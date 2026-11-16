const admin = require('firebase-admin');
const { setGlobalOptions } = require('firebase-functions/v2');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');
const { Readable } = require('stream');
const crypto = require('crypto');
const cors = require('cors')({ origin: true, credentials: true });
const { defineSecret } = require('firebase-functions/params');
const MONGODB_URI = defineSecret('MONGODB_URI');
const STUDENT_JWT_SECRET = defineSecret('STUDENT_JWT_SECRET');

const ALLOWED_ORIGINS = [
  'https://tamil-learning.onrender.com',
  'https://lokesh314-git.github.io',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  /^https:\/\/.*\.onrender\.com$/,
  /^https:\/\/.*\.web\.app$/,
  /^https:\/\/.*\.firebaseapp\.com$/
];

setGlobalOptions({
  region: 'us-central1',
  cors: ALLOWED_ORIGINS,
  invoker: 'public'
});

if (!admin.apps.length) {
  admin.initializeApp();
}

async function assertAdmin(request) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be authenticated.');
  }

  const token = request.auth?.token || request.token || {};
  if (token.admin === true || token.role === 'admin' || (token.email && token.email.toLowerCase() === 'tamillearning2024@gmail.com')) {
    return uid;
  }

  const snap = await admin.firestore().doc(`users/${uid}`).get();
  if (!snap.exists || snap.get('role') !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin only.');
  }

  return uid;
}

async function assertAdminHttp(req) {
  const decoded = await verifyHttpUser(req);
  await assertAdmin({ auth: { uid: decoded.uid, token: decoded } });
}

async function verifyHttpUser(req) {
  const authorization = String(req.headers.authorization || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1] : (req.query?.token || req.query?.auth);
  if (token) {
    return admin.auth().verifyIdToken(token);
  }

  // Check X-Student-Id header / query for Spark plan student authentication
  const studentId = req.headers['x-student-id'] || req.query?.studentId;
  if (studentId) {
    let docSnap = await admin.firestore().doc(`users/${studentId}`).get();
    if (!docSnap.exists) {
      docSnap = await admin.firestore().doc(`students/${studentId}`).get();
    }
    if (docSnap.exists) {
      const data = docSnap.data();
      if (!data.isDeleted && data.status !== 'blocked' && data.status !== 'deleted' && data.status !== 'inactive') {
        return { uid: studentId, role: 'student', isStudentSession: true, studentData: data };
      }
    }
  }

  throw new HttpsError('unauthenticated', 'Sign in is required.');
}

function normalizeDobServer(value) {
  if (!value) return '';
  if (value.toDate instanceof Function) value = value.toDate();
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const input = String(value).trim();
  let match = input.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) return validatedDob(match[1], match[2], match[3]);
  match = input.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) return validatedDob(match[3], match[2], match[1]);
  return '';
}

