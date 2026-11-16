# Legacy Document Recovery & Migration Guide

**Project:** Tamil Learning – Academic Management & Student Portal  
**Target:** Automatic & manual repair of curriculum unit documents stored in legacy Firestore chunks (`mongo_file_chunks`).  

---

## 1. Problem Statement

Prior to the current fix, document uploads split Base64 payloads into 350KB chunks and wrote them into the `mongo_file_chunks` Firestore collection under IDs formatted like `mongo_file_<timestamp>_<hash>`.

Because `firestore.rules` blocks students from reading `mongo_file_chunks` directly, any units pointing to these legacy IDs failed to render for students with the error:
`Document content could not be found.`

---

## 2. Recovery Mechanisms Implemented

Two distinct recovery mechanisms have been built into the platform:

1. **Autonomous Server-Side Auto-Heal (Zero Downtime / On-the-Fly):**
   - When any student or administrator requests a document from `/api/materials/download/:id`, if the file is not yet present in the MongoDB GridFS bucket, the backend Cloud Function queries `mongo_file_chunks` in Firestore.
   - Using the Firebase Admin SDK (which bypasses security rules safely), it fetches all ordered chunks (`index: 0, 1, 2...`), reassembles the binary Buffer, and returns the stream to the user immediately.
   - Simultaneously, in an asynchronous background task, it uploads the reconstructed buffer into MongoDB GridFS and updates the metadata records. Future downloads are served directly from GridFS at high speed.

2. **Administrative Batch Migration Callable:**
   - Deployed Cloud Function: `recoverLegacyDocuments` (Callable, Administrator only).
   - Scans all documents in the `units` Firestore collection.
   - For every unit with a legacy ID:
     1. Verifies if already migrated to GridFS.
     2. Fetches chunks from `mongo_file_chunks`.
     3. Reassembles the file buffer.
     4. Uploads to GridFS bucket `study_materials_files`.
     5. Updates the unit record in Firestore with verified `gridFsFileId`, `downloadUrl`, `pdfLink`, and timestamp.
   - Returns a structured execution report with counts of scanned, recovered, and skipped units.

3. **Standalone Terminal Recovery Tool (`scripts/recoverLegacyDocuments.cjs`):**
   - For local or CI/CD execution without invoking Cloud Functions.
   - Run from terminal:
     ```bash
     node scripts/recoverLegacyDocuments.cjs
     ```

---

## 3. How to Run the Batch Recovery

### Option A: From Developer / Administrator Terminal
```bash
node scripts/recoverLegacyDocuments.cjs
```
**Expected Output:**
```
=== Starting Legacy Document Recovery ===
Connected to MongoDB Atlas and GridFS Bucket.
Found 15 total units in Firestore.
Unit [1] "இலக்கிய வரலாறு": has legacy fileId: mongo_file_1710000000_abc
  -> Reassembled 1048576 bytes from 4 chunks.
  -> Successfully migrated to GridFS ID: 65f9a1b2c3d4e5f6a7b8c9d0 | URL: https://.../download/65f9a1b2c3d4e5f6a7b8c9d0
=== Recovery Complete: 1 legacy units found, 1 recovered to GridFS ===
```

### Option B: Triggering via Firebase Admin Callable in Web Console
Administrators can invoke the function directly via the browser developer tools or admin dashboard:
```javascript
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

const recoverFn = httpsCallable(functions, 'recoverLegacyDocuments');
const result = await recoverFn();
console.log('Recovery Result:', result.data);
```

---

## 4. Verification Checklist

After running the recovery process, verify the following in Firestore Console or Admin Portal:
- [x] Unit documents have `gridFsFileId` matching a 24-character hexadecimal ObjectId.
- [x] Unit documents have `downloadUrl` and `pdfLink` formatted as `https://us-central1-tamil-learning-9f609.cloudfunctions.net/api/materials/download/<id>`.
- [x] Student portal opens the unit document in `PdfViewerModal` without error.
- [x] `mongo_file_chunks` records can be archived or safely purged after verification.

