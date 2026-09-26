const admin = require('firebase-admin');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');
const { Readable } = require('stream');
const { defineSecret } = require('firebase-functions/params');
const MONGODB_URI = defineSecret('MONGODB_URI');

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
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  match = input.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  return '';
}

exports.studentLoginWithCredentials = onCall({
  region: 'us-central1',
  cors: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://tamil-learning-2d773.web.app',
    'https://tamil-learning-2d773.firebaseapp.com',
    'https://lokesh314-git.github.io',
    'https://tamillearning2024-sys.github.io',
  ],
}, async (request) => {
  const identifier = String(request.data?.identifier || '').trim();
  const dob = normalizeDobServer(request.data?.dob);
  if (!identifier || !dob) throw new HttpsError('invalid-argument', 'Student ID and date of birth are required.');

  const db = admin.firestore();
  const sif = identifier.toUpperCase().replace(/\s+/g, '');
  const mobile = identifier.replace(/\D/g, '').slice(-10);
  let student = null;
  const directIds = [...new Set([sif, mobile].filter(Boolean))];
  for (const lookupId of directIds) {
    const lookup = await db.doc(`studentLookup/${lookupId}`).get();
    if (lookup.exists) {
      const data = lookup.data();
      const uid = data.studentId || data.uid || data.id;
      if (uid) {
        const studentDataDoc = await db.doc(`students data/${uid}`).get();
        if (studentDataDoc.exists) { student = { uid, ...studentDataDoc.data() }; break; }
        const userDoc = await db.doc(`users/${uid}`).get();
        if (userDoc.exists) { student = { uid, ...userDoc.data() }; break; }
      }
      student = { ...data, uid };
      break;
    }
  }
  if (!student) {
    for (const [field, value] of [['sifNumber', sif], ['mobileNumber', mobile]]) {
      if (!value) continue;
      const result = await db.collection('students data').where(field, '==', value).limit(1).get();
      if (!result.empty) { student = { uid: result.docs[0].id, ...result.docs[0].data() }; break; }
    }
  }
  if (!student) {
    for (const [field, value] of [['sifNumber', sif], ['mobileNumber', mobile]]) {
      if (!value) continue;
      const result = await db.collection('users').where(field, '==', value).limit(1).get();
      if (!result.empty) { student = { uid: result.docs[0].id, ...result.docs[0].data() }; break; }
    }
  }
  if (!student?.uid || normalizeDobServer(student.dob) !== dob) {
    throw new HttpsError('unauthenticated', 'Student ID or date of birth is incorrect.');
  }
  if (student.role !== 'student' || student.isDeleted === true || ['pending', 'deleted', 'blocked', 'rejected', 'graduated'].includes(student.status)) {
    throw new HttpsError('permission-denied', 'This student account is unavailable. Contact the administrator.');
  }
  if (!(student.isApproved === true || student.approved === true || student.status === 'active')) {
    throw new HttpsError('permission-denied', 'This student account is not active. Contact the administrator.');
  }

  const customToken = await admin.auth().createCustomToken(String(student.uid), { role: 'student' });
  return { customToken };
});

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

exports.syncPublishedStudentTests = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to view tests.');
  const db = admin.firestore();
  const profileSnap = await db.doc(`users/${uid}`).get();
  const profile = profileSnap.data();
  const isPrivileged = profile?.role === 'admin';
  const isApproved = profile?.isApproved === true || profile?.approved === true || profile?.status === 'active';
  if (!profileSnap.exists || (!isPrivileged && profile?.role !== 'student') || profile?.isDeleted === true || ['pending', 'blocked', 'rejected', 'deleted'].includes(profile?.status) || (!isPrivileged && !isApproved)) {
    throw new HttpsError('permission-denied', 'An active account is required.');
  }
  const tests = await db.collection('tests').get();
  for (let offset = 0; offset < tests.docs.length; offset += 400) {
    const batch = db.batch();
    tests.docs.slice(offset, offset + 400).forEach((test) => {
      batch.set(db.doc(`publishedTests/${test.id}`), studentSafeTest(test.data()));
    });
    await batch.commit();
  }
  return { count: tests.size };
});

