import React, { useEffect, useRef, useState } from 'react';
import { YEARS } from '../utils/departments';
import { Upload, FileText, BookOpen, Video, HelpCircle, FileCheck, CheckCircle2, X, AlertCircle, Database, HardDrive } from 'lucide-react';
import Modal from './ui/Modal';
import { uploadFileToStorage } from '../utils/fileUpload';

const CATEGORIES = [
  { id: 'pdf_notes', label: 'PDF Notes', icon: FileText },
  { id: 'unit_notes', label: 'Unit Notes', icon: BookOpen },
  { id: 'semester_notes', label: 'Semester Notes', icon: BookOpen },
  { id: 'question_banks', label: 'Question Banks', icon: HelpCircle },
  { id: 'previous_year_papers', label: 'Previous Year Papers', icon: FileCheck },
  { id: 'reference_materials', label: 'Reference Materials', icon: FileText },
  { id: 'ebooks', label: 'E-Books', icon: BookOpen },
  { id: 'videos', label: 'Videos / Lectures', icon: Video },
];

const UNITS = [
  { id: '1', label: 'Unit 1' },
  { id: '2', label: 'Unit 2' },
  { id: '3', label: 'Unit 3' },
  { id: '4', label: 'Unit 4' },
  { id: '5', label: 'Unit 5' },
  { id: 'general', label: 'General / Semester-wide' },
];

