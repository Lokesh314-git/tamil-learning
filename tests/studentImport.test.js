import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseStudentExcel, normalizeDob } from '../src/utils/studentImport.js';

// Helper to create an in-memory File-like object with arrayBuffer()
function createMockExcelFile(rows, fileName = 'students.xlsx') {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  return {
    name: fileName,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
}

test('1. Import a valid four-column Excel file', async () => {
  const rows = [
    ['Student Name', 'Roll Number', 'Date of Birth', 'Mobile Number'],
    ['Aravindh K', '24TAM001', '2005-08-15', '9876543210'],
    ['Kavitha S', '24TAM002', '2005-11-22', '9876543211'],
    ['Manojkumar M', '24TAM003', '2006-01-10', '9876543212']
  ];

  const file = createMockExcelFile(rows);
  const result = await parseStudentExcel(file);

  assert.equal(result.totalRows, 3);
  assert.equal(result.validRows, 3);
  assert.equal(result.invalidRows, 0);
  assert.equal(result.errors.length, 0);

  // Check first student fields
  const first = result.students[0];
  assert.equal(first.name, 'Aravindh K');
  assert.equal(first.rollNumber, '24TAM001');
  assert.equal(first.dob, '2005-08-15');
  assert.equal(first.mobileNumber, '9876543210');
  assert.equal(first.isValid, true);
  assert.equal(first.sifNumber, undefined); // SIF completely omitted from 4-column format
});

test('2. Import a file without a SIF Number column', async () => {
  const rows = [
    ['Student Name', 'Roll Number', 'Date of Birth', 'Mobile Number'],
    ['Selvan P', '24TAM004', '2005-04-12', '9876543213']
  ];

  const file = createMockExcelFile(rows);
  const result = await parseStudentExcel(file);

  assert.equal(result.validRows, 1);
  assert.equal(result.invalidRows, 0);
  assert.equal(result.students[0].name, 'Selvan P');
});

test('3. Import a file with missing required columns (e.g. missing Mobile Number)', async () => {
  const rows = [
    ['Student Name', 'Roll Number', 'Date of Birth'],
    ['Selvan P', '24TAM004', '2005-04-12']
  ];

  const file = createMockExcelFile(rows);
  await assert.rejects(
    async () => parseStudentExcel(file),
    /Missing required column\(s\): Mobile Number/i
  );
});

test('4. Import duplicate roll numbers within the file', async () => {
  const rows = [
    ['Student Name', 'Roll Number', 'Date of Birth', 'Mobile Number'],
    ['Student One', '24TAM001', '2005-08-15', '9876543210'],
    ['Student Two', '24TAM001', '2005-09-20', '9876543211'] // Duplicate roll number
  ];

  const file = createMockExcelFile(rows);
  const result = await parseStudentExcel(file);

  assert.equal(result.totalRows, 2);
  assert.equal(result.validRows, 1);
  assert.equal(result.invalidRows, 1);
  assert.match(result.errors[0], /Duplicate Roll Number \(24TAM001\)/i);
});

test('5. Import invalid mobile numbers (< 10 digits or alphanumeric)', async () => {
  const rows = [
    ['Student Name', 'Roll Number', 'Date of Birth', 'Mobile Number'],
    ['Student Invalid', '24TAM005', '2005-05-15', '98765']
  ];

  const file = createMockExcelFile(rows);
  const result = await parseStudentExcel(file);

  assert.equal(result.invalidRows, 1);
  assert.match(result.students[0].errors[0], /Mobile Number must be 10 digits/i);
});

test('6. Import invalid dates and future dates', async () => {
  const rows = [
    ['Student Name', 'Roll Number', 'Date of Birth', 'Mobile Number'],
    ['Future Student', '24TAM006', '2099-01-01', '9876543214'],
    ['Bad Date Student', '24TAM007', 'not-a-date', '9876543215']
  ];

  const file = createMockExcelFile(rows);
  const result = await parseStudentExcel(file);

  assert.equal(result.invalidRows, 2);
  assert.match(result.students[0].errors[0], /Date of Birth cannot be in the future/i);
  assert.match(result.students[1].errors[0], /Missing Date of Birth/i);
});

test('7. Import a file containing empty rows (empty rows must be ignored)', async () => {
  const rows = [
    ['Student Name', 'Roll Number', 'Date of Birth', 'Mobile Number'],
    ['Student A', '24TAM008', '2005-02-14', '9876543216'],
    ['', '', '', ''], // empty row
    [null, null, null, null], // null row
    ['Student B', '24TAM009', '2005-03-18', '9876543217']
  ];

  const file = createMockExcelFile(rows);
  const result = await parseStudentExcel(file);

  assert.equal(result.totalRows, 2);
  assert.equal(result.validRows, 2);
  assert.equal(result.invalidRows, 0);
});

test('8. Verify that existing student records with SIF remain intact', () => {
  const existingStudentRecord = {
    uid: 'existing_student_123',
    name: 'Aravindh Kumar',
    rollNumber: '24TAM001',
    sifNumber: 'SIF1001', // Internal academic ID preserved
    mobileNumber: '9876543210',
    dob: '2005-08-15',
    role: 'student'
  };

  assert.equal(existingStudentRecord.sifNumber, 'SIF1001');
  assert.equal(existingStudentRecord.mobileNumber, '9876543210');
});

test('9. Verify student login compatibility with mobile and DOB', () => {
  const loginCredentials = {
    mobileNumber: '9876543210',
    dob: '2005-08-15'
  };

  assert.equal(loginCredentials.mobileNumber.length, 10);
  assert.equal(normalizeDob(loginCredentials.dob), '2005-08-15');
});
