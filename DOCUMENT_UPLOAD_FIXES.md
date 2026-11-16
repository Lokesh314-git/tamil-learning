# Document Upload & Viewer Architecture Fixes

**Project:** Tamil Learning – Academic Management & Student Portal  
**Scope:** Complete redesign and stabilization of unit document upload, metadata persistence, authenticated streaming, and in-app viewer.  

---

## 1. Overview of Changes

The document storage and delivery workflow has been completely repaired across 7 core modules:

1. `src/services/mongoService.js` — Synchronous upload await, verified ID resolution, authenticated streaming retrieval, and multi-tier token handling.
2. `src/utils/fileUpload.js` — Uniform metadata schema propagation and robust file downloader.
3. `src/components/UnitFormModal.jsx` — Form lifecycle integration with complete GridFS metadata.
4. `src/pages/admin/AdminUnitsPage.jsx` — Clean metadata payload formulation and sanitized URL storage.
5. `src/pages/student/StudentUnits.jsx` — Reliable parameter dispatch to `PdfViewerModal`.
6. `src/components/PdfViewerModal.jsx` — Multi-candidate URL resolution, explicit error handling with HTTP status recognition, Retry action, and memory cleanup.
7. `functions/index.js` — Secure document streaming endpoint with student authorization, access control, and auto-healing legacy recovery.

---

## 2. Detailed Implementation Breakdown

### 2.1 Synchronous Upload Process (`src/services/mongoService.js`)
- Replaced the unawaited `(async () => { ... })()` upload pattern with synchronous execution:
  ```javascript
  const uploadFn = httpsCallable(functions, 'uploadFileToMongo');
  const res = await uploadFn({
    fileBase64: base64Data,
    fileName: cleanFileName,
    mimeType,
    metadata: { ... }
  });
  ```
- Dual-transport failover:
  1. Primary: Firebase Callable Cloud Function (`uploadFileToMongo`).
  2. Secondary: HTTP REST Endpoint (`POST /api/materials/upload`) with Bearer headers.
  3. Offline / Spark Plan Fallback: Chunked storage with verified ID generation and logging.
- Accurate progress tracking:
  - 10%–40%: Base64 reading in browser.
  - 45%–85%: File payload transmission and GridFS stream ingestion.
  - 100%: Storage metadata confirmation in Firestore `downloads` collection.

### 2.2 Complete Unit Document Metadata (`src/components/UnitFormModal.jsx` & `src/pages/admin/AdminUnitsPage.jsx`)
Ensured every saved unit in Firestore contains the standard schema:
```javascript
{
  unitNumber: 1,
  title: 'இலக்கிய வரலாறு (History of Literature)',
  fileId: '65f9a1b2c3d4e5f6a7b8c9d0',
  gridFsFileId: '65f9a1b2c3d4e5f6a7b8c9d0',
  downloadUrl: 'https://us-central1-tamil-learning-9f609.cloudfunctions.net/api/materials/download/65f9a1b2c3d4e5f6a7b8c9d0',
  pdfLink: 'https://us-central1-tamil-learning-9f609.cloudfunctions.net/api/materials/download/65f9a1b2c3d4e5f6a7b8c9d0',
  fileName: 'Unit_1_Tamil_Literature.pdf',
  fileSize: 1048576,
  mimeType: 'application/pdf',
  departmentId: 'all',
  departmentName: 'All Classes',
  year: '1st Year',
  storageProvider: 'MongoDB GridFS',
  updatedAt: ServerTimestamp
}
```
Undefined, null, and non-URL raw string IDs are stripped from URL fields before saving.

### 2.3 Student Document Retrieval Fix (`src/pages/student/StudentUnits.jsx`)
Updated line 339 to pass robust, fallback-aware arguments:
```javascript
<Button onClick={() => setViewingDoc({
  title: currentUnitRecord.title || `Unit ${activeUnit} Official Notes`,
  fileUrl: currentUnitRecord.downloadUrl || currentUnitRecord.pdfLink || currentUnitRecord.fileUrl || '',
  downloadUrl: currentUnitRecord.downloadUrl || currentUnitRecord.pdfLink || currentUnitRecord.fileUrl || '',
  pdfLink: currentUnitRecord.pdfLink || currentUnitRecord.downloadUrl || currentUnitRecord.fileUrl || '',
  fileName: currentUnitRecord.fileName || `Unit_${activeUnit}_Notes.pdf`,
  fileId: currentUnitRecord.gridFsFileId || currentUnitRecord.fileId || currentUnitRecord.id || '',
  gridFsFileId: currentUnitRecord.gridFsFileId || currentUnitRecord.fileId || '',
  category: 'curriculum_unit_pdf'
})}>
  <Eye size={15} style={{ marginRight: 6 }} /> Open Unit Notes
</Button>
```

### 2.4 In-App PDF Viewer Enhancements (`src/components/PdfViewerModal.jsx`)
1. **Multi-Candidate Candidate Extraction:**
   ```javascript
   const rawUrl = fileUrl || material?.downloadUrl || material?.pdfLink || material?.fileUrl || material?.fileLink || '';
   const docFileId = fileId || material?.gridFsFileId || material?.fileId || material?.id || '';
   ```
2. **Explicit Error State & HTTP Status Mapping:**
   - `401 Unauthorized`: "Authentication required. Please sign in to view this curriculum material."
   - `403 Forbidden`: "Access restricted. You do not have permission to view this department or year document."
   - `404 Not Found`: "Document content could not be found in storage repository."
   - `500 Server Error`: "Server error encountered while retrieving the file. Please retry."
3. **Interactive Recovery:**
   - "Retry" button invokes `loadDocument()` without requiring modal close.
   - "Try Download" button triggers native browser download stream.
4. **Memory Leak Prevention:**
   - Registered `useEffect` cleanup hook to revoke Blob URLs via `URL.revokeObjectURL(blobUrl)`.

### 2.5 Cloud Functions Streaming Route (`functions/index.js`)
Enhanced `GET /api/materials/download/:id`:
- Authenticates requests from both Firebase Auth ID Tokens (`Authorization: Bearer ...`) and active Spark student sessions (`X-Student-Id`).
- Checks student account status (`!isDeleted`, `status === 'active' || isApproved`).
- Checks academic authorization against document metadata (`year`, `departmentId`).
- Locates document across GridFS ObjectIds, filenames, and metadata collections.
- Auto-recovers from `mongo_file_chunks` if legacy chunks exist.
- Sets standard binary streaming headers:
  - `Content-Type: application/pdf`
  - `Content-Disposition: inline; filename="..."`
  - `Content-Length: <size>`
  - `Cache-Control: public, max-age=86400, s-maxage=86400`

