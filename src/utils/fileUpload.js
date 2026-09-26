import { mongoService } from '../services/mongoService';
import { MONGO_CONFIG } from '../config/mongoConfig';

/**
 * Uploads and stores a file directly in MongoDB GridFS & Atlas Document Repository.
 * Eliminates Firebase Storage restrictions, oversized Firestore property limits, and Base64 bloat.
 * 
 * @param {File} file - Browser File object
 * @param {string} folder - Destination category (e.g. 'study_materials', 'units', 'assignments', 'downloads')
 * @param {Function} [onProgress] - Optional progress callback `(percent: number) => void`
 * @param {Object} [extraMetadata] - Optional metadata (title, category, unitNumber, year, departmentId, etc.)
 * @returns {Promise<{ url: string, fileId: string, fileName: string, size: number, mimeType: string, mongoDocId: string }>}
 */
export const uploadFileToStorage = async (file, folder = 'study_materials', onProgress, extraMetadata = {}) => {
  if (!file) {
    throw new Error('No file provided for upload.');
  }

  try {
    if (typeof onProgress === 'function') onProgress(5);

    // Clean up file name to prevent illegal URI characters
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const mimeType = file.type || 'application/pdf';

    // Upload directly to MongoDB GridFS via MongoService
    const result = await mongoService.uploadFileToGridFS(
      file,
      {
        folder,
        category: extraMetadata.category || folder,
        title: extraMetadata.title || file.name.replace(/\.[^/.]+$/, ''),
        unitNumber: extraMetadata.unitNumber || 1,
        year: extraMetadata.year || 'All Years',
        departmentId: extraMetadata.departmentId || 'all',
        departmentName: extraMetadata.departmentName || 'All Classes',
        section: extraMetadata.section || 'all',
        subject: extraMetadata.subject || 'Tamil',
        description: extraMetadata.description || '',
      },
      onProgress
    );

    return {
      url: result.downloadUrl,
      fileId: result.fileId,
      fileName: result.fileName || cleanName,
      size: result.fileSize || file.size,
      mimeType: result.mimeType || mimeType,
      mongoDocId: result.fileId,
    };
  } catch (err) {
    console.error('[FileUpload] Upload to MongoDB GridFS exception:', err);
    throw new Error(err.message || 'Failed to process and store document in MongoDB GridFS.');
  }
};

/**
 * Universal file opener and downloader for MongoDB GridFS files, Blobs, and remote HTTP URLs
 * @param {string} fileUrl 
 * @param {string} [fileName] 
 * @param {string} [fileId]
 */
export const openOrDownloadFile = async (fileUrl, fileName = 'document.pdf', fileId = '') => {
  if (!fileUrl && !fileId) return;

  try {
    const res = await mongoService.fetchFileBlob(fileId, fileUrl);
    if (res?.blobUrl) {
      const link = document.createElement('a');
      link.href = res.blobUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }
  } catch (e) {
    console.warn('[FileUpload] Blob retrieval notice, opening URL:', e);
  }

  if (fileUrl && (fileUrl.startsWith('http://') || fileUrl.startsWith('https://'))) {
    window.open(fileUrl, '_blank', 'noopener,noreferrer');
  }
};

/**
 * Helper to convert Base64 Data URL to Blob and open/download
 */
function openBase64Blob(dataUrl, fileName = 'document.pdf') {
  try {
    const parts = dataUrl.split(',');
    const meta = parts[0] || '';
    const base64Data = parts[1] || '';
    const mimeMatch = meta.match(/:(.*?);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'application/pdf';

    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  } catch (err) {
    console.error('[FileUpload] Error in openBase64Blob:', err);
    window.open(dataUrl, '_blank');
  }
}

export default {
  uploadFileToStorage,
  openOrDownloadFile,
};