const StudyMaterialModal = ({ open, initial, departments = [], onClose, onSave }) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('pdf_notes');
  const [unit, setUnit] = useState('1');
  const [subject, setSubject] = useState('');
  const [year, setYear] = useState(YEARS[0]);
  const [departmentId, setDepartmentId] = useState('all');
  const [section, setSection] = useState('all');
  const [description, setDescription] = useState('');
  const [fileId, setFileId] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [fileLoading, setFileLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (initial) {
      setTitle(initial.title || '');
      setCategory(initial.category || 'pdf_notes');
      setUnit(initial.unit ? String(initial.unit) : '1');
      setSubject(initial.subject || '');
      setYear(initial.year || YEARS[0]);
      setDepartmentId(initial.departmentId || 'all');
      setSection(initial.section || 'all');
      setDescription(initial.description || '');
      setFileId(initial.fileId || initial.gridFsFileId || initial.id || '');
      setFileName(initial.fileName || '');
      setFileSize(initial.fileSize || 0);
    } else {
      setTitle('');
      setCategory('pdf_notes');
      setUnit('1');
      setSubject('');
      setYear(YEARS[0]);
      setDepartmentId('all');
      setSection('all');
      setDescription('');
      setFileId('');
      setFileName('');
      setFileSize(0);
    }
    setError('');
    setFileLoading(false);
    setUploadProgress(0);
  }, [initial, open]);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileLoading(true);
    setUploadProgress(1);
    setError('');

    try {
      const { fileId: uploadedId, fileName: name, size } = await uploadFileToStorage(file, 'study_materials', (pct) => {
        setUploadProgress(pct);
      });

      setFileId(uploadedId);
      setFileName(name);
      setFileSize(size);
      if (!title.trim()) {
        setTitle(name.replace(/\.[^/.]+$/, ''));
      }
    } catch (err) {
      console.error('File upload error:', err);
      setError(err.message || 'Failed to upload study material to MongoDB GridFS.');
    } finally {
      setFileLoading(false);
    }
  };

  const handleClearFile = () => {
    setFileId('');
    setFileName('');
    setFileSize(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setUploadProgress(0);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Please provide a title for the study material.');
      return;
    }
    if (!fileId && !fileName && !initial?.id) {
      setError('Please select and upload a document file to MongoDB.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const selectedDept = departments.find((d) => d.id === departmentId);
      const departmentName = departmentId === 'all' ? 'All Classes' : (selectedDept?.name || 'General');

      await onSave({
        title: cleanTitle,
        category,
        unit: unit === 'general' ? 'General' : `Unit ${unit}`,
        unitNumber: unit === 'general' ? 0 : Number(unit),
        subject: subject.trim() || departmentName,
        year,
        departmentId,
        departmentName,
        section,
        description: description.trim(),
        fileId: fileId || initial?.fileId || initial?.gridFsFileId || initial?.id,
        gridFsFileId: fileId || initial?.fileId || initial?.gridFsFileId || initial?.id,
        fileName: fileName.trim() || `${cleanTitle}.pdf`,
        fileSize: Number(fileSize) || 450 * 1024,
        storageProvider: 'MongoDB GridFS',
        uploadedAt: new Date().toISOString()
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save study material.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={initial?.id ? 'Edit Study Material' : 'Upload Study Material'}
      subtitle="Publish textbooks, unit notes, reference PDFs directly to MongoDB GridFS"
      icon={BookOpen}
      iconVariant="primary"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting || fileLoading}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting || fileLoading}
          >
            {fileLoading ? `Uploading to MongoDB ${uploadProgress}%...` : submitting ? 'Saving...' : initial?.id ? 'Update Material' : 'Publish Material'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && (
          <div className="alert error" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <h4 className="modal-section-title">Basic Information</h4>
        <div className="form-group">
          <label className="form-label" htmlFor="material-title">Material Title *</label>
          <input
            className="input"
            id="material-title"
            placeholder="e.g. Unit 1 Grammar & Literature Notes"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="material-category">Material Category / Type *</label>
            <select id="material-category" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="material-unit">Curriculum Unit *</label>
            <select id="material-unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNITS.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>

        <h4 className="modal-section-title">Academic Information</h4>
        <div className="grid grid-3" style={{ gap: 12 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="material-year">Target Year *</label>
            <select id="material-year" className="input" value={year} onChange={(e) => setYear(e.target.value)}>
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="material-department">Department / Class</label>
            <select id="material-department" className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="all">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.year})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="material-section">Section</label>
            <select id="material-section" className="input" value={section} onChange={(e) => setSection(e.target.value)}>
              <option value="all">All Sections</option>
              <option value="A">Section A</option>
              <option value="B">Section B</option>
              <option value="C">Section C</option>
              <option value="D">Section D</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="material-subject">Subject / Topic Name</label>
          <input
            className="input"
            id="material-subject"
            placeholder="e.g. தமிழ் மொழி வரலாறு"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <h4 className="modal-section-title">File Information</h4>
        {/* Direct MongoDB GridFS Document Upload */}
        <div className="form-group">
          <label className="form-label" htmlFor="material-file">PDF / Document File Upload (Stored in MongoDB GridFS) *</label>
          <input
            type="file"
            id="material-file"
            ref={fileInputRef}
            accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.txt,.epub,.zip"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />

          <div
            style={{
              border: '2px dashed var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              textAlign: 'center',
              background: 'var(--color-bg)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
            onClick={() => fileInputRef.current?.click()}
          >
            {fileLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>
                <div style={{ color: 'var(--color-primary)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HardDrive size={16} className="spin" />
                  Storing directly in MongoDB GridFS ({uploadProgress}%)...
                </div>
                <div style={{ width: '80%', height: 6, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--color-primary)', transition: 'width 0.2s' }} />
                </div>
              </div>
            ) : fileName ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  background: 'rgba(34, 197, 94, 0.08)',
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  width: '100%',
                  maxWidth: 480
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden', textAlign: 'left' }}>
                  <CheckCircle2 size={20} color="var(--color-success)" style={{ flexShrink: 0 }} />
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Selected File · {fileName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', gap: 8, marginTop: 2 }}>
                      <span>Size: {Math.round(fileSize / 1024)} KB</span>
                      <span>•</span>
                      <span>Storage: MongoDB GridFS</span>
                      <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>Status: Ready to Upload</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '4px 8px', flexShrink: 0 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClearFile();
                  }}
                  title="Remove file"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: 'var(--color-primary-light)',
                    color: 'var(--color-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Upload size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>
                    Click to select and upload document to MongoDB GridFS
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                    PDF, Notes, Question Banks, Assignments, and E-Books stored securely
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="material-description">Description / Guidance</label>
          <textarea
            className="input"
            id="material-description"
            rows={2}
            placeholder="Detailed topics covered, syllabus unit references, reading guidance for students."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
};

export default StudyMaterialModal;
