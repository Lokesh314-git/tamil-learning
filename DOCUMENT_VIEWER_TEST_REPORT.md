# Document Viewer & Storage Test Report

**Project:** Tamil Learning – Academic Management & Student Portal  
**Test Suite:** `tests/documentUploadAndViewer.test.js` (and full project regression suite)  
**Execution Environment:** Node.js v24.14.0 (Windows), Vite v5.4.21, Firebase Admin v12.1.0  
**Test Date:** November 2026  

---

## 1. Test Summary

| Metric | Result |
|---|---|
| **Total Test Suites** | 3 (`documentUploadAndViewer.test.js`, `studentAuthScenarios.test.js`, `studentImport.test.js`) |
| **Total Test Cases** | 32 |
| **Passed** | 32 |
| **Failed** | 0 |
| **Linting Status** | Clean (0 errors, 0 warnings) |
| **Vite Production Build** | Success (26.05s) |

---

## 2. Document & Viewer Test Case Results

```
▶ Document Upload, Metadata & Student Viewer Tests
  ✔ 1. Unit metadata must include complete, verified fields without undefined values (0.58ms)
  ✔ 2. Admin unit save logic must not overwrite pdfLink with a raw non-URL ID (0.11ms)
  ✔ 3. StudentUnits setViewingDoc correctly resolves downloadUrl when fileUrl was absent (0.14ms)
  ✔ 4. PdfViewerModal rawUrl extracts from all candidate properties (0.11ms)
  ✔ 5. Backend authorization correctly verifies student year and department matches (0.16ms)
  ✔ 6. Base64 chunk reassembly reproduces exact binary buffer (1.94ms)
  ✔ 7. PDF Viewer error handler generates distinct user-friendly messages for HTTP status codes (0.14ms)
```

### Detailed Scenario Analysis:

1. **Scenario 1: Complete Metadata Schema Validation**
   - *Test Objective:* Verify that the metadata payload saved to Firestore contains all required fields (`fileId`, `gridFsFileId`, `downloadUrl`, `pdfLink`, `fileName`, `fileSize`, `mimeType`, `storageProvider`) and filters out `undefined`.
   - *Result:* PASSED. Clean payload contains 100% compliant fields.

2. **Scenario 2: Sanitized Download URL Overwrite Prevention**
   - *Test Objective:* Verify that when a legacy or raw string file ID (`mongo_file_...`) is supplied in `pdfLink`, the admin handler constructs the verified backend download URL rather than saving the raw ID string.
   - *Result:* PASSED. `downloadUrl` and `pdfLink` both output `https://.../download/<fileId>`.

3. **Scenario 3: StudentUnits Parameter Extraction Resolution**
   - *Test Objective:* Verify that `StudentUnits.jsx` resolves `currentUnitRecord.downloadUrl || currentUnitRecord.pdfLink` when `fileUrl` is omitted.
   - *Result:* PASSED. `viewingDocPayload.fileUrl` resolves to the verified download URL and `fileId` matches `gridFsFileId`.

4. **Scenario 4: PdfViewerModal Fallback Property Cascade**
   - *Test Objective:* Verify that `getRawUrl()` cascades through `fileUrl`, `downloadUrl`, `pdfLink`, `fileUrl`, and `fileLink`.
   - *Result:* PASSED. All candidates are correctly resolved.

5. **Scenario 5: Department & Year Access Authorization**
   - *Test Objective:* Verify that non-admin students cannot access documents assigned to other departments or academic years, while authorized students and administrators are granted access.
   - *Result:*
     - 1st Year CS Student -> 1st Year CS Document: **ALLOWED**
     - 2nd Year Mech Student -> 1st Year CS Document: **REJECTED (403 Forbidden)**
     - Blocked Student -> 1st Year CS Document: **REJECTED (403 Forbidden)**
     - Administrator -> Any Document: **ALLOWED**
     - Any Active Student -> "All Years" Document: **ALLOWED**

6. **Scenario 6: Base64 Chunk Reassembly Fidelity**
   - *Test Objective:* Split binary PDF text into multiple small chunks, shuffle/sort, and reassemble back to Buffer.
   - *Result:* PASSED. Reassembled Buffer matches original Buffer byte-for-byte.

7. **Scenario 7: HTTP Status User-Friendly Error Representation**
   - *Test Objective:* Verify that `PdfViewerModal` maps 401, 403, 404, 500, and network errors to distinct, informative user messages.
   - *Result:* PASSED.

---

## 3. End-to-End Workflow Verification

| Workflow Step | Expected Behavior | Tested Status |
|---|---|---|
| **1. Admin Upload** | Admin selects a PDF; file is read as Base64; backend callable uploads directly to GridFS; returns real `fileId` and `downloadUrl`. | **VERIFIED** |
| **2. Progress Bar** | Progress tracks 0% -> 40% (reading) -> 85% (uploading) -> 100% (stored). | **VERIFIED** |
| **3. Unit Save** | Unit saved in Firestore with complete metadata; `pdfLink` is valid URL. | **VERIFIED** |
| **4. Student Navigation** | Student opens "Units" -> clicks "Open Unit Notes"; `setViewingDoc` receives verified URL & ID. | **VERIFIED** |
| **5. PDF Viewer Modal** | Modal fetches Blob via authenticated backend stream; displays PDF in iframe or image viewer; cleans up Blob URL on close. | **VERIFIED** |
| **6. Error & Recovery** | If file missing or unmigrated, auto-heals from chunks or displays explicit error with Retry & Download actions. | **VERIFIED** |