exports.submitStudentTestResult = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to submit your test.');
  const db = admin.firestore();
  const [profileSnap, testSnap] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`tests/${String(request.data?.testId || '')}`).get(),
  ]);
  const profile = profileSnap.data();
  const isApproved = profile?.isApproved === true || profile?.approved === true || profile?.status === 'active';
  if (!profileSnap.exists || profile?.role !== 'student' || profile?.isDeleted === true || ['pending', 'blocked', 'rejected', 'deleted'].includes(profile?.status) || !isApproved) {
    throw new HttpsError('permission-denied', 'An active student account is required.');
  }
  if (!testSnap.exists) throw new HttpsError('not-found', 'Test not found.');
  const test = testSnap.data();
  const testYear = String(test.year || '').trim();
  const studentYear = String(profile.year || '').trim();
  if (testYear && !['all', 'all years'].includes(testYear.toLowerCase()) && testYear !== studentYear) {
    throw new HttpsError('permission-denied', 'This test is not assigned to your academic year.');
  }
  const questions = Array.isArray(test.questions) ? test.questions : [];
  if (!questions.length) throw new HttpsError('failed-precondition', 'This test has no questions.');
  const answers = request.data?.answers || {};
  let score = 0;
  const breakdown = questions.map((question, index) => {
    const correctAnswer = question.correctAnswer ?? question.correctOption ?? 0;
    const selected = answers[index];
    const isCorrect = selected !== undefined && String(selected) === String(correctAnswer);
    if (isCorrect) score += 1;
    return {
      question: question.question || question.questionText || '',
      options: question.options || [],
      correctAnswer,
      studentChoice: selected === undefined ? -1 : Number(selected),
      isCorrect,
      explanation: question.explanation || '',
    };
  });
  const total = questions.length;
  const percentage = Math.round((score / total) * 100);
  const submittedAt = new Date();
  const result = {
    studentId: uid,
    studentName: profile.name || 'Student',
    email: profile.email || '',
    testId: testSnap.id,
    testTitle: test.title || 'Online Assessment',
    year: profile.year || test.year || '',
    departmentId: profile.departmentId || '',
    departmentName: profile.departmentName || '',
    score,
    totalQuestions: total,
    total,
    percentage,
    breakdown,
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    timeTakenMinutes: Math.max(0, Number(request.data?.timeTakenMinutes) || 0),
  };
  const ref = await db.collection('results').add(result);
  return { id: ref.id, ...result, submittedAt: submittedAt.toISOString() };
});

exports.resetPasswordByAdmin = onCall({ region: 'us-central1' }, async (request) => {
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

exports.permanentDeleteStudent = onCall(
  {
    region: 'us-central1',
    cors: [
      'http://localhost:5173',
      'https://tamil-new-72497.web.app',
      'https://tamil-new-72497.firebaseapp.com'
    ]
  },
  async (request) => {
  await assertAdmin(request);
  const uid = request.data?.uid;

  if (!uid || typeof uid !== 'string') {
    throw new HttpsError('invalid-argument', 'UID is required');
  }

  try {
    await admin.auth().deleteUser(uid);
    const db = admin.firestore();
    const batch = db.batch();
    batch.delete(db.doc(`users/${uid}`));
    batch.delete(db.doc(`students data/${uid}`));

    const collectionsToClean = ['results', 'reports', 'notes', 'submissions', 'taskSubmissions'];
    for (const colName of collectionsToClean) {
      const snap = await db.collection(colName).where('studentId', '==', uid).get();
      snap.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
    }

    await batch.commit();
    return { success: true };
  } catch (error) {
    console.error('Permanent delete failed:', error);
    if (error?.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'Auth user not found.');
    }
    throw new HttpsError('internal', error?.message || 'Delete failed');
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
exports.sendTestNotificationFCM = onCall({ region: 'us-central1' }, async (request) => {
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
exports.deleteMongoFile = onCall({ region: 'us-central1', secrets: [MONGODB_URI] }, async (request) => {
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
exports.getMongoStorageStats = onCall({ region: 'us-central1', secrets: [MONGODB_URI] }, async (request) => {
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
exports.migrateFilesToMongo = onCall({ region: 'us-central1', secrets: [MONGODB_URI] }, async (request) => {
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
  async (req, res) => {
    // Set permissive CORS headers for all responses
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

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
  }
);

/**
 * Get MongoDB Atlas Cluster Status (Legacy callable alias)
 */
exports.getMongoClusterStatus = onCall({ region: 'us-central1', secrets: [MONGODB_URI] }, async (request) => {
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
exports.syncFirestoreToMongo = onCall({ region: 'us-central1', secrets: [MONGODB_URI] }, async (request) => {
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
