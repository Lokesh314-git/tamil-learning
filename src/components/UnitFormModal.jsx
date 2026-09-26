import React, { useEffect, useRef, useState } from 'react';
import { Upload, FolderKanban, X, CheckCircle2, FileText, AlertCircle, HardDrive } from 'lucide-react';
import Modal from './ui/Modal';
import { uploadFileToStorage } from '../utils/fileUpload';

const UnitFormModal = ({
  open,
  onClose,
  onSave,
  initial,
  year,
  departments = [],
  selectedDepartmentId = 'all'
}) => {
  const [form, setForm] = useState({
    unitNumber: 1,
    title: '',
    fileId: '',
    fileName: '',
    fileSize: 0,
    departmentId: selectedDepartmentId || 'all'
  });
  const [fileLoading, setFileLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (initial) {
      setForm({
        unitNumber: Number(initial.unitNumber) || 1,
        title: initial.title || '',
        fileId: initial.fileId || initial.gridFsFileId || initial.pdfLink || '',
        fileName: initial.fileName || '',
        fileSize: initial.fileSize || 0,
        departmentId: initial.departmentId || selectedDepartmentId || 'all'
      });
    } else {
      setForm({
        unitNumber: 1,
        title: '',
        fileId: '',
        fileName: '',
        fileSize: 0,
        departmentId: selectedDepartmentId || 'all'
      });
    }
    setFileError('');
    setFileLoading(false);
    setUploadProgress(0);
  }, [initial, selectedDepartmentId, open]);

  const onUnitChange = (value) => {
    const unitNumber = Number(value) || 1;
    setForm((prev) => ({ ...prev, unitNumber }));
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileLoading(true);
    setUploadProgress(1);
    setFileError('');

    try {
      const { fileId, fileName, size } = await uploadFileToStorage(file, 'units', (pct) => {
        setUploadProgress(pct);
      });

      setForm((prev) => ({
        ...prev,
        fileId: fileId,
        gridFsFileId: fileId,
        fileName: fileName,
        fileSize: size,
        title: prev.title || fileName.replace(/\.[^/.]+$/, '')
      }));
    } catch (err) {
      console.error('[UnitFormModal] File upload error:', err);
      setFileError(err.message || 'Failed to upload unit document to MongoDB GridFS.');
    } finally {
      setFileLoading(false);
    }
  };

  const handleClearFile = () => {
    setForm((prev) => ({ ...prev, fileId: '', gridFsFileId: '', fileName: '', fileSize: 0 }));
    if (fileInputRef.current) fileInputRef.current.value = '';
    setUploadProgress(0);
  };

  const handleSave = () => {
    if (!form.title.trim()) {
      setFileError('Please enter a Unit title.');
      return;
    }
    onSave({
      ...form,
      storageProvider: 'MongoDB GridFS',
      updatedAt: new Date().toISOString()
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={initial?.id ? 'Update Curriculum Unit' : 'Create Curriculum Unit'}
      subtitle={`Configure learning syllabus & materials for ${year || 'all classes'}`}
      icon={FolderKanban}
      iconVariant="primary"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={fileLoading}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={fileLoading}>
            {fileLoading ? `Uploading to MongoDB ${uploadProgress}%...` : initial?.id ? 'Update Unit' : 'Save Unit'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {fileError && (
          <div className="alert error" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} />
            <span>{fileError}</span>
          </div>
        )}

        <div className="grid grid-2" style={{ gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Unit Number *</label>
            <select
              className="input"
              value={form.unitNumber}
              onChange={(e) => onUnitChange(e.target.value)}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  Unit {n} (அலகு {n})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Target Department</label>
            <select
              className="input"
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
            >
              <option value="all">All Departments ({year})</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Unit / Lesson Title *</label>
          <input
            className="input"
            placeholder="e.g. Tamil language history or Lesson 1"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <span className="form-hint">Provide clear chapter title in Tamil or English</span>
        </div>

        <div className="form-group">
          <label className="form-label">Attached Syllabus / Lesson Document (Stored in MongoDB GridFS)</label>
          <input
            type="file"
            ref={fileInputRef}
            accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.txt,.epub,.zip"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />

          <div
            style={{
              border: '2px dashed var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 16px',
              textAlign: 'center',
              background: 'var(--color-bg)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
            role="button"
            tabIndex={0}
            aria-label="Upload unit syllabus or lesson document"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
            onClick={() => fileInputRef.current?.click()}
          >
            {fileLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%' }}>
                <div style={{ color: 'var(--color-primary)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HardDrive size={16} className="spin" />
                  Storing directly in MongoDB GridFS ({uploadProgress}%)...
                </div>
                <div style={{ width: '80%', height: 6, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--color-primary)', transition: 'width 0.2s' }} />
                </div>
              </div>
            ) : form.fileName ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  background: 'rgba(34, 197, 94, 0.08)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  width: '100%',
                  maxWidth: 420
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                  <CheckCircle2 size={18} color="var(--color-success)" style={{ flexShrink: 0 }} />
                  <div style={{ overflow: 'hidden', textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Selected file: {form.fileName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {form.fileSize ? `Size: ${Math.round(form.fileSize / 1024)} KB | ` : ''}Storage: MongoDB GridFS | Status: Ready
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px 6px', flexShrink: 0 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClearFile();
                  }}
                  title="Remove file"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <div
                  style={{
                    width: 42,
                    height: 42,
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
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
                  Click to upload syllabus document to MongoDB GridFS
                </div>
                <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
                  PDF, DOCX, PPTX or images stored directly in MongoDB
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default UnitFormModal;
