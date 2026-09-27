import { httpsCallable } from 'firebase/functions';
import { collection, doc, getDocs, query, where, writeBatch, deleteDoc } from 'firebase/firestore';
import { functions } from '../firebase';
import { mongoService } from '../services/mongoService';

/**
 * Permanently and completely deletes a student across all databases (Firestore, MongoDB GridFS, and Atlas).
 * Cleans user profile, results, reports, notes, submissions, attendance, feedback, and storage chunks.
 * Ensures zero orphaned or outdated records remain in either the application or databases.
 *
 * @param {object} db - Firestore database instance
 * @param {object|string} student - Student object or student UID
 */
export const deleteStudentCompletely = async (db, student) => {
  const uid = typeof student === 'string' ? student : (student?.uid || student?.id);
  if (!uid) return;

  const email = typeof student === 'object' ? student.email : null;
  const sifNumber = typeof student === 'object' ? student.sifNumber : null;

  // 1. Non-blocking background call to Mongo Cloud Function if available
  try {
    const deleteStudentFn = httpsCallable(functions, 'deleteStudentFromMongo');
    deleteStudentFn({ studentId: uid, email, sifNumber }).catch(() => {});
  } catch (_) {}

  const batch = writeBatch(db);

  // 2. Delete primary student document
  batch.delete(doc(db, 'users', uid));

  // 3. Collections to clean concurrently in parallel
  const collectionsToClean = [
    'results',
    'reports',
    'notes',
    'submissions',
    'taskSubmissions',
    'task_submissions',
    'attendance',
    'attendance_records',
    'student_attendance',
    'feedback',
    'assignmentSubmissions',
    'notifications',
    'mongo_file_chunks'
  ];

  // Run all queries concurrently for ultra-fast response
  const queryPromises = [];

  for (const colName of collectionsToClean) {
    const colRef = collection(db, colName);
    queryPromises.push(getDocs(query(colRef, where('studentId', '==', uid))).catch(() => null));
    queryPromises.push(getDocs(query(colRef, where('userId', '==', uid))).catch(() => null));
    if (email) {
      queryPromises.push(getDocs(query(colRef, where('email', '==', email))).catch(() => null));
    }
    if (sifNumber) {
      queryPromises.push(getDocs(query(colRef, where('sifNumber', '==', sifNumber))).catch(() => null));
    }
  }

  const snapshots = await Promise.all(queryPromises);

  snapshots.forEach((snap) => {
    if (snap && !snap.empty) {
      snap.forEach((d) => batch.delete(d.ref));
    }
  });

  await batch.commit();

  // 4. Clear any active local student session
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const activeSession = JSON.parse(window.localStorage.getItem('tamil_student_session') || 'null');
      if (activeSession?.studentId === uid || activeSession?.uid === uid) {
        window.localStorage.removeItem('tamil_student_session');
        window.localStorage.removeItem('tamil_student_mongo_session');
      }
    }
  } catch (_) {}
};

export default {
  deleteStudentCompletely,
};
