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
import { studentAuthService, normalizeDob, normalizeMobile } from './studentAuthService';

export { normalizeDob, normalizeMobile };

export const readStudentSession = () => {
  return null;
};

export const clearStudentSession = () => {
  try {
    localStorage.removeItem('tamil_student_session');
    localStorage.removeItem('tamil_student_mongo_session');
  } catch (_) {}
};

/**
 * Student API Services (Firestore + Firebase Functions)
 * MongoDB is completely decoupled from student authentication.
 */
export const studentMongoApi = {
  async login(credentials) {
    return studentAuthService.loginStudent(credentials);
  },

  async me() {
    const studentUid = auth.currentUser?.uid;
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
    const studentUid = auth.currentUser?.uid;
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
    const studentUid = auth.currentUser?.uid;
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
    const studentUid = auth.currentUser?.uid;
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
    } catch (callableErr) {
      console.warn('Backend evaluation callable unavailable, saving directly to Firestore:', callableErr.message);
    }

    const testData = payload?.testData || {};
    const answers = payload?.answers || {};
    const questions = testData?.questions || [];
    let score = 0;
    const details = [];

    questions.forEach((q, index) => {
      const selected = answers[index];
      const isCorrect = selected !== undefined && Number(selected) === Number(q.correctAnswer);
      if (isCorrect) score += 1;
      details.push({
        questionIndex: index,
        selectedAnswer: selected !== undefined ? Number(selected) : null,
        isCorrect,
      });
    });

    const studentUid = auth.currentUser?.uid;
    const resultDoc = {
      testId,
      studentId: studentUid || '',
      score,
      totalQuestions: questions.length,
      percentage: questions.length ? Math.round((score / questions.length) * 100) : 0,
      details,
      submittedAt: firestoreServerTimestamp(),
      timeTakenMinutes: Math.max(0, Number(payload?.timeTakenMinutes) || 0),
    };

    const docRef = await firestoreAddDoc(firestoreCollection(db, 'test_results'), resultDoc);
    return { id: docRef.id, ...resultDoc };
  },

  async getTestResults(testId) {
    const studentUid = auth.currentUser?.uid;
    if (!studentUid) return [];
    try {
      const q = firestoreQuery(
        firestoreCollection(db, 'test_results'),
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
    const studentUid = auth.currentUser?.uid;
    if (!studentUid) return [];
    try {
      const q = firestoreQuery(
        firestoreCollection(db, 'test_results'),
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