function validatedDob(year, month, day) {
  const y = Number(year), m = Number(month), d = Number(day);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (!y || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return '';
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

exports.importStudentsToMongo = onCall({
  region: 'us-central1',
  cors: true,
  secrets: [MONGODB_URI],
}, async (request) => {
  await assertAdmin(request);
  const students = request.data?.students;
  if (!Array.isArray(students) || students.length < 1 || students.length > 120) {
    throw new HttpsError('invalid-argument', 'Provide between 1 and 120 student records.');
  }

  const records = students.map((student) => {
    const uid = String(student?.uid || '').trim();
    const sifNumber = student?.sifNumber ? String(student.sifNumber).trim().toUpperCase().replace(/\s+/g, '') : null;
    const mobileNumber = String(student?.mobileNumber || '').replace(/\D/g, '').slice(-10);
    const dob = normalizeDobServer(student?.dob);
    if (!uid || !mobileNumber || mobileNumber.length !== 10 || !dob) {
      throw new HttpsError('invalid-argument', 'Each student needs a UID, valid 10-digit mobile number, and valid date of birth.');
    }
    const record = { ...student, uid, dob, role: 'student', updatedAt: new Date() };
    if (sifNumber) record.sifNumber = sifNumber;
    else delete record.sifNumber;
    if (mobileNumber) record.mobileNumber = mobileNumber;
    return record;
  });

  try {
    const client = await getMongoClient();
    const studentsCollection = client.db(MONGO_DB_NAME).collection('students');
    await ensureStudentMongoIndexes(studentsCollection);
    await writeStudentRecords(studentsCollection, records);
    return { success: true, count: records.length };
  } catch (error) {
    console.error('[importStudentsToMongo] Import failed:', error);
    throw new HttpsError('internal', error?.code === 11000
      ? 'A mobile number or roll number is already assigned to another imported student.'
      : 'Could not save student records to MongoDB. Check the MongoDB connection and try again.');
  }
});

exports.deleteStudentFromMongo = onCall({
  region: 'us-central1',
  cors: true,
  secrets: [MONGODB_URI],
}, async (request) => {
  await assertAdmin(request);
  const studentId = String(request.data?.studentId || '').trim();
  if (!studentId || studentId.length > 128) throw new HttpsError('invalid-argument', 'A valid student ID is required.');
  try {
    const client = await getMongoClient();
    const mongoDb = client.db(MONGO_DB_NAME);
    await mongoDb.collection('students').deleteOne({ _id: studentId });
    await mongoDb.collection('student_preferences').deleteOne({ _id: studentId });
    await Promise.all([...STUDENT_PRIVATE_COLLECTIONS].map((name) => mongoDb.collection(name).deleteMany({ studentId })));
    return { success: true };
  } catch (error) {
    console.error('[deleteStudentFromMongo] Delete failed:', error);
    throw new HttpsError('internal', 'Could not remove student records from MongoDB.');
  }
});

exports.migrateStudentProfilesToMongo = onCall({
  region: 'us-central1',
  cors: true,
  secrets: [MONGODB_URI],
}, async (request) => {
  await assertAdmin(request);
  try {
    const firestoreDb = admin.firestore();
    const client = await getMongoClient();
    const mongoDb = client.db(MONGO_DB_NAME);
    const migrationState = mongoDb.collection('app_migrations');
    if (await migrationState.findOne({ _id: 'studentProfilesToMongoV1' })) {
      return { success: true, skipped: true, students: 0, portalRecords: 0 };
    }
    const snapshot = await firestoreDb.collection('users').where('role', '==', 'student').get();
    const records = snapshot.docs.map((document) => ({ uid: document.id, ...normalizeDatabaseValues(document.data()) }))
      .filter((student) => student.dob && (student.sifNumber || student.mobileNumber));
    const studentsCollection = mongoDb.collection('students');
    await ensureStudentMongoIndexes(studentsCollection);
    for (let i = 0; i < records.length; i += 500) {
      await writeStudentRecords(studentsCollection, records.slice(i, i + 500));
    }

    let portalRecords = 0;
    for (const collectionName of STUDENT_MIRRORED_COLLECTIONS) {
      const portalSnapshot = await firestoreDb.collection(collectionName).get();
      const target = mongoDb.collection(collectionName);
      const docs = portalSnapshot.docs.map((document) => ({
        replaceOne: {
          filter: { _id: document.id },
          replacement: { ...normalizeDatabaseValues(document.data()), _id: document.id },
          upsert: true,
        },
      }));
      for (let i = 0; i < docs.length; i += 500) {
        await target.bulkWrite(docs.slice(i, i + 500), { ordered: false });
      }
      portalRecords += docs.length;
    }
    await migrationState.insertOne({ _id: 'studentProfilesToMongoV1', completedAt: new Date(), importedStudents: records.length });
    return { success: true, students: records.length, portalRecords };
  } catch (error) {
    console.error('[migrateStudentProfilesToMongo] Migration failed:', error);
    throw new HttpsError('internal', 'Could not migrate existing student profiles to MongoDB.');
  }
});

exports.syncStudentProfileToMongo = onDocumentWritten(
  { document: 'users/{uid}', region: 'us-central1', secrets: [MONGODB_URI] },
  async (event) => {
    const client = await getMongoClient();
    const studentsCollection = client.db(MONGO_DB_NAME).collection('students');
    const after = event.data?.after;
    if (!after?.exists) {
      await studentsCollection.deleteOne({ _id: event.params.uid });
      return;
    }
    const profile = normalizeDatabaseValues(after.data());
    if (profile.role !== 'student') return;
    const sifNumber = String(profile.sifNumber || '').trim().toUpperCase().replace(/\s+/g, '');
    const mobileNumber = String(profile.mobileNumber || '').replace(/\D/g, '').slice(-10);
    const dob = normalizeDobServer(profile.dob);
    if ((!sifNumber && !mobileNumber) || (mobileNumber && mobileNumber.length !== 10) || !dob) return;
    await ensureStudentMongoIndexes(studentsCollection);
    const record = {
      ...profile,
      uid: event.params.uid,
      dob,
      role: 'student',
      _id: event.params.uid,
      updatedAt: new Date(),
    };
    if (sifNumber) record.sifNumber = sifNumber;
    else delete record.sifNumber;
    if (mobileNumber) record.mobileNumber = mobileNumber;
    else delete record.mobileNumber;
    await studentsCollection.replaceOne(
      { _id: event.params.uid },
      record,
      { upsert: true }
    );
  }
);

exports.syncPortalCollectionToMongo = onDocumentWritten(
  { document: '{collectionName}/{documentId}', region: 'us-central1', secrets: [MONGODB_URI] },
  async (event) => {
    const collectionName = event.params.collectionName;
    if (!STUDENT_MIRRORED_COLLECTIONS.has(collectionName)) return;
    const client = await getMongoClient();
    const collection = client.db(MONGO_DB_NAME).collection(collectionName);
    const documentId = event.params.documentId;
    if (!event.data?.after.exists) {
      await collection.deleteOne({ _id: documentId });
      return;
    }
    await collection.replaceOne(
      { _id: documentId },
      { ...normalizeDatabaseValues(event.data.after.data()), _id: documentId },
      { upsert: true }
    );
  }
);

function studentSafeTest(testData) {
  const { questions = [], answerKey: _ak, correctAnswers: _ca, ...metadata } = testData || {};
  return {
    ...metadata,
    questions: questions.map((question) => {
      const source = question || {};
      return {
        question: source.question || source.questionText || '',
        options: Array.isArray(source.options) ? source.options.map((option) => String(option)) : [],
        ...(source.imageUrl ? { imageUrl: source.imageUrl } : {}),
        ...(source.points != null ? { points: source.points } : {}),
      };
    }),
  };
}

exports.publishSafeStudentTest = onDocumentWritten(
  { document: 'tests/{testId}', region: 'us-central1' },
  async (event) => {
    const db = admin.firestore();
    const target = db.doc(`publishedTests/${event.params.testId}`);
    if (!event.data?.after.exists) {
      await target.delete();
      return;
    }
    await target.set(studentSafeTest(event.data.after.data()));
  }
);

exports.resetPasswordByAdmin = onCall({ region: 'us-central1', cors: true }, async (request) => {
  await assertAdmin(request);
  const uid = request.data?.uid;
  const password = request.data?.password;

  if (!uid || !password) {
    throw new HttpsError('invalid-argument', 'uid and password are required');
  }
  if (typeof password !== 'string' || password.length < 6) {
    throw new HttpsError('invalid-argument', 'Password must be at least 6 characters.');
  }

  try {
    await admin.auth().updateUser(uid, { password });
    return { success: true };
  } catch (err) {
    console.error('resetPasswordByAdmin failed', err);
    throw new HttpsError('internal', err?.message || 'Failed to reset password');
  }
});

/**
 * Automatically triggers Push Notification when a document is created in 'notifications' collection
 */
exports.onTestNotificationCreated = onDocumentCreated(
  {
    document: 'notifications/{notifId}',
    region: 'us-central1'
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();

    // If scheduled for future delivery, skip immediate push
    if (data.isScheduled && data.scheduledFor) {
      const scheduleTime = new Date(data.scheduledFor).getTime();
      if (scheduleTime > Date.now() + 60000) {
        console.log(`[FCM] Notification ${event.params.notifId} scheduled for ${data.scheduledFor}, skipping immediate send.`);
        return;
      }
    }

    const title = data.title || 'New Academic Activity';
    const body = data.body || 'A new update has been published in the student portal.';
    const notifId = event.params.notifId;

    // Determine target FCM topics
    const topics = [];
    if (!data.targetType || data.targetType === 'all') {
      topics.push('all_students');
    } else if (data.targetType === 'year' && data.targetYear && data.targetYear !== 'all') {
      topics.push(`year_${data.targetYear}`);
    } else if (data.targetType === 'department' && data.targetDepartmentId && data.targetDepartmentId !== 'all') {
      topics.push(`dept_${data.targetDepartmentId}`);
    } else if (data.targetType === 'section' && data.targetSection && data.targetSection !== 'all') {
      topics.push(`section_${data.targetSection}`);
    } else {
      topics.push('all_students');
    }

    for (const topic of topics) {
      try {
        const message = {
          topic,
          notification: {
            title,
            body
          },
          data: {
            notificationId: String(notifId),
            testId: String(data.testId || ''),
            testTitle: String(data.testTitle || data.title || ''),
            taskId: String(data.taskId || ''),
            materialId: String(data.materialId || ''),
            announcementId: String(data.announcementId || ''),
            subject: String(data.subject || 'Tamil'),
            testDate: String(data.testDate || ''),
            testTime: String(data.testTime || ''),
            dueDate: String(data.dueDate || ''),
            duration: String(data.duration || '30'),
            description: String(data.description || ''),
            type: String(data.type || 'new_test'),
            targetYear: String(data.targetYear || 'all'),
            targetDepartmentId: String(data.targetDepartmentId || 'all'),
            route: String(data.route || '/student/notifications')
          },
          webpush: {
            fcmOptions: {
              link: data.route || '/student/notifications'
            }
          }
        };

        const response = await admin.messaging().send(message);
        console.log(`[FCM] Sent message to topic ${topic} for notif ${notifId}:`, response);
      } catch (err) {
        console.error(`[FCM] Error sending message to topic ${topic}:`, err);
      }
    }
  }
);

/**
 * Callable Function for Admin to explicitly dispatch test notifications
 */
exports.sendTestNotificationFCM = onCall({ region: 'us-central1', cors: true }, async (request) => {
  await assertAdmin(request);
  const data = request.data || {};

  const topic = data.topic || 'all_students';
  const title = data.title || 'New Test Available';
  const body = data.body || 'A new assessment has been published.';

  try {
    const message = {
      topic,
      notification: { title, body },
      data: {
        notificationId: String(data.notificationId || Date.now()),
        testId: String(data.testId || ''),
        testTitle: String(data.testTitle || ''),
        subject: String(data.subject || 'Tamil'),
        testDate: String(data.testDate || ''),
        testTime: String(data.testTime || ''),
        duration: String(data.duration || '30'),
        description: String(data.description || ''),
        type: String(data.type || 'new_test'),
        route: String(data.route || '/student/tests')
      },
      webpush: {
        fcmOptions: {
          link: data.route || '/student/tests'
        }
      }
    };

    const response = await admin.messaging().send(message);
    return { success: true, messageId: response };
  } catch (err) {
    console.error('[FCM] Callable failed:', err);
    throw new HttpsError('internal', err?.message || 'Failed to dispatch FCM message');
  }
});

/**
 * =========================================================================
 * Rate-Limiting Cache for Student Sign-In Protection
 * =========================================================================
 */
const studentLoginAttempts = new Map();

function checkLoginRateLimit(key, maxAttempts = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const record = studentLoginAttempts.get(key) || { count: 0, lastAttempt: now };
  if (now - record.lastAttempt > windowMs) {
    record.count = 1;
    record.lastAttempt = now;
    studentLoginAttempts.set(key, record);
    return true;
  }
  if (record.count >= maxAttempts) {
    return false;
  }
  record.count += 1;
  record.lastAttempt = now;
  studentLoginAttempts.set(key, record);
  return true;
}

function clearLoginRateLimit(key) {
  studentLoginAttempts.delete(key);
}

/**
 * Callable: Secure Student Authentication
 * Validates Registered Mobile Number + DOB server-side,
 * rejects ambiguous duplicate mobile numbers, ensures Firebase Auth account exists,
 * assigns role-based custom claims, and returns a Firebase Custom Auth Token.
 */
exports.studentLogin = onCall({ region: 'us-central1', cors: ALLOWED_ORIGINS }, async (request) => {
  const rawMobile = String(request.data?.mobileNumber || request.data?.identifier || '').trim();
  const rawDob = request.data?.dob;

  // 1. Mobile Number Normalization & Validation (10 digits)
  const digitsOnly = rawMobile.replace(/\D/g, '');
  let mobileNumber = digitsOnly;
  if (digitsOnly.length > 10 && (digitsOnly.startsWith('91') || digitsOnly.startsWith('0'))) {
    mobileNumber = digitsOnly.startsWith('91') ? digitsOnly.slice(2, 12) : digitsOnly.slice(-10);
  }
  if (mobileNumber.length > 10) {
    mobileNumber = mobileNumber.slice(-10);
  }

  if (!mobileNumber || mobileNumber.length !== 10) {
    throw new HttpsError('invalid-argument', 'Please enter a valid 10-digit registered mobile number.');
  }

  // 2. Date of Birth Normalization & Validation
  const dob = normalizeDobServer(rawDob);
  if (!dob) {
    throw new HttpsError('invalid-argument', 'Please enter a valid Date of Birth.');
  }

  const todayIso = new Date().toISOString().split('T')[0];
  if (dob > todayIso) {
    throw new HttpsError('invalid-argument', 'Date of Birth cannot be in the future.');
  }

  // 3. Client IP & Rate Limiting
  const clientIp = String(
    request.rawRequest?.headers?.['x-forwarded-for'] ||
    request.rawRequest?.ip ||
    'client'
  ).split(',')[0].trim();
  const rateLimitKey = `${clientIp}:${mobileNumber}`;

  if (!checkLoginRateLimit(rateLimitKey)) {
    throw new HttpsError('resource-exhausted', 'Too many sign-in attempts. Please try again in 15 minutes.');
  }

  const db = admin.firestore();
  const usersRef = db.collection('users');

  // 4. Query Firestore users collection by mobileNumber and phone
  const [mobileSnap, phoneSnap] = await Promise.all([
    usersRef.where('role', '==', 'student').where('mobileNumber', '==', mobileNumber).get(),
    usersRef.where('role', '==', 'student').where('phone', '==', mobileNumber).get()
  ]);

  const matchedDocsMap = new Map();
  for (const doc of [...mobileSnap.docs, ...phoneSnap.docs]) {
    matchedDocsMap.set(doc.id, doc);
  }

  let candidates = Array.from(matchedDocsMap.values());

  // Filter out permanently deleted accounts
  candidates = candidates.filter((d) => {
    const data = d.data();
    return data.isDeleted !== true && data.status !== 'deleted';
  });

  // 5. Ambiguous Duplicate Mobile Number Check
  if (candidates.length > 1) {
    console.warn(`[studentLogin] Ambiguous duplicate mobile number: ${mobileNumber} shared by UIDs:`, candidates.map((d) => d.id));
    throw new HttpsError(
      'failed-precondition',
      'Multiple student accounts are associated with this mobile number. Please contact your college administrator for correction.'
    );
  }

  // 6. Verify Record Exists in Firestore
  if (candidates.length === 0) {
    throw new HttpsError('unauthenticated', 'Invalid mobile number or date of birth.');
  }

  const matchedDoc = candidates[0];
  const studentData = matchedDoc.data();
  const studentUid = matchedDoc.id;

  // 7. Verify Account Status
  if (studentData.isDeleted === true || ['deleted', 'blocked', 'rejected', 'inactive'].includes(studentData.status)) {
    throw new HttpsError('permission-denied', 'Student account is inactive or blocked. Please contact your department admin.');
  }

  // 8. Verify Secure Date of Birth Match
  const storedDob = normalizeDobServer(studentData.dob);
  if (!storedDob || storedDob !== dob) {
    throw new HttpsError('unauthenticated', 'Invalid mobile number or date of birth.');
  }

  clearLoginRateLimit(rateLimitKey);

  // 10. Ensure Firebase Auth account exists for this student UID
  try {
    await admin.auth().getUser(studentUid);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      await admin.auth().createUser({
        uid: studentUid,
        displayName: studentData.name || 'Student',
        email: studentData.email && studentData.email.includes('@') ? studentData.email : undefined,
      });
    }
  }

  // 11. Set custom user claims for Firestore security rules
  const customClaims = {
    role: 'student',
    year: studentData.year || '1st Year',
    departmentId: studentData.departmentId || 'all',
  };
  await admin.auth().setCustomUserClaims(studentUid, customClaims);

  // 12. Issue Firebase Custom Auth Token
  const customToken = await admin.auth().createCustomToken(studentUid, customClaims);

  return {
    success: true,
    customToken,
    student: {
      id: studentUid,
      uid: studentUid,
      name: studentData.name || 'Student',
      email: studentData.email || '',
      sifNumber: studentData.sifNumber || '',
      mobileNumber,
      rollNumber: studentData.rollNumber || '',
      registerNumber: studentData.registerNumber || '',
      year: studentData.year || '1st Year',
      departmentId: studentData.departmentId || '',
      departmentName: studentData.departmentName || '',
      section: studentData.section || 'A',
      role: 'student',
      status: studentData.status || 'active',
      isApproved: true,
    }
  };
});

/**
 * Callable: Server-Side Assessment Submission & Grading
 * Ensures answer keys and calculations are never exposed to or manipulated by the browser.
 */
exports.submitStudentAssessment = onCall({ region: 'us-central1', cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in to submit an assessment.');
  }

  const testId = String(request.data?.testId || '').trim();
  const answers = request.data?.answers && typeof request.data.answers === 'object' ? request.data.answers : {};
  const timeTakenMinutes = Math.max(0, Number(request.data?.timeTakenMinutes) || 0);

  if (!testId) {
    throw new HttpsError('invalid-argument', 'testId is required.');
  }

  const db = admin.firestore();

  // 1. Fetch Student Profile
  const studentSnap = await db.doc(`users/${uid}`).get();
  if (!studentSnap.exists) {
    throw new HttpsError('not-found', 'Student profile not found.');
  }
  const student = studentSnap.data();
  if (student.isDeleted === true || ['deleted', 'blocked', 'rejected'].includes(student.status)) {
    throw new HttpsError('permission-denied', 'Account is inactive.');
  }

  // 2. Fetch authoritative Test with answer key
  const testSnap = await db.doc(`tests/${testId}`).get();
  if (!testSnap.exists) {
    throw new HttpsError('not-found', 'Assessment not found.');
  }
  const testData = testSnap.data();

  // Check Year matching
  const testYear = String(testData.year || '').trim();
  if (
    testYear &&
    !['all', 'all years'].includes(testYear.toLowerCase()) &&
    student.year &&
    testYear.toLowerCase() !== student.year.toLowerCase()
  ) {
    throw new HttpsError('permission-denied', 'This assessment is not assigned to your academic year.');
  }

  const questions = Array.isArray(testData.questions) ? testData.questions : [];
  if (!questions.length) {
    throw new HttpsError('invalid-argument', 'This assessment has no questions.');
  }

  // 3. Evaluate score securely server-side
  let score = 0;
  const breakdown = questions.map((q, index) => {
    const correctAnswer = q.correctAnswer ?? q.correctOption ?? 0;
    const selected = answers[index];
    const isCorrect = selected !== undefined && String(selected) === String(correctAnswer);
    if (isCorrect) score += 1;
    return {
      question: q.question || q.questionText || '',
      options: Array.isArray(q.options) ? q.options : [],
      correctAnswer,
      studentChoice: selected === undefined ? -1 : Number(selected),
      isCorrect,
      explanation: q.explanation || '',
    };
  });

  const percentage = Math.round((score / questions.length) * 100);
  const resultDocId = `${uid}_${testId}`;
  const resultRef = db.doc(`results/${resultDocId}`);

  // Check previous attempts
  const prevSnap = await resultRef.get();
  let prevAttempts = 0;
  let prevBestScore = 0;
  let createdAt = admin.firestore.FieldValue.serverTimestamp();

  if (prevSnap.exists) {
    const prev = prevSnap.data();
    prevAttempts = Number(prev.attemptsCount) || 1;
    prevBestScore = Number(prev.bestScore != null ? prev.bestScore : prev.score) || 0;
    if (prev.createdAt) createdAt = prev.createdAt;
  }

  const resultPayload = {
    id: resultDocId,
    studentId: uid,
    studentName: student.name || 'Student',
    email: student.email || '',
    sifNumber: student.sifNumber || student.rollNumber || '',
    testId,
    testTitle: testData.title || 'Online Assessment',
    year: student.year || testData.year || '',
    departmentId: student.departmentId || testData.departmentId || '',
    departmentName: student.departmentName || testData.departmentName || '',
    score,
    totalQuestions: questions.length,
    total: questions.length,
    percentage,
    breakdown,
    submittedAt: new Date().toISOString(),
    timeTakenMinutes,
    attemptsCount: prevAttempts + 1,
    bestScore: Math.max(score, prevBestScore),
    createdAt,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await resultRef.set(resultPayload, { merge: true });

  // Real-time admin notification
  try {
    await db.collection('notifications').add({
      title: '📊 New Test Attempt Completed',
      body: `${resultPayload.studentName} (${resultPayload.year || 'Student'}) completed "${resultPayload.testTitle}": Score ${resultPayload.score}/${resultPayload.totalQuestions} (${resultPayload.percentage}%).`,
      type: 'test_submission',
      category: 'tests',
      recipientRole: 'admin',
      targetScope: 'admin',
      testId: resultPayload.testId,
      studentId: resultPayload.studentId,
      studentName: resultPayload.studentName,
      read: false,
      isRead: false,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (_) {}

  return { success: true, result: resultPayload };
});

/**
 * Helper: Deliver due scheduled notifications across target FCM topics
 */
async function deliverPendingScheduledNotifications() {
  const db = admin.firestore();
  const now = new Date();

  // Find notifications that were scheduled and are due
  const snap = await db.collection('notifications')
    .where('isScheduled', '==', true)
    .where('status', '==', 'scheduled')
    .get();

  let deliveredCount = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const scheduledTime = data.scheduledFor ? new Date(data.scheduledFor).getTime() : 0;

    if (!scheduledTime || scheduledTime <= now.getTime()) {
      const title = data.title || 'Academic Activity';
      const body = data.body || 'A new update has been published in the student portal.';
      const notifId = docSnap.id;

      const topics = [];
      if (!data.targetType || data.targetType === 'all') {
        topics.push('all_students');
      } else if (data.targetType === 'year' && data.targetYear && data.targetYear !== 'all') {
        topics.push(`year_${data.targetYear}`);
      } else if (data.targetType === 'department' && data.targetDepartmentId && data.targetDepartmentId !== 'all') {
        topics.push(`dept_${data.targetDepartmentId}`);
      } else if (data.targetType === 'section' && data.targetSection && data.targetSection !== 'all') {
        topics.push(`section_${data.targetSection}`);
      } else {
        topics.push('all_students');
      }

      for (const topic of topics) {
        try {
          await admin.messaging().send({
            topic,
            notification: { title, body },
            data: {
              notificationId: String(notifId),
              testId: String(data.testId || ''),
              type: String(data.type || 'new_test'),
              route: String(data.route || '/student/notifications'),
            },
            webpush: {
              fcmOptions: {
                link: data.route || '/student/notifications'
              }
            }
          });
        } catch (fcmErr) {
          console.error(`[Scheduled FCM] Failed for ${notifId} topic ${topic}:`, fcmErr.message);
        }
      }

      await docSnap.ref.update({
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        deliveredScheduledAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      deliveredCount++;
    }
  }

  return deliveredCount;
}

/**
 * Scheduled Cloud Function: Runs every 5 minutes to deliver scheduled notifications
 */
exports.scheduledNotificationDelivery = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'us-central1',
    timeZone: 'Asia/Kolkata',
  },
  async () => {
    try {
      const count = await deliverPendingScheduledNotifications();
      console.log(`[Scheduler] Delivered ${count} scheduled notifications.`);
    } catch (err) {
      console.error('[Scheduler] Notification delivery error:', err);
    }
  }
);

/**
 * Callable: On-demand check and delivery of scheduled notifications (Admin only)
 */
exports.checkAndDeliverScheduledNotifications = onCall({ region: 'us-central1', cors: true }, async (request) => {
  await assertAdmin(request);
  const count = await deliverPendingScheduledNotifications();
  return { success: true, deliveredCount: count };
});

/**
 * =========================================================================
 * MongoDB Atlas & GridFS File Storage Integration
 * Cluster: cluster0.qfdmujt.mongodb.net
 * Database: tamil_learning
 * =========================================================================
 */
const MONGO_DB_NAME = 'tamil_learning';
const GRIDFS_BUCKET_NAME = 'study_materials_files';
const CLOUD_FUNCTIONS_BASE_URL = 'https://us-central1-tamil-learning-9f609.cloudfunctions.net';
const STUDENT_API_COLLECTIONS = new Set([
  'attendance', 'announcements', 'assignments', 'downloads', 'feedback', 'notes', 'notifications',
  'publishedTests', 'reports', 'results', 'studyMaterials', 'study_materials', 'task_submissions',
  'taskSubmissions', 'tasks', 'thirukkurals', 'units', 'assignmentSubmissions',
]);
const STUDENT_MIRRORED_COLLECTIONS = new Set([...STUDENT_API_COLLECTIONS, 'tests']);
const STUDENT_PRIVATE_COLLECTIONS = new Set([
  'attendance', 'feedback', 'notes', 'reports', 'results', 'task_submissions', 'taskSubmissions', 'assignmentSubmissions',
]);
const STUDENT_WRITABLE_COLLECTIONS = new Set(['feedback', 'notes', 'task_submissions', 'taskSubmissions', 'assignmentSubmissions']);
const STUDENT_ALLOWED_FILTERS = new Set(['year', 'departmentId', 'unitNumber', 'status', 'category']);
const _STUDENT_CORS_ORIGINS = [
  'http://localhost:5173', 'http://127.0.0.1:5173',
  'https://tamil-learning-9f609.web.app', 'https://tamil-learning-9f609.firebaseapp.com',
  'https://tamil-learning-2d773.web.app', 'https://tamil-learning-2d773.firebaseapp.com',
  'https://lokesh314-git.github.io', 'https://tamillearning2024-sys.github.io',
];

let cachedMongoClient = null;

async function getMongoClient() {
  const mongoUri = MONGODB_URI.value();
  if (!mongoUri) throw new Error('MONGODB_URI secret is not configured.');
  if (cachedMongoClient && cachedMongoClient.topology && cachedMongoClient.topology.isConnected()) {
    return cachedMongoClient;
  }
  const client = new MongoClient(mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  cachedMongoClient = client;
  return client;
}

async function getGridFSBucket(bucketName = GRIDFS_BUCKET_NAME) {
  const client = await getMongoClient();
  const db = client.db(MONGO_DB_NAME);
  const bucket = new GridFSBucket(db, { bucketName });
  return { bucket, db, client };
}

async function ensureStudentMongoIndexes(studentsCollection) {
  await Promise.all([
    studentsCollection.createIndex({ sifNumber: 1 }, { unique: true, partialFilterExpression: { sifNumber: { $type: 'string' } } }),
    studentsCollection.createIndex({ mobileNumber: 1 }, { unique: true, partialFilterExpression: { mobileNumber: { $type: 'string' } } }),
  ]);
}

async function writeStudentRecords(studentsCollection, records) {
  const operations = records.map((student) => {
    const uid = String(student.uid || student._id || '').trim();
    const sifNumber = String(student.sifNumber || '').trim().toUpperCase().replace(/\s+/g, '');
    const mobileNumber = String(student.mobileNumber || '').replace(/\D/g, '').slice(-10);
    const dob = normalizeDobServer(student.dob);
    if (!uid || (!sifNumber && !mobileNumber) || (mobileNumber && mobileNumber.length !== 10) || !dob) {
      throw new Error('Student record is missing a UID, valid identifier, or date of birth.');
    }
    const record = { ...normalizeDatabaseValues(student), uid, dob, role: 'student', _id: uid, updatedAt: new Date() };
    if (sifNumber) record.sifNumber = sifNumber;
    else delete record.sifNumber;
    if (mobileNumber) record.mobileNumber = mobileNumber;
    else delete record.mobileNumber;
    return { replaceOne: { filter: { _id: uid }, replacement: record, upsert: true } };
  });
  if (operations.length) await studentsCollection.bulkWrite(operations, { ordered: true });
}

function normalizeDatabaseValues(value) {
  if (value?.toDate instanceof Function) return value.toDate();
  if (Array.isArray(value)) return value.map(normalizeDatabaseValues);
  if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof ObjectId)) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, normalizeDatabaseValues(item)]));
  }
  return value;
}

