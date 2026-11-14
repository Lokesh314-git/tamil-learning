import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signInWithCustomToken, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { normalizeEmail } from '../utils/emailValidation';
import { isDeletedAccount } from '../utils/studentStatus';
import { clearStudentSession, readStudentSession, studentMongoApi } from '../services/studentMongoApi';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let profileUnsub = null;
    let disposed = false;

    const handleStudentSessionExpired = () => {
      setUser(null);
      setProfile(null);
      setLoading(false);
    };
    window.addEventListener('student-session-expired', handleStudentSessionExpired);

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      profileUnsub?.();
      profileUnsub = null;

      if (firebaseUser) {
        setUser(firebaseUser);
        profileUnsub = onSnapshot(doc(db, 'users', firebaseUser.uid), async (snapshot) => {
          if (disposed) return;
          if (!snapshot.exists()) {
            const session = readStudentSession();
            if (session?.studentId === firebaseUser.uid && session.student) {
              setProfile(session.student);
              setLoading(false);
              return;
            }
            await signOut(auth).catch(() => {});
            setProfile(null);
            setLoading(false);
            return;
          }

          const rawData = snapshot.data();
          const userRole = rawData.role || (firebaseUser.email ? 'admin' : 'student');
          const userProfile = { uid: snapshot.id, id: snapshot.id, ...rawData, role: userRole };

          if (isDeletedAccount(userProfile)) {
            await signOut(auth).catch(() => {});
            setProfile(null);
            setLoading(false);
            return;
          }

          setProfile(userProfile);
          setLoading(false);
        }, (error) => {
          console.warn('Profile listener error:', error);
          if (!disposed) {
            setLoading(false);
          }
        });
        return;
      }

      setUser(null);
      setProfile(null);
      clearStudentSession();
      setLoading(false);
    });

    return () => {
      disposed = true;
      window.removeEventListener('student-session-expired', handleStudentSessionExpired);
      unsubAuth();
      profileUnsub?.();
    };
  }, []);

  const loginAdmin = async ({ email, password }) => {
    clearStudentSession();
    await signOut(auth).catch(() => {});
    const cleanEmail = normalizeEmail(email);

    // 1. Authenticate with Firebase Authentication
    try {
      const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const snapshot = await getDoc(doc(db, 'users', credential.user.uid));
      if (!snapshot.exists() || snapshot.data().role !== 'admin') {
        await signOut(auth).catch(() => {});
        const error = new Error('Only administrator accounts can sign in here.');
        error.code = 'not-admin';
        throw error;
      }
      const adminProfile = { uid: snapshot.id, id: snapshot.id, ...snapshot.data() };
      if (isDeletedAccount(adminProfile)) {
        await signOut(auth);
        throw new Error('Your account has been deleted by admin.');
      }
      setUser(credential.user);
      setProfile(adminProfile);
      return adminProfile;
    } catch (firebaseErr) {
      // 2. If Firebase Auth password fails, check if this is an admin student logging in via Mobile Number and DOB
      try {
        const studentProfile = await studentMongoApi.login({ mobileNumber: email, dob: password });
        if (studentProfile && studentProfile.role === 'admin') {
          if (studentProfile.customToken) {
            await signInWithCustomToken(auth, studentProfile.customToken);
          }
          const studentId = studentProfile.uid || studentProfile.id;
          setUser(auth.currentUser || { uid: studentId, studentId, ...studentProfile });
          setProfile({ ...studentProfile, id: studentId, uid: studentId, role: 'admin' });
          return { ...studentProfile, role: 'admin' };
        } else if (studentProfile) {
          clearStudentSession();
          const err = new Error('This account is registered as a student. Admin privileges have not been granted.');
          err.code = 'not-admin';
          throw err;
        }
      } catch (studentErr) {
        if (studentErr.code === 'not-admin') throw studentErr;
        throw firebaseErr;
      }
      throw firebaseErr;
    }
  };

  const loginStudentWithCredentials = async ({ mobileNumber, dob, identifier }) => {
    clearStudentSession();
    await signOut(auth).catch(() => {});
    const cleanMobile = String(mobileNumber || identifier || '').trim().replace(/\D/g, '').slice(-10);
    try {
      const studentProfile = await studentMongoApi.login({ mobileNumber: cleanMobile, dob });
      const studentId = studentProfile?.uid || studentProfile?.id;
      if (!studentId) {
        clearStudentSession();
        throw new Error('Invalid mobile number or date of birth.');
      }

      // Authenticate genuinely with Firebase Auth using the server-issued Custom Auth Token
      if (studentProfile.customToken) {
        try {
          const cred = await signInWithCustomToken(auth, studentProfile.customToken);
          const currentUser = cred.user;
          const userRole = studentProfile.role === 'admin' ? 'admin' : 'student';
          setUser(currentUser);
          setProfile({ ...studentProfile, id: studentId, uid: studentId, role: userRole });
          setLoading(false);
          return { ...studentProfile, role: userRole };
        } catch (authErr) {
          console.warn('[AuthContext] signInWithCustomToken notice:', authErr.message);
        }
      }

      const userRole = studentProfile.role === 'admin' ? 'admin' : 'student';
      setUser(auth.currentUser || { uid: studentId, studentId, ...studentProfile });
      setProfile({ ...studentProfile, id: studentId, uid: studentId, role: userRole });
      setLoading(false);
      return { ...studentProfile, role: userRole };
    } catch (error) {
      clearStudentSession();
      throw error;
    }
  };

  const refreshProfile = useCallback(async () => {
    if (!user?.uid) return profile;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const nextProfile = { uid: snap.id, id: snap.id, ...snap.data() };
        setProfile(nextProfile);
        return nextProfile;
      }
    } catch (_) {}
    return profile;
  }, [profile, user]);

  const logout = async () => {
    clearStudentSession();
    await signOut(auth).catch(() => {});
    setUser(null);
    setProfile(null);
    setLoading(false);
  };

  const value = {
    user,
    profile,
    role: profile?.role || (user?.email ? 'admin' : (user ? 'student' : null)),
    loading,
    loginStudent: loginStudentWithCredentials,
    loginStudentWithCredentials,
    loginAdmin,
    refreshProfile,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
