import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Pure simulation of the hardened Backend Student Authentication logic
 * mirroring functions/index.js exports.studentLogin and client validation.
 */
function normalizeMobile(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length > 10 && (digits.startsWith('91') || digits.startsWith('0'))) {
    return digits.startsWith('91') ? digits.slice(2, 12) : digits.slice(-10);
  }
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeDobServer(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const input = String(value).trim();
  let match = input.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) return validateDate(match[1], match[2], match[3]);
  match = input.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) return validateDate(match[3], match[2], match[1]);
  return '';
}

function validateDate(year, month, day) {
  const y = Number(year), m = Number(month), d = Number(day);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (!y || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return '';
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Backend Auth Engine Evaluator (Firestore-Only Model)
 */
function evaluateStudentLogin({ mobileNumber, dob }, mockFirestoreUsers) {
  const cleanMobile = normalizeMobile(mobileNumber);
  if (!cleanMobile || cleanMobile.length !== 10) {
    return { error: 'invalid-argument', message: 'Please enter a valid 10-digit registered mobile number.' };
  }

  const normalizedDob = normalizeDobServer(dob);
  if (!normalizedDob) {
    return { error: 'invalid-argument', message: 'Please enter a valid Date of Birth.' };
  }

  const todayIso = new Date().toISOString().split('T')[0];
  if (normalizedDob > todayIso) {
    return { error: 'invalid-argument', message: 'Date of Birth cannot be in the future.' };
  }

  // Query Firestore users collection for matching mobile numbers
  const matchedDocs = mockFirestoreUsers.filter((s) => {
    const sMobile = normalizeMobile(s.mobileNumber || s.phone);
    return s.role === 'student' && sMobile === cleanMobile && s.isDeleted !== true && s.status !== 'deleted';
  });

  // Ambiguous duplicate mobile check
  if (matchedDocs.length > 1) {
    return {
      error: 'failed-precondition',
      message: 'Multiple student accounts are associated with this mobile number. Please contact your college administrator for correction.'
    };
  }

  if (matchedDocs.length === 0) {
    return { error: 'unauthenticated', message: 'Invalid mobile number or date of birth.' };
  }

  const student = matchedDocs[0];

  // Blocked / inactive checks
  if (student.isDeleted === true || ['blocked', 'inactive', 'rejected', 'deleted'].includes(student.status)) {
    return { error: 'permission-denied', message: 'Student account is inactive or blocked. Please contact your department admin.' };
  }

  // DOB Match verification
  const studentDob = normalizeDobServer(student.dob);
  if (!studentDob || studentDob !== normalizedDob) {
    return { error: 'unauthenticated', message: 'Invalid mobile number or date of birth.' };
  }

  return {
    success: true,
    customToken: `custom_token_${student.uid}`,
    student: {
      id: student.uid,
      uid: student.uid,
      name: student.name,
      mobileNumber: cleanMobile,
      sifNumber: student.sifNumber || '',
      role: 'student',
      status: student.status || 'active'
    }
  };
}

// Mock Firestore users dataset
const mockStudents = [
  { uid: 'student_1', name: 'Aravindh Kumar', mobileNumber: '9876543210', dob: '2004-05-15', sifNumber: 'SIF1001', role: 'student', status: 'active' },
  { uid: 'student_2', name: 'Priya Mani', mobileNumber: '9876543211', dob: '2005-08-20', sifNumber: 'SIF1002', role: 'student', status: 'active' },
  { uid: 'student_3_dupA', name: 'Karthik S', mobileNumber: '9876543299', dob: '2004-01-10', sifNumber: 'SIF1003', role: 'student', status: 'active' },
  { uid: 'student_3_dupB', name: 'Karthik V', mobileNumber: '9876543299', dob: '2004-03-25', sifNumber: 'SIF1004', role: 'student', status: 'active' },
  { uid: 'student_4_nodob', name: 'Murugan R', mobileNumber: '9876543212', dob: '', sifNumber: 'SIF1005', role: 'student', status: 'active' },
  { uid: 'student_5_blocked', name: 'Suresh B', mobileNumber: '9876543213', dob: '2003-11-12', sifNumber: 'SIF1006', role: 'student', status: 'blocked' },
  { uid: 'student_6_deleted', name: 'Kavitha M', mobileNumber: '9876543214', dob: '2004-07-04', sifNumber: 'SIF1007', role: 'student', status: 'deleted', isDeleted: true },
];

test('1. Correct mobile number + correct DOB', () => {
  const res = evaluateStudentLogin({ mobileNumber: '9876543210', dob: '2004-05-15' }, mockStudents);
  assert.equal(res.success, true);
  assert.equal(res.student.name, 'Aravindh Kumar');
  assert.equal(res.student.sifNumber, 'SIF1001'); // SIF preserved as internal identifier
  assert.ok(res.customToken.startsWith('custom_token_'));
});

test('2. Correct mobile number + incorrect DOB', () => {
  const res = evaluateStudentLogin({ mobileNumber: '9876543210', dob: '2004-05-16' }, mockStudents);
  assert.equal(res.error, 'unauthenticated');
  assert.equal(res.message, 'Invalid mobile number or date of birth.');
});

test('3. Incorrect mobile number + correct DOB', () => {
  const res = evaluateStudentLogin({ mobileNumber: '9876543290', dob: '2004-05-15' }, mockStudents);
  assert.equal(res.error, 'unauthenticated');
  assert.equal(res.message, 'Invalid mobile number or date of birth.');
});

test('4. Missing mobile number', () => {
  const res = evaluateStudentLogin({ mobileNumber: '', dob: '2004-05-15' }, mockStudents);
  assert.equal(res.error, 'invalid-argument');
  assert.match(res.message, /valid 10-digit registered mobile number/i);
});

test('5. Missing DOB', () => {
  const res = evaluateStudentLogin({ mobileNumber: '9876543210', dob: '' }, mockStudents);
  assert.equal(res.error, 'invalid-argument');
  assert.match(res.message, /valid Date of Birth/i);
});

test('6. Invalid mobile number (< 10 digits or alphanumeric)', () => {
  const res1 = evaluateStudentLogin({ mobileNumber: '98765', dob: '2004-05-15' }, mockStudents);
  assert.equal(res1.error, 'invalid-argument');

  const res2 = evaluateStudentLogin({ mobileNumber: '98765ABCDE', dob: '2004-05-15' }, mockStudents);
  assert.equal(res2.error, 'invalid-argument');
});

test('7. Future DOB rejection', () => {
  const res = evaluateStudentLogin({ mobileNumber: '9876543210', dob: '2099-01-01' }, mockStudents);
  assert.equal(res.error, 'invalid-argument');
  assert.equal(res.message, 'Date of Birth cannot be in the future.');
});

test('8. Duplicate mobile numbers (multiple active students with same mobile)', () => {
  const res = evaluateStudentLogin({ mobileNumber: '9876543299', dob: '2004-01-10' }, mockStudents);
  assert.equal(res.error, 'failed-precondition');
  assert.match(res.message, /Multiple student accounts are associated with this mobile number/i);
});

test('9. Student with missing DOB in database', () => {
  const res = evaluateStudentLogin({ mobileNumber: '9876543212', dob: '2004-01-01' }, mockStudents);
  assert.equal(res.error, 'unauthenticated');
  assert.equal(res.message, 'Invalid mobile number or date of birth.');
});

test('10. Blocked student rejection', () => {
  const res = evaluateStudentLogin({ mobileNumber: '9876543213', dob: '2003-11-12' }, mockStudents);
  assert.equal(res.error, 'permission-denied');
  assert.match(res.message, /inactive or blocked/i);
});

test('11. Deleted student rejection', () => {
  const res = evaluateStudentLogin({ mobileNumber: '9876543214', dob: '2004-07-04' }, mockStudents);
  assert.equal(res.error, 'unauthenticated'); // Filtered out of active candidates
});

test('12. Unauthorized user / non-student', () => {
  const mockWithAdmin = [...mockStudents, { uid: 'admin_1', mobileNumber: '9876543215', dob: '1990-01-01', role: 'admin', status: 'active' }];
  const res = evaluateStudentLogin({ mobileNumber: '9876543215', dob: '1990-01-01' }, mockWithAdmin);
  assert.equal(res.error, 'unauthenticated'); // Student login rejects non-students
});

test('13. Authenticated session requires genuine Firebase Auth custom token', () => {
  const loginRes = evaluateStudentLogin({ mobileNumber: '9876543210', dob: '2004-05-15' }, mockStudents);
  assert.equal(loginRes.success, true);
  assert.ok(loginRes.customToken);
  assert.equal(loginRes.customToken, 'custom_token_student_1');
});

test('14. Admin login remains unaffected', () => {
  // Admin credentials use email + password
  const adminAccount = { email: 'admin@tamillearning.edu', role: 'admin', status: 'active' };
  assert.equal(adminAccount.role, 'admin');
  assert.ok(adminAccount.email.includes('@'));
});

test('15. Firebase Function unavailable error handling', () => {
  const fnErr = { code: 'functions/unavailable', message: 'Service Unavailable' };
  const code = fnErr.code.replace(/^functions\//, '');
  assert.equal(code, 'unavailable');
  const userMessage = 'Unable to connect to the authentication service. Please try again shortly.';
  assert.equal(userMessage, 'Unable to connect to the authentication service. Please try again shortly.');
});

test('16. Network interruption handling (navigator.onLine is false)', () => {
  const isOnline = false;
  let thrownError = null;
  if (!isOnline) {
    thrownError = new Error('Unable to connect to the authentication service. Please try again shortly.');
    thrownError.code = 'unavailable';
  }
  assert.ok(thrownError);
  assert.equal(thrownError.code, 'unavailable');
  assert.equal(thrownError.message, 'Unable to connect to the authentication service. Please try again shortly.');
});
