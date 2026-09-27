import {
  collection as firestoreCollection,
  doc as firestoreDoc,
  query as firestoreQuery,
  where as firestoreWhere,
  getDocs as firestoreGetDocs,
  getDoc as firestoreGetDoc,
  addDoc as firestoreAddDoc,
  setDoc as firestoreSetDoc,
  updateDoc as firestoreUpdateDoc,
  deleteDoc as firestoreDeleteDoc,
  onSnapshot as firestoreOnSnapshot,
  serverTimestamp as firestoreServerTimestamp,
  writeBatch as firestoreWriteBatch
} from 'firebase/firestore';
import { db } from '../firebase';

const SESSION_KEY = 'tamil_student_session';
const LEGACY_SESSION_KEY = 'tamil_student_mongo_session';

/**
 * Normalizes any Date of Birth string or Date object into standard YYYY-MM-DD format.
 */
export function normalizeDob(value) {
  if (!value) return '';
  if (value.toDate instanceof Function) value = value.toDate();
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const input = String(value).trim();
  // YYYY-MM-DD or YYYY/MM/DD
  let match = input.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) {
    return `${match[1].padStart(4, '0')}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }
  // DD-MM-YYYY or DD/MM/YYYY
  match = input.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) {
    return `${match[3].padStart(4, '0')}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  return input;
}

export const readStudentSession = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY) || localStorage.getItem(LEGACY_SESSION_KEY);
    const value = JSON.parse(raw || 'null');
    if (!value?.studentId || !value?.authenticated) {
      clearStudentSession();
      return null;
    }
    return value;
  } catch {
    clearStudentSession();
    return null;
  }
};

export const clearStudentSession = () => {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch (_) {}
};

/**
 * Direct Client-Side Firestore Student Authentication and Services
 * 100% compatible with Firebase Spark (Free Tier) plan - No Cloud Functions required.
 */
