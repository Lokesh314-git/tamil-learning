import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';

/**
 * Permanently deletes a student from the 'users' collection,
 * cleans up studentLookup entries, and removes all associated student records
 * (results, reports, notes, submissions, taskSubmissions, attendance).
 *
 * @param {object} db - Firestore database instance
 * @param {object|string} student - Student object or student UID
 */
export const deleteStudentCompletely = async (db, student) => {
  const uid = typeof student === 'string' ? student : (student?.uid || student?.id);
  if (!uid) return;

  const batch = writeBatch(db);

  // 1. Delete student from 'users' collection
  batch.delete(doc(db, 'users', uid));
  batch.delete(doc(db, 'students data', uid));

  // 2. Delete studentLookup records if known
  if (typeof student === 'object' && student !== null) {
    if (student.sifNumber) {
      batch.delete(doc(db, 'studentLookup', String(student.sifNumber).trim().toUpperCase()));
    }
    if (student.mobileNumber) {
      batch.delete(doc(db, 'studentLookup', String(student.mobileNumber).trim()));
    }
  }

  // Also query studentLookup where studentId == uid to ensure all alias docs are purged
  try {
    const lookupSnap = await getDocs(query(collection(db, 'studentLookup'), where('studentId', '==', uid)));
    lookupSnap.forEach((d) => batch.delete(d.ref));
  } catch (e) {
    console.warn('Error querying studentLookup for delete:', e);
  }

  // 3. Delete student records from associated collections
  const collectionsToClean = ['results', 'reports', 'notes', 'submissions', 'taskSubmissions', 'attendance'];
  for (const colName of collectionsToClean) {
    try {
      const snap = await getDocs(query(collection(db, colName), where('studentId', '==', uid)));
      snap.forEach((documentRef) => {
        batch.delete(documentRef.ref);
      });
    } catch (e) {
      console.warn(`Error cleaning collection ${colName}:`, e);
    }
  }

  await batch.commit();
};
