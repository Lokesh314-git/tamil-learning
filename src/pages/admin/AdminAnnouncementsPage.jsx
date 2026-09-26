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
import {
  Megaphone,
  Plus,
  Bell,
  Calendar,
  AlertCircle,
  Tag,
  Pin,
  Trash2,
  Edit,
  Send,
  Search,
  Layers
} from 'lucide-react';

const CATEGORIES = [
  { id: 'all', label: 'All Notices' },
  { id: 'academic', label: 'Academic' },
  { id: 'examination', label: 'Examination' },
  { id: 'events', label: 'Events' },
  { id: 'placement', label: 'Placement' },
  { id: 'circulars', label: 'Circulars' },
];

const PRIORITIES = [
  { id: 'normal', label: 'Normal', color: '#64748b' },
  { id: 'important', label: 'Important', color: '#d97706' },
  { id: 'urgent', label: 'Urgent Alert', color: '#dc2626' },
];

const AdminAnnouncementsPage = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedYear, setSelectedYear] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal Form
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formCategory, setFormCategory] = useState('academic');
  const [formPriority, setFormPriority] = useState('normal');
  const [formYear, setFormYear] = useState('all');
  const [formDeptId, setFormDeptId] = useState('all');
  const [formSection, setFormSection] = useState('all');
  const [sendFcm, setSendFcm] = useState(true);
  const [isPinned, setIsPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    let ready = 0;
    const check = () => {
      ready++;
      if (ready >= 2) setLoading(false);
    };

    // 1. Listen to announcements / notices
    const unsubNotices = onSnapshot(query(collection(db, 'announcements')), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
      setAnnouncements(list);
      check();
    });

    // 2. Listen to departments
    const unsubDepts = onSnapshot(query(collection(db, 'departments')), (snap) => {
      setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    });

    return () => {
      unsubNotices();
      unsubDepts();
    };
  }, []);

  const filteredAnnouncements = useMemo(() => {
    return announcements.filter((a) => {
      const catMatch = selectedCategory === 'all' || a.category === selectedCategory;
      const yearMatch = selectedYear === 'All' || a.targetYear === 'all' || a.targetYear === selectedYear;
      const searchMatch = !searchQuery.trim() ||
        (a.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.body || '').toLowerCase().includes(searchQuery.toLowerCase());

      return catMatch && yearMatch && searchMatch;
    });
  }, [announcements, selectedCategory, selectedYear, searchQuery]);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormTitle('');
    setFormBody('');
    setFormCategory('academic');
    setFormPriority('normal');
    setFormYear('all');
    setFormDeptId('all');
    setFormSection('all');
    setSendFcm(true);
    setIsPinned(false);
    setError('');
    setModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormTitle(item.title || '');
    setFormBody(item.body || '');
    setFormCategory(item.category || 'academic');
    setFormPriority(item.priority || 'normal');
    setFormYear(item.targetYear || 'all');
    setFormDeptId(item.targetDeptId || 'all');
    setFormSection(item.targetSection || 'all');
    setSendFcm(false);
    setIsPinned(item.isPinned === true);
    setError('');
    setModalOpen(true);
  };

  const handleSaveAnnouncement = async (e) => {
    e.preventDefault();
    const cleanTitle = formTitle.trim();
    const cleanBody = formBody.trim();
    if (!cleanTitle || !cleanBody) {
      setError('Please provide both title and announcement details.');
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      const selectedDept = departments.find((d) => d.id === formDeptId);
      const targetDeptName = formDeptId === 'all' ? 'All Classes' : (selectedDept?.name || 'General');

      const payload = {
        title: cleanTitle,
        body: cleanBody,
        category: formCategory,
        priority: formPriority,
        targetYear: formYear,
        targetDeptId: formDeptId,
        targetDeptName,
        targetSection: formSection,
        isPinned,
        updatedAt: serverTimestamp(),
      };

      if (editingItem?.id) {
        await updateDoc(doc(db, 'announcements', editingItem.id), payload);
        setMessage('Announcement updated successfully.');
      } else {
        const ref = await addDoc(collection(db, 'announcements'), {
          ...payload,
          createdAt: serverTimestamp(),
        });

        // Also add to notifications collection for student notification feed
        await addDoc(collection(db, 'notifications'), {
          title: cleanTitle,
          body: cleanBody,
          type: 'announcement',
          category: formCategory,
          priority: formPriority,
          targetYear: formYear,
          targetDepartmentId: formDeptId,
          targetDepartmentName,
          targetSection: formSection,
          createdAt: serverTimestamp(),
        });

        setMessage('Notice published and broadcasted to students successfully!');
      }

      setModalOpen(false);
    } catch (err) {
      setError(err.message || 'Failed to publish announcement.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, 'announcements', deleteTarget.id));
      setMessage('Announcement deleted successfully.');
    } catch (err) {
      setError(err.message || 'Failed to delete announcement.');
    } finally {
      setDeleteTarget(null);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="grid fade-in" style={{ gap: 20 }}>
      {/* Header Banner */}
      <div className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="pill info" style={{ marginBottom: 6 }}>Communication & Broadcast</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Announcements & Digital Notice Board</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-light)', fontSize: 13 }}>
            Publish official college circulars, exam dates, event updates, and notifications to students.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} />
          <span>Post Announcement</span>
        </button>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      {/* Category Tabs */}
      <div className="tab-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={`tab-btn ${selectedCategory === c.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="card" style={{ padding: '14px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            className="input"
            style={{ paddingLeft: 36 }}
            placeholder="Search notices by title or keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className="input"
          style={{ width: 'auto', minWidth: 140 }}
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
        >
          <option value="All">All Years</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Announcements List */}
      <div className="grid grid-2" style={{ gap: 16 }}>
        {filteredAnnouncements.map((a) => {
          const priority = PRIORITIES.find((p) => p.id === a.priority) || PRIORITIES[0];

          return (
            <div
              key={a.id}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderLeft: `5px solid ${priority.color}`,
                background: a.isPinned ? '#faf5ff' : '#ffffff',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {a.isPinned && (
                      <span className="pill" style={{ background: '#f3e8ff', color: '#7e22ce', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700 }}>
                        <Pin size={11} /> PINNED
                      </span>
                    )}
                    <span className="pill info" style={{ fontSize: 11, textTransform: 'capitalize' }}>
                      {a.category || 'Academic'}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 10,
                        background: a.priority === 'urgent' ? '#fee2e2' : a.priority === 'important' ? '#fef3c7' : '#f1f5f9',
                        color: priority.color,
                      }}
                    >
                      {priority.label}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className="btn-icon"
                      onClick={() => openEditModal(a)}
                      title="Edit Notice"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-light)' }}
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => setDeleteTarget(a)}
                      title="Delete Notice"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <h3 style={{ margin: '12px 0 6px', fontSize: 17, fontWeight: 800 }}>{a.title}</h3>
                <p style={{ margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                  {a.body}
                </p>
              </div>

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--color-text-light)' }}>
                <div>
                  Target: <strong>{a.targetYear === 'all' ? 'All Years' : a.targetYear}</strong> • {a.targetDeptName || 'All Classes'}
                </div>
                <div>
                  {a.createdAt?.toDate ? a.createdAt.toDate().toLocaleDateString() : 'Active'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredAnnouncements.length === 0 && (
        <EmptyState message="No announcements found. Click 'Post Announcement' to broadcast an update." />
      )}

      {/* Announcement Create / Edit Modal */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                {editingItem ? 'Edit Announcement' : 'Post New Announcement'}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveAnnouncement}>
              <div className="modal-body">
                <div>
                  <label className="form-label">Notice Title *</label>
                  <input
                    className="input"
                    placeholder="e.g. Semester Exam Schedule & Hall Tickets Available"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="grid grid-2" style={{ gap: 10 }}>
                  <div>
                    <label className="form-label">Category *</label>
                    <select className="input" value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                      <option value="academic">Academic</option>
                      <option value="examination">Examination</option>
                      <option value="events">Events</option>
                      <option value="placement">Placement</option>
                      <option value="circulars">Circulars</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Priority</label>
                    <select className="input" value={formPriority} onChange={(e) => setFormPriority(e.target.value)}>
                      <option value="normal">Normal</option>
                      <option value="important">Important</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-3" style={{ gap: 10 }}>
                  <div>
                    <label className="form-label">Target Year</label>
                    <select className="input" value={formYear} onChange={(e) => setFormYear(e.target.value)}>
                      <option value="all">All Years</option>
                      {YEARS.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Target Class</label>
                    <select className="input" value={formDeptId} onChange={(e) => setFormDeptId(e.target.value)}>
                      <option value="all">All Classes</option>
                      {departments.filter((d) => formYear === 'all' || d.year === formYear).map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Target Section</label>
                    <select className="input" value={formSection} onChange={(e) => setFormSection(e.target.value)}>
                      <option value="all">All Sections</option>
                      <option value="A">Section A</option>
                      <option value="B">Section B</option>
                      <option value="C">Section C</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="form-label">Announcement Details / Body *</label>
                  <textarea
                    className="input"
                    rows={4}
                    placeholder="Write announcement body..."
                    value={formBody}
                    onChange={(e) => setFormBody(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isPinned}
                      onChange={(e) => setIsPinned(e.target.checked)}
                    />
                    <span>Pin to top of Notice Board</span>
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Publishing...' : editingItem ? 'Update Notice' : 'Broadcast Notice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        text={`Are you sure you want to delete notice "${deleteTarget?.title}"?`}
      />
    </div>
  );
};

export default AdminAnnouncementsPage;
