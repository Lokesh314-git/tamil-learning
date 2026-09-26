import React, { useEffect, useMemo, useState } from 'react';
import Modal from './ui/Modal';
import { UserPlus, UserCheck, Phone, Calendar, Hash, Mail, BookOpen, Layers } from 'lucide-react';
import { normalizeDob } from '../utils/studentImport';

const YEARS = ['1st Year', '2nd Year', '3rd Year'];
const SECTIONS = ['A', 'B', 'C', 'D'];

const AddStudentModal = ({
  open,
  onClose,
  onCreate,
  onUpdate,
  student,
  submitting = false,
  error,
  departments = [],
}) => {
  const isEdit = Boolean(student);
  const [form, setForm] = useState({
    name: '',
    email: '',
    sifNumber: '',
    mobileNumber: '',
    rollNumber: '',
    dob: '',
    year: YEARS[0],
    departmentId: '',
    departmentName: '',
    section: 'A',
    status: 'active',
  });
  const [validationError, setValidationError] = useState('');

  const departmentsForYear = useMemo(
    () => departments.filter((d) => !d.year || d.year === form.year),
    [departments, form.year]
  );

  useEffect(() => {
    if (isEdit && student) {
      setForm({
        name: student.name || '',
        email: student.email || '',
        sifNumber: student.sifNumber || '',
        mobileNumber: student.mobileNumber || student.phone || '',
        rollNumber: student.rollNumber || student.rollNo || '',
        dob: student.dob || '',
        year: student.year || YEARS[0],
        departmentId: student.departmentId || student.classId || '',
        departmentName: student.departmentName || student.class || '',
        section: student.section || 'A',
        status: student.status || 'active',
      });
    } else {
      setForm({
        name: '',
        email: '',
        sifNumber: '',
        mobileNumber: '',
        rollNumber: '',
        dob: '',
        year: YEARS[0],
        departmentId: departments[0]?.id || '',
        departmentName: departments[0]?.name || '',
        section: 'A',
        status: 'active',
      });
    }
    setValidationError('');
  }, [isEdit, student, departments]);

  useEffect(() => {
    if (!form.departmentId && departmentsForYear.length > 0) {
      setForm((prev) => ({
        ...prev,
        departmentId: departmentsForYear[0].id,
        departmentName: departmentsForYear[0].name,
      }));
    }
  }, [departmentsForYear, form.departmentId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError('');

    if (!form.name.trim()) {
      setValidationError('Student name is required.');
      return;
    }
    if (!form.sifNumber.trim() && !form.mobileNumber.trim()) {
      setValidationError('Either SIF Number or Mobile Number is required for student login.');
      return;
    }
    if (!form.dob.trim()) {
      setValidationError('Date of Birth is mandatory for student login verification.');
      return;
    }

    const payload = {
      ...form,
      name: form.name.trim(),
      email: form.email.trim(),
      sifNumber: form.sifNumber.trim().toUpperCase(),
      mobileNumber: form.mobileNumber.trim().replace(/\D/g, ''),
      rollNumber: form.rollNumber.trim(),
      dob: normalizeDob(form.dob) || form.dob.trim(),
      class: form.departmentName,
    };

    if (isEdit) {
      onUpdate(payload);
    } else {
      onCreate(payload);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Student Profile' : 'Add New Student'}
      subtitle={
        isEdit
          ? 'Update student academic details and credentials'
          : 'Register a student for instant student portal login with SIF/Mobile & DOB'
      }
      icon={isEdit ? UserCheck : UserPlus}
      iconVariant="primary"
      size="lg"
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Saving...' : isEdit ? 'Update Student Record' : 'Create & Register Student'}
          </button>
        </>
      )}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {(validationError || error) && (
          <div className="alert error" style={{ margin: 0 }}>
            {validationError || error}
          </div>
        )}

        {/* Basic Identity */}
        <div className="grid grid-2" style={{ gap: 14 }}>
          <div>
            <label className="form-label">Full Name *</label>
            <input
              className="input"
              placeholder="e.g. K. Anbarasu"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="form-label">Email Address (Optional)</label>
            <input
              className="input"
              type="email"
              placeholder="e.g. anbarasu@college.edu"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
        </div>

        {/* Login Credentials Group */}
        <div style={{ background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#1e40af', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Hash size={14} /> Student Login Credentials (Used in Student Portal)
          </div>

          <div className="grid grid-3" style={{ gap: 12 }}>
            <div>
              <label className="form-label">SIF Number *</label>
              <input
                className="input"
                placeholder="e.g. SIF202401"
                value={form.sifNumber}
                onChange={(e) => setForm({ ...form, sifNumber: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label">Mobile Number *</label>
              <input
                className="input"
                type="tel"
                placeholder="e.g. 9876543210"
                value={form.mobileNumber}
                onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })}
              />
            </div>

            <div>
              <label className="form-label">Date of Birth (Mandatory) *</label>
              <input
                className="input"
                type="date"
                value={form.dob}
                onChange={(e) => setForm({ ...form, dob: e.target.value })}
                required
              />
            </div>
          </div>
        </div>

        {/* Academic Hierarchy */}
        <div className="grid grid-3" style={{ gap: 12 }}>
          <div>
            <label className="form-label">Academic Year *</label>
            <select
              className="input"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Department / Class *</label>
            <select
              className="input"
              value={form.departmentId}
              onChange={(e) => {
                const found = departments.find((d) => d.id === e.target.value);
                setForm({
                  ...form,
                  departmentId: e.target.value,
                  departmentName: found?.name || '',
                });
              }}
            >
              <option value="">Select Department</option>
              {departmentsForYear.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.year || form.year})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Section *</label>
            <select
              className="input"
              value={form.section}
              onChange={(e) => setForm({ ...form, section: e.target.value })}
            >
              {SECTIONS.map((s) => (
                <option key={s} value={s}>Section {s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-2" style={{ gap: 12 }}>
          <div>
            <label className="form-label">Roll Number (Optional)</label>
            <input
              className="input"
              placeholder="e.g. 24TAM001"
              value={form.rollNumber}
              onChange={(e) => setForm({ ...form, rollNumber: e.target.value })}
            />
          </div>

          <div>
            <label className="form-label">Account Status</label>
            <select
              className="input"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">Active (Full Access)</option>
              <option value="blocked">Blocked (Login Disabled)</option>
              <option value="graduated">Graduated / Alumni</option>
            </select>
          </div>
        </div>
      </form>
    </Modal>
  );
};

export default AddStudentModal;
