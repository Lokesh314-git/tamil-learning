import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  where
} from 'firebase/firestore';
import { db } from '../../firebase';
import { YEARS } from '../../utils/departments';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';
import StudyMaterialModal from '../../components/StudyMaterialModal';
import PdfViewerModal from '../../components/PdfViewerModal';
import { dispatchMaterialNotification } from '../../utils/testNotificationService';
import { openOrDownloadFile } from '../../utils/fileUpload';
import {
  BookOpen,
  Plus,
  FileText,
  Video,
  Link,
  HelpCircle,
  FileCheck,
  Download,
  ExternalLink,
  Edit,
  Trash2,
  Search,
  Filter,
  Eye,
  Database,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

const CATEGORY_MAP = {
  all: { label: 'All Materials', icon: BookOpen },
  pdf_notes: { label: 'PDF Notes', icon: FileText },
  unit_notes: { label: 'Unit Notes', icon: BookOpen },
  semester_notes: { label: 'Semester Notes', icon: BookOpen },
  question_banks: { label: 'Question Banks', icon: HelpCircle },
  previous_year_papers: { label: 'Previous Year Papers', icon: FileCheck },
  reference_materials: { label: 'Reference Materials', icon: FileText },
  ebooks: { label: 'E-Books', icon: BookOpen },
  videos: { label: 'Videos / Lectures', icon: Video },
};

const AdminStudyMaterialsPage = () => {
  const [materials, setMaterials] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedYear, setSelectedYear] = useState('All');
  const [selectedUnit, setSelectedUnit] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    let ready = 0;
    const check = () => {
      ready++;
      if (ready >= 2) setLoading(false);
    };

    // 1. Listen to study_materials collection
    const unsubMaterials = onSnapshot(
      query(collection(db, 'study_materials')),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => {
          const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return timeB - timeA;
        });
        setMaterials(list);
        check();
      },
      (err) => {
        console.warn('Study materials listener error:', err);
        check();
      }
    );

    // 2. Listen to classes / departments
    const unsubDepts = onSnapshot(
      query(collection(db, 'departments')),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setDepartments(list);
        check();
      },
      (err) => {
        console.warn('Departments listener error:', err);
        check();
      }
    );

    return () => {
      unsubMaterials();
      unsubDepts();
    };
  }, []);

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      const catMatch = selectedCategory === 'all' || m.category === selectedCategory;
      const yearMatch = selectedYear === 'All' || m.year === selectedYear;
      const unitMatch = selectedUnit === 'All' || String(m.unit) === selectedUnit || String(m.unitNumber) === selectedUnit;
      const searchMatch = !searchQuery.trim() ||
        (m.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.subject || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.description || '').toLowerCase().includes(searchQuery.toLowerCase());

      return catMatch && yearMatch && unitMatch && searchMatch;
    });
  }, [materials, selectedCategory, selectedYear, selectedUnit, searchQuery]);

  const handleSaveMaterial = async (data) => {
    try {
      const { mongoService } = await import('../../services/mongoService');
      const payload = {
        title: data.title || '',
        category: data.category || 'pdf_notes',
        unit: data.unit || 'Unit 1',
        unitNumber: Number(data.unitNumber) || 1,
        subject: data.subject || 'Tamil',
        year: data.year || '1st Year',
        departmentId: data.departmentId || 'all',
        departmentName: data.departmentName || 'All Classes',
        section: data.section || 'all',
        description: data.description || '',
        fileId: data.fileId || data.gridFsFileId || editingMaterial?.fileId || editingMaterial?.gridFsFileId || '',
        gridFsFileId: data.gridFsFileId || data.fileId || editingMaterial?.gridFsFileId || editingMaterial?.fileId || '',
        fileName: data.fileName || editingMaterial?.fileName || `${data.title || 'document'}.pdf`,
        fileSize: Number(data.fileSize) || editingMaterial?.fileSize || 0,
        storageProvider: 'MongoDB GridFS',
        mongoStored: true,
      };

      // Strip any undefined keys
      const cleanPayload = Object.fromEntries(
        Object.entries(payload).filter(([_, v]) => v !== undefined)
      );

      if (editingMaterial?.id) {
        await updateDoc(doc(db, 'study_materials', editingMaterial.id), {
          ...cleanPayload,
          updatedAt: serverTimestamp(),
        });
        await mongoService.mirrorDocumentToMongo('study_materials', editingMaterial.id, cleanPayload);
        setMessage('Study material updated and stored in MongoDB GridFS successfully.');
      } else {
        const ref = await addDoc(collection(db, 'study_materials'), {
          ...cleanPayload,
          downloadsCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await mongoService.mirrorDocumentToMongo('study_materials', ref.id, cleanPayload);
        setMessage('Study material published and stored directly in MongoDB GridFS!');

        // Dispatch instant notification to students
        try {
          await dispatchMaterialNotification({
            materialId: ref.id,
            title: data.title,
            testTitle: data.title,
            subject: data.subject || 'Tamil',
            unitNumber: data.unitNumber || data.unit || 1,
            description: data.description,
            targetType: data.year && data.year !== 'All' ? 'year' : 'all',
            targetYear: data.year || 'all',
            route: '/student/units',
          });
        } catch (notifErr) {
          console.warn('Material notification error:', notifErr);
        }
      }
      setModalOpen(false);
    } catch (err) {
      setError(err.message || 'Failed to save study material.');
    }
  };

  const handleDeleteMaterial = async () => {
    if (!deleteTarget) return;
    try {
      const { mongoService } = await import('../../services/mongoService');
      await deleteDoc(doc(db, 'study_materials', deleteTarget.id));
      if (deleteTarget.fileId || deleteTarget.id) {
        await mongoService.deleteFileFromGridFS(deleteTarget.fileId || deleteTarget.id);
      }
      setMessage('Study material deleted from MongoDB GridFS and database.');
    } catch (err) {
      setError(err.message || 'Failed to delete material.');
    } finally {
      setDeleteTarget(null);
    }
  };

  const openCreateModal = () => {
    setEditingMaterial(null);
    setModalOpen(true);
  };

  const openEditModal = (m) => {
    setEditingMaterial(m);
    setModalOpen(true);
  };

  if (loading) return <Loader />;

  return (
    <div className="grid fade-in" style={{ gap: 20 }}>
      {/* Header Banner */}
      <div className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="pill info" style={{ marginBottom: 6 }}>Digital Library & Resources</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Study Materials Hub</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-light)', fontSize: 13 }}>
            Upload, categorize, and distribute curriculum PDFs, notes, question banks, and multimedia study resources to students.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} />
          <span>Upload Material</span>
        </button>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      {/* Category Pills Slider */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
        {Object.entries(CATEGORY_MAP).map(([key, info]) => {
          const Icon = info.icon;
          const active = selectedCategory === key;
          const count = key === 'all'
            ? materials.length
            : materials.filter((m) => m.category === key).length;

          return (
            <button
              key={key}
              onClick={() => setSelectedCategory(key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 20,
                border: active ? '1.5px solid var(--color-primary)' : '1px solid #e2e8f0',
                background: active ? 'var(--color-primary)' : '#ffffff',
                color: active ? '#ffffff' : '#475569',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={14} />
              <span>{info.label}</span>
              <span style={{
                background: active ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                color: active ? '#ffffff' : '#64748b',
                padding: '1px 6px',
                borderRadius: 10,
                fontSize: 11,
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters Bar */}
      <div className="card" style={{ padding: '14px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            className="input"
            style={{ paddingLeft: 36 }}
            placeholder="Search by title, subject, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className="input"
          style={{ width: 'auto', minWidth: 130 }}
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
        >
          <option value="All">All Years</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <select
          className="input"
          style={{ width: 'auto', minWidth: 120 }}
          value={selectedUnit}
          onChange={(e) => setSelectedUnit(e.target.value)}
        >
          <option value="All">All Units</option>
          <option value="1">Unit 1</option>
          <option value="2">Unit 2</option>
          <option value="3">Unit 3</option>
          <option value="4">Unit 4</option>
          <option value="5">Unit 5</option>
          <option value="general">General</option>
        </select>
      </div>

      {/* Materials Cards Grid */}
      <div className="grid grid-3" style={{ gap: 16 }}>
        {filteredMaterials.map((m) => {
          const categoryInfo = CATEGORY_MAP[m.category] || CATEGORY_MAP.pdf_notes;
          const CategoryIcon = categoryInfo.icon;
          const hasFile = Boolean(m.fileId || m.gridFsFileId || m.fileName || m.fileUrl || m.pdfLink);

          return (
            <div
              key={m.id}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className="pill info" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CategoryIcon size={12} />
                      {categoryInfo.label}
                    </span>
                    <span className="pill" style={{ fontSize: 11, background: '#f8fafc', border: '1px solid #cbd5e1' }}>
                      {m.unit === 'general' ? 'General' : (m.unit || `Unit ${m.unitNumber || '1'}`)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className="btn-icon"
                      onClick={() => openEditModal(m)}
                      title="Edit Material"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-light)' }}
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => setDeleteTarget(m)}
                      title="Delete Material"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <h3 style={{ margin: '12px 0 6px', fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>
                  {m.title}
                </h3>

                <div style={{ fontSize: 12, color: 'var(--color-primary)', fontWeight: 600, marginBottom: 6 }}>
                  {m.subject || m.departmentName || 'Tamil'} • {m.year || 'All Years'}
                </div>

                <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-light)', lineHeight: 1.4, minHeight: 34 }}>
                  {m.description || 'Curriculum resource available for download and offline learning.'}
                </p>

                <div style={{
                  marginTop: 12,
                  padding: '8px 10px',
                  borderRadius: 6,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: 11,
                  color: '#475569',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--color-text)' }}>
                    <CheckCircle2 size={13} color="var(--color-success)" />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.fileName || `${m.title}.pdf`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 10 }}>
                    <span>Size: {m.fileSize ? `${Math.round(m.fileSize / 1024)} KB` : 'MongoDB Blob'}</span>
                    <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Stored in MongoDB</span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
                  {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString() : 'Active'}
                </span>

                <div style={{ display: 'flex', gap: 6 }}>
                  {hasFile && (
                    <button
                      type="button"
                      onClick={() => setViewingDoc(m)}
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Eye size={13} />
                      <span>Open PDF</span>
                    </button>
                  )}
                  {hasFile && (
                    <button
                      type="button"
                      onClick={() => setViewingDoc(m)}
                      className="btn btn-primary"
                      style={{ padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Download size={13} />
                      <span>Download</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredMaterials.length === 0 && (
        <EmptyState message="No study materials found matching your filters. Click 'Upload Material' to add resources." />
      )}

      {/* Upload / Edit Modal */}
      <StudyMaterialModal
        open={modalOpen}
        initial={editingMaterial}
        departments={departments}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveMaterial}
      />

      {/* In-App PDF Viewer Modal */}
      <PdfViewerModal
        isOpen={Boolean(viewingDoc)}
        onClose={() => setViewingDoc(null)}
        material={viewingDoc}
      />

      {/* Delete Confirmation */}
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteMaterial}
        text={`Are you sure you want to delete "${deleteTarget?.title}"?`}
      />
    </div>
  );
};

export default AdminStudyMaterialsPage;
