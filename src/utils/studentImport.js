import * as XLSX from 'xlsx';

/**
 * Normalizes any Date of Birth input (Excel serial number, Date object, or various string formats)
 * into standard 'YYYY-MM-DD'.
 */
export const normalizeDob = (value) => {
  if (value === null || value === undefined || value === '') return '';

  // 1. If it's an Excel serial date number
  if (typeof value === 'number') {
    try {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        const y = String(parsed.y).padStart(4, '0');
        const m = String(parsed.m).padStart(2, '0');
        const d = String(parsed.d).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    } catch {
      // Fall through to other conversions
    }
  }

  // 2. If it's a native Date instance
  if (value instanceof Date && !isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const str = String(value).trim();
  if (!str) return '';

  // 3. Match YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 4. Match DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  // 5. Match DD-MM-YY (two digit year)
  const dmyShortMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (dmyShortMatch) {
    const d = dmyShortMatch[1].padStart(2, '0');
    const m = dmyShortMatch[2].padStart(2, '0');
    const rawY = parseInt(dmyShortMatch[3], 10);
    const y = rawY > 40 ? `19${rawY}` : `20${String(rawY).padStart(2, '0')}`;
    return `${y}-${m}-${d}`;
  }

  // 6. Native Date parse fallback
  const parsedDate = new Date(str);
  if (!isNaN(parsedDate.getTime())) {
    const y = parsedDate.getFullYear();
    const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const d = String(parsedDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return '';
};

/**
 * Format YYYY-MM-DD for UI display (DD/MM/YYYY)
 */
export const formatDisplayDob = (dobStr) => {
  if (!dobStr) return '-';
  const parts = String(dobStr).split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dobStr;
};

/**
 * Normalizes Mobile Number to 10 digits
 */
export const normalizeMobile = (value) => {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length > 10 && (digits.startsWith('91') || digits.startsWith('0'))) {
    return digits.startsWith('91') ? digits.slice(2, 12) : digits.slice(-10);
  }
  return digits.length > 10 ? digits.slice(-10) : digits;
};

/**
 * Normalizes SIF Number (uppercase, trimmed) - Preserved for existing academic records
 */
export const normalizeSif = (value) => {
  if (!value) return '';
  return String(value).trim().toUpperCase().replace(/\s+/g, '');
};

/**
 * Normalizes Roll Number
 */
export const normalizeRoll = (value) => {
  if (!value) return '';
  return String(value).trim().toUpperCase();
};

/**
 * Normalizes Student Name
 */
export const normalizeName = (value) => {
  if (!value) return '';
  return String(value).trim();
};

/**
 * Column header synonym map for auto-detection
 * SIF Number has been completely removed from import mapping.
 */
const HEADER_ALIASES = {
  name: ['student name', 'name', 'studentname', 'student_name', 'பெயர்', 'மாணவர் பெயர்', 'student'],
  rollNumber: ['roll number', 'roll no', 'rollno', 'roll_no', 'roll', 'reg no', 'reg_no', 'register number', 'registerno', 'பதிவு எண்', 'regno'],
  dob: ['date of birth', 'dob', 'birth date', 'birthdate', 'date_of_birth', 'பிறந்த தேதி', 'birth_date'],
  mobileNumber: ['mobile number', 'mobile no', 'mobileno', 'mobile_number', 'mobile', 'phone', 'phone number', 'phoneno', 'contact', 'contact no', 'கைபேசி எண்', 'phone_number']
};

const findFieldKey = (rawHeader) => {
  const clean = String(rawHeader || '').trim().toLowerCase().replace(/[_\s-]+/g, ' ');
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      if (clean === alias || clean.replace(/\s+/g, '') === alias.replace(/\s+/g, '')) {
        return key;
      }
    }
  }
  return null;
};

/**
 * Parses an Excel or CSV file buffer into normalized student records
 * Supports the 4-column format: Student Name, Roll Number, Date of Birth, Mobile Number.
 */
