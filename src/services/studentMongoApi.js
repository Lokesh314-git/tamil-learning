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
import { db, auth } from '../firebase';
import { studentAuthService, normalizeDob, normalizeMobile, readStudentSession, clearStudentSession } from './studentAuthService';

export { normalizeDob, normalizeMobile, readStudentSession, clearStudentSession };

/**
 * Student API Services (Firestore)
 * 100% compatible with Firebase Spark (Free Tier) Plan — No Cloud Functions needed.
 */
export const studentMongoApi = {
  async login(credentials) {
    return studentAuthService.loginStudent(credentials);
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
    const allowed = ['address', 'parentName', 'parentMobile', 'emergencyContact', 'bloodGroup', 'phone'];
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
    const testId = String(payload?.testId || payload?.testData?.id || '').trim();
    if (!testId || testId === 'undefined') {
      throw new Error('Test identifier is missing.');
    }

    const session = readStudentSession();
    const studentId = String(payload.studentId || session?.studentId || auth.currentUser?.uid || '').trim();
    if (!studentId) {
      throw new Error('Student identifier is missing. Please sign in again.');
    }

    const testData = payload?.testData || {};
    const answers = payload?.answers || {};
    const questions = Array.isArray(testData?.questions) ? testData.questions : [];
    let score = 0;
    const breakdown = questions.map((q, index) => {
      const selected = answers[index];
      const correctAns = q.correctAnswer !== undefined ? q.correctAnswer : q.correctOption;
      const isCorrect = selected !== undefined && String(selected) === String(correctAns);
      if (isCorrect) score += 1;
      return {
        question: q.question || q.questionText || '',
        options: Array.isArray(q.options) ? q.options : [],
        correctAnswer: correctAns !== undefined ? Number(correctAns) : null,
        studentChoice: selected === undefined ? -1 : Number(selected),
        isCorrect,
        explanation: q.explanation || '',
      };
    });

    // Deterministic unique result document ID per student per test: `${studentId}_${testId}`
    const resultDocId = `${studentId}_${testId}`;
    const resultDocRef = firestoreDoc(db, 'results', resultDocId);

    // Read previous attempts / best score
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
    const student = session?.student || {};

    const studentName = payload?.studentName || student?.name || 'Student';
    const email = payload?.email || student?.email || '';
    const sifNumber = payload?.sifNumber || student?.sifNumber || student?.rollNumber || '';
    const year = payload?.year || student?.year || testData?.year || '';
    const departmentId = payload?.departmentId || student?.departmentId || testData?.departmentId || '';
    const departmentName = payload?.departmentName || student?.departmentName || testData?.departmentName || '';

    const resultData = {
      studentId,
      studentName,
      email,
      sifNumber,
      testId,
      testTitle: testData?.title || 'Online Assessment',
      year,
      departmentId,
      departmentName,
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

    // Upsert the single canonical result document in results collection
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
    } catch (_) {}

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

  async getTestResults(testId) {
    const session = readStudentSession();
    const studentUid = session?.studentId || auth.currentUser?.uid;
    if (!studentUid) return [];
    try {
      const q = firestoreQuery(
        firestoreCollection(db, 'results'),
        firestoreWhere('studentId', '==', studentUid),
        firestoreWhere('testId', '==', testId)
      );
      const snap = await firestoreGetDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.warn('Failed to load test results:', e);
      return [];
    }
  },

  async getAllTestResults() {
    const session = readStudentSession();
    const studentUid = session?.studentId || auth.currentUser?.uid;
    if (!studentUid) return [];
    try {
      const q = firestoreQuery(
        firestoreCollection(db, 'results'),
        firestoreWhere('studentId', '==', studentUid)
      );
      const snap = await firestoreGetDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.warn('Failed to load all test results:', e);
      return [];
    }
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
