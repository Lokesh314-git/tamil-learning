import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signInWithCustomToken, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { normalizeEmail } from '../utils/emailValidation';
import { isDeletedAccount } from '../utils/studentStatus';
import { ROOT_ADMIN_EMAIL } from '../utils/roles';
import { studentAuthService, normalizeMobile, readStudentSession, clearStudentSession } from '../services/studentAuthService';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let profileUnsub = null;
    let disposed = false;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      profileUnsub?.();
      profileUnsub = null;

      if (firebaseUser) {
        setUser(firebaseUser);
        profileUnsub = onSnapshot(doc(db, 'users', firebaseUser.uid), async (snapshot) => {
          if (disposed) return;
          if (!snapshot.exists()) {
            if (firebaseUser.email && normalizeEmail(firebaseUser.email) === ROOT_ADMIN_EMAIL) {
              const rootDoc = {
                uid: firebaseUser.uid,
                id: firebaseUser.uid,
                email: normalizeEmail(firebaseUser.email),
                name: 'Administrator',
                role: 'admin',
                isRootAdmin: true,
                createdAt: new Date().toISOString()
              };
              setProfile(rootDoc);
              setLoading(false);
              return;
            }
            await signOut(auth).catch(() => {});
            setUser(null);
            setProfile(null);
            setLoading(false);
            return;
          }

          const rawData = snapshot.data();
          const userRole = rawData.role || (firebaseUser.email ? 'admin' : 'student');
          const userProfile = { uid: snapshot.id, id: snapshot.id, ...rawData, role: userRole };

          if (isDeletedAccount(userProfile)) {
            await signOut(auth).catch(() => {});
            setUser(null);
            setProfile(null);
            setLoading(false);
            return;
          }

          setProfile(userProfile);
          setLoading(false);
        }, (error) => {
          console.warn('Profile listener error:', error);
          if (firebaseUser.email && normalizeEmail(firebaseUser.email) === ROOT_ADMIN_EMAIL) {
            const rootDoc = {
              uid: firebaseUser.uid,
              id: firebaseUser.uid,
              email: normalizeEmail(firebaseUser.email),
              name: 'Administrator',
              role: 'admin',
              isRootAdmin: true
            };
            setProfile(rootDoc);
          }
          if (!disposed) {
            setLoading(false);
          }
        });
        return;
      }

      // Spark Plan Session Persistence: If no Firebase Auth user, restore verified student session
      const studentSession = readStudentSession();
      if (studentSession?.studentId && studentSession.authenticated && studentSession.student) {
        const student = studentSession.student;
        const uid = studentSession.studentId;
        setUser({ uid, id: uid, ...student });
        setProfile(student);
        setLoading(false);
        return;
      }

      setUser(null);
      setProfile(null);
      setLoading(false);
    });

    return () => {
      disposed = true;
      unsubAuth();
      profileUnsub?.();
    };
  }, []);

  const loginAdmin = async ({ email, password }) => {
    clearStudentSession();
    await signOut(auth).catch(() => {});
    const cleanEmail = normalizeEmail(email);

    // 1. Authenticate with Firebase Authentication
    const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    let snapshot;
    try {
      snapshot = await getDoc(doc(db, 'users', credential.user.uid));
    } catch (firestoreErr) {
      if (firestoreErr.code === 'permission-denied') {
        // If this is the designated root admin whose email was verified by Firebase Auth,
        // grant immediate admin access even if Firestore rules have not finished propagating.
        if (cleanEmail === ROOT_ADMIN_EMAIL) {
          const adminDoc = {
            uid: credential.user.uid,
            id: credential.user.uid,
            email: cleanEmail,
            name: 'Administrator',
            role: 'admin',
            isRootAdmin: true,
            createdAt: new Date().toISOString()
          };
          setUser(credential.user);
          setProfile(adminDoc);
          setDoc(doc(db, 'users', credential.user.uid), adminDoc).catch(() => {});
          return adminDoc;
        }
        const err = new Error('Firestore denied access to your admin profile. Ask the project owner to check Firestore rules for your account.');
        err.code = 'admin-profile-permission-denied';
        throw err;
      }
      throw firestoreErr;
    }

    if (!snapshot.exists()) {
      if (cleanEmail === ROOT_ADMIN_EMAIL) {
        const adminDoc = {
          uid: credential.user.uid,
          id: credential.user.uid,
          email: cleanEmail,
          name: 'Administrator',
          role: 'admin',
          isRootAdmin: true,
          createdAt: new Date().toISOString()
        };
        try {
          await setDoc(doc(db, 'users', credential.user.uid), adminDoc);
          setUser(credential.user);
          setProfile(adminDoc);
          return adminDoc;
        } catch (writeErr) {
          console.warn('Auto-seed root admin write notice:', writeErr);
        }
      }

      await signOut(auth).catch(() => {});
      const error = new Error('No admin profile found in Firestore for this account.');
      error.code = 'not-admin';
      throw error;
    }

    if (snapshot.data().role !== 'admin') {
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
  };

  const loginStudentWithCredentials = async ({ mobileNumber, dob, identifier }) => {
    clearStudentSession();
    await signOut(auth).catch(() => {});
    const cleanMobile = normalizeMobile(mobileNumber || identifier || '');

    // 1. Authenticate with direct Firestore verification (100% Spark Plan compatible)
    const { student } = await studentAuthService.loginStudent({
      mobileNumber: cleanMobile,
      dob
    });

    const studentUid = String(student.uid || student.id);
    const finalProfile = {
      ...student,
      uid: studentUid,
      id: studentUid,
      role: 'student',
      status: student.status || 'active'
    };

    if (isDeletedAccount(finalProfile) || ['deleted', 'blocked', 'rejected', 'inactive'].includes(finalProfile.status)) {
      clearStudentSession();
      await signOut(auth).catch(() => {});
      throw new Error('Student account is inactive or blocked. Please contact your department admin.');
    }

    setUser({ uid: studentUid, id: studentUid, ...finalProfile });
    setProfile(finalProfile);
    setLoading(false);
    return finalProfile;
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
