import React, { useEffect, useRef, useState } from 'react';
import { Upload, X, CheckCircle2, FileCheck2, AlertCircle, Calendar, Tag, FileText, HardDrive } from 'lucide-react';
import Modal from './ui/Modal';
import { uploadFileToStorage } from '../utils/fileUpload';

const TaskFormModal = ({
  open,
  onClose,
  onSave,
  initial,
  year,
  departments = [],
  selectedDepartmentId = 'all'
}) => {
  const [form, setForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    fileId: '',
    fileName: '',
    fileSize: 0,
    status: 'active',
    departmentId: selectedDepartmentId || 'all'
  });
  const [fileLoading, setFileLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (initial) {
      setForm({
        title: initial.title || '',
        description: initial.description || '',
        dueDate: initial.dueDate || '',
        fileId: initial.fileId || initial.gridFsFileId || initial.fileLink || '',
        fileName: initial.fileName || '',
        fileSize: initial.fileSize || 0,
        status: initial.status || 'active',
        departmentId: initial.departmentId || selectedDepartmentId || 'all'
      });
    } else {
      setForm({
        title: '',
        description: '',
        dueDate: '',
        fileId: '',
        fileName: '',
        fileSize: 0,
        status: 'active',
        departmentId: selectedDepartmentId || 'all'
      });
    }
    setError('');
    setFileLoading(false);
    setUploadProgress(0);
  }, [initial, selectedDepartmentId, open]);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileLoading(true);
    setUploadProgress(1);
    setError('');

    try {
      const { fileId, fileName, size } = await uploadFileToStorage(file, 'assignments', (pct) => {
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
      console.error('File upload error:', err);
      setError(err.message || 'Failed to upload task reference to MongoDB GridFS.');
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
      setError('Please enter a Task/Assignment title.');
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
      title={initial?.id ? 'Edit Assignment / Task' : 'Create Assignment / Task'}
      subtitle={`Assign student homework and tasks for ${year || 'all classes'}`}
      icon={FileCheck2}
      iconVariant="primary"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={fileLoading}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={fileLoading}>
            {fileLoading ? `Uploading to MongoDB ${uploadProgress}%...` : initial?.id ? 'Update Task' : 'Publish Task'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <div className="alert error" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-2" style={{ gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Target Department / Class</label>
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

          <div className="form-group">
            <label className="form-label">Task Status</label>
            <select
              className="input"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">Active (Accepting Submissions)</option>
              <option value="closed">Closed / Archived</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Task / Assignment Title *</label>
          <input
            className="input"
            placeholder="e.g. கட்டுரை எழுதுதல் அல்லது தமிழ் இலக்கணம் பயிற்சி 1"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Instructions & Guidelines</label>
          <textarea
            className="input"
            rows={3}
            placeholder="Specify assignment instructions, submission format, and marking criteria..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Submission Due Date</label>
          <input
            className="input"
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Reference Material / Worksheet (Stored in MongoDB GridFS)</label>
          <input
            type="file"
            ref={fileInputRef}
            accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.txt,.zip"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />

          <div
            style={{
              border: '2px dashed var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
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
            onClick={() => fileInputRef.current?.click()}
          >
            {fileLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%' }}>
                <div style={{ color: 'var(--color-primary)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HardDrive size={16} className="spin" />
                  Uploading directly to MongoDB GridFS ({uploadProgress}%)...
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
                      ✓ {form.fileName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      Stored in MongoDB GridFS {form.fileSize ? `(${Math.round(form.fileSize / 1024)} KB)` : ''}
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
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: 'var(--color-primary-light)',
                    color: 'var(--color-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Upload size={18} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
                  Attach PDF or question worksheet (Stored in MongoDB GridFS)
                </div>
                <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
                  PDF, DOCX, PPTX, Images directly stored in MongoDB
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default TaskFormModal;
