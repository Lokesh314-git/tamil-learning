import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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
  writeBatch,
  where,
  getDocs
} from 'firebase/firestore';
import { db } from '../../firebase';
import { YEARS, sortDepartmentsByName } from '../../utils/departments';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';
import { GraduationCap, Plus, Users, ArrowUpRight, BookOpen, Layers, Edit, Trash2, CheckCircle2 } from 'lucide-react';

const SECTIONS = ['A', 'B', 'C', 'D'];

const AdminClassesPage = () => {
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState('All');
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [promoteModalOpen, setPromoteModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Class Form State
  const [formName, setFormName] = useState('');
  const [formYear, setFormYear] = useState(YEARS[0]);
  const [formSections, setFormSections] = useState(['A']);
  const [formDescription, setFormDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Promotion State
  const [fromYear, setFromYear] = useState('1st Year');
  const [toYear, setToYear] = useState('2nd Year');
  const [promoteClassId, setPromoteClassId] = useState('all');
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    setLoading(true);
    let ready = 0;
    const check = () => {
      ready++;
      if (ready >= 2) setLoading(false);
    };

    // 1. Listen to Classes / Departments
    const unsubClasses = onSnapshot(
      query(collection(db, 'departments')),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setClasses(sortDepartmentsByName(list));
        check();
      },
      (err) => {
        console.warn('Classes listener err:', err);
        check();
      }
    );

    // 2. Listen to Students for counts
    const unsubStudents = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'student')),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setStudents(list);
        check();
      },
      (err) => {
        console.warn('Students listener err:', err);
        check();
      }
    );

    return () => {
      unsubClasses();
      unsubStudents();
    };
  }, []);

  const filteredClasses = useMemo(() => {
    return classes.filter((c) => {
      if (c.isActive === false && !c.name) return false;
      if (selectedYear === 'All') return true;
      return c.year === selectedYear;
    });
  }, [classes, selectedYear]);

  const studentCountByClass = useMemo(() => {
    const map = {};
    students.forEach((s) => {
      if (s.isDeleted || s.status === 'deleted') return;
      if (s.departmentId) {
        map[s.departmentId] = (map[s.departmentId] || 0) + 1;
      }
    });
    return map;
  }, [students]);

  const openAddModal = () => {
    setEditingClass(null);
    setFormName('');
    setFormYear(selectedYear !== 'All' ? selectedYear : YEARS[0]);
    setFormSections(['A']);
    setFormDescription('');
    setError('');
    setMessage('');
    setClassModalOpen(true);
  };

  const openEditModal = (c) => {
    setEditingClass(c);
    setFormName(c.name || '');
    setFormYear(c.year || YEARS[0]);
    setFormSections(c.sections && Array.isArray(c.sections) && c.sections.length ? c.sections : ['A']);
    setFormDescription(c.description || '');
    setError('');
    setMessage('');
    setClassModalOpen(true);
  };

  const handleSaveClass = async (e) => {
    e.preventDefault();
    const cleanName = formName.trim();
    if (!cleanName) {
      setError('Please enter class/program name.');
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      if (editingClass?.id) {
        await updateDoc(doc(db, 'departments', editingClass.id), {
          name: cleanName,
          year: formYear,
          sections: formSections,
          description: formDescription.trim(),
          updatedAt: serverTimestamp(),
        });
        setMessage('Class updated successfully.');
      } else {
        await addDoc(collection(db, 'departments'), {
          name: cleanName,
          year: formYear,
          sections: formSections,
          description: formDescription.trim(),
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setMessage('New Class created successfully.');
      }
      setClassModalOpen(false);
    } catch (err) {
      setError(err.message || 'Failed to save class.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClass = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, 'departments', deleteTarget.id));
      setMessage('Class deleted successfully.');
    } catch (err) {
      setError(err.message || 'Failed to delete class.');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handlePromoteStudents = async () => {
    const eligible = students.filter((s) => {
      if (s.isDeleted || s.status === 'deleted') return false;
      const yearMatch = s.year === fromYear;
      const classMatch = promoteClassId === 'all' || s.departmentId === promoteClassId;
      return yearMatch && classMatch;
    });

    if (eligible.length === 0) {
      setError(`No active students found in ${fromYear} to promote.`);
      return;
    }

    setPromoting(true);
    setError('');
    setMessage('');

    try {
      const batch = writeBatch(db);
      eligible.forEach((s) => {
        const studentRef = doc(db, 'users', s.id);
        const isGraduating = toYear === 'Graduated';
        batch.update(studentRef, {
          year: toYear,
          status: isGraduating ? 'graduated' : (s.status || 'active'),
          promotedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Also update studentLookup if SIF exists
        if (s.sifNumber) {
          const lookupRef = doc(db, 'studentLookup', s.sifNumber.toUpperCase());
          batch.set(lookupRef, { year: toYear }, { merge: true });
        }
        if (s.mobileNumber) {
          const lookupMobileRef = doc(db, 'studentLookup', s.mobileNumber);
          batch.set(lookupMobileRef, { year: toYear }, { merge: true });
        }
      });

      await batch.commit();
      setMessage(`Successfully promoted ${eligible.length} students from ${fromYear} to ${toYear}!`);
      setPromoteModalOpen(false);
    } catch (err) {
      setError(err.message || 'Failed to promote students.');
    } finally {
      setPromoting(false);
    }
  };

  const toggleSection = (sec) => {
    if (formSections.includes(sec)) {
      if (formSections.length === 1) return; // Keep at least one section
      setFormSections(formSections.filter((s) => s !== sec));
    } else {
      setFormSections([...formSections, sec].sort());
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="grid fade-in" style={{ gap: 20 }}>
      {/* Header Banner */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0' }}>
        <div>
          <div className="pill info" style={{ marginBottom: 8, fontWeight: 700 }}>Academic Management</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Classes & Sections</h2>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>
            Manage academic classes, sections, student allocations, and year-end promotions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => setPromoteModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArrowUpRight size={16} />
            <span>Promote Students</span>
          </button>
          <button className="btn btn-primary" onClick={openAddModal} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} />
            <span>Create Class</span>
          </button>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      {/* Year Filter Tabs */}
      <div className="tab-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {['All', ...YEARS].map((y) => (
          <button
            key={y}
            className={`tab-btn ${selectedYear === y ? 'active' : ''}`}
            onClick={() => setSelectedYear(y)}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Class Cards Grid */}
      <div className="grid grid-3" style={{ gap: 16 }}>
        {filteredClasses.map((c) => {
          const count = studentCountByClass[c.id] || 0;
          const secs = c.sections && Array.isArray(c.sections) && c.sections.length ? c.sections : ['A'];
          return (
            <div key={c.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderTop: '4px solid var(--color-primary)' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="pill info" style={{ fontSize: 11, fontWeight: 700 }}>{c.year}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className="btn-icon"
                      onClick={() => openEditModal(c)}
                      title="Edit Class"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#64748b' }}
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => setDeleteTarget(c)}
                      title="Delete Class"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <h3 style={{ margin: '12px 0 4px', fontSize: 17, fontWeight: 700, color: '#0f172a' }}>{c.name}</h3>
                <p style={{ margin: 0, fontSize: 13, color: '#64748b', minHeight: 18 }}>
                  {c.description || 'Core curriculum learning department'}
                </p>

                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: 0.5 }}>
                    Active Sections
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {secs.map((sec) => (
                      <span
                        key={sec}
                        style={{
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          padding: '3px 10px',
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#334155',
                        }}
                      >
                        Section {sec}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-primary)', fontWeight: 700, fontSize: 14 }}>
                  <Users size={16} />
                  <span>{count} Students</span>
                </div>
                <button className="btn btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => openEditModal(c)}>
                  Configure
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredClasses.length === 0 && (
        <EmptyState message="No classes found for this year. Click 'Create Class' to get started." />
      )}

      {/* Class Create / Edit Modal */}
      {classModalOpen && createPortal((
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setClassModalOpen(false); }}>
          <div className="modal" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                {editingClass ? 'Edit Class' : 'Create New Class'}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setClassModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveClass}>
              <div className="modal-body">
                <div>
                  <label className="form-label">Class / Department Name *</label>
                  <input
                    className="input"
                    placeholder="e.g. B.A. Tamil, M.A. Tamil, B.Sc"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="form-label">Academic Year *</label>
                  <select className="input" value={formYear} onChange={(e) => setFormYear(e.target.value)}>
                    {YEARS.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">Sections Available</label>
                  <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                    {SECTIONS.map((sec) => {
                      const active = formSections.includes(sec);
                      return (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => toggleSection(sec)}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 8,
                            border: active ? '2px solid var(--color-primary)' : '1px solid #cbd5e1',
                            background: active ? '#eff6ff' : '#ffffff',
                            color: active ? 'var(--color-primary)' : '#475569',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Section {sec} {active && '✓'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="form-label">Description (Optional)</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Brief summary of syllabus or department focus"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setClassModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : editingClass ? 'Update Class' : 'Create Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ), document.body)}

      {/* Promotion Modal */}
      {promoteModalOpen && createPortal((
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setPromoteModalOpen(false); }}>
          <div className="modal" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <GraduationCap size={22} color="var(--color-primary)" />
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Promote Students to Next Year</h3>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setPromoteModalOpen(false)}>✕</button>
            </div>

            <div className="modal-body">
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                Batch promote eligible students to the next academic level. All portal access and credentials will be preserved.
              </p>

              <div className="grid grid-2" style={{ gap: 10 }}>
                <div>
                  <label className="form-label">Current Year (From)</label>
                  <select className="input" value={fromYear} onChange={(e) => setFromYear(e.target.value)}>
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Promote To</label>
                  <select className="input" value={toYear} onChange={(e) => setToYear(e.target.value)}>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="Graduated">Graduated / Alumni</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">Target Department / Class</label>
                <select className="input" value={promoteClassId} onChange={(e) => setPromoteClassId(e.target.value)}>
                  <option value="all">All Classes & Departments</option>
                  {classes.filter((c) => c.year === fromYear).map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.year})</option>
                  ))}
                </select>
              </div>

              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: '#475569' }}>
                ℹ️ Students will instantly see their updated curriculum units and tests when they access their student portal.
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPromoteModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handlePromoteStudents} disabled={promoting}>
                {promoting ? 'Promoting...' : `Confirm Promotion (${fromYear} → ${toYear})`}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteClass}
        text={`Are you sure you want to delete "${deleteTarget?.name}"?`}
      />
    </div>
  );
};

export default AdminClassesPage;
