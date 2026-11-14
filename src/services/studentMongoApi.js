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
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '../firebase';

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
  async login({ mobileNumber, dob, identifier }) {
    const rawMobile = String(mobileNumber || identifier || '').trim();
    const cleanMobile = rawMobile.replace(/\D/g, '').slice(-10);
    const cleanDob = normalizeDob(dob);

    if (!cleanMobile || cleanMobile.length !== 10) {
      const error = new Error('Please enter a valid 10-digit registered mobile number.');
      error.status = 400;
      throw error;
    }

    if (!cleanDob) {
      const error = new Error('Please enter a valid Date of Birth.');
      error.status = 400;
      throw error;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const error = new Error('Unable to connect to the authentication server. Please check your internet connection.');
      error.code = 'network-unavailable';
      throw error;
    }

    // Standardized Primary Authentication: Firebase Callable Function exclusively (no HTTP fallback)
    try {
      const studentLoginCallable = httpsCallable(functions, 'studentLogin');
      const response = await studentLoginCallable({ mobileNumber: cleanMobile, dob: cleanDob });

      if (response?.data?.student) {
        const student = response.data.student;
        const customToken = response.data.customToken;
        const session = {
          studentId: student.uid || student.id,
          token: customToken || `session_${student.uid}`,
          customToken,
          authenticated: true,
          student,
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        localStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(session));
        return { ...student, customToken };
      }
      throw new Error('Authentication failed. No student profile was returned.');
    } catch (callableErr) {
      console.warn('[studentMongoApi] Callable studentLogin error:', callableErr.code, callableErr.message);
      const code = String(callableErr.code || '').replace(/^functions\//, '');
      const rawMsg = callableErr.message || '';

      if (code === 'unauthenticated') {
        const err = new Error('Invalid registered mobile number or date of birth.');
        err.code = 'unauthenticated';
        throw err;
      }

      if (code === 'permission-denied') {
        const err = new Error(rawMsg || 'Your student account is blocked or inactive. Please contact your department administrator.');
        err.code = 'permission-denied';
        throw err;
      }

      if (code === 'failed-precondition') {
        const err = new Error(rawMsg || 'Multiple student accounts are associated with this mobile number. Please contact your college administrator for correction.');
        err.code = 'failed-precondition';
        throw err;
      }

      if (code === 'resource-exhausted') {
        const err = new Error('Too many sign-in attempts. Please try again in 15 minutes.');
        err.code = 'resource-exhausted';
        throw err;
      }

      if (code === 'invalid-argument') {
        const err = new Error(rawMsg || 'Please enter a valid 10-digit registered mobile number and date of birth.');
        err.code = 'invalid-argument';
        throw err;
      }

      if (code === 'internal' || code === 'unavailable' || !navigator.onLine) {
        // Fallback: If backend Cloud Function is not yet deployed on this Firebase project (404/internal),
        // or during service interruption, execute Direct Firestore Verification.
        try {
          const usersRef = firestoreCollection(db, 'users');
          const [mobileSnap, phoneSnap] = await Promise.all([
            firestoreGetDocs(firestoreQuery(usersRef, firestoreWhere('role', '==', 'student'), firestoreWhere('mobileNumber', '==', cleanMobile))),
            firestoreGetDocs(firestoreQuery(usersRef, firestoreWhere('role', '==', 'student'), firestoreWhere('phone', '==', cleanMobile)))
          ]);

          const candidateMap = new Map();
          [...mobileSnap.docs, ...phoneSnap.docs].forEach((d) => candidateMap.set(d.id, { id: d.id, uid: d.id, ...d.data() }));
          const candidates = Array.from(candidateMap.values()).filter(
            (s) => s.isDeleted !== true && s.status !== 'deleted'
          );

          if (candidates.length > 1) {
            const dupErr = new Error('Multiple student accounts are associated with this mobile number. Please contact your college administrator for correction.');
            dupErr.code = 'failed-precondition';
            throw dupErr;
          }

          if (candidates.length === 0) {
            const notFoundErr = new Error('Invalid registered mobile number or date of birth.');
            notFoundErr.code = 'unauthenticated';
            throw notFoundErr;
          }

          const student = candidates[0];

          if (['blocked', 'inactive', 'rejected'].includes(student.status)) {
            const blockedErr = new Error('Your student account is blocked or inactive. Please contact your department administrator.');
            blockedErr.code = 'permission-denied';
            throw blockedErr;
          }

          const storedDob = normalizeDob(student.dob);
          if (!storedDob || storedDob !== cleanDob) {
            const dobErr = new Error('Invalid registered mobile number or date of birth.');
            dobErr.code = 'unauthenticated';
            throw dobErr;
          }

          const studentId = student.id || student.uid;
          const session = {
            studentId,
            token: `session_${studentId}`,
            authenticated: true,
            student: { ...student, uid: studentId, id: studentId }
          };
          localStorage.setItem(SESSION_KEY, JSON.stringify(session));
          localStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(session));
          return { ...student, uid: studentId, id: studentId };
        } catch (fallbackErr) {
          if (['failed-precondition', 'unauthenticated', 'permission-denied'].includes(fallbackErr.code)) {
            throw fallbackErr;
          }
          console.warn('[studentMongoApi] Direct verification notice:', fallbackErr.message);
        }

        if (!navigator.onLine) {
          const err = new Error('Unable to connect to the authentication server. Please check your internet connection.');
          err.code = 'unavailable';
          throw err;
        }

        const err = new Error('Authentication service encountered an unexpected error. Please try again shortly.');
        err.code = 'internal';
        throw err;
      }

      // Preserve descriptive error message or generic server failure (never falsify credentials)
      const err = new Error(rawMsg || 'Authentication service is temporarily unavailable. Please try again.');
      err.code = code || 'unknown';
      throw err;
    }
  },

  async me() {
    const session = readStudentSession();
    const studentUid = session?.studentId || auth.currentUser?.uid;
    if (!studentUid) throw new Error('Session expired.');
    const docRef = firestoreDoc(db, 'users', studentUid);
    const snap = await firestoreGetDoc(docRef);
    if (!snap.exists()) throw new Error('Student profile not found.');
    return { id: snap.id, uid: snap.id, ...snap.data() };
  },

  async logout() {
    clearStudentSession();
  },

  async updateProfile(patch) {
    const session = readStudentSession();
    const studentUid = session?.studentId || auth.currentUser?.uid;
    if (!studentUid) throw new Error('Session expired.');
    const docRef = firestoreDoc(db, 'users', studentUid);
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
    const studentUid = session?.studentId || auth.currentUser?.uid;
    if (!studentUid) return {};
    try {
      const docRef = firestoreDoc(db, 'student_preferences', studentUid);
      const snap = await firestoreGetDoc(docRef);
      return snap.exists() ? snap.data() : {};
    } catch {
      return {};
    }
  },

  async updatePreferences(patch) {
    const session = readStudentSession();
    const studentUid = session?.studentId || auth.currentUser?.uid;
    if (!studentUid) return;
    try {
      const docRef = firestoreDoc(db, 'student_preferences', studentUid);
      await firestoreSetDoc(
        docRef,
        { ...patch, studentId: studentUid, updatedAt: firestoreServerTimestamp() },
        { merge: true }
      );
    } catch (e) {
      console.warn('Failed to update student preferences:', e);
    }
  },

  async submitTest(payload = {}) {
    const testId = payload?.testId || payload?.testData?.id;
    if (!testId || testId === 'undefined') {
      throw new Error('Test identifier is missing.');
    }

    // 1. Primary: Server-Side Assessment Evaluation via Cloud Function
    try {
      const submitFn = httpsCallable(functions, 'submitStudentAssessment');
      const response = await submitFn({
        testId,
        answers: payload.answers || {},
        timeTakenMinutes: Math.max(0, Number(payload.timeTakenMinutes) || 0),
      });
      if (response?.data?.result) {
        return response.data.result;
      }
    } catch (fnErr) {
      console.warn('[submitTest] Backend assessment submission notice:', fnErr.message);
      if (fnErr.code === 'unauthenticated' || fnErr.code === 'permission-denied') {
        throw new Error(fnErr.message || 'You must be signed in as an active student to submit this assessment.');
      }
    }

    // 2. Fallback execution if cloud function is offline
    const session = readStudentSession();
    const sessionStudent = session?.student || (session?.studentId ? { uid: session.studentId, id: session.studentId } : null);
    const authUser = auth.currentUser;
    const student = payload?.student || payload?.profile || sessionStudent || {};

    const studentId =
      payload?.studentId ||
      payload?.userId ||
      student?.uid ||
      student?.id ||
      session?.studentId ||
      authUser?.uid;

    if (!studentId || studentId === 'undefined') {
      throw new Error('Student identifier is missing. Please ensure you are logged in before submitting.');
    }

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

    const questions = Array.isArray(testData?.questions) ? testData.questions : [];
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
        isCorrect: Boolean(isCorrect),
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

    const studentName = payload?.studentName || student?.name || student?.displayName || authUser?.displayName || 'Student';
    const email = payload?.email || student?.email || authUser?.email || '';
    const sifNumber = payload?.sifNumber || student?.sifNumber || student?.rollNumber || student?.registerNumber || '';
    const year = payload?.year || student?.year || testData?.year || '';
    const departmentId = payload?.departmentId || student?.departmentId || testData?.departmentId || '';
    const departmentName = payload?.departmentName || student?.departmentName || testData?.departmentName || '';

    const resultData = {
      studentId: String(studentId),
      studentName: String(studentName || 'Student'),
      email: String(email || ''),
      sifNumber: String(sifNumber || ''),
      testId: String(testId),
      testTitle: String(testData?.title || 'Online Assessment'),
      year: String(year || ''),
      departmentId: String(departmentId || ''),
      departmentName: String(departmentName || ''),
      score: Number(score) || 0,
      totalQuestions: Number(questions.length) || 0,
      total: Number(questions.length) || 0,
      percentage: Number(calculatedPercentage) || 0,
      breakdown: Array.isArray(breakdown) ? breakdown : [],
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
        firestoreWhere('studentId', '==', String(studentId)),
        firestoreWhere('testId', '==', String(testId))
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
