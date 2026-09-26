import { useState, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendEmailVerification,
} from 'firebase/auth';
import { auth, firebaseConfig } from '../firebase';
import { isTemporaryEmail, isValidEmail, normalizeEmail } from '../utils/emailValidation';

/**
 * Create student auth users without hijacking the admin session.
 * Student Firestore profile is intentionally NOT created here.
 */
export const useCreateStudent = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const secondaryAuth = useMemo(() => {
    const existing = getApps().find((app) => app.name === 'secondary');
    const app = existing || initializeApp(firebaseConfig, 'secondary');
    return getAuth(app);
  }, []);

  const createStudent = async ({ name, email, password }) => {
    setLoading(true);
    setError(null);

    const cleanEmail = normalizeEmail(email);
    const cleanName = (name || '').trim();

    if (!cleanName || !cleanEmail || !password) {
      setLoading(false);
      throw new Error('Please fill all required fields.');
    }
    if (!isValidEmail(cleanEmail)) {
      setLoading(false);
      throw new Error('Please enter a valid email address.');
    }
    if (isTemporaryEmail(cleanEmail)) {
      setLoading(false);
      throw new Error('Temporary email addresses are not allowed.');
    }
    if (password.length < 6) {
      setLoading(false);
      throw new Error('Password must be at least 6 characters.');
    }

    const adminUser = auth.currentUser;
    if (!adminUser) {
      setLoading(false);
      throw new Error('Admin session missing. Please log in again.');
    }

    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, password);
      await updateProfile(cred.user, { displayName: cleanName });
      await sendEmailVerification(cred.user);
      await signOut(secondaryAuth);
      return cred.user;
    } catch (err) {
      setError(err.message || 'Failed to create student');
      throw err;
    } finally {
      setLoading(false);
      if (adminUser?.reload) {
        adminUser.reload().catch(() => {});
      }
    }
  };

  return { createStudent, loading, error };
};

export default useCreateStudent;
