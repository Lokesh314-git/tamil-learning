import React, { useState, useMemo, useRef } from 'react';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import Modal from './ui/Modal';
import {
  parseStudentExcel,
  downloadSampleStudentTemplate,
  formatDisplayDob
} from '../utils/studentImport';
import { YEARS } from '../utils/departments';
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  X,
  Layers,
  GraduationCap,
  Users
} from 'lucide-react';

const SECTIONS = ['A', 'B', 'C', 'D', 'E'];

const ImportStudentsModal = ({ open, onClose, departments = [], onImportSuccess }) => {
  const [year, setYear] = useState(YEARS[0] || '1st Year');
  const [departmentId, setDepartmentId] = useState('');
  const [customClassName, setCustomClassName] = useState('');
  const [section, setSection] = useState('A');

  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');

  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importError, setImportError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef(null);

  // Filter departments for selected year
  const departmentsForYear = useMemo(() => {
    return departments.filter(
      (d) => d.year === year && (d.isActive === true || d.isActive === undefined)
    );
  }, [departments, year]);

  // Set default department if available
  React.useEffect(() => {
    if (departmentsForYear.length > 0 && !departmentId) {
      setDepartmentId(departmentsForYear[0].id);
    }
  }, [departmentsForYear, departmentId]);

  const selectedDepartment = useMemo(() => {
    return departments.find((d) => d.id === departmentId);
  }, [departments, departmentId]);

  const effectiveClassName = useMemo(() => {
    if (departmentId === '__custom__') return customClassName.trim();
    return selectedDepartment?.name || customClassName.trim() || 'General';
  }, [departmentId, selectedDepartment, customClassName]);

  const handleFileChange = async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setParseError('');
    setImportError('');
    setParsing(true);

    try {
      const result = await parseStudentExcel(selectedFile);
      setParsedData(result);
    } catch (err) {
      console.error('Failed to parse Excel file:', err);
      setParseError(err.message || 'Failed to read file. Please verify it is a valid Excel file.');
      setParsedData(null);
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleReset = () => {
    setFile(null);
    setParsedData(null);
    setParseError('');
    setImportError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImport = async () => {
    if (!parsedData || parsedData.validRows === 0) return;
    if (!effectiveClassName) {
      setImportError('Please select or specify a Class / Department name.');
      return;
    }

    setImporting(true);
    setImportError('');
    setImportProgress(0);

    try {
      const validStudents = parsedData.students.filter((s) => s.isValid);
      const totalStudents = validStudents.length;
      const deptId = departmentId === '__custom__' ? `custom_${Date.now()}` : departmentId || 'general';

      // Firestore batches are limited to 500 operations.
      // Each student produces up to 4 docs: users, students data, SIF lookup, mobile lookup.
      // Keep each batch below Firestore's 500-write limit.
      const CHUNK_SIZE = 120;
      let processed = 0;

      for (let i = 0; i < validStudents.length; i += CHUNK_SIZE) {
        const chunk = validStudents.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        for (const student of chunk) {
          const studentId = `std_${student.sifNumber.toLowerCase()}_${student.mobileNumber}`;
          const studentDocRef = doc(db, 'users', studentId);
          const studentDataRef = doc(db, 'students data', studentId);

          const studentData = {
            uid: studentId,
            name: student.name,
            rollNumber: student.rollNumber,
            registerNumber: student.rollNumber, // keep backward-compatible
            sifNumber: student.sifNumber,
            dob: student.dob,
            mobileNumber: student.mobileNumber,
            year,
            departmentId: deptId,
            departmentName: effectiveClassName,
            class: effectiveClassName,
            section: section.trim().toUpperCase(),
            role: 'student',
            status: 'active',
            isApproved: true,
            approved: true,
            isDeleted: false,
            importedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };

          batch.set(studentDocRef, studentData, { merge: true });
          batch.set(studentDataRef, studentData, { merge: true });

          // Lookup by SIF Number
          if (student.sifNumber) {
            const lookupSifRef = doc(db, 'studentLookup', student.sifNumber);
            batch.set(
              lookupSifRef,
              {
                studentId,
                sifNumber: student.sifNumber,
                mobileNumber: student.mobileNumber,
                dob: student.dob,
                name: student.name,
                rollNumber: student.rollNumber,
                year,
                departmentId: deptId,
                departmentName: effectiveClassName,
                section: section.trim().toUpperCase(),
                role: 'student',
                status: 'active',
                isApproved: true,
                approved: true,
                updatedAt: serverTimestamp()
              },
              { merge: true }
            );
          }

          // Lookup by Mobile Number
          if (student.mobileNumber) {
            const lookupMobileRef = doc(db, 'studentLookup', student.mobileNumber);
            batch.set(
              lookupMobileRef,
              {
                studentId,
                sifNumber: student.sifNumber,
                mobileNumber: student.mobileNumber,
                dob: student.dob,
                name: student.name,
                rollNumber: student.rollNumber,
                year,
                departmentId: deptId,
                departmentName: effectiveClassName,
                section: section.trim().toUpperCase(),
                role: 'student',
                status: 'active',
                isApproved: true,
                approved: true,
                updatedAt: serverTimestamp()
              },
              { merge: true }
            );
          }
        }

        await batch.commit();
        processed += chunk.length;
        setImportProgress(Math.round((processed / totalStudents) * 100));
      }

      onImportSuccess?.(totalStudents);
      handleReset();
      onClose();
    } catch (err) {
      console.error('Error batch-importing students:', err);
      setImportError(err.message || 'Failed to import students. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import Students from Excel"
      subtitle="Batch create student accounts with SIF, DOB, Year, Class & Section"
      icon={FileSpreadsheet}
      iconVariant="primary"
      size="xl"
      footer={(
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Target: <strong>{year}</strong> &bull; <strong>{effectiveClassName}</strong> &bull; <strong>Section {section}</strong>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={importing}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleImport}
              disabled={!parsedData || parsedData.validRows === 0 || importing}
            >
              {importing ? (
                <>Importing {parsedData?.validRows} Students...</>
              ) : (
                <>
                  <CheckCircle2 size={16} /> Confirm & Import {parsedData ? `(${parsedData.validRows})` : ''}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Assignment Controls */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 14,
              padding: 16,
              background: 'var(--surface-ground, #f8fafc)',
              borderRadius: 12,
              border: '1px solid var(--border)'
            }}
          >
            {/* Academic Year */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                <GraduationCap size={15} color="#3b82f6" /> Academic Year *
              </label>
              <select
                className="input"
                value={year}
                onChange={(e) => {
                  setYear(e.target.value);
                  setDepartmentId('');
                }}
                disabled={importing}
                style={{ width: '100%', borderRadius: 8 }}
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Class / Department */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                <Layers size={15} color="#8b5cf6" /> Class / Department *
              </label>
              <select
                className="input"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                disabled={importing}
                style={{ width: '100%', borderRadius: 8 }}
              >
                {departmentsForYear.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
                <option value="__custom__">+ Custom Class Name</option>
              </select>
            </div>

            {/* Section */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                <Users size={15} color="#10b981" /> Section *
              </label>
              <select
                className="input"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                disabled={importing}
                style={{ width: '100%', borderRadius: 8 }}
              >
                {SECTIONS.map((sec) => (
                  <option key={sec} value={sec}>Section {sec}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Custom class name input if selected */}
          {departmentId === '__custom__' && (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Enter Class Name *
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Tamil Literature or B.A. Tamil"
                value={customClassName}
                onChange={(e) => setCustomClassName(e.target.value)}
                disabled={importing}
                style={{ width: '100%', borderRadius: 8 }}
              />
            </div>
          )}

          {/* File Upload Zone */}
          {!parsedData ? (
            <div>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: isDragOver ? '2px dashed #3b82f6' : '2px dashed var(--border)',
                  borderRadius: 14,
                  padding: '36px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: isDragOver ? 'rgba(59, 130, 246, 0.06)' : 'var(--surface-ground, #fafafa)',
                  transition: 'all 0.2s ease'
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => handleFileChange(e.target.files?.[0])}
                  style={{ display: 'none' }}
                />
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    background: 'rgba(59, 130, 246, 0.1)',
                    color: '#3b82f6',
                    display: 'grid',
                    placeItems: 'center',
                    margin: '0 auto 14px'
                  }}
                >
                  <Upload size={24} />
                </div>
                <h4 style={{ margin: '0 0 6px', fontSize: 15 }}>
                  {parsing ? 'Reading spreadsheet...' : 'Click to select Excel sheet or drag & drop here'}
                </h4>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                  Supports .xlsx, .xls, and .csv files
                </p>
                <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  Required Columns: <strong>Student Name</strong>, <strong>Roll Number</strong>, <strong>SIF Number</strong>, <strong>Date of Birth</strong>, <strong>Mobile Number</strong>
                </p>
              </div>

              {/* Sample Template Download */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadSampleStudentTemplate();
                  }}
                  style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8 }}
                >
                  <Download size={14} /> Download Sample Template (.xlsx)
                </button>
              </div>
            </div>
          ) : (
            /* Parsed Data Preview */
            <div style={{ display: 'grid', gap: 14 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'var(--surface-ground, #f8fafc)',
                  borderRadius: 10,
                  border: '1px solid var(--border)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FileSpreadsheet size={20} color="#10b981" />
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{file?.name}</span>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Total rows: <strong>{parsedData.totalRows}</strong> | Ready to import:{' '}
                      <strong style={{ color: '#10b981' }}>{parsedData.validRows}</strong>
                      {parsedData.invalidRows > 0 && (
                        <span style={{ color: '#ef4444', marginLeft: 8 }}>
                          | Issues: <strong>{parsedData.invalidRows}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleReset}
                  disabled={importing}
                  style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6 }}
                >
                  Choose Different File
                </button>
              </div>

              {/* Warnings / Errors in rows */}
              {parsedData.invalidRows > 0 && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    fontSize: 12,
                    color: '#b91c1c'
                  }}
                >
                  <strong>Note:</strong> {parsedData.invalidRows} row(s) have missing required fields and will be skipped. Only valid rows will be imported.
                </div>
              )}

              {/* Table Preview (first 6 rows) */}
              <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                <table className="table" style={{ fontSize: 12, margin: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 45 }}>#</th>
                      <th>Student Name</th>
                      <th>Roll No</th>
                      <th>SIF Number</th>
                      <th>Date of Birth</th>
                      <th>Mobile Number</th>
                      <th style={{ width: 80 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.students.slice(0, 10).map((s, idx) => (
                      <tr key={idx} style={{ opacity: s.isValid ? 1 : 0.6 }}>
                        <td>{s.rowIndex}</td>
                        <td style={{ fontWeight: 600 }}>{s.name || '-'}</td>
                        <td>{s.rollNumber || '-'}</td>
                        <td><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{s.sifNumber || '-'}</span></td>
                        <td>{formatDisplayDob(s.dob)}</td>
                        <td>{s.mobileNumber || '-'}</td>
                        <td>
                          {s.isValid ? (
                            <span className="pill success" style={{ fontSize: 10, padding: '2px 6px' }}>Valid</span>
                          ) : (
                            <span className="pill error" style={{ fontSize: 10, padding: '2px 6px' }} title={s.errors.join(', ')}>
                              Invalid
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedData.students.length > 10 && (
                <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                  Showing first 10 of {parsedData.students.length} students...
                </p>
              )}
            </div>
          )}

          {/* Errors */}
          {parseError && (
            <div className="alert error" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} /> {parseError}
            </div>
          )}
          {importError && (
            <div className="alert error" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} /> {importError}
            </div>
          )}

          {/* Import Progress Bar */}
          {importing && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span>Importing students...</span>
                <span>{importProgress}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${importProgress}%`,
                    background: 'linear-gradient(90deg, #3b82f6, #10b981)',
                    transition: 'width 0.2s ease'
                  }}
                />
              </div>
            </div>
          )}
        </div>
    </Modal>
  );
};

export default ImportStudentsModal;
