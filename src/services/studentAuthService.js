import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

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
 * Student Authentication Service
 * Pure Firebase Architecture:
 * - Uses Firebase Cloud Function `studentLogin` (onCall) for server-side verification.
 * - Firestore is the single source of truth for student records.
 * - Authenticates with genuine Firebase Auth session via Custom Token.
 * - Completely decoupled from MongoDB.
 */
export const studentAuthService = {
  /**
   * Authenticates student using Mobile Number and Date of Birth.
   * @param {Object} credentials - { mobileNumber, dob }
   * @returns {Promise<{ customToken: string, student: Object }>}
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
      const studentLoginCallable = httpsCallable(functions, 'studentLogin');
      const response = await studentLoginCallable({
        mobileNumber: cleanMobile,
        dob: cleanDob,
      });

      if (!response?.data?.customToken) {
        throw new Error('Authentication token not received from server.');
      }

      return {
        customToken: response.data.customToken,
        student: response.data.student,
      };
    } catch (callableErr) {
      const code = String(callableErr.code || '').replace(/^functions\//, '');
      const rawMsg = callableErr.message || '';

      if (code === 'unauthenticated') {
        const err = new Error('Invalid mobile number or date of birth.');
        err.code = 'unauthenticated';
        throw err;
      }

      if (code === 'permission-denied') {
        const err = new Error(rawMsg || 'Student account is inactive or blocked. Please contact your department admin.');
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

      // For network errors, internal errors, unavailable, 404, or CORS issues:
      const err = new Error('Unable to connect to the authentication service. Please try again shortly.');
      err.code = 'unavailable';
      throw err;
    }
  },
};