function studentJwtSecret() {
  const secret = STUDENT_JWT_SECRET.value();
  if (!secret || secret.length < 32) throw new Error('STUDENT_JWT_SECRET must contain at least 32 characters.');
  return secret;
}

function _signStudentToken(studentId) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: studentId, iat: now, exp: now + 7 * 24 * 60 * 60 })}`;
  const signature = crypto.createHmac('sha256', studentJwtSecret()).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function verifyStudentToken(token) {
  try {
    const [header, payload, signature] = String(token || '').split('.');
    if (!header || !payload || !signature) return null;
    const unsigned = `${header}.${payload}`;
    const expected = crypto.createHmac('sha256', studentJwtSecret()).update(unsigned).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!claims.sub || !Number.isInteger(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

function toApiValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toApiValue);
  if (value && typeof value === 'object') {
    if (value._bsontype === 'ObjectId') return String(value);
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '_id').map(([key, item]) => [key, toApiValue(item)]));
  }
  return value;
}

function studentIsActive(student) {
  return !!student && student.status === 'active' && student.isDeleted !== true;
}

function tokenStudentId(request) {
  const match = String(request.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return match ? verifyStudentToken(match[1])?.sub : null;
}

exports.studentMongoApi = onRequest({
  region: 'us-central1',
  cors: true,
  secrets: [MONGODB_URI, STUDENT_JWT_SECRET],
}, (req, res) => {
  return cors(req, res, async () => {
    res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') return res.status(204).send('');

  try {
    const mongoClient = await getMongoClient();
    const mongoDb = mongoClient.db(MONGO_DB_NAME);
    const students = mongoDb.collection('students');
    const pathname = new URL(req.url, 'https://student-api.local').pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'POST' && pathname === '/login') {
      return res.status(410).json({
        error: 'Student authentication via MongoDB API has been deprecated and permanently removed. Use the Firebase Callable Function studentLogin.'
      });
    }

    const studentId = tokenStudentId(req);
    if (!studentId) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    const student = await students.findOne({ _id: studentId });
    if (!studentIsActive(student)) return res.status(401).json({ error: 'Student account is inactive. Please contact the administrator.' });

    if (pathname === '/preferences' && req.method === 'GET') {
      const preferences = await mongoDb.collection('student_preferences').findOne({ _id: studentId });
      return res.json({ preferences: toApiValue(preferences || {}) });
    }
    if (pathname === '/preferences' && req.method === 'PATCH') {
      const allowed = ['completedUnits', 'readNotificationIds', 'bookmarkedMaterialIds'];
      const patch = Object.fromEntries(Object.entries(req.body || {})
        .filter(([key, value]) => allowed.includes(key) && Array.isArray(value))
        .map(([key, value]) => [key, [...new Set(value.map((item) => String(item).slice(0, 128)))].slice(0, 1000)]));
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'No valid student preferences were provided.' });
      await mongoDb.collection('student_preferences').updateOne(
        { _id: studentId },
        { $set: { ...patch, updatedAt: new Date() }, $setOnInsert: { studentId, createdAt: new Date() } },
        { upsert: true }
      );
      return res.json({ success: true });
    }

    if (req.method === 'POST' && pathname === '/tests/submit') {
      const testId = String(req.body?.testId || '').slice(0, 128);
      const test = testId ? await mongoDb.collection('tests').findOne({ _id: testId }) : null;
      if (!test) return res.status(404).json({ error: 'Test not found.' });
      const testYear = String(test.year || '').trim();
      if (testYear && !['all', 'all years'].includes(testYear.toLowerCase()) && testYear !== student.year) {
        return res.status(403).json({ error: 'This test is not assigned to your academic year.' });
      }
      const questions = Array.isArray(test.questions) ? test.questions : [];
      if (!questions.length) return res.status(400).json({ error: 'This test has no questions.' });
      const answers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
      let score = 0;
      const breakdown = questions.map((question, index) => {
        const correctAnswer = question.correctAnswer ?? question.correctOption ?? 0;
        const selected = answers[index];
        const isCorrect = selected !== undefined && String(selected) === String(correctAnswer);
        if (isCorrect) score += 1;
        return {
          question: question.question || question.questionText || '',
          options: Array.isArray(question.options) ? question.options : [],
          correctAnswer,
          studentChoice: selected === undefined ? -1 : Number(selected),
          isCorrect,
          explanation: question.explanation || '',
        };
      });
      const resultId = new ObjectId().toHexString();
      const submittedAt = new Date();
      const result = {
        studentId,
        studentName: student.name || 'Student',
        email: student.email || '',
        testId,
        testTitle: test.title || 'Online Assessment',
        year: student.year || test.year || '',
        departmentId: student.departmentId || '',
        departmentName: student.departmentName || '',
        score,
        totalQuestions: questions.length,
        total: questions.length,
        percentage: Math.round((score / questions.length) * 100),
        breakdown,
        submittedAt,
        timeTakenMinutes: Math.max(0, Number(req.body?.timeTakenMinutes) || 0),
        _id: resultId,
      };
      await mongoDb.collection('results').insertOne(result);
      await admin.firestore().collection('results').doc(resultId).set(result);
      return res.json({ id: resultId, ...toApiValue(result) });
    }

    if (req.method === 'POST' && pathname === '/logout') return res.json({ success: true });
    if (req.method === 'GET' && pathname === '/me') {
      return res.json({ studentId, student: toApiValue(student) });
    }
    if (pathname === '/profile' && req.method === 'PATCH') {
      const allowed = ['address', 'parentName', 'parentMobile', 'emergencyContact', 'bloodGroup'];
      const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([key, value]) => allowed.includes(key) && typeof value === 'string').map(([key, value]) => [key, value.trim().slice(0, 500)]));
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'No editable profile fields were provided.' });
      await students.updateOne({ _id: studentId, status: 'active' }, { $set: { ...patch, profileUpdatedAt: new Date() } });
      const updatedStudent = await students.findOne({ _id: studentId });
      await admin.firestore().doc(`users/${studentId}`).update(patch).catch((error) => console.warn('Student profile mirror update skipped:', error?.message));
      return res.json({ success: true, student: toApiValue(updatedStudent) });
    }

    const dataMatch = pathname.match(/^\/data\/([A-Za-z][A-Za-z0-9_]*)$/);
    if (!dataMatch || !STUDENT_API_COLLECTIONS.has(dataMatch[1])) return res.status(404).json({ error: 'Endpoint not found.' });
    const collectionName = dataMatch[1];
    const collection = mongoDb.collection(collectionName);
    if (req.method === 'GET') {
      const filter = {};
      if (STUDENT_PRIVATE_COLLECTIONS.has(collectionName)) filter.studentId = studentId;
      const scopedFields = [];
      if (student.year) scopedFields.push(['year', 'academicYear', student.year]);
      if (student.departmentId || student.departmentName) scopedFields.push(['departmentId', 'department', student.departmentId || student.departmentName, student.departmentName]);
      if (student.section) scopedFields.push(['section', null, student.section]);
      if (scopedFields.length) {
        filter.$and = scopedFields.map(([primary, alternate, ...values]) => {
          const valid = [...new Set([...values.filter(Boolean), 'all', 'All', 'All Years', 'all years'])];
          return { $or: [
            { [primary]: { $in: valid } },
            { [primary]: { $exists: false } },
            ...(alternate ? [{ [alternate]: { $in: valid } }, { [alternate]: { $exists: false } }] : []),
          ] };
        });
      }
      const params = new URL(req.url, 'https://student-api.local').searchParams;
      for (const [key, value] of params.entries()) {
        if (STUDENT_ALLOWED_FILTERS.has(key)) filter[key] = value.slice(0, 100);
      }
      const documentId = params.get('id');
      if (documentId) {
        let document = await collection.findOne({ ...filter, _id: documentId });
        if (!document && ObjectId.isValid(documentId)) document = await collection.findOne({ ...filter, _id: new ObjectId(documentId) });
        return res.json({ docs: document ? [{ id: String(document._id), data: toApiValue(document) }] : [] });
      }
      const docs = await collection.find(filter).limit(500).toArray();
      const visible = collectionName === 'notifications'
        ? docs.filter((item) => !item.targetYear || item.targetYear === student.year)
          .filter((item) => !item.targetDepartmentId || item.targetDepartmentId === 'all' || item.targetDepartmentId === student.departmentId)
          .filter((item) => !item.targetSection || item.targetSection === 'all' || item.targetSection === student.section)
        : docs;
      return res.json({ docs: visible.map((item) => ({ id: String(item._id), data: toApiValue(item) })) });
    }

    const id = String(req.query.id || '').slice(0, 128);
    const idFilter = ObjectId.isValid(id) ? { $in: [id, new ObjectId(id)] } : id;
    if (req.method === 'POST' && STUDENT_WRITABLE_COLLECTIONS.has(collectionName)) {
      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      const record = { ...payload, studentId, studentName: student.name || 'Student', year: student.year, updatedAt: new Date() };
      delete record._id;
      const inserted = await collection.insertOne(record);
      const recordId = String(inserted.insertedId);
      await admin.firestore().collection(collectionName).doc(recordId).set(record).catch((error) => console.warn('Student record mirror write skipped:', error?.message));
      return res.status(201).json({ id: recordId });
    }
    if (req.method === 'PATCH' && STUDENT_WRITABLE_COLLECTIONS.has(collectionName) && id) {
      const current = await collection.findOne({ _id: idFilter, studentId });
      if (!current) return res.status(404).json({ error: 'Record not found.' });
      const patch = { ...(req.body || {}), updatedAt: new Date() };
      for (const key of ['studentId', 'uid', 'role', 'status', '_id']) delete patch[key];
      await collection.updateOne({ _id: current._id, studentId }, { $set: patch });
      const updated = await collection.findOne({ _id: current._id, studentId });
      const { _id: updatedId, ...updatedMirror } = updated;
      await admin.firestore().collection(collectionName).doc(String(updatedId)).set(updatedMirror).catch((error) => console.warn('Student record mirror update skipped:', error?.message));
      return res.json({ success: true });
    }
    if (req.method === 'PUT' && STUDENT_WRITABLE_COLLECTIONS.has(collectionName) && id) {
      const payload = req.body && typeof req.body === 'object' ? { ...req.body } : {};
      for (const key of ['studentId', 'uid', 'role', 'status', '_id']) delete payload[key];
      const current = await collection.findOne({ _id: idFilter, studentId });
      await collection.updateOne(
        current ? { _id: current._id, studentId } : { _id: id, studentId },
        current
          ? { $set: { ...payload, updatedAt: new Date() } }
          : { $set: { ...payload, studentId, studentName: student.name || 'Student', year: student.year, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );
      const saved = await collection.findOne({ _id: current?._id || id, studentId });
      const { _id: savedId, ...savedMirror } = saved;
      await admin.firestore().collection(collectionName).doc(String(savedId)).set(savedMirror).catch((error) => console.warn('Student record mirror update skipped:', error?.message));
      return res.json({ success: true });
    }
    if (req.method === 'DELETE' && STUDENT_WRITABLE_COLLECTIONS.has(collectionName) && id) {
      const result = await collection.deleteOne({ _id: idFilter, studentId });
      await admin.firestore().collection(collectionName).doc(id).delete().catch((error) => console.warn('Student record mirror delete skipped:', error?.message));
      return res.json({ success: result.deletedCount === 1 });
    }
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error('[studentMongoApi] Request failed:', error);
    return res.status(500).json({ error: 'Student service is temporarily unavailable.' });
  }
  });
});

/**
 * Helper to upload buffer to GridFS
 */
async function uploadBufferToGridFS({ buffer, fileName, mimeType, metadata = {} }) {
  const { bucket, db } = await getGridFSBucket();
  const fileId = new ObjectId();
  
  return new Promise((resolve, reject) => {
    const readableStream = Readable.from(buffer);
    const uploadStream = bucket.openUploadStreamWithId(fileId, fileName, {
      contentType: mimeType || 'application/pdf',
      metadata: {
        ...metadata,
        fileName,
        mimeType: mimeType || 'application/pdf',
        fileSize: buffer.length,
        uploadedAt: new Date(),
      }
    });

    readableStream.pipe(uploadStream)
      .on('error', (err) => {
        console.error('[GridFS] Stream upload error:', err);
        reject(err);
      })
      .on('finish', async () => {
        const fileIdStr = fileId.toString();
        const downloadUrl = `${CLOUD_FUNCTIONS_BASE_URL}/api/materials/download/${fileIdStr}`;
        
        // Also record metadata in study_materials and documents collections
        const docRecord = {
          _id: fileIdStr,
          fileId: fileIdStr,
          gridFSId: fileId,
          fileName,
          fileSize: buffer.length,
          mimeType: mimeType || 'application/pdf',
          downloadUrl,
          title: metadata.title || fileName,
          category: metadata.category || 'pdf_notes',
          unitNumber: Number(metadata.unitNumber) || 1,
          year: String(metadata.year || 'All Years'),
          departmentId: String(metadata.departmentId || 'all'),
          departmentName: String(metadata.departmentName || 'All Classes'),
          section: String(metadata.section || 'all'),
          subject: String(metadata.subject || 'Tamil'),
          description: String(metadata.description || ''),
          uploadedBy: String(metadata.uploadedBy || 'Admin'),
          storageProvider: 'MongoDB GridFS',
          mongoCluster: 'cluster0.qfdmujt.mongodb.net',
          mongoDatabase: MONGO_DB_NAME,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        try {
          await db.collection('study_materials').updateOne({ _id: fileIdStr }, { $set: docRecord }, { upsert: true });
          await db.collection('documents').updateOne({ _id: fileIdStr }, { $set: docRecord }, { upsert: true });
          await db.collection('downloads').updateOne({ _id: fileIdStr }, { $set: docRecord }, { upsert: true });
        } catch (dbErr) {
          console.warn('[GridFS] Metadata record warning:', dbErr);
        }

        resolve({
          success: true,
          fileId: fileIdStr,
          fileName,
          fileSize: buffer.length,
          mimeType: mimeType || 'application/pdf',
          downloadUrl,
          document: docRecord,
        });
      });
  });
}

/**
 * Callable: Upload file directly to MongoDB GridFS
 */
exports.uploadFileToMongo = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [MONGODB_URI],
  },
  async (request) => {
    await assertAdmin(request);
    const data = request.data || {};

    const { fileBase64, fileName, mimeType, metadata = {} } = data;
    if (!fileBase64 || !fileName) {
      throw new HttpsError('invalid-argument', 'fileBase64 and fileName are required.');
    }

    try {
      // Decode Base64 string to Buffer
      const cleanBase64 = fileBase64.includes('base64,') ? fileBase64.split('base64,')[1] : fileBase64;
      const buffer = Buffer.from(cleanBase64, 'base64');

      const result = await uploadBufferToGridFS({
        buffer,
        fileName,
        mimeType: mimeType || 'application/pdf',
        metadata: {
          ...metadata,
          title: metadata.title || data.title || fileName.replace(/\.[^/.]+$/, ''),
          category: metadata.category || data.category || 'pdf_notes',
          unitNumber: metadata.unitNumber || data.unitNumber || 1,
          year: metadata.year || data.year || 'All Years',
          departmentId: metadata.departmentId || data.departmentId || 'all',
          departmentName: metadata.departmentName || data.departmentName || 'All Classes',
          section: metadata.section || data.section || 'all',
          subject: metadata.subject || data.subject || 'Tamil',
          description: metadata.description || data.description || '',
          uploadedBy: metadata.uploadedBy || data.uploadedBy || 'Admin',
        }
      });

      return result;
    } catch (err) {
      console.error('[uploadFileToMongo] Error:', err);
      throw new HttpsError('internal', err.message || 'Failed to upload file to MongoDB GridFS.');
    }
  }
);

/**
 * Callable: Delete file from MongoDB GridFS and collections
 */
exports.deleteMongoFile = onCall({ region: 'us-central1', cors: true, secrets: [MONGODB_URI] }, async (request) => {
  await assertAdmin(request);
  const fileId = request.data?.fileId || request.data?.id;

  if (!fileId) {
    throw new HttpsError('invalid-argument', 'fileId is required.');
  }

  try {
    const { bucket, db } = await getGridFSBucket();
    
    // Attempt ObjectId delete from GridFS
    try {
      const objId = ObjectId.isValid(fileId) ? new ObjectId(fileId) : null;
      if (objId) {
        await bucket.delete(objId);
      }
    } catch (gErr) {
      console.warn('[GridFS] Bucket delete notice:', gErr.message);
    }

    // Delete metadata from MongoDB collections
    await db.collection('study_materials').deleteOne({ $or: [{ _id: fileId }, { fileId }] });
    await db.collection('documents').deleteOne({ $or: [{ _id: fileId }, { fileId }] });
    await db.collection('downloads').deleteOne({ $or: [{ _id: fileId }, { fileId }] });

    return { success: true, fileId };
  } catch (err) {
    console.error('[deleteMongoFile] Error:', err);
    throw new HttpsError('internal', err.message || 'Failed to delete file from MongoDB.');
  }
});

/**
 * Callable: Get MongoDB Storage Statistics
 */
exports.getMongoStorageStats = onCall({ region: 'us-central1', cors: true, secrets: [MONGODB_URI] }, async (request) => {
  await assertAdmin(request);
  try {
    const { db } = await getGridFSBucket();
    const filesCollection = db.collection(`${GRIDFS_BUCKET_NAME}.files`);
    const _chunksCollection = db.collection(`${GRIDFS_BUCKET_NAME}.chunks`);

    const totalFiles = await filesCollection.countDocuments();
    const filesStats = await filesCollection.aggregate([
      { $group: { _id: null, totalBytes: { $sum: '$length' } } }
    ]).toArray();

    const totalBytes = filesStats[0]?.totalBytes || 0;
    const materialsCount = await db.collection('study_materials').countDocuments();
    const downloadsCount = await db.collection('downloads').countDocuments();

    return {
      connected: true,
      cluster: 'cluster0.qfdmujt.mongodb.net',
      database: MONGO_DB_NAME,
      storageEngine: 'MongoDB GridFS',
      bucketName: GRIDFS_BUCKET_NAME,
      totalFiles,
      totalBytes,
      totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
      studyMaterialsCount: materialsCount,
      downloadsCount,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('getMongoStorageStats error:', err);
    return {
      connected: false,
      cluster: 'cluster0.qfdmujt.mongodb.net',
      database: MONGO_DB_NAME,
      error: err.message,
    };
  }
});

/**
 * Callable: Migrate existing Base64 / Firestore stored files to MongoDB GridFS
 */
exports.migrateFilesToMongo = onCall({ region: 'us-central1', cors: true, secrets: [MONGODB_URI] }, async (request) => {
  await assertAdmin(request);
  const firestoreDb = admin.firestore();
  const targetCollections = ['study_materials', 'units', 'tasks', 'downloads'];
  const report = { totalMigrated: 0, byCollection: {} };

  for (const col of targetCollections) {
    const snap = await firestoreDb.collection(col).get();
    let colMigrated = 0;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const fileUrl = data.fileUrl || data.pdfLink || data.fileLink || data.downloadUrl || '';

      // Check if file is stored as a Data URL (Base64)
      if (typeof fileUrl === 'string' && fileUrl.startsWith('data:')) {
        try {
          const parts = fileUrl.split('base64,');
          if (parts.length === 2) {
            const mimeMatch = parts[0].match(/:(.*?);/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'application/pdf';
            const buffer = Buffer.from(parts[1], 'base64');
            const fileName = data.fileName || `${data.title || docSnap.id}.pdf`;

            const res = await uploadBufferToGridFS({
              buffer,
              fileName,
              mimeType,
              metadata: {
                title: data.title || fileName,
                year: data.year || 'All Years',
                unitNumber: data.unitNumber || data.unit || 1,
                departmentId: data.departmentId || 'all',
                departmentName: data.departmentName || 'All Classes',
                category: data.category || col,
                sourceCollection: col,
                firestoreDocId: docSnap.id,
              }
            });

            // Update Firestore doc with lightweight MongoDB GridFS stream URL
            const updatePayload = {
              fileId: res.fileId,
              fileName: res.fileName,
              fileSize: res.fileSize,
              mimeType: res.mimeType,
              storageProvider: 'MongoDB GridFS',
              mongoStored: true,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            if (data.fileUrl) updatePayload.fileUrl = res.downloadUrl;
            if (data.pdfLink) updatePayload.pdfLink = res.downloadUrl;
            if (data.fileLink) updatePayload.fileLink = res.downloadUrl;
            if (data.downloadUrl) updatePayload.downloadUrl = res.downloadUrl;

            await docSnap.ref.update(updatePayload);
            colMigrated++;
            report.totalMigrated++;
          }
        } catch (mErr) {
          console.error(`[Migrate] Error on doc ${col}/${docSnap.id}:`, mErr);
        }
      }
    }
    report.byCollection[col] = colMigrated;
  }

  return { success: true, ...report, timestamp: new Date().toISOString() };
});

/**
 * =========================================================================
 * REST / HTTP API Endpoints for MongoDB File Operations
 * Handles:
 *  - POST /api/materials/upload
 *  - GET  /api/materials
 *  - GET  /api/materials/download/:id
 *  - DELETE /api/materials/:id
 *  - PUT  /api/materials/:id
 *  - GET  /api/materials/status
 * =========================================================================
 */
exports.api = onRequest(
  {
    region: 'us-central1',
    cors: true,
    maxInstances: 10,
    secrets: [MONGODB_URI],
  },
  (req, res) => {
    return cors(req, res, async () => {
      // Set permissive CORS headers for all responses
      res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
      res.set('Access-Control-Allow-Credentials', 'true');

      if (req.method === 'OPTIONS') {
        return res.status(204).send('');
      }

    const path = req.path || '';

    try {
      // 1. Download / Stream File from MongoDB GridFS
      // GET /api/materials/download/:id or /materials/download/:id or /files/download/:id or /download/:id
      const downloadMatch = path.match(/\/(?:api\/)?(?:materials|files|documents)?\/?download\/([a-zA-Z0-9_-]+)/i);
      if (downloadMatch && req.method === 'GET') {
        const decoded = await verifyHttpUser(req);
        let userProfile = decoded.studentData || null;
        let role = decoded.role || '';

        if (!userProfile) {
          const userSnap = await admin.firestore().doc(`users/${decoded.uid}`).get();
          if (userSnap.exists) {
            userProfile = userSnap.data();
            role = userProfile.role || (decoded.email ? 'admin' : 'student');
          } else {
            const studentSnap = await admin.firestore().doc(`students/${decoded.uid}`).get();
            if (studentSnap.exists) {
              userProfile = studentSnap.data();
              role = 'student';
            }
          }
        }

        if (role !== 'admin') {
          const isBlocked = userProfile?.isDeleted === true || userProfile?.status === 'blocked' || userProfile?.status === 'rejected' || userProfile?.status === 'deleted' || userProfile?.status === 'inactive';
          const isActive = userProfile?.isApproved === true || userProfile?.approved === true || userProfile?.status === 'active';
          if (isBlocked || !isActive) {
            return res.status(403).json({ error: 'An active student or administrator account is required.' });
          }
        }

        const rawId = downloadMatch[1];
        const { bucket, db } = await getGridFSBucket();

        let targetFile = null;

        // A. Search by GridFS _id
        if (ObjectId.isValid(rawId)) {
          const files = await bucket.find({ _id: new ObjectId(rawId) }).toArray();
          if (files.length > 0) targetFile = files[0];
        }

        // B. Search by custom metadata.fileId or fileName
        if (!targetFile) {
          const files = await bucket.find({ $or: [{ 'metadata.fileId': rawId }, { filename: rawId }] }).toArray();
          if (files.length > 0) targetFile = files[0];
        }

        // C. Search metadata collection in MongoDB
        if (!targetFile) {
          const metaDoc = await db.collection('documents').findOne({ $or: [{ _id: rawId }, { fileId: rawId }] });
          if (metaDoc && metaDoc.gridFSId) {
            const files = await bucket.find({ _id: metaDoc.gridFSId }).toArray();
            if (files.length > 0) targetFile = files[0];
          }
        }

        // D. Check Firestore mongo_file_chunks collection as auto-recovery fallback
        if (!targetFile) {
          const chunksSnap = await admin.firestore().collection('mongo_file_chunks')
            .where('fileId', '==', rawId)
            .get();

          if (!chunksSnap.empty) {
            const parts = chunksSnap.docs.map((d) => d.data());
            parts.sort((a, b) => (a.index || 0) - (b.index || 0));
            const fullBase64 = parts.map((p) => p.chunkData).join('');
            if (fullBase64) {
              const cleanBase64 = fullBase64.includes('base64,') ? fullBase64.split('base64,')[1] : fullBase64;
              const buffer = Buffer.from(cleanBase64, 'base64');
              const mimeType = 'application/pdf';
              const fileName = `Unit_Material_${rawId}.pdf`;

              // Auto-heal: Upload to GridFS in the background so future requests stream from GridFS
              uploadBufferToGridFS({
                buffer,
                fileName,
                mimeType,
                metadata: { fileId: rawId, recoveredFrom: 'mongo_file_chunks' }
              }).catch((e) => console.warn('[Recovery] Auto-heal GridFS upload notice:', e?.message));

              res.set('Content-Type', mimeType);
              res.set('Content-Length', buffer.length);
              res.set('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
              res.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');
              return res.end(buffer);
            }
          }
        }

        if (!targetFile) {
          return res.status(404).json({ error: 'File not found in MongoDB GridFS repository.' });
        }

        // Verify document access based on the unit's department and year permissions
        if (role !== 'admin') {
          const fileYear = targetFile.metadata?.year;
          const fileDept = targetFile.metadata?.departmentId;
          const studentYear = userProfile?.year;
          const studentDept = userProfile?.departmentId;

          if (fileYear && fileYear !== 'All Years' && fileYear !== 'all' && studentYear && fileYear !== studentYear) {
            return res.status(403).json({ error: `Access restricted: this document is intended for ${fileYear}.` });
          }
          if (fileDept && fileDept !== 'all' && fileDept !== 'All Classes' && studentDept && fileDept !== studentDept) {
            return res.status(403).json({ error: 'Access restricted: this document is intended for a different department.' });
          }
        }

        const mimeType = targetFile.metadata?.mimeType || targetFile.contentType || 'application/pdf';
        const fileName = targetFile.filename || 'document.pdf';

        res.set('Content-Type', mimeType);
        res.set('Content-Length', targetFile.length);
        res.set('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
        res.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');

        const downloadStream = bucket.openDownloadStream(targetFile._id);
        downloadStream.on('error', (err) => {
          console.error('[GridFS] Download stream error:', err);
          if (!res.headersSent) res.status(500).json({ error: 'Failed to stream document.' });
        });

        return downloadStream.pipe(res);
      }

      // 2. Upload Material / File to MongoDB GridFS
      // POST /api/materials/upload or /materials/upload or /upload
      if (req.method === 'POST' && (path.includes('/upload') || path.endsWith('/materials'))) {
        await assertAdminHttp(req);
        const body = req.body || {};
        const fileBase64 = body.fileBase64 || body.file || body.data;
        const fileName = body.fileName || body.name || `document_${Date.now()}.pdf`;
        const mimeType = body.mimeType || body.type || 'application/pdf';

        if (!fileBase64) {
          return res.status(400).json({ error: 'Missing fileBase64 content in upload payload.' });
        }

        const cleanBase64 = fileBase64.includes('base64,') ? fileBase64.split('base64,')[1] : fileBase64;
        const buffer = Buffer.from(cleanBase64, 'base64');

        const result = await uploadBufferToGridFS({
          buffer,
          fileName,
          mimeType,
          metadata: {
            title: body.title || fileName.replace(/\.[^/.]+$/, ''),
            category: body.category || 'pdf_notes',
            unitNumber: body.unitNumber || body.unit || 1,
            year: body.year || 'All Years',
            departmentId: body.departmentId || 'all',
            departmentName: body.departmentName || 'All Classes',
            section: body.section || 'all',
            subject: body.subject || 'Tamil',
            description: body.description || '',
            uploadedBy: body.uploadedBy || 'Admin',
          }
        });

        return res.status(201).json(result);
      }

      // 3. Get Study Materials List from MongoDB
      // GET /api/materials or /materials
      if (req.method === 'GET' && (path.endsWith('/materials') || path === '/' || path === '')) {
        const { db } = await getGridFSBucket();
        const query = {};

        if (req.query.year && req.query.year !== 'All') query.year = req.query.year;
        if (req.query.category && req.query.category !== 'all') query.category = req.query.category;
        if (req.query.unit && req.query.unit !== 'All') query.unitNumber = Number(req.query.unit);
        if (req.query.departmentId && req.query.departmentId !== 'all') query.departmentId = req.query.departmentId;

        const materials = await db.collection('study_materials').find(query).sort({ createdAt: -1 }).limit(100).toArray();
        return res.json({ success: true, count: materials.length, materials });
      }

      // 4. Delete Material from MongoDB
      // DELETE /api/materials/:id or /materials/:id
      const deleteMatch = path.match(/\/(?:api\/)?(?:materials|files)\/([a-zA-Z0-9_-]+)/i);
      if (req.method === 'DELETE' && deleteMatch) {
        await assertAdminHttp(req);
        const fileId = deleteMatch[1];
        const { bucket, db } = await getGridFSBucket();

        if (ObjectId.isValid(fileId)) {
          try {
            await bucket.delete(new ObjectId(fileId));
          } catch (_) {}
        }

        await db.collection('study_materials').deleteOne({ $or: [{ _id: fileId }, { fileId }] });
        await db.collection('documents').deleteOne({ $or: [{ _id: fileId }, { fileId }] });
        await db.collection('downloads').deleteOne({ $or: [{ _id: fileId }, { fileId }] });

        return res.json({ success: true, message: `Material ${fileId} deleted successfully.` });
      }

      // 5. Replace Material in MongoDB
      // PUT /api/materials/:id or /materials/:id
      if (req.method === 'PUT' && deleteMatch) {
        await assertAdminHttp(req);
        const fileId = deleteMatch[1];
        const body = req.body || {};
        const { bucket, db } = await getGridFSBucket();

        if (body.fileBase64) {
          // Delete old GridFS object
          if (ObjectId.isValid(fileId)) {
            try { await bucket.delete(new ObjectId(fileId)); } catch (_) {}
          }
          const cleanBase64 = body.fileBase64.includes('base64,') ? body.fileBase64.split('base64,')[1] : body.fileBase64;
          const buffer = Buffer.from(cleanBase64, 'base64');
          const result = await uploadBufferToGridFS({
            buffer,
            fileName: body.fileName || 'updated_file.pdf',
            mimeType: body.mimeType || 'application/pdf',
            metadata: body,
          });
          return res.json({ success: true, message: 'Material updated with new file.', ...result });
        } else {
          // Update metadata only
          await db.collection('study_materials').updateOne(
            { $or: [{ _id: fileId }, { fileId }] },
            { $set: { ...body, updatedAt: new Date() } }
          );
          return res.json({ success: true, message: 'Material metadata updated.' });
        }
      }

      // 6. Cluster & GridFS Status Endpoint
      // GET /api/materials/status or /status
      if (req.method === 'GET' && (path.includes('/status') || path.includes('/health'))) {
        const { db } = await getGridFSBucket();
        const filesCount = await db.collection(`${GRIDFS_BUCKET_NAME}.files`).countDocuments();
        const materialsCount = await db.collection('study_materials').countDocuments();
        return res.json({
          status: 'ok',
          connected: true,
          cluster: 'cluster0.qfdmujt.mongodb.net',
          database: MONGO_DB_NAME,
          storageEngine: 'MongoDB GridFS',
          totalGridFSFiles: filesCount,
          totalStudyMaterials: materialsCount,
          timestamp: new Date().toISOString(),
        });
      }

      // Default fallback
      return res.status(404).json({ error: 'Endpoint not found on Tamil Learning MongoDB API.' });
    } catch (err) {
      console.error('[API Error]:', err);
      const status = err?.code === 'unauthenticated' ? 401 : err?.code === 'permission-denied' ? 403 : 500;
      return res.status(status).json({ error: err.message || 'Internal Server Error.' });
    }
    });
  }
);

/**
 * Get MongoDB Atlas Cluster Status (Legacy callable alias)
 */
exports.getMongoClusterStatus = onCall({ region: 'us-central1', cors: true, secrets: [MONGODB_URI] }, async (request) => {
  await assertAdmin(request);
  try {
    const client = await getMongoClient();
    const db = client.db(MONGO_DB_NAME);
    const collections = await db.listCollections().toArray();
    return {
      connected: true,
      cluster: 'cluster0.qfdmujt.mongodb.net',
      database: MONGO_DB_NAME,
      collections: collections.map(c => c.name),
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('getMongoClusterStatus error:', err);
    return {
      connected: false,
      cluster: 'cluster0.qfdmujt.mongodb.net',
      database: MONGO_DB_NAME,
      error: err.message,
    };
  }
});

/**
 * Sync Firestore Collection to MongoDB Atlas
 */
exports.syncFirestoreToMongo = onCall({ region: 'us-central1', cors: true, secrets: [MONGODB_URI] }, async (request) => {
  await assertAdmin(request);
  const collectionName = request.data?.collectionName || 'students';
  
  try {
    const client = await getMongoClient();
    const mongoDb = client.db(MONGO_DB_NAME);
    const mongoCol = mongoDb.collection(collectionName);

    const snap = await admin.firestore().collection(collectionName).get();
    let syncedCount = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      await mongoCol.updateOne(
        { _id: doc.id },
        {
          $set: {
            ...data,
            _syncedAt: new Date(),
            _firestoreId: doc.id,
          }
        },
        { upsert: true }
      );
      syncedCount++;
    }

    return {
      success: true,
      collection: collectionName,
      syncedCount,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('syncFirestoreToMongo error:', err);
    throw new HttpsError('internal', err?.message || 'Sync to MongoDB failed');
  }
});

/**
 * Callable: Audit Student Mobile Numbers & Duplicate Detection Report
 * Accessible only by administrators.
 * Scans all student records in Firestore users collection and categorizes:
 * - Duplicate mobile numbers (multiple students sharing the same phone)
 * - Missing mobile numbers
 * - Invalid mobile numbers (not 10 digits)
 * - Missing or invalid date of birth records
 */
exports.auditStudentMobileNumbers = onCall({ region: 'us-central1', cors: true }, async (request) => {
  await assertAdmin(request);
  const db = admin.firestore();
  const snap = await db.collection('users').where('role', '==', 'student').get();

  const mobileMap = new Map();
  const missingMobiles = [];
  const invalidMobiles = [];
  const missingDobs = [];
  let validMobileCount = 0;

  snap.forEach((doc) => {
    const data = doc.data();
    if (data.isDeleted === true || data.status === 'deleted') return;

    const studentInfo = {
      id: doc.id,
      uid: doc.id,
      name: data.name || 'Unnamed Student',
      sifNumber: data.sifNumber || '-',
      rollNumber: data.rollNumber || '-',
      departmentName: data.departmentName || data.class || '-',
      year: data.year || '-',
      status: data.status || 'active',
      rawMobile: data.mobileNumber || data.phone || '',
      dob: data.dob || '',
    };

    const digits = String(studentInfo.rawMobile).replace(/\D/g, '');
    const cleanMobile = digits.length > 10 && digits.startsWith('91') ? digits.slice(2, 12) : digits.slice(-10);

    // Check DOB
    const normalizedDob = normalizeDobServer(data.dob);
    if (!normalizedDob) {
      missingDobs.push(studentInfo);
    }

    // Check Mobile
    if (!digits) {
      missingMobiles.push(studentInfo);
    } else if (cleanMobile.length !== 10) {
      invalidMobiles.push({ ...studentInfo, normalizedMobile: cleanMobile });
    } else {
      validMobileCount++;
      const existing = mobileMap.get(cleanMobile) || [];
      existing.push(studentInfo);
      mobileMap.set(cleanMobile, existing);
    }
  });

  const duplicates = [];
  for (const [mobileNumber, list] of mobileMap.entries()) {
    if (list.length > 1) {
      duplicates.push({
        mobileNumber,
        count: list.length,
        students: list
      });
    }
  }

  return {
    success: true,
    totalActiveStudents: snap.size - (missingMobiles.length + invalidMobiles.length),
    totalStudentsScanned: snap.size,
    validMobileCount,
    duplicateMobileCount: duplicates.length,
    missingMobileCount: missingMobiles.length,
    invalidMobileCount: invalidMobiles.length,
    missingDobCount: missingDobs.length,
    duplicates,
    missingMobiles,
    invalidMobiles,
    missingDobs,
    generatedAt: new Date().toISOString()
  };
});

/**
 * Callable: Recover Legacy Documents from mongo_file_chunks into MongoDB GridFS
 * Accessible only by administrators.
 * Scans all curriculum units in Firestore.
 * If a unit's file is stored as chunks in mongo_file_chunks rather than MongoDB GridFS,
 * reassembles the binary content and uploads it to GridFS, then updates the unit document.
 */
exports.recoverLegacyDocuments = onCall({ region: 'us-central1', cors: true, secrets: [MONGODB_URI] }, async (request) => {
  await assertAdmin(request);
  const db = admin.firestore();
  const { bucket } = await getGridFSBucket();

  const unitsSnap = await db.collection('units').get();
  const results = [];
  let recoveredCount = 0;
  let alreadyValidCount = 0;
  let missingCount = 0;

  for (const docSnap of unitsSnap.docs) {
    const unit = docSnap.data();
    const unitId = docSnap.id;
    const fileId = unit.gridFsFileId || unit.fileId;

    if (!fileId) {
      continue;
    }

    // 1. Check if already present in GridFS
    let existsInGridFS = false;
    if (ObjectId.isValid(fileId)) {
      const files = await bucket.find({ _id: new ObjectId(fileId) }).toArray();
      if (files.length > 0) existsInGridFS = true;
    }
    if (!existsInGridFS) {
      const files = await bucket.find({ 'metadata.fileId': fileId }).toArray();
      if (files.length > 0) existsInGridFS = true;
    }

    if (existsInGridFS) {
      alreadyValidCount++;
      continue;
    }

    // 2. Not in GridFS — Search Firestore mongo_file_chunks
    const chunksSnap = await db.collection('mongo_file_chunks').where('fileId', '==', fileId).get();
    if (chunksSnap.empty) {
      missingCount++;
      results.push({ unitId, unitNumber: unit.unitNumber, title: unit.title, fileId, status: 'no_chunks_found' });
      continue;
    }

    // 3. Reassemble Base64 chunks
    const parts = chunksSnap.docs.map((d) => d.data());
    parts.sort((a, b) => (a.index || 0) - (b.index || 0));
    const fullBase64 = parts.map((p) => p.chunkData).join('');

    if (!fullBase64) {
      missingCount++;
      results.push({ unitId, unitNumber: unit.unitNumber, title: unit.title, fileId, status: 'empty_chunk_data' });
      continue;
    }

    const cleanBase64 = fullBase64.includes('base64,') ? fullBase64.split('base64,')[1] : fullBase64;
    const buffer = Buffer.from(cleanBase64, 'base64');
    const fileName = unit.fileName || `Unit_${unit.unitNumber || 1}_Curriculum_Notes.pdf`;
    const mimeType = unit.mimeType || 'application/pdf';

    // 4. Upload buffer to MongoDB GridFS
    const uploadRes = await uploadBufferToGridFS({
      buffer,
      fileName,
      mimeType,
      metadata: {
        legacyFileId: fileId,
        unitNumber: unit.unitNumber || 1,
        year: unit.year || 'All Years',
        departmentId: unit.departmentId || 'all',
        departmentName: unit.departmentName || 'All Classes',
        title: unit.title || `Unit ${unit.unitNumber || 1}`,
        recoveredFrom: 'mongo_file_chunks',
        recoveredAt: new Date().toISOString()
      }
    });

    const newGridFsId = uploadRes.fileId;
    const newDownloadUrl = uploadRes.downloadUrl;

    // 5. Update Unit document with verified GridFS metadata
    await db.collection('units').doc(unitId).update({
      gridFsFileId: newGridFsId,
      fileId: newGridFsId,
      downloadUrl: newDownloadUrl,
      pdfLink: newDownloadUrl,
      fileName,
      fileSize: buffer.length,
      mimeType,
      storageProvider: 'MongoDB GridFS',
      recoveredAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    recoveredCount++;
    results.push({
      unitId,
      unitNumber: unit.unitNumber,
      title: unit.title,
      oldFileId: fileId,
      newGridFsId,
      downloadUrl: newDownloadUrl,
      status: 'recovered'
    });
  }

  return {
    success: true,
    totalUnitsScanned: unitsSnap.size,
    recoveredCount,
    alreadyValidCount,
    missingCount,
    details: results,
    timestamp: new Date().toISOString()
  };
});
