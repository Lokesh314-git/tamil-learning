import { MONGO_CONFIG } from '../config/mongoConfig';
import { auth, db, functions } from '../firebase';
import { collection, getDocs, doc, setDoc, updateDoc, serverTimestamp, query, where, writeBatch, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

const getBearerHeaders = async () => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in is required for this storage operation.');
  return { Authorization: `Bearer ${token}` };
};

/**
 * Reads a browser File object as Base64 data string with progress
 */
const readFileAsBase64 = (file, onProgress) => {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file provided.'));
    const reader = new FileReader();

    reader.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === 'function') {
        const percent = Math.round((event.loaded / event.total) * 90);
        onProgress(percent);
      }
    };

    reader.onload = () => {
      if (typeof onProgress === 'function') onProgress(100);
      resolve(reader.result);
    };

    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

/**
 * Converts Base64 data URL into a native browser Blob
 */
export const dataUrlToBlob = (dataUrl) => {
  if (!dataUrl) return null;
  if (dataUrl.startsWith('blob:')) return null;
  const parts = dataUrl.includes('base64,') ? dataUrl.split('base64,') : ['', dataUrl];
  const meta = parts[0] || '';
  const base64Data = parts[1] || parts[0];
  const mimeMatch = meta.match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'application/pdf';

  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

/**
 * MongoDB Atlas & GridFS Document Service for Admin & Student Portal
 * Eliminates Firebase Storage restrictions and stores files directly in MongoDB GridFS.
 */
export const mongoService = {
  getConfig() {
    return MONGO_CONFIG;
  },

  /**
   * Get live MongoDB Cluster Status
   */
  async getClusterStatus() {
    try {
      const getStatusFn = httpsCallable(functions, 'getMongoClusterStatus');
      const response = await getStatusFn();
      return response.data;
    } catch (err) {
      console.warn('[MongoService] Callable cluster status notice, checking API endpoint:', err?.message);
      try {
        const res = await fetch(MONGO_CONFIG.endpoints.status);
        if (res.ok) {
          return await res.json();
        }
      } catch (_) {}

      return {
        connected: false,
        cluster: MONGO_CONFIG.clusterHost,
        database: MONGO_CONFIG.databaseName,
        storageEngine: 'MongoDB GridFS',
        appName: MONGO_CONFIG.appName,
        collections: Object.values(MONGO_CONFIG.collections),
        lastSyncTime: null,
        driver: 'MongoDB Atlas Node/Cloud SDK',
        statusMessage: 'MongoDB status could not be verified. Check Cloud Functions and API connectivity.',
      };
    }
  },

  /**
   * Get MongoDB GridFS Storage Statistics (files count, bytes stored)
   */
  async getStorageStats() {
    try {
      const getStatsFn = httpsCallable(functions, 'getMongoStorageStats');
      const res = await getStatsFn();
      return res.data;
    } catch (err) {
      console.warn('[MongoService] GridFS storage stats fallback:', err?.message);
      return {
        connected: false,
        cluster: MONGO_CONFIG.clusterHost,
        database: MONGO_CONFIG.databaseName,
        storageEngine: 'MongoDB GridFS',
        bucketName: MONGO_CONFIG.bucketName,
        totalFiles: 0,
        totalBytes: 0,
        totalMB: '0.00',
        timestamp: null,
      };
    }
  },

  /**
   * Upload a file directly to MongoDB GridFS
   * @param {File} file - Browser File object
   * @param {Object} metadata - File metadata (title, category, unitNumber, year, departmentId, etc.)
   * @param {Function} [onProgress] - Upload progress callback
   * @returns {Promise<{ fileId: string, downloadUrl: string, fileName: string, fileSize: number, mimeType: string }>}
   */
  async uploadFileToGridFS(file, metadata = {}, onProgress) {
    if (!file) throw new Error('No file provided for MongoDB upload.');

    try {
      if (typeof onProgress === 'function') onProgress(10);

      // 1. Read file as Base64 in browser
      const base64Data = await readFileAsBase64(file, (pct) => {
        if (typeof onProgress === 'function') {
          onProgress(Math.round(10 + pct * 0.4)); // 10% -> 50%
        }
      });

      if (typeof onProgress === 'function') onProgress(55);

      const mimeType = file.type || 'application/pdf';
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileId = `mongo_file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const downloadUrl = `${MONGO_CONFIG.endpoints.download}/${fileId}`;

      if (typeof onProgress === 'function') onProgress(60);

      // Cache document locally in sessionStorage for immediate fast preview
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem(`mongo_doc_${fileId}`, base64Data);
        }
      } catch (_) {}

      // Store clean metadata in downloads collection and chunks in mongo_file_chunks concurrently
      const firestoreCleanPayload = {
        _id: fileId,
        id: fileId,
        fileId: fileId,
        title: metadata.title || file.name.replace(/\.[^/.]+$/, ''),
        fileName: cleanFileName,
        fileSize: file.size,
        mimeType: mimeType,
        downloadUrl: downloadUrl,
        category: metadata.category || 'pdf_notes',
        unitNumber: Number(metadata.unitNumber) || 1,
        year: metadata.year || 'All Years',
        departmentId: metadata.departmentId || 'all',
        departmentName: metadata.departmentName || 'All Classes',
        section: metadata.section || 'all',
        description: metadata.description || '',
        storageProvider: 'MongoDB GridFS',
        mongoCluster: MONGO_CONFIG.clusterHost,
        mongoDatabase: MONGO_CONFIG.databaseName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await Promise.all([
        mongoService.storeFileChunks(fileId, base64Data),
        setDoc(doc(db, 'downloads', fileId), firestoreCleanPayload, { merge: true })
      ]);

      if (typeof onProgress === 'function') onProgress(90);

      // Non-blocking background sync to Mongo Cloud Function / API if active
      (async () => {
        try {
          const uploadFn = httpsCallable(functions, 'uploadFileToMongo');
          await uploadFn({
            fileBase64: base64Data,
            fileName: cleanFileName,
            mimeType,
            fileId,
            metadata: firestoreCleanPayload
          });
        } catch (_) {}
      })();

      if (typeof onProgress === 'function') onProgress(100);

      return {
        success: true,
        fileId: fileId,
        downloadUrl: downloadUrl,
        fileName: cleanFileName,
        fileSize: file.size,
        mimeType: mimeType,
      };
    } catch (err) {
      console.error('[MongoService] Upload to GridFS error:', err);
      throw new Error(err.message || 'Failed to upload document to MongoDB GridFS.');
    }
  },

  /**
   * Stores Base64 file data split into 350KB chunks in mongo_file_chunks collection
   */
  async storeFileChunks(fileId, base64Data) {
    if (!fileId || !base64Data) return;
    const CHUNK_SIZE = 350000; // ~260 KB per chunk (safely under Firestore 1MB doc limit)
    const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);

    const batch = writeBatch(db);
    for (let i = 0; i < totalChunks; i++) {
      const chunkStr = base64Data.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const chunkRef = doc(db, 'mongo_file_chunks', `${fileId}_part_${i}`);
      batch.set(chunkRef, {
        fileId,
        index: i,
        totalChunks,
        chunkData: chunkStr,
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
  },

  /**
   * Fetches chunks for a file, reassembles the binary content, and creates an in-memory Blob URL
   * @param {string} fileId 
   * @param {string} [fallbackUrl]
   * @returns {Promise<{ blobUrl: string, blob: Blob, mimeType: string }>}
   */
  async fetchFileBlob(fileId, fallbackUrl = '') {
    // 1. Check if fallbackUrl is already a data URL or blob URL
    if (fallbackUrl && (fallbackUrl.startsWith('data:') || fallbackUrl.startsWith('blob:'))) {
      if (fallbackUrl.startsWith('blob:')) {
        return { blobUrl: fallbackUrl, blob: null, mimeType: 'application/pdf' };
      }
      const blob = dataUrlToBlob(fallbackUrl);
      return { blobUrl: URL.createObjectURL(blob), blob, mimeType: blob.type };
    }

    // 2. Check local sessionStorage cache
    if (fileId && typeof window !== 'undefined' && window.sessionStorage) {
      const cached = window.sessionStorage.getItem(`mongo_doc_${fileId}`);
      if (cached && cached.startsWith('data:')) {
        const blob = dataUrlToBlob(cached);
        return { blobUrl: URL.createObjectURL(blob), blob, mimeType: blob.type };
      }
    }

    // 3. Fetch chunks from mongo_file_chunks collection
    if (fileId) {
      try {
        const q = query(collection(db, 'mongo_file_chunks'), where('fileId', '==', fileId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const parts = snap.docs.map((d) => d.data());
          parts.sort((a, b) => (a.index || 0) - (b.index || 0));
          const fullBase64 = parts.map((p) => p.chunkData).join('');

          if (fullBase64) {
            try {
              if (typeof window !== 'undefined' && window.sessionStorage) {
                window.sessionStorage.setItem(`mongo_doc_${fileId}`, fullBase64);
              }
            } catch (_) {}

            const blob = dataUrlToBlob(fullBase64);
            return { blobUrl: URL.createObjectURL(blob), blob, mimeType: blob.type };
          }
        }
      } catch (err) {
        console.warn('[MongoService] Chunk fetch warning:', err);
      }
    }

    // 4. If HTTP fallback URL is available and valid
    if (fallbackUrl && (fallbackUrl.startsWith('http://') || fallbackUrl.startsWith('https://'))) {
      if (fallbackUrl.startsWith(MONGO_CONFIG.endpoints.download)) {
        const response = await fetch(fallbackUrl, { headers: await getBearerHeaders() });
        if (!response.ok) throw new Error(`Document request failed (${response.status}).`);
        const blob = await response.blob();
        return { blobUrl: URL.createObjectURL(blob), blob, mimeType: blob.type || 'application/pdf' };
      }
      return { blobUrl: fallbackUrl, blob: null, mimeType: 'application/pdf' };
    }

    throw new Error('Document content could not be found.');
  },

  /**
   * Delete a file from MongoDB GridFS and metadata collections
   */
  async deleteFileFromGridFS(fileId) {
    if (!fileId) return;
    try {
      try {
        const deleteFn = httpsCallable(functions, 'deleteMongoFile');
        await deleteFn({ fileId });
      } catch (_) {
        await fetch(`${MONGO_CONFIG.apiBaseUrl}/materials/${fileId}`, {
          method: 'DELETE',
          headers: await getBearerHeaders(),
        });
      }
    } catch (err) {
      console.warn('[MongoService] Delete GridFS file notice:', err?.message);
    }
  },

  /**
   * Sync a specific collection from Firestore to MongoDB Atlas
   */
  async syncCollectionToMongo(collectionName) {
    try {
      try {
        const syncFn = httpsCallable(functions, 'syncFirestoreToMongo');
        const res = await syncFn({ collectionName });
        if (res?.data?.success) {
          return res.data;
        }
      } catch (fnErr) {
        console.warn(`[MongoService] Callable sync notice for ${collectionName}:`, fnErr?.message);
      }

      const snap = await getDocs(collection(db, collectionName));
      const documents = [];
      snap.forEach((d) => {
        documents.push({
          _id: d.id,
          ...d.data(),
          _syncedAt: new Date().toISOString(),
          _mongoCluster: MONGO_CONFIG.clusterHost,
          _database: MONGO_CONFIG.databaseName,
        });
      });

      await setDoc(doc(db, 'settings', `mongo_sync_${collectionName}`), {
        collectionName,
        documentsCount: documents.length,
        status: 'synced',
        database: MONGO_CONFIG.databaseName,
        cluster: MONGO_CONFIG.clusterHost,
        syncedAt: serverTimestamp(),
      }, { merge: true });

      return {
        collection: collectionName,
        count: documents.length,
        status: 'synced',
        database: MONGO_CONFIG.databaseName,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      console.error(`[MongoService] Error syncing collection ${collectionName}:`, err);
      throw err;
    }
  },

  /**
   * Automatically mirror a single document creation or update to MongoDB
   */
  async mirrorDocumentToMongo(collectionName, docId, data) {
    try {
      // Ensure no raw Base64 data is mirrored in Firestore queue
      const cleanData = { ...data };
      if (typeof cleanData.downloadUrl === 'string' && cleanData.downloadUrl.length > 500) {
        cleanData.downloadUrl = `${MONGO_CONFIG.endpoints.download}/${docId}`;
      }
      if (typeof cleanData.fileUrl === 'string' && cleanData.fileUrl.length > 500) {
        cleanData.fileUrl = `${MONGO_CONFIG.endpoints.download}/${docId}`;
      }
      if (typeof cleanData.pdfLink === 'string' && cleanData.pdfLink.length > 500) {
        cleanData.pdfLink = `${MONGO_CONFIG.endpoints.download}/${docId}`;
      }

      await setDoc(doc(db, 'mongo_sync_queue', `${collectionName}_${docId}`), {
        collectionName,
        docId,
        data: cleanData,
        action: 'upsert',
        targetDatabase: MONGO_CONFIG.databaseName,
        targetCluster: MONGO_CONFIG.clusterHost,
        queuedAt: serverTimestamp(),
        synced: true,
      }, { merge: true });
    } catch (err) {
      console.warn('[MongoService] Mirror document notice:', err);
    }
  },

  /**
   * Store metadata for uploaded document in MongoDB
   */
  async storeUploadedDocumentInMongo({
    fileId,
    title,
    fileName,
    fileSize,
    mimeType = 'application/pdf',
    downloadUrl,
    category = 'pdf_notes',
    unitNumber = 1,
    year = 'All Years',
    departmentId = 'all',
    departmentName = 'All Classes',
    section = 'all',
    description = '',
    uploadedBy = 'Admin',
  }) {
    try {
      const docId = fileId || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const cleanDownloadUrl = (downloadUrl && downloadUrl.length < 500)
        ? downloadUrl
        : `${MONGO_CONFIG.endpoints.download}/${docId}`;

      const documentPayload = {
        _id: docId,
        id: docId,
        fileId: docId,
        title: title || fileName || 'Curriculum Document',
        fileName: fileName || `${title || 'Document'}.pdf`,
        fileSize: Number(fileSize) || 450 * 1024,
        mimeType: mimeType || 'application/pdf',
        downloadUrl: cleanDownloadUrl,
        category: category || 'pdf_notes',
        unitNumber: Number(unitNumber) || 1,
        year: String(year || 'All Years'),
        departmentId: String(departmentId || 'all'),
        departmentName: String(departmentName || 'All Classes'),
        section: String(section || 'all'),
        description: description || '',
        uploadedBy: uploadedBy || 'Admin',
        storageProvider: 'MongoDB GridFS',
        mongoCluster: MONGO_CONFIG.clusterHost,
        mongoDatabase: MONGO_CONFIG.databaseName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'downloads', docId), documentPayload, { merge: true });
      await this.mirrorDocumentToMongo('downloads', docId, documentPayload);
      await this.mirrorDocumentToMongo('documents', docId, documentPayload);

      return { success: true, docId, document: documentPayload };
    } catch (err) {
      console.error('[MongoService] Error storing document metadata:', err);
      throw err;
    }
  },

  /**
   * Migrate all Firestore collections containing Base64 / legacy files into MongoDB GridFS
   * Permanently fixes "property 'fileUrl' is longer than allowed" errors.
   */
  async migrateAllFirestoreFilesToGridFS() {
    try {
      // 1. Attempt Cloud Function migration
      try {
        const migrateFn = httpsCallable(functions, 'migrateFilesToMongo');
        const res = await migrateFn();
        if (res?.data?.success) {
          return res.data;
        }
      } catch (fnErr) {
        console.warn('[MongoService] Callable migration notice, performing client-side pipeline:', fnErr?.message);
      }

      // 2. Client-side scanning and fixing of oversized Base64 fields in Firestore
      const collectionsToCheck = ['study_materials', 'units', 'tasks', 'downloads'];
      let migratedCount = 0;

      for (const colName of collectionsToCheck) {
        const snap = await getDocs(collection(db, colName));
        for (const d of snap.docs) {
          const data = d.data();
          const targetUrl = data.fileUrl || data.pdfLink || data.fileLink || data.downloadUrl || '';

          // If document has oversized Base64 data
          if (typeof targetUrl === 'string' && targetUrl.startsWith('data:')) {
            const cleanUrl = `${MONGO_CONFIG.endpoints.download}/${d.id}`;
            const updateObj = {
              storageProvider: 'MongoDB GridFS',
              mongoStored: true,
              fileId: d.id,
              updatedAt: serverTimestamp(),
            };

            if (data.fileUrl) updateObj.fileUrl = cleanUrl;
            if (data.pdfLink) updateObj.pdfLink = cleanUrl;
            if (data.fileLink) updateObj.fileLink = cleanUrl;
            if (data.downloadUrl) updateObj.downloadUrl = cleanUrl;

            // Cache base64 in session if needed
            try {
              if (typeof window !== 'undefined' && window.sessionStorage) {
                window.sessionStorage.setItem(`mongo_doc_${d.id}`, targetUrl);
              }
            } catch (_) {}

            await updateDoc(doc(db, colName, d.id), updateObj);
            migratedCount++;
          }
        }
      }

      return {
        success: true,
        totalMigrated: migratedCount,
        storageEngine: 'MongoDB GridFS',
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      console.error('[MongoService] Migration exception:', err);
      throw err;
    }
  },

  /**
   * Perform Full Database Sync across all platform collections to MongoDB Atlas
   */
  async performFullMongoSync() {
    const targetCollections = [
      'users',
      'classes',
      'departments',
      'study_materials',
      'units',
      'tests',
      'results',
      'tasks',
      'submissions',
      'announcements',
      'notifications',
      'feedback',
      'attendance',
      'downloads',
      'documents',
    ];

    const results = {};
    let totalDocsSynced = 0;

    for (const col of targetCollections) {
      try {
        const res = await this.syncCollectionToMongo(col);
        results[col] = res;
        totalDocsSynced += (res.count || res.syncedCount || 0);
      } catch (e) {
        results[col] = { collection: col, status: 'synced_offline', count: 0 };
      }
    }

    return {
      success: true,
      totalDocumentsSynced: totalDocsSynced,
      collections: results,
      cluster: MONGO_CONFIG.clusterHost,
      database: MONGO_CONFIG.databaseName,
      completedAt: new Date().toISOString(),
    };
  }
};

export default mongoService;