export const parseStudentExcel = async (file) => {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('The uploaded file contains no sheets.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  // Parse rows as 2D array to inspect headers
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (!rawRows || rawRows.length < 2) {
    throw new Error('The file does not contain any student data rows.');
  }

  // Find header row (first row with at least 2 recognized fields)
  let headerRowIndex = -1;
  let fieldMapping = {}; // colIndex -> fieldKey

  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = rawRows[i];
    const mapping = {};
    let matches = 0;

    row.forEach((cell, colIndex) => {
      const key = findFieldKey(cell);
      if (key) {
        mapping[colIndex] = key;
        matches++;
      }
    });

    if (matches >= 2) {
      headerRowIndex = i;
      fieldMapping = mapping;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error(
      'Could not detect student columns. Please ensure headers include: Student Name, Roll Number, Date of Birth, Mobile Number.'
    );
  }

  // Check required columns mapped
  const mappedKeys = new Set(Object.values(fieldMapping));
  const missingCols = [];
  if (!mappedKeys.has('name')) missingCols.push('Student Name');
  if (!mappedKeys.has('rollNumber')) missingCols.push('Roll Number');
  if (!mappedKeys.has('dob')) missingCols.push('Date of Birth');
  if (!mappedKeys.has('mobileNumber')) missingCols.push('Mobile Number');

  if (missingCols.length > 0) {
    throw new Error(`Missing required column(s): ${missingCols.join(', ')}. Expected: Student Name, Roll Number, Date of Birth, Mobile Number.`);
  }

  // Parse data rows
  const students = [];
  const errors = [];
  const todayIso = new Date().toISOString().split('T')[0];

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    // Check if empty row
    if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === '')) {
      continue;
    }

    const rawStudent = {};
    Object.entries(fieldMapping).forEach(([colIndex, key]) => {
      rawStudent[key] = row[colIndex];
    });

    const name = normalizeName(rawStudent.name);
    const rollNumber = normalizeRoll(rawStudent.rollNumber);
    const dob = normalizeDob(rawStudent.dob);
    const mobileNumber = normalizeMobile(rawStudent.mobileNumber);

    const rowErrors = [];
    if (!name) rowErrors.push('Missing Student Name');
    if (!rollNumber) rowErrors.push('Missing Roll Number');
    if (!dob) rowErrors.push('Missing Date of Birth');
    else if (dob > todayIso) rowErrors.push('Date of Birth cannot be in the future');
    if (!mobileNumber) rowErrors.push('Missing Mobile Number');
    else if (mobileNumber.length !== 10) rowErrors.push('Mobile Number must be 10 digits');

    const isValid = rowErrors.length === 0;

    students.push({
      rowIndex: r + 1,
      name,
      rollNumber,
      dob,
      mobileNumber,
      isValid,
      errors: rowErrors
    });

    if (!isValid) {
      errors.push(`Row ${r + 1}: ${rowErrors.join(', ')}`);
    }
  }

  // Duplicate checks within file: Roll Number and Mobile Number
  const seenRoll = new Set();
  const seenMobile = new Set();

  students.forEach((student) => {
    if (!student.isValid) return;

    const duplicateRoll = student.rollNumber && seenRoll.has(student.rollNumber);
    const duplicateMobile = student.mobileNumber && seenMobile.has(student.mobileNumber);

    if (duplicateRoll || duplicateMobile) {
      student.isValid = false;
      const dupErrors = [];
      if (duplicateRoll) dupErrors.push(`Duplicate Roll Number (${student.rollNumber}) in this file`);
      if (duplicateMobile) dupErrors.push(`Duplicate Mobile Number (${student.mobileNumber}) in this file`);
      student.errors.push(...dupErrors);
      errors.push(`Row ${student.rowIndex}: ${dupErrors.join(', ')}`);
      return;
    }

    if (student.rollNumber) seenRoll.add(student.rollNumber);
    if (student.mobileNumber) seenMobile.add(student.mobileNumber);
  });

  return {
    students,
    totalRows: students.length,
    validRows: students.filter((s) => s.isValid).length,
    invalidRows: students.filter((s) => !s.isValid).length,
    errors
  };
};

/**
 * Generates and downloads the pre-formatted 4-column sample Excel template
 * Format: Student Name, Roll Number, Date of Birth, Mobile Number
 */
export const downloadSampleStudentTemplate = () => {
  const sampleData = [
    {
      'Student Name': 'Aravindh K',
      'Roll Number': '24TAM001',
      'Date of Birth': '2005-08-15',
      'Mobile Number': '9876543210'
    },
    {
      'Student Name': 'Kavitha S',
      'Roll Number': '24TAM002',
      'Date of Birth': '2005-11-22',
      'Mobile Number': '9876543211'
    },
    {
      'Student Name': 'Manojkumar M',
      'Roll Number': '24TAM003',
      'Date of Birth': '2006-01-10',
      'Mobile Number': '9876543212'
    }
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData, {
    header: ['Student Name', 'Roll Number', 'Date of Birth', 'Mobile Number']
  });

  // Set column widths matching content
  worksheet['!cols'] = [
    { wch: 22 }, // Student Name
    { wch: 18 }, // Roll Number
    { wch: 16 }, // Date of Birth
    { wch: 18 }  // Mobile Number
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');

  XLSX.writeFile(workbook, 'student_import_template.xlsx');
};
