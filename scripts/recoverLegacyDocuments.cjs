/**
 * Standalone Recovery Script: Reassemble and Migrate Legacy Unit Documents
 * Run via: node scripts/recoverLegacyDocuments.cjs
 * 
 * Inspects all curriculum units in Firestore.
 * Finds documents referencing legacy chunk IDs ('mongo_file_*').
 * Reassembles chunks from 'mongo_file_chunks' and updates metadata.
 */

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { MongoClient, GridFSBucket } = require('mongodb');

// Optional: Provide service account JSON path or use default credentials
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://tamil_admin:tamilpassword123@cluster0.qfdmujt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const MONGO_DB_NAME = 'tamil_learning';
const GRIDFS_BUCKET_NAME = 'study_materials_files';
const CLOUD_FUNCTIONS_BASE_URL = 'https://us-central1-tamil-learning-9f609.cloudfunctions.net';

async function runRecovery() {
  console.log('=== Starting Legacy Document Recovery ===');

  if (getApps().length === 0) {
    try {
      initializeApp({ projectId: 'tamil-learning-9f609' });
    } catch (e) {
      console.warn('Firebase init warning:', e.message);
    }
  }

  const db = getFirestore();
  let mongoClient = null;
  let bucket = null;

  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    const mongoDb = mongoClient.db(MONGO_DB_NAME);
    bucket = new GridFSBucket(mongoDb, { bucketName: GRIDFS_BUCKET_NAME });
    console.log('Connected to MongoDB Atlas and GridFS Bucket.');
  } catch (err) {
    console.warn('MongoDB direct connection unavailable, will audit Firestore references only:', err.message);
  }

  const unitsSnap = await db.collection('units').get();
  console.log(`Found ${unitsSnap.size} total units in Firestore.`);

  let legacyCount = 0;
  let recoveredCount = 0;

  for (const doc of unitsSnap.docs) {
    const unit = doc.data();
    const fileId = unit.gridFsFileId || unit.fileId || unit.pdfLink;

    if (!fileId) continue;

    const isLegacy = typeof fileId === 'string' && (fileId.startsWith('mongo_file_') || !fileId.startsWith('http'));
    if (!isLegacy) continue;

    legacyCount++;
    console.log(`Unit [${unit.unitNumber || '?'}] "${unit.title}": has legacy fileId: ${fileId}`);

    // Check chunks
    const chunksSnap = await db.collection('mongo_file_chunks').where('fileId', '==', fileId).get();
    if (chunksSnap.empty) {
      console.log(`  -> No chunks found in mongo_file_chunks for ${fileId}`);
      continue;
    }

    const parts = chunksSnap.docs.map((d) => d.data());
    parts.sort((a, b) => (a.index || 0) - (b.index || 0));
    const fullBase64 = parts.map((p) => p.chunkData).join('');
    const cleanBase64 = fullBase64.includes('base64,') ? fullBase64.split('base64,')[1] : fullBase64;
    const buffer = Buffer.from(cleanBase64, 'base64');

    console.log(`  -> Reassembled ${buffer.length} bytes from ${parts.length} chunks.`);

    if (bucket) {
      const fileName = unit.fileName || `Unit_${unit.unitNumber || 1}_Curriculum_Notes.pdf`;
      const uploadStream = bucket.openUploadStream(fileName, {
        contentType: 'application/pdf',
        metadata: {
          fileId,
          unitNumber: unit.unitNumber || 1,
          year: unit.year || 'All Years',
          departmentId: unit.departmentId || 'all',
          title: unit.title || `Unit ${unit.unitNumber || 1}`,
          recoveredFrom: 'mongo_file_chunks'
        }
      });

      await new Promise((resolve, reject) => {
        uploadStream.end(buffer, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const newGridFsId = uploadStream.id.toString();
      const downloadUrl = `${CLOUD_FUNCTIONS_BASE_URL}/api/materials/download/${newGridFsId}`;

      await doc.ref.update({
        gridFsFileId: newGridFsId,
        fileId: newGridFsId,
        downloadUrl,
        pdfLink: downloadUrl,
        fileName,
        fileSize: buffer.length,
        mimeType: 'application/pdf',
        storageProvider: 'MongoDB GridFS',
        updatedAt: FieldValue.serverTimestamp()
      });

      recoveredCount++;
      console.log(`  -> Successfully migrated to GridFS ID: ${newGridFsId} | URL: ${downloadUrl}`);
    }
  }

  if (mongoClient) await mongoClient.close();
  console.log(`=== Recovery Complete: ${legacyCount} legacy units found, ${recoveredCount} recovered to GridFS ===`);
}

if (require.main === module) {
  runRecovery().catch((err) => {
    console.error('Recovery execution error:', err);
    process.exit(1);
  });
}

module.exports = { runRecovery };
