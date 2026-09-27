const admin = require('firebase-admin');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');
const { Readable } = require('stream');
const crypto = require('crypto');
const cors = require('cors')({ origin: true, credentials: true });
const { defineSecret } = require('firebase-functions/params');
const MONGODB_URI = defineSecret('MONGODB_URI');
const STUDENT_JWT_SECRET = defineSecret('STUDENT_JWT_SECRET');

if (!admin.apps.length) {
  admin.initializeApp();
}

async function assertAdmin(request) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Must be authenticated.');
  }

  const token = request.auth?.token || request.token || {};
  if (token.admin === true || token.role === 'admin') {
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
  if (!match) throw new HttpsError('unauthenticated', 'Sign in is required.');
  return admin.auth().verifyIdToken(match[1]);
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
    const sifNumber = String(student?.sifNumber || '').trim().toUpperCase().replace(/\s+/g, '');
    const mobileNumber = String(student?.mobileNumber || '').replace(/\D/g, '').slice(-10);
    const dob = normalizeDobServer(student?.dob);
    if (!uid || (!sifNumber && !mobileNumber) || (mobileNumber && mobileNumber.length !== 10) || !dob) {
      throw new HttpsError('invalid-argument', 'Each student needs a UID, SIF or 10-digit mobile number, and valid date of birth.');
    }
    const record = { ...student, uid, dob, role: 'student', updatedAt: new Date() };
    if (sifNumber) record.sifNumber = sifNumber;
    else delete record.sifNumber;
    if (mobileNumber) record.mobileNumber = mobileNumber;
    else delete record.mobileNumber;
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
      ? 'A SIF or mobile number is already assigned to another imported student.'
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
  const { questions = [], answerKey, correctAnswers, ...metadata } = testData || {};
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
 * MongoDB Atlas & GridFS File Storage Integration
 * Cluster: cluster0.qfdmujt.mongodb.net
 * Database: tamil_learning
 * =========================================================================
 */
const MONGO_DB_NAME = 'tamil_learning';
const GRIDFS_BUCKET_NAME = 'study_materials_files';
const CLOUD_FUNCTIONS_BASE_URL = 'https://us-central1-tamil-learning-2d773.cloudfunctions.net';
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
const STUDENT_CORS_ORIGINS = [
  'http://localhost:5173', 'http://127.0.0.1:5173',
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

function signStudentToken(studentId) {
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
      const identifier = String(req.body?.identifier || '').trim().slice(0, 80);
      const dob = normalizeDobServer(req.body?.dob);
      if (!identifier || !dob) return res.status(400).json({ error: 'Invalid Mobile Number/SIF Number or Date of Birth.' });
      const sifNumber = identifier.toUpperCase().replace(/\s+/g, '');
      const mobileNumber = identifier.replace(/\D/g, '').slice(-10);
      const matches = [];
      if (/^[A-Z0-9_-]{2,40}$/.test(sifNumber)) matches.push({ sifNumber });
      if (mobileNumber.length === 10) matches.push({ mobileNumber });
      const attempts = mongoDb.collection('student_login_attempts');
      await attempts.createIndex({ lastAttempt: 1 }, { expireAfterSeconds: 900 });
      const clientIp = String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim().slice(0, 80);
      const attemptKey = crypto.createHmac('sha256', studentJwtSecret()).update(`${clientIp}:${sifNumber}`).digest('hex');
      const recentAttempts = await attempts.findOne({ _id: attemptKey });
      const now = new Date();
      if (recentAttempts?.count >= 10 && now.getTime() - recentAttempts.lastAttempt.getTime() < 15 * 60 * 1000) {
        return res.status(429).json({ error: 'Too many sign-in attempts. Please try again in 15 minutes.' });
      }
      await attempts.updateOne({ _id: attemptKey }, { $inc: { count: 1 }, $set: { lastAttempt: now } }, { upsert: true });
      const student = matches.length ? await students.findOne({ $or: matches, dob, status: 'active', isDeleted: { $ne: true } }) : null;
      if (!student) return res.status(401).json({ error: 'Invalid Mobile Number/SIF Number or Date of Birth.' });
      await attempts.deleteOne({ _id: attemptKey });
      const studentId = String(student.uid || student._id);
      const token = signStudentToken(studentId);
      return res.json({ studentId, token, expiresIn: 604800, student: toApiValue(student) });
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
    const chunksCollection = db.collection(`${GRIDFS_BUCKET_NAME}.chunks`);

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
        const userSnap = await admin.firestore().doc(`users/${decoded.uid}`).get();
        const profile = userSnap.data();
        if (!userSnap.exists || profile?.role !== 'admin' && (profile?.role !== 'student' || profile?.isDeleted === true || profile?.status === 'blocked' || profile?.status === 'rejected' || profile?.status === 'deleted' || !(profile?.isApproved === true || profile?.approved === true || profile?.status === 'active'))) {
          throw new HttpsError('permission-denied', 'An active student or administrator account is required.');
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

        if (!targetFile) {
          return res.status(404).json({ error: 'File not found in MongoDB GridFS repository.' });
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
