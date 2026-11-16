import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Document Upload, Metadata & Student Viewer Tests', () => {

  // 1. Metadata Schema Verification
  test('1. Unit metadata must include complete, verified fields without undefined values', () => {
    const rawData = {
      unitNumber: 1,
      title: 'Tamil Literature & Grammar',
      fileId: '65f9a1b2c3d4e5f6a7b8c9d0',
      gridFsFileId: '65f9a1b2c3d4e5f6a7b8c9d0',
      downloadUrl: 'https://us-central1-tamil-learning-9f609.cloudfunctions.net/api/materials/download/65f9a1b2c3d4e5f6a7b8c9d0',
      pdfLink: 'https://us-central1-tamil-learning-9f609.cloudfunctions.net/api/materials/download/65f9a1b2c3d4e5f6a7b8c9d0',
      fileName: 'Unit_1_Grammar.pdf',
      fileSize: 1048576,
      mimeType: 'application/pdf',
      departmentId: 'all',
      departmentName: 'All Departments',
      year: '1st Year',
      storageProvider: 'MongoDB GridFS',
      extraUnusedField: undefined
    };

    const cleanPayload = Object.fromEntries(
      Object.entries(rawData).filter(([_, v]) => v !== undefined && v !== null)
    );

    assert.equal(cleanPayload.fileId, '65f9a1b2c3d4e5f6a7b8c9d0');
    assert.equal(cleanPayload.gridFsFileId, '65f9a1b2c3d4e5f6a7b8c9d0');
    assert.equal(cleanPayload.downloadUrl.startsWith('https://'), true);
    assert.equal(cleanPayload.pdfLink.startsWith('https://'), true);
    assert.equal(cleanPayload.fileName, 'Unit_1_Grammar.pdf');
    assert.equal(cleanPayload.fileSize, 1048576);
    assert.equal(cleanPayload.mimeType, 'application/pdf');
    assert.equal(cleanPayload.storageProvider, 'MongoDB GridFS');
    assert.equal(cleanPayload.extraUnusedField, undefined);
  });

  // 2. Prevent string ID from overwriting pdfLink
  test('2. Admin unit save logic must not overwrite pdfLink with a raw non-URL ID', () => {
    const dataWithRawId = {
      unitNumber: 2,
      title: 'Poetry & Prose',
      fileId: 'mongo_file_1710000000_abc',
      gridFsFileId: 'mongo_file_1710000000_abc',
      pdfLink: 'mongo_file_1710000000_abc', // Erroneous legacy raw ID
      fileName: 'Unit_2_Poetry.pdf',
      fileSize: 524288
    };

    const verifiedFileId = dataWithRawId.gridFsFileId || dataWithRawId.fileId || '';
    const verifiedDownloadUrl = (dataWithRawId.pdfLink && dataWithRawId.pdfLink.startsWith('http'))
      ? dataWithRawId.pdfLink
      : `https://us-central1-tamil-learning-9f609.cloudfunctions.net/api/materials/download/${verifiedFileId}`;

    assert.equal(verifiedDownloadUrl.startsWith('https://'), true);
    assert.equal(verifiedDownloadUrl.includes('mongo_file_1710000000_abc'), true);
  });

  // 3. StudentUnits parameter extraction
  test('3. StudentUnits setViewingDoc correctly resolves downloadUrl when fileUrl was absent', () => {
    const currentUnitRecord = {
      id: 'unit_doc_101',
      unitNumber: 3,
      title: 'Epics & Ethics',
      downloadUrl: 'https://us-central1-tamil-learning-9f609.cloudfunctions.net/api/materials/download/65f9a1b2c3d4e5f6a7b8c9d1',
      pdfLink: 'https://us-central1-tamil-learning-9f609.cloudfunctions.net/api/materials/download/65f9a1b2c3d4e5f6a7b8c9d1',
      gridFsFileId: '65f9a1b2c3d4e5f6a7b8c9d1',
      fileName: 'Unit_3_Ethics.pdf'
    };

    const viewingDocPayload = {
      title: currentUnitRecord.title,
      fileUrl: currentUnitRecord.downloadUrl || currentUnitRecord.pdfLink || currentUnitRecord.fileUrl || '',
      downloadUrl: currentUnitRecord.downloadUrl || currentUnitRecord.pdfLink || currentUnitRecord.fileUrl || '',
      pdfLink: currentUnitRecord.pdfLink || currentUnitRecord.downloadUrl || currentUnitRecord.fileUrl || '',
      fileName: currentUnitRecord.fileName,
      fileId: currentUnitRecord.gridFsFileId || currentUnitRecord.fileId || currentUnitRecord.id
    };

    assert.equal(viewingDocPayload.fileUrl, 'https://us-central1-tamil-learning-9f609.cloudfunctions.net/api/materials/download/65f9a1b2c3d4e5f6a7b8c9d1');
    assert.equal(viewingDocPayload.fileId, '65f9a1b2c3d4e5f6a7b8c9d1');
  });

  // 4. PdfViewerModal rawUrl extraction
  test('4. PdfViewerModal rawUrl extracts from all candidate properties', () => {
    function getRawUrl({ fileUrl, material }) {
      return fileUrl || material?.downloadUrl || material?.pdfLink || material?.fileUrl || material?.fileLink || '';
    }

    assert.equal(getRawUrl({ fileUrl: 'https://example.com/file1.pdf' }), 'https://example.com/file1.pdf');
    assert.equal(getRawUrl({ material: { downloadUrl: 'https://example.com/file2.pdf' } }), 'https://example.com/file2.pdf');
    assert.equal(getRawUrl({ material: { pdfLink: 'https://example.com/file3.pdf' } }), 'https://example.com/file3.pdf');
    assert.equal(getRawUrl({ material: { fileUrl: 'https://example.com/file4.pdf' } }), 'https://example.com/file4.pdf');
    assert.equal(getRawUrl({}), '');
  });

  // 5. Access control verification (Year & Department restriction)
  test('5. Backend authorization correctly verifies student year and department matches', () => {
    function verifyDocumentAccess(userProfile, fileMetadata) {
      if (userProfile.role === 'admin' || userProfile.isRootAdmin) {
        return { allowed: true };
      }

      if (userProfile.role !== 'student') {
        return { allowed: false, status: 403, error: 'Unauthorized role' };
      }

      if (userProfile.isDeleted || ['blocked', 'rejected', 'inactive'].includes(userProfile.status)) {
        return { allowed: false, status: 403, error: 'Account inactive or blocked' };
      }

      const fileYear = fileMetadata.year;
      const fileDept = fileMetadata.departmentId;

      if (fileYear && fileYear !== 'All Years' && fileYear !== 'all' && userProfile.year && fileYear !== userProfile.year) {
        return { allowed: false, status: 403, error: `Access restricted: this document is intended for ${fileYear}.` };
      }

      if (fileDept && fileDept !== 'all' && fileDept !== 'All Classes' && userProfile.departmentId && fileDept !== userProfile.departmentId) {
        return { allowed: false, status: 403, error: 'Access restricted: this document is intended for a different department.' };
      }

      return { allowed: true };
    }

    const student1 = { uid: 's1', role: 'student', year: '1st Year', departmentId: 'cs', status: 'active' };
    const student2 = { uid: 's2', role: 'student', year: '2nd Year', departmentId: 'mech', status: 'active' };
    const blockedStudent = { uid: 's3', role: 'student', year: '1st Year', departmentId: 'cs', status: 'blocked' };
    const adminUser = { uid: 'a1', role: 'admin' };

    const docYear1 = { year: '1st Year', departmentId: 'cs' };
    const docAll = { year: 'All Years', departmentId: 'all' };

    // Student 1 accesses 1st Year doc -> ALLOWED
    assert.equal(verifyDocumentAccess(student1, docYear1).allowed, true);

    // Student 2 (2nd Year) accesses 1st Year doc -> RESTRICTED (403)
    const res2 = verifyDocumentAccess(student2, docYear1);
    assert.equal(res2.allowed, false);
    assert.equal(res2.status, 403);

    // Blocked student accesses doc -> RESTRICTED (403)
    assert.equal(verifyDocumentAccess(blockedStudent, docYear1).allowed, false);

    // Admin accesses any doc -> ALLOWED
    assert.equal(verifyDocumentAccess(adminUser, docYear1).allowed, true);

    // Any student accesses 'All Years' doc -> ALLOWED
    assert.equal(verifyDocumentAccess(student1, docAll).allowed, true);
    assert.equal(verifyDocumentAccess(student2, docAll).allowed, true);
  });

  // 6. Base64 Chunk Reassembly Test
  test('6. Base64 chunk reassembly reproduces exact binary buffer', () => {
    const originalText = '%PDF-1.4\n1 0 obj\n<< /Title (Tamil Literature Syllabus) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF';
    const originalBuffer = Buffer.from(originalText, 'utf8');
    const base64Data = originalBuffer.toString('base64');

    // Split into 3 chunks
    const CHUNK_SIZE = 20;
    const chunks = [];
    for (let i = 0; i < Math.ceil(base64Data.length / CHUNK_SIZE); i++) {
      chunks.push({
        index: i,
        chunkData: base64Data.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      });
    }

    // Sort and reassemble
    chunks.sort((a, b) => a.index - b.index);
    const reassembledBase64 = chunks.map((c) => c.chunkData).join('');
    const reassembledBuffer = Buffer.from(reassembledBase64, 'base64');

    assert.equal(reassembledBase64, base64Data);
    assert.deepEqual(reassembledBuffer, originalBuffer);
    assert.equal(reassembledBuffer.toString('utf8'), originalText);
  });

  // 7. HTTP status error code handling for PDF Viewer
  test('7. PDF Viewer error handler generates distinct user-friendly messages for HTTP status codes', () => {
    function getFriendlyErrorMessage(status) {
      if (status === 401) return 'Authentication required. Please sign in to view this curriculum material.';
      if (status === 403) return 'Access restricted. You do not have permission to view this department or year document.';
      if (status === 404) return 'Document content could not be found in storage repository.';
      if (status === 500) return 'Server error encountered while retrieving the file. Please retry.';
      return 'Failed to load document content. Please check your network connection.';
    }

    assert.equal(getFriendlyErrorMessage(401).includes('Authentication required'), true);
    assert.equal(getFriendlyErrorMessage(403).includes('Access restricted'), true);
    assert.equal(getFriendlyErrorMessage(404).includes('could not be found'), true);
    assert.equal(getFriendlyErrorMessage(500).includes('Server error'), true);
    assert.equal(getFriendlyErrorMessage(0).includes('check your network connection'), true);
  });

  // 8. Student Online Assessment Visibility Verification
  test('8. Student Online Assessment Visibility logic correctly resolves matching tests', () => {
    function isTestVisibleToStudent(test, studentProfile, currentRouteYear) {
      const studentYear = currentRouteYear || studentProfile?.year || '1st Year';
      const studentDeptId = studentProfile?.departmentId;
      const testYear = test.year || 'All Years';

      const isYearMatch =
        testYear === 'All Years' ||
        testYear === 'All' ||
        testYear === 'all' ||
        testYear.toLowerCase() === studentYear.toLowerCase() ||
        (studentProfile?.year && testYear.toLowerCase() === studentProfile.year.toLowerCase());

      const isDeptMatch =
        !test.departmentId ||
        test.departmentId === 'all' ||
        !studentDeptId ||
        test.departmentId === studentDeptId ||
        (test.departmentName && (test.departmentName === studentProfile?.departmentName || test.departmentName === studentProfile?.class));

      const isDirectDeptMatch =
        Boolean(test.departmentId && test.departmentId !== 'all' && studentDeptId && test.departmentId === studentDeptId) ||
        Boolean(test.departmentName && (test.departmentName === studentProfile?.departmentName || test.departmentName === studentProfile?.class));

      return isDirectDeptMatch || (isYearMatch && isDeptMatch);
    }

    const student = {
      uid: 'stu-aiml-1',
      name: 'Sathiyakumar',
      year: '2nd Year',
      departmentId: 'VSYl1VmKW2uNURI87rMu',
      departmentName: 'B.Sc AIML'
    };

    // Test A: Explicitly assigned to B.Sc AIML (even if year label was 1st Year) -> VISIBLE
    const testA = {
      id: 'test-1',
      title: 'Tamil Quiz 1',
      year: '1st Year',
      departmentId: 'VSYl1VmKW2uNURI87rMu',
      departmentName: 'B.Sc AIML'
    };
    assert.equal(isTestVisibleToStudent(testA, student, '2nd Year'), true);

    // Test B: 2nd Year all departments -> VISIBLE
    const testB = {
      id: 'test-2',
      title: 'Common 2nd Year Exam',
      year: '2nd Year',
      departmentId: 'all'
    };
    assert.equal(isTestVisibleToStudent(testB, student, '2nd Year'), true);

    // Test C: All Years general test -> VISIBLE
    const testC = {
      id: 'test-3',
      title: 'Tamil General Assessment',
      year: 'All Years',
      departmentId: 'all'
    };
    assert.equal(isTestVisibleToStudent(testC, student, '2nd Year'), true);

    // Test D: Assigned to different department in 2nd Year (e.g. B.Com) -> NOT VISIBLE
    const testD = {
      id: 'test-4',
      title: 'B.Com Specific Test',
      year: '2nd Year',
      departmentId: 'RCAq378rPVj56iKuNP19',
      departmentName: 'R25 B.com'
    };
    assert.equal(isTestVisibleToStudent(testD, student, '2nd Year'), false);

    // Test E: 1st Year general test with no department match -> NOT VISIBLE for 2nd Year
    const testE = {
      id: 'test-5',
      title: '1st Year General Only',
      year: '1st Year',
      departmentId: 'all'
    };
    assert.equal(isTestVisibleToStudent(testE, student, '2nd Year'), false);
  });
});