export const studentMongoApi = {
  async login({ identifier, dob }) {
    const cleanId = String(identifier || '').trim();
    const cleanDob = normalizeDob(dob);

    if (!cleanId || !cleanDob) {
      const error = new Error('Please enter a valid SIF/Mobile Number and Date of Birth.');
      error.status = 400;
      throw error;
    }

    const sifCandidate = cleanId.toUpperCase().replace(/\s+/g, '');
    const mobileCandidate = cleanId.replace(/\D/g, '').slice(-10);
    const usersRef = firestoreCollection(db, 'users');

    // Run SIF, Roll Number, and Mobile queries in parallel for instant response
    const queryPromises = [];
    if (sifCandidate) {
      queryPromises.push(firestoreGetDocs(firestoreQuery(usersRef, firestoreWhere('sifNumber', '==', sifCandidate))).catch(() => null));
      queryPromises.push(firestoreGetDocs(firestoreQuery(usersRef, firestoreWhere('rollNumber', '==', cleanId))).catch(() => null));
      queryPromises.push(firestoreGetDocs(firestoreQuery(usersRef, firestoreWhere('registerNumber', '==', cleanId))).catch(() => null));
    }
    if (mobileCandidate.length === 10) {
      queryPromises.push(firestoreGetDocs(firestoreQuery(usersRef, firestoreWhere('mobileNumber', '==', mobileCandidate))).catch(() => null));
    }

    const snaps = await Promise.all(queryPromises);
    let matchedDoc = null;

    for (const snap of snaps) {
      if (snap && !snap.empty) {
        const found = snap.docs.find((d) => normalizeDob(d.data()?.dob) === cleanDob);
        if (found) {
          matchedDoc = found;
          break;
        }
      }
    }

    // Fallback: search in student users if direct indices missed
    if (!matchedDoc) {
      try {
        const qStudents = firestoreQuery(usersRef, firestoreWhere('role', '==', 'student'));
        const allSnap = await firestoreGetDocs(qStudents);
        matchedDoc = allSnap.docs.find((d) => {
          const data = d.data() || {};
          const sSif = String(data.sifNumber || data.sif || data.sifNo || data.rollNumber || '').toUpperCase().replace(/\s+/g, '');
          const sMobile = String(data.mobileNumber || data.mobile || data.phone || '').replace(/\D/g, '').slice(-10);
          const sDob = normalizeDob(data.dob);

          const matchesId = (sSif && sSif === sifCandidate) || (sMobile && mobileCandidate.length === 10 && sMobile === mobileCandidate);
          return matchesId && sDob === cleanDob;
        });
      } catch (e) {
        console.warn('Fallback student query error:', e);
      }
    }

    if (!matchedDoc) {
      const error = new Error('Invalid Mobile Number/SIF Number or Date of Birth.');
      error.status = 401;
      throw error;
    }

    const rawData = matchedDoc.data();
    const studentData = { id: matchedDoc.id, uid: matchedDoc.id, ...rawData };

    if (
      studentData.isDeleted === true ||
      studentData.status === 'blocked' ||
      studentData.status === 'rejected' ||
      studentData.status === 'deleted'
    ) {
      const error = new Error('Student account is inactive. Please contact your department admin.');
      error.status = 401;
      throw error;
    }

    const session = {
      studentId: studentData.uid,
      token: `local_token_${studentData.uid}`,
      authenticated: true,
      student: studentData,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(session));

    return studentData;
  },

  async me() {
    const session = readStudentSession();
    if (!session?.studentId) throw new Error('Session expired.');
    const docRef = firestoreDoc(db, 'users', session.studentId);
    const snap = await firestoreGetDoc(docRef);
    if (!snap.exists()) throw new Error('Student profile not found.');
    return { id: snap.id, uid: snap.id, ...snap.data() };
  },

  async logout() {
    clearStudentSession();
  },

  async updateProfile(patch) {
    const session = readStudentSession();
    if (!session?.studentId) throw new Error('Session expired.');
    const docRef = firestoreDoc(db, 'users', session.studentId);
    const allowed = ['address', 'parentName', 'parentMobile', 'emergencyContact', 'bloodGroup'];
    const updateData = {};
    for (const key of allowed) {
      if (patch[key] !== undefined) updateData[key] = patch[key];
    }
    updateData.profileUpdatedAt = firestoreServerTimestamp();
    await firestoreUpdateDoc(docRef, updateData);
    return studentMongoApi.me();
  },

  async getPreferences() {
    const session = readStudentSession();
    if (!session?.studentId) return {};
    try {
      const docRef = firestoreDoc(db, 'student_preferences', session.studentId);
      const snap = await firestoreGetDoc(docRef);
      return snap.exists() ? snap.data() : {};
    } catch {
      return {};
    }
  },

  async updatePreferences(patch) {
    const session = readStudentSession();
    if (!session?.studentId) return;
    try {
      const docRef = firestoreDoc(db, 'student_preferences', session.studentId);
      await firestoreSetDoc(
        docRef,
        { ...patch, studentId: session.studentId, updatedAt: firestoreServerTimestamp() },
        { merge: true }
      );
    } catch (e) {
      console.warn('Failed to update student preferences:', e);
    }
  },

  async submitTest(payload) {
    const session = readStudentSession();
    const student = session?.student || { uid: session?.studentId, id: session?.studentId };
    const studentId = student.uid || student.id;
    const testId = payload.testId;

    let testData = payload.testData || null;

    if (!testData) {
      try {
        const [testDoc, pubDoc] = await Promise.all([
          firestoreGetDoc(firestoreDoc(db, 'tests', testId)).catch(() => null),
          firestoreGetDoc(firestoreDoc(db, 'publishedTests', testId)).catch(() => null)
        ]);
        if (testDoc?.exists()) testData = testDoc.data();
        else if (pubDoc?.exists()) testData = pubDoc.data();
      } catch (err) {
        console.warn('Could not fetch test details:', err);
      }
    }

    const questions = testData?.questions || [];
    const answers = payload.answers || {};
    let score = 0;

    const breakdown = questions.map((q, index) => {
      const correctAns = q.correctAnswer ?? q.correctOption ?? 0;
      const selected = answers[index];
      const isCorrect = selected !== undefined && String(selected) === String(correctAns);
      if (isCorrect) score += 1;
      return {
        question: q.question || q.questionText || '',
        options: Array.isArray(q.options) ? q.options : [],
        correctAnswer: correctAns,
        studentChoice: selected === undefined ? -1 : Number(selected),
        isCorrect,
        explanation: q.explanation || '',
      };
    });

    // Deterministic unique result document ID per student per test: `${studentId}_${testId}`
    const resultDocId = `${studentId}_${testId}`;
    const resultDocRef = firestoreDoc(db, 'results', resultDocId);

    // Check if an existing result is present to preserve history / attempt count
    let prevAttempts = 0;
    let prevBestScore = 0;
    let existingCreatedAt = null;

    try {
      const existingSnap = await firestoreGetDoc(resultDocRef);
      if (existingSnap.exists()) {
        const prevData = existingSnap.data() || {};
        prevAttempts = Number(prevData.attemptsCount) || 1;
        prevBestScore = Number(prevData.bestScore != null ? prevData.bestScore : prevData.score) || 0;
        existingCreatedAt = prevData.createdAt || null;
      }
    } catch (e) {
      console.warn('Could not read existing test result:', e);
    }

    const calculatedPercentage = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

    const resultData = {
      studentId,
      studentName: student.name || 'Student',
      email: student.email || '',
      sifNumber: student.sifNumber || student.rollNumber || '',
      testId,
      testTitle: testData?.title || 'Online Assessment',
      year: student.year || testData?.year || '',
      departmentId: student.departmentId || '',
      departmentName: student.departmentName || '',
      score,
      totalQuestions: questions.length,
      total: questions.length,
      percentage: calculatedPercentage,
      breakdown,
      submittedAt: new Date().toISOString(),
      timeTakenMinutes: Math.max(0, Number(payload.timeTakenMinutes) || 0),
      attemptsCount: prevAttempts + 1,
      bestScore: Math.max(score, prevBestScore),
      createdAt: existingCreatedAt || firestoreServerTimestamp(),
      updatedAt: firestoreServerTimestamp()
    };

    // Upsert the single canonical result document for this student & test
    await firestoreSetDoc(resultDocRef, resultData, { merge: true });

    // Clean up any legacy duplicate documents for this test & student
    try {
      const qDupes = firestoreQuery(
        firestoreCollection(db, 'results'),
        firestoreWhere('studentId', '==', studentId),
        firestoreWhere('testId', '==', testId)
      );
      const dupesSnap = await firestoreGetDocs(qDupes);
      dupesSnap.forEach((d) => {
        if (d.id !== resultDocId) {
          firestoreDeleteDoc(d.ref).catch(() => {});
        }
      });
    } catch (e) {
      console.warn('Duplicate result cleanup error:', e);
    }

    // Dispatch real-time notification alert to Admin
    try {
      firestoreAddDoc(firestoreCollection(db, 'notifications'), {
        title: '📊 New Test Attempt Completed',
        body: `${resultData.studentName} (${resultData.year || 'Student'}) completed "${resultData.testTitle}": Score ${resultData.score}/${resultData.totalQuestions} (${resultData.percentage}%).`,
        type: 'test_submission',
        category: 'tests',
        recipientRole: 'admin',
        targetScope: 'admin',
        testId: resultData.testId,
        studentId: resultData.studentId,
        studentName: resultData.studentName,
        read: false,
        isRead: false,
        status: 'pending',
        createdAt: firestoreServerTimestamp(),
      }).catch(() => {});
    } catch (_) {}

    return { id: resultDocId, ...resultData };
  },
};

/**
 * Universal Firestore wrappers that handle flexible parameter signatures
 * e.g. collection(db, 'notes') or collection('notes')
 */
export const collection = (dbOrName, maybeName) => {
  if (typeof dbOrName === 'string') {
    return firestoreCollection(db, dbOrName);
  }
  return firestoreCollection(dbOrName || db, maybeName);
};

export const doc = (dbOrName, nameOrId, maybeId) => {
  if (maybeId !== undefined) {
    return firestoreDoc(dbOrName || db, nameOrId, maybeId);
  }
  return firestoreDoc(db, dbOrName, nameOrId);
};

export const query = firestoreQuery;
export const where = firestoreWhere;
export const serverTimestamp = firestoreServerTimestamp;
export const onSnapshot = firestoreOnSnapshot;
export const getDocs = firestoreGetDocs;
export const getDoc = firestoreGetDoc;
export const addDoc = firestoreAddDoc;
export const setDoc = firestoreSetDoc;
export const updateDoc = firestoreUpdateDoc;
export const deleteDoc = firestoreDeleteDoc;
export const writeBatch = firestoreWriteBatch;
