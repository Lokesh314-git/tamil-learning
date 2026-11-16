# Document Storage & Streaming Architecture Audit

**Project:** Tamil Learning – Academic Management & Student Portal  
**Firebase Project:** `tamil-learning-9f609` (Region: `us-central1`)  
**Production URL:** `https://tamil-learning.onrender.com`  
**Storage Engines:** MongoDB Atlas GridFS (`study_materials_files`), Google Cloud Firestore  
**Audit Date:** November 2026  

---

## 1. Executive Summary

When administrators uploaded curriculum unit documents and students attempted to view them via the portal, the application threw fatal errors:
```
PdfViewerModal: Document content could not be found.
mongoService.fetchFileBlob: Error: Document content could not be found.
```
This audit examines the end-to-end architecture across client components, services, security rules, and backend streaming endpoints, identifying 5 key failure modes and outlining the remediation architecture.

---

## 2. Root Cause Analysis of System Failures

### 2.1 Failure Mode 1: Firestore Security Rule Mismatch (`mongo_file_chunks`)
- **Vulnerability / Block:** In `firestore.rules`:
  ```javascript
  match /mongo_file_chunks/{id} {
    allow read, write: if isAdmin();
  }
  ```
- **Observed Behavior:** The legacy `mongoService.fetchFileBlob()` implementation queried Firestore's `mongo_file_chunks` directly from the student client. Because students do not possess administrator claims, Firestore rejected the query (`permission-denied`).
- **Resolution Strategy:** Strict maintenance of security boundaries. Students must **never** read raw chunks directly from Firestore. Instead, all document streaming must occur through the authenticated backend Cloud Function / API endpoint (`/api/materials/download/:id`), with MongoDB credentials remaining strictly server-side.

### 2.2 Failure Mode 2: Unawaited Background Upload & Temporary File IDs
- **Root Cause:** In `mongoService.uploadFileToGridFS()`:
  ```javascript
  // Defective legacy implementation
  const fileId = `mongo_file_${Date.now()}_...`;
  (async () => {
    try {
      const uploadFn = httpsCallable(functions, 'uploadFileToMongo');
      await uploadFn({ ... });
    } catch (_) {}
  })();
  return { success: true, fileId, downloadUrl };
  ```
- **Observed Behavior:**
  1. The upload was fired inside an unawaited self-invoking function and errors were swallowed (`catch (_) {}`).
  2. A temporary pseudorandom string (`mongo_file_...`) was immediately returned and saved to Firestore before the file was ever transmitted or saved to GridFS.
  3. Progress jumped to 100% prematurely before server acknowledgment.

### 2.3 Failure Mode 3: Erroneous Metadata Mapping in Admin Unit Save
- **Root Cause:** In `AdminUnitsPage.jsx`:
  ```javascript
  const unitPayload = {
    fileId: data.fileId || data.gridFsFileId || '',
    pdfLink: data.fileId || data.pdfLink || '', // BUG: stored raw ID rather than URL!
    ...
  };
  ```
- **Observed Behavior:** `pdfLink` was populated with the raw string ID (`mongo_file_...` or hex ID) rather than a valid HTTP download URL. Additionally, `downloadUrl` was omitted entirely from the unit schema.

### 2.4 Failure Mode 4: Undefined Parameter in Student Viewer Dispatch
- **Root Cause:** In `StudentUnits.jsx` line 339:
  ```javascript
  <Button onClick={() => setViewingDoc({
    title: currentUnitRecord.title,
    fileUrl: currentUnitRecord.fileUrl, // BUG: fileUrl was never defined on unit record!
    fileName: currentUnitRecord.fileName,
    fileId: currentUnitRecord.fileId
  })}>
  ```
- **Observed Behavior:** `currentUnitRecord.fileUrl` evaluated to `undefined`. When `PdfViewerModal` opened, `rawUrl` was empty, triggering `Document content could not be found.`

### 2.5 Failure Mode 5: Token Verification Failure on Spark Plan
- **Root Cause:** In `mongoService.getBearerHeaders()`:
  ```javascript
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in is required for this storage operation.');
  ```
- **Observed Behavior:** On environments without Blaze plan custom token signing, student login operates through verified Firestore sessions where `auth.currentUser` is null. Calling `getBearerHeaders()` threw an exception, halting download attempts.

---

## 3. Storage Architecture Comparison

| Feature | Legacy Implementation | Remediated Architecture |
|---|---|---|
| **Upload Processing** | Detached async task, swallowed errors | Awaited backend callable & HTTP upload with 0-100% real progress |
| **File ID Authority** | Random client string (`mongo_file_...`) | Verified MongoDB GridFS `ObjectId` |
| **Unit Metadata** | Incomplete, raw ID assigned to `pdfLink` | Complete: `fileId`, `gridFsFileId`, `downloadUrl`, `pdfLink`, `fileName`, `fileSize`, `mimeType`, `storageProvider` |
| **Student Document Access** | Attempted direct read of `mongo_file_chunks` (blocked by rules) | Authenticated backend streaming with active student verification |
| **Spark Plan Support** | Threw unauthenticated error if `auth.currentUser` is null | Hybrid authentication (Firebase ID Token + Spark Session verification) |
| **Self-Healing & Recovery** | None; broken references remained dead | Server-side auto-heal reconstructs legacy chunks and streams instantly |

---

## 4. Security Verification

1. **Firestore Rules:** `mongo_file_chunks` remains restricted to administrators (`allow read, write: if isAdmin();`).
2. **Backend Authentication:** `/api/materials/download/:id` verifies requesting identity (Bearer token or Spark student session).
3. **Role & Account Status:** Active account verification (`!isDeleted`, `status === 'active' || isApproved`).
4. **Access Boundaries:** Document year and department filters enforced server-side before binary transmission.
5. **Credentials Privacy:** MongoDB Atlas connection URI is confined to Cloud Functions environment variables / Secret Manager.
