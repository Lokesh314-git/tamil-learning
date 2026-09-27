import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
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
        clearStudentSession();
        setUser(firebaseUser);
        profileUnsub = onSnapshot(doc(db, 'users', firebaseUser.uid), async (snapshot) => {
          if (!snapshot.exists() || snapshot.data().role !== 'admin') {
            await signOut(auth).catch(() => {});
            return;
          }
          const adminProfile = { uid: snapshot.id, id: snapshot.id, ...snapshot.data() };
          if (isDeletedAccount(adminProfile)) {
            await signOut(auth).catch(() => {});
            return;
          }
          if (!disposed) {
            setUser(firebaseUser);
            setProfile(adminProfile);
            setLoading(false);
          }
        }, (error) => {
          console.warn('Admin profile listener error:', error);
          if (!disposed) {
            setProfile(null);
            setLoading(false);
          }
        });
        return;
      }

      setUser(null);
      setProfile(null);
      const session = readStudentSession();
      if (!session) {
        setLoading(false);
        return;
      }

      setLoading(true);
      studentMongoApi.me().then((studentProfile) => {
        if (disposed) return;
        if (studentProfile?.status !== 'active' && studentProfile?.status !== 'approved' && !studentProfile?.role) {
          throw new Error('Student account is inactive.');
        }
        const studentId = session.studentId;
        const userRole = studentProfile?.role || 'student';
        setUser({ uid: studentId, studentId, mongoAuthenticated: true });
        setProfile({ ...studentProfile, id: studentId, uid: studentId, role: userRole });
      }).catch((error) => {
        console.warn('MongoDB student session could not be restored:', error);
        clearStudentSession();
      }).finally(() => {
        if (!disposed) setLoading(false);
      });
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

    // 1. Try Firebase Authentication first
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
      // 2. If Firebase Auth fails, check if this is a promoted student admin logging in via SIF / Email / Mobile and DOB
      try {
        const studentProfile = await studentMongoApi.login({ identifier: email, dob: password });
        if (studentProfile && studentProfile.role === 'admin') {
          const studentId = studentProfile.uid || studentProfile.id;
          setUser({ uid: studentId, studentId, mongoAuthenticated: true });
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
        // Re-throw original firebase error if both failed
        throw firebaseErr;
      }
      throw firebaseErr;
    }
  };

  const loginStudentWithCredentials = async ({ identifier, dob }) => {
    await signOut(auth).catch(() => {});
    try {
      const studentProfile = await studentMongoApi.login({ identifier: String(identifier || '').trim(), dob });
      const studentId = studentProfile?.uid || studentProfile?.id;
      if (!studentId) {
        clearStudentSession();
        throw new Error('Invalid Mobile Number/SIF Number or Date of Birth.');
      }
      const userRole = studentProfile.role === 'admin' ? 'admin' : 'student';
      setUser({ uid: studentId, studentId, mongoAuthenticated: true });
      setProfile({ ...studentProfile, id: studentId, uid: studentId, role: userRole });
      setLoading(false);
      return { ...studentProfile, role: userRole };
    } catch (error) {
      clearStudentSession();
      throw error;
    }
  };

  const refreshProfile = useCallback(async () => {
    if (!user?.mongoAuthenticated) return profile;
    const studentProfile = await studentMongoApi.me();
    const userRole = studentProfile?.role || 'student';
    const nextProfile = { ...studentProfile, uid: user.uid, id: user.uid, role: userRole };
    setProfile(nextProfile);
    return nextProfile;
  }, [profile, user]);

  const logout = async () => {
    if (user?.mongoAuthenticated) await studentMongoApi.logout().catch(() => clearStudentSession());
    else {
      clearStudentSession();
      await signOut(auth).catch(() => {});
    }
    setUser(null);
    setProfile(null);
  };

  const value = {
    user,
    profile,
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
