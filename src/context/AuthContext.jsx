import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  fetchSignInMethodsForEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db, functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { isTemporaryEmail, isValidEmail, normalizeEmail } from '../utils/emailValidation';
import { isApprovedAccount, isDeletedAccount } from '../utils/studentStatus';
import { normalizeDob } from '../utils/studentImport';

const AuthContext = createContext();

const STUDENT_SESSION_KEY = 'tamil_student_session';
const PENDING_SIGNUP_KEY = 'pending_student_signup';

const readPendingSignups = () => {
  try {
    const raw = localStorage.getItem(PENDING_SIGNUP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writePendingSignups = (value) => {
  try {
    localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(value));
  } catch {
    // Ignore localStorage failures.
  }
};

const setPendingSignup = (email, payload) => {
  const key = normalizeEmail(email);
  const current = readPendingSignups();
  current[key] = payload;
  writePendingSignups(current);
};

const getPendingSignup = (email) => {
  const key = normalizeEmail(email);
  const current = readPendingSignups();
  return current[key] || null;
};

const clearPendingSignup = (email) => {
  const key = normalizeEmail(email);
  const current = readPendingSignups();
  if (key in current) {
    delete current[key];
    writePendingSignups(current);
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Never trust a client-editable cached profile as an authenticated session.
    localStorage.removeItem(STUDENT_SESSION_KEY);

    // Safety timeout: Ensure loading is never stuck for more than 2 seconds
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 2000);

    // 2. Default Firebase Auth state listener (primarily for Admin or Firebase Auth sessions)
    let profileUnsub = null;
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      clearTimeout(safetyTimer);
      profileUnsub?.();
      profileUnsub = null;
      if (!fbUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(fbUser);
      profileUnsub = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
        setProfile(snap.exists() ? { uid: snap.id, id: snap.id, ...snap.data() } : null);
        setLoading(false);
      }, (err) => {
        console.warn('Profile listener error:', err);
        setProfile(null);
        setLoading(false);
      });
    });

    return () => {
      clearTimeout(safetyTimer);
      unsub();
      profileUnsub?.();
    };
  }, []);

  const signupStudent = async ({ name, email, password, year, departmentId, departmentName }) => {
    const cleanEmail = normalizeEmail(email);
    const cleanName = (name || '').trim();
    const selectedYear = (year || '').trim();

    const selectedDepartmentId = (departmentId || '').trim();
    const selectedDepartmentName = (departmentName || '').trim();

    if (!cleanName || !cleanEmail || !selectedYear || !selectedDepartmentId || !selectedDepartmentName) {
      throw new Error('Please fill all fields.');
    }
    if (!isValidEmail(cleanEmail)) {
      throw new Error('Please enter a valid email address.');
    }
    if (isTemporaryEmail(cleanEmail)) {
      throw new Error('Temporary email addresses are not allowed.');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await updateProfile(cred.user, { displayName: cleanName });
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        name: cleanName,
        email: cleanEmail,
        role: 'student',
        year: selectedYear,
        departmentId: selectedDepartmentId,
        departmentName: selectedDepartmentName,
        status: 'pending',
        isDeleted: false,
        approved: false,
        isApproved: false,
        deletedAt: null,
        emailVerified: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setPendingSignup(cleanEmail, {
        name: cleanName,
        year: selectedYear,
        departmentId: selectedDepartmentId,
        departmentName: selectedDepartmentName,
      });
      await sendEmailVerification(cred.user);
      await signOut(auth);
      return {
        message: 'Verification email sent. Please check your inbox.',
      };
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        throw new Error('This email is already registered. Please sign in.');
      }
      throw err;
    }
  };

  const ensureVerifiedStudentProfile = async (fbUser) => {
    const userRef = doc(db, 'users', fbUser.uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data();
    }

    const pending = getPendingSignup(fbUser.email || '');
    const data = {
      uid: fbUser.uid,
      name: fbUser.displayName || pending?.name || 'Student',
      email: normalizeEmail(fbUser.email || ''),
      role: 'student',
      year: pending?.year || null,
      departmentId: pending?.departmentId || null,
      departmentName: pending?.departmentName || null,
      isDeleted: false,
      approved: false,
      status: 'pending',
      deletedAt: null,
      emailVerified: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(userRef, data);
    clearPendingSignup(fbUser.email || '');

    return {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };

  const login = async ({ email, password }) => {
    const cleanEmail = normalizeEmail(email);

    if (!isValidEmail(cleanEmail)) {
      const error = new Error('Invalid email or password.');
      error.code = 'auth/invalid-email';
      throw error;
    }
    if (!password) {
      const error = new Error('Invalid email or password.');
      error.code = 'auth/missing-password';
      throw error;
    }

    const classifyInvalidCredential = async () => {
      let methods = [];
      try {
        methods = await fetchSignInMethodsForEmail(auth, cleanEmail);
      } catch {
        // If sign-in methods check fails, fall back to invalid credentials message.
      }
      if (!methods.length) {
        const error = new Error('Account not created. Create account first.');
        error.code = 'auth/user-not-found';
        throw error;
      }
      const error = new Error('Invalid email or password.');
      error.code = 'auth/invalid-credential';
      throw error;
    };

    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
    } catch (err) {
      if (err?.code === 'auth/user-not-found') {
        const error = new Error('Account not created. Create account first.');
        error.code = 'auth/user-not-found';
        throw error;
      }
      if (err?.code === 'auth/wrong-password') {
        const error = new Error('Invalid email or password.');
        error.code = 'auth/wrong-password';
        throw error;
      }
      if (err?.code === 'auth/invalid-credential') {
        await classifyInvalidCredential();
      }
      // Pass through Firebase error codes for UI-level mapping.
      throw err;
    }

    await cred.user.reload();
    await cred.user.getIdToken(true);

    if (!cred.user.emailVerified) {
      const error = new Error('Your email verification link may be expired. Please resend verification email.');
      error.code = 'email-not-verified';
      error.unverifiedUser = cred.user;
      throw error;
    }

    let data = await ensureVerifiedStudentProfile(cred.user);

    if (data.role === 'admin') {
      setProfile(data);
      return data;
    }

    if (isDeletedAccount(data)) {
      await signOut(auth);
      const error = new Error('Your account has been deleted by admin.');
      error.code = 'account-deleted';
      throw error;
    }

    setProfile(data);

    if (!isApprovedAccount(data)) {
      await signOut(auth);
      let msg = 'Your account is waiting for admin approval.';
      if (data.status === 'rejected') msg = 'Your signup request was rejected by admin.';
      if (data.status === 'blocked') msg = 'Your account is blocked. Contact admin.';
      const error = new Error(msg);
      error.code = 'not-approved';
      throw error;
    }

    if (!data.year) {
      await signOut(auth);
      const error = new Error('No year assigned to this student. Contact admin.');
      error.code = 'year-missing';
      throw error;
    }

    return data;
  };

  const resendVerificationEmail = async ({
    user: unverifiedUser,
    signOutAfterSend = true,
  } = {}) => {
    if (!unverifiedUser) {
      const error = new Error('No unverified user session found.');
      error.code = 'unverified-user-missing';
      throw error;
    }

    await unverifiedUser.reload();
    if (unverifiedUser.emailVerified) {
      return { alreadyVerified: true };
    }

    await sendEmailVerification(unverifiedUser);

    if (signOutAfterSend) {
      await signOut(auth).catch(() => {});
    }

    return { sent: true };
  };

  const loginAdmin = async ({ email, password }) => {
    const cleanEmail = normalizeEmail(email);
    const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
    let snap;
    try {
      snap = await getDoc(doc(db, 'users', cred.user.uid));
    } catch (cause) {
      await signOut(auth).catch(() => {});
      const error = new Error('Could not read the admin profile. Check Firestore access rules and try again.');
      error.code = cause?.code === 'permission-denied' ? 'admin-profile-permission-denied' : cause?.code;
      throw error;
    }

    if (!snap.exists()) {
      await signOut(auth).catch(() => {});
      const error = new Error(`No admin profile exists for Firebase Auth UID ${cred.user.uid}. A project owner must create users/${cred.user.uid} with role "admin".`);
      error.code = 'admin-profile-missing';
      throw error;
    }

    const data = snap.data();

    if (isDeletedAccount(data)) {
      await signOut(auth);
      const error = new Error('Your account has been deleted by admin.');
      error.code = 'account-deleted';
      throw error;
    }
    if (data.role !== 'admin') {
      await signOut(auth);
      const error = new Error('Only admin can login here');
      error.code = 'not-admin';
      throw error;
    }
    setProfile(data);
    return data;
  };

  const loginStudentWithCredentials = async ({ identifier, dob }) => {
    const rawId = (identifier || '').trim();
    const normalizedInputDob = normalizeDob(dob);
    if (!rawId) throw new Error('Please enter your SIF Number or Mobile Number.');
    if (!normalizedInputDob) throw new Error('Please enter a valid Date of Birth.');

    localStorage.removeItem(STUDENT_SESSION_KEY);
    await signOut(auth).catch(() => {});
    try {
      const loginStudent = httpsCallable(functions, 'studentLoginWithCredentials');
      const response = await loginStudent({ identifier: rawId, dob: normalizedInputDob });
      const credential = await signInWithCustomToken(auth, response.data.customToken);
      const profileSnap = await getDoc(doc(db, 'users', credential.user.uid));
      if (!profileSnap.exists()) throw new Error('Student profile could not be loaded. Contact the administrator.');

      const freshProfile = { id: profileSnap.id, uid: profileSnap.id, ...profileSnap.data(), role: 'student' };
      if (isDeletedAccount(freshProfile) || !isApprovedAccount(freshProfile)) {
        await signOut(auth);
        throw new Error('This student account is unavailable or not approved. Contact the administrator.');
      }
      setUser(credential.user);
      setProfile(freshProfile);
      return freshProfile;
    } catch (err) {
      const message = err?.message || 'Student sign in failed.';
      const mapped = new Error(message.replace(/^Firebase: /, '').replace(/\s*\(functions\/[^)]+\)\.?$/, ''));
      mapped.code = err?.code;
      throw mapped;
    }
  };

  const logout = async () => {
    localStorage.removeItem(STUDENT_SESSION_KEY);
    setUser(null);
    setProfile(null);
    await signOut(auth).catch(() => {});
  };

  const value = {
    user,
    profile,
    loading,
    signupStudent,
    login,
    loginStudent: loginStudentWithCredentials,
    loginStudentWithCredentials,
    loginAdmin,
    resendVerificationEmail,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
