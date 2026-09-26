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
  apiKey: "AIzaSyBfCwllgEfXaZj3682cIuWo2G6bgg98wvs",
  authDomain: "tamil-learning-2d773.firebaseapp.com",
  projectId: "tamil-learning-2d773",
  messagingSenderId: "65145408113",
  appId: "1:65145408113:web:d171b55ea346e51bb829d0",
  measurementId: "G-FS3NHJNFCB"
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
