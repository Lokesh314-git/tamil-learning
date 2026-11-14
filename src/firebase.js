import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setLogLevel as setFirestoreLogLevel
} from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

export const firebaseConfig = {
  apiKey: "AIzaSyALJkLtYmUncwLzzxA1lCzBD_4uhtAG9AE",
  authDomain: "tamil-learning-9f609.firebaseapp.com",
  projectId: "tamil-learning-9f609",
  storageBucket: "tamil-learning-9f609.firebasestorage.app",
  messagingSenderId: "1001786235235",
  appId: "1:1001786235235:web:a5b9ac1c24a1b15111db56",
  measurementId: "G-NX4TFD061T"
};

// Avoid re-initialization during Vite HMR
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

// Reuse Firestore instance if it already exists
const existingDb = globalThis._firestoreDb;
const db =
  existingDb ||
  initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    experimentalAutoDetectLongPolling: true
  });
globalThis._firestoreDb = db;
setFirestoreLogLevel('error');

// Must match callable function region
const functions = getFunctions(app, 'us-central1');

export { app, auth, db, functions };
