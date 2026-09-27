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
import { GraduationCap, Plus, Users, ArrowUpRight, BookOpen, Layers, Edit, Trash2, CheckCircle2, X, ArrowRight } from 'lucide-react';

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
  const [targetSection, setTargetSection] = useState('keep'); // 'keep' | 'A' | 'B' | 'C' | 'D'
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
      const key = s.departmentId || s.classId;
      if (key) {
        map[key] = (map[key] || 0) + 1;
      }
    });
    return map;
  }, [students]);

  const handleFromYearChange = (newFromYear) => {
    setFromYear(newFromYear);
    setPromoteClassId('all');
    if (newFromYear === '1st Year') setToYear('2nd Year');
    else if (newFromYear === '2nd Year') setToYear('3rd Year');
    else if (newFromYear === '3rd Year') setToYear('Graduated');
  };

  const eligiblePromotionStudents = useMemo(() => {
    return students.filter((s) => {
      if (s.isDeleted || s.status === 'deleted') return false;
      const yearMatch = (s.year || '').trim() === fromYear;
      const classMatch = promoteClassId === 'all' || s.departmentId === promoteClassId || s.classId === promoteClassId;
      return yearMatch && classMatch;
    });
  }, [students, fromYear, promoteClassId]);

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
    const eligible = eligiblePromotionStudents;

    if (eligible.length === 0) {
      setError(`No active students found in ${fromYear} to promote.`);
      return;
    }

    setPromoting(true);
    setError('');
    setMessage('');

    try {
      const isGraduating = toYear === 'Graduated';
      // Cache for newly created or matched departments in the target year
      // Key: normalized department name, Value: { id, name, sections }
      const targetDeptMap = new Map();

      // Populate existing departments in target year
      if (!isGraduating) {
        classes
          .filter((c) => (c.year || '').trim().toLowerCase() === toYear.trim().toLowerCase())
          .forEach((c) => {
            if (c.name) {
              targetDeptMap.set(c.name.trim().toLowerCase(), {
                id: c.id,
                name: c.name.trim(),
                sections: c.sections || ['A'],
              });
            }
          });
      }

      // Prepare target departments and student updates
      const studentPromotions = [];

      for (const s of eligible) {
        let finalDeptId = s.departmentId || s.classId || '';
        let finalDeptName = s.departmentName || s.class || '';
        let finalSection = targetSection === 'keep' ? (s.section || 'A') : targetSection;

        // Clean section prefix if any (e.g., 'Section A' -> 'A')
        finalSection = finalSection.replace(/^Section\s*/i, '').trim() || 'A';

        if (!isGraduating) {
          // Find source class details
          const sourceClass = classes.find((c) => c.id === (s.departmentId || s.classId));
          const deptName = (sourceClass?.name || s.departmentName || s.class || 'General').trim();
          const deptKey = deptName.toLowerCase();

          let targetDept = targetDeptMap.get(deptKey);

          if (!targetDept) {
            // Automatically create corresponding department/class in target year
            const newDeptData = {
              name: deptName,
              year: toYear,
              sections: sourceClass?.sections && sourceClass.sections.length ? sourceClass.sections : [finalSection, 'A'],
              description: sourceClass?.description || `${deptName} (${toYear})`,
              isActive: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            newDeptData.sections = Array.from(new Set(newDeptData.sections)).sort();

            const newDocRef = await addDoc(collection(db, 'departments'), newDeptData);
            targetDept = {
              id: newDocRef.id,
              name: deptName,
              sections: newDeptData.sections,
            };
            targetDeptMap.set(deptKey, targetDept);
          }

          finalDeptId = targetDept.id;
          finalDeptName = targetDept.name;
        }

        studentPromotions.push({
          id: s.id,
          updates: {
            year: toYear,
            departmentId: finalDeptId,
            departmentName: finalDeptName,
            class: finalDeptName,
            classId: finalDeptId,
            section: finalSection,
            status: isGraduating ? 'graduated' : 'active',
            promotedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        });
      }

      // Commit in batches of 400 (Firestore max 500 per batch)
      const batchSize = 400;
      for (let i = 0; i < studentPromotions.length; i += batchSize) {
        const batch = writeBatch(db);
        const slice = studentPromotions.slice(i, i + batchSize);
        slice.forEach((p) => {
          batch.update(doc(db, 'users', p.id), p.updates);
        });
        await batch.commit();
      }

      setMessage(`🎉 Successfully promoted ${eligible.length} students to ${toYear} with updated class & section assignments!`);
      setPromoteModalOpen(false);
    } catch (err) {
      console.error('Promotion error:', err);
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
        <div className="modal-backdrop class-dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setClassModalOpen(false); }}>
          <section className="class-dialog" role="dialog" aria-modal="true" aria-labelledby="class-dialog-title">
            <header className="class-dialog-header">
              <div className="class-dialog-heading">
                <span className="class-dialog-icon"><BookOpen size={22} /></span>
                <div>
                  <p className="class-dialog-eyebrow">Academic management</p>
                  <h3 id="class-dialog-title">{editingClass ? 'Edit class' : 'Create a class'}</h3>
                  <p className="class-dialog-subtitle">Set up a department, academic year, and its sections.</p>
                </div>
              </div>
              <button type="button" className="class-dialog-close" onClick={() => setClassModalOpen(false)} aria-label="Close dialog">
                <X size={19} />
              </button>
            </header>

            <form className="class-dialog-form" onSubmit={handleSaveClass}>
              <div className="class-dialog-body">
                <div className="class-dialog-fields">
                  <div className="class-dialog-field class-dialog-field-wide">
                    <label className="class-dialog-label" htmlFor="class-name">Class or department name <span>Required</span></label>
                    <input
                      id="class-name"
                      className="input class-dialog-input"
                      placeholder="e.g. B.A. Tamil, M.A. Tamil, B.Sc"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <div className="class-dialog-field">
                    <label className="class-dialog-label" htmlFor="class-year">Academic year <span>Required</span></label>
                    <select id="class-year" className="input class-dialog-input" value={formYear} onChange={(e) => setFormYear(e.target.value)}>
                      {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>

                  <div className="class-dialog-field class-dialog-field-wide">
                    <div className="class-dialog-label-row">
                      <label className="class-dialog-label" id="class-sections-label">Sections</label>
                      <span className="class-dialog-hint">Choose all that apply</span>
                    </div>
                    <div className="class-section-options" role="group" aria-labelledby="class-sections-label">
                      {SECTIONS.map((sec) => {
                        const active = formSections.includes(sec);
                        return (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => toggleSection(sec)}
                            className={`class-section-option ${active ? 'is-selected' : ''}`}
                            aria-pressed={active}
                          >
                            <span>Section {sec}</span>
                            {active && <CheckCircle2 size={18} aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="class-dialog-field class-dialog-field-wide">
                    <label className="class-dialog-label" htmlFor="class-description">Description <span>Optional</span></label>
                    <textarea
                      id="class-description"
                      className="input class-dialog-input class-dialog-textarea"
                      rows={4}
                      placeholder="Add a short note about the syllabus or department focus"
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <footer className="class-dialog-footer">
                <span className="class-dialog-footer-note">You can update these details later.</span>
                <div className="class-dialog-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setClassModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary class-dialog-submit" disabled={submitting}>
                    {submitting ? 'Saving...' : editingClass ? 'Save changes' : 'Create class'}
                  </button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      ), document.body)}

      {/* Promotion Modal */}
      {promoteModalOpen && createPortal((
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setPromoteModalOpen(false); }}>
          <div className="modal" style={{ maxWidth: 580 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <GraduationCap size={22} color="var(--color-primary)" />
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Promote Students & Advance Classes</h3>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setPromoteModalOpen(false)}>✕</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                Batch promote students to the next academic level. Classes and sections will be automatically matched or created in the target year.
              </p>

              <div className="grid grid-2" style={{ gap: 12 }}>
                <div>
                  <label className="form-label">Current Academic Year</label>
                  <select className="input" value={fromYear} onChange={(e) => handleFromYearChange(e.target.value)}>
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Promote To Target Year</label>
                  <select className="input" value={toYear} onChange={(e) => setToYear(e.target.value)}>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="Graduated">Graduated / Alumni</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-2" style={{ gap: 12 }}>
                <div>
                  <label className="form-label">Filter Source Class</label>
                  <select className="input" value={promoteClassId} onChange={(e) => setPromoteClassId(e.target.value)}>
                    <option value="all">All Classes & Departments</option>
                    {classes.filter((c) => (c.year || '').trim() === fromYear).map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.year})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Target Section Assignment</label>
                  <select className="input" value={targetSection} onChange={(e) => setTargetSection(e.target.value)}>
                    <option value="keep">Keep Current Section (e.g. A → A, B → B)</option>
                    <option value="A">Assign all to Section A</option>
                    <option value="B">Assign all to Section B</option>
                    <option value="C">Assign all to Section C</option>
                    <option value="D">Assign all to Section D</option>
                  </select>
                </div>
              </div>

              {/* Promotion summary card */}
              <div style={{ background: '#eff6ff', padding: 14, borderRadius: 10, border: '1px solid #bfdbfe', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>
                    Eligible Students Found:
                  </span>
                  <span style={{ background: '#1d4ed8', color: '#fff', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 800 }}>
                    {eligiblePromotionStudents.length} Students
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span>{fromYear}</span>
                  <ArrowRight size={14} />
                  <span style={{ fontWeight: 700 }}>{toYear}</span>
                  {toYear !== 'Graduated' && (
                    <span style={{ color: '#047857', fontWeight: 600, marginLeft: 6 }}>
                      (Class & Section automatically carried forward)
                    </span>
                  )}
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: '#64748b' }}>
                💡 Upon promotion, students' class, section, units, tasks, and online tests will immediately switch to <strong>{toYear}</strong>.
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPromoteModalOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handlePromoteStudents}
                disabled={promoting || eligiblePromotionStudents.length === 0}
              >
                {promoting ? 'Promoting Students...' : `Confirm Promotion (${eligiblePromotionStudents.length} Students)`}
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
