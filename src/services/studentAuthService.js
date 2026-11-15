import {
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase';

const SESSION_KEY = 'tamil_student_session';

/**
 * Normalizes a mobile phone number to a 10-digit string.
 */
export function normalizeMobile(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length > 10 && (digits.startsWith('91') || digits.startsWith('0'))) {
    return digits.startsWith('91') ? digits.slice(2, 12) : digits.slice(-10);
  }
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Normalizes Date of Birth into standard YYYY-MM-DD format.
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

/**
 * Reads verified student session from localStorage (100% Spark Plan compatible).
 */
export function readStudentSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const session = JSON.parse(raw || 'null');
    if (!session?.studentId || !session?.authenticated || !session?.student) {
      clearStudentSession();
      return null;
    }
    return session;
  } catch {
    clearStudentSession();
    return null;
  }
}

/**
 * Clears student session from localStorage.
 */
export function clearStudentSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('tamil_student_mongo_session');
  } catch (_) {}
}

/**
 * Student Authentication Service
 * 100% compatible with Firebase Spark (Free Tier) Plan — No Blaze Plan or Cloud Functions needed.
 * Directly verifies student records in Cloud Firestore.
 */
export const studentAuthService = {
  /**
   * Authenticates student using Mobile Number and Date of Birth against Firestore.
   * @param {Object} credentials - { mobileNumber, dob }
   * @returns {Promise<{ student: Object }>}
   */
  async loginStudent({ mobileNumber, dob, identifier }) {
    const rawMobile = mobileNumber || identifier || '';
    const cleanMobile = normalizeMobile(rawMobile);
    const cleanDob = normalizeDob(dob);

    if (!cleanMobile || cleanMobile.length !== 10) {
      const err = new Error('Please enter a valid 10-digit registered mobile number.');
      err.code = 'invalid-argument';
      throw err;
    }

    if (!cleanDob) {
      const err = new Error('Please enter a valid Date of Birth.');
      err.code = 'invalid-argument';
      throw err;
    }

    const today = new Date().toISOString().split('T')[0];
    if (cleanDob > today) {
      const err = new Error('Date of Birth cannot be in the future.');
      err.code = 'invalid-argument';
      throw err;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const err = new Error('Unable to connect to the authentication service. Please try again shortly.');
      err.code = 'unavailable';
      throw err;
    }

    try {
      const usersRef = collection(db, 'users');
      const [mobileSnap, phoneSnap] = await Promise.all([
        getDocs(query(usersRef, where('role', '==', 'student'), where('mobileNumber', '==', cleanMobile))),
        getDocs(query(usersRef, where('role', '==', 'student'), where('phone', '==', cleanMobile)))
      ]);

      const candidateMap = new Map();
      [...mobileSnap.docs, ...phoneSnap.docs].forEach((d) => {
        candidateMap.set(d.id, { id: d.id, uid: d.id, ...d.data() });
      });

      const candidates = Array.from(candidateMap.values()).filter(
        (s) => s.isDeleted !== true && s.status !== 'deleted'
      );

      // Ambiguous duplicate mobile check
      if (candidates.length > 1) {
        const err = new Error('Multiple student accounts are associated with this mobile number. Please contact your college administrator for correction.');
        err.code = 'failed-precondition';
        throw err;
      }

      if (candidates.length === 0) {
        const err = new Error('Invalid mobile number or date of birth.');
        err.code = 'unauthenticated';
        throw err;
      }

      const student = candidates[0];

      // Inactive / blocked account check
      if (['blocked', 'inactive', 'rejected'].includes(student.status)) {
        const err = new Error('Student account is inactive or blocked. Please contact your department admin.');
        err.code = 'permission-denied';
        throw err;
      }

      // Date of Birth match verification
      const storedDob = normalizeDob(student.dob);
      if (!storedDob || storedDob !== cleanDob) {
        const err = new Error('Invalid mobile number or date of birth.');
        err.code = 'unauthenticated';
        throw err;
      }

      const studentUid = String(student.uid || student.id);
      const verifiedStudent = {
        ...student,
        id: studentUid,
        uid: studentUid,
        role: 'student',
        status: student.status || 'active'
      };

      // Store verified session locally for seamless navigation and refresh persistence
      const session = {
        studentId: studentUid,
        authenticated: true,
        student: verifiedStudent
      };
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } catch (_) {}

      return {
        student: verifiedStudent
      };
    } catch (err) {
      if (['invalid-argument', 'unauthenticated', 'permission-denied', 'failed-precondition'].includes(err.code)) {
        throw err;
      }
      console.warn('[studentAuthService] Firestore verification error:', err);
      const netErr = new Error('Unable to connect to the authentication service. Please try again shortly.');
      netErr.code = 'unavailable';
      throw netErr;
    }
  },
};
