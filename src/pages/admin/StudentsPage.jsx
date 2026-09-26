import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '../../firebase';
import AddStudentModal from '../../components/AddStudentModal';
import ImportStudentsModal from '../../components/ImportStudentsModal';
import StudentTable from '../../components/StudentTable';
import { useCreateStudent } from '../../hooks/useCreateStudent';
import Loader from '../../components/Loader';
import { useAuth } from '../../context/AuthContext';
import { YEARS, sortDepartmentsByName } from '../../utils/departments';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import { FileSpreadsheet, Upload, UserCheck, Users, Edit3, UserPlus } from 'lucide-react';
import { deleteStudentCompletely } from '../../utils/studentDelete';

const StudentsPage = () => {
  const [students, setStudents] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [filterYear, setFilterYear] = useState('All');
  const [filterDepartmentId, setFilterDepartmentId] = useState('All');
  const [filterSection, setFilterSection] = useState('All');
  const [activeTab, setActiveTab] = useState('pending');
  const [selected, setSelected] = useState(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);

  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditYear, setBulkEditYear] = useState(YEARS[0]);
  const [bulkEditDepartmentId, setBulkEditDepartmentId] = useState('');
  const [savingBulkEdit, setSavingBulkEdit] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState('');
  const [editYear, setEditYear] = useState(YEARS[0]);
  const [editDepartmentId, setEditDepartmentId] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const load = () => {};

  const { createStudent, loading: creating, error: createError } = useCreateStudent();
  const { user: currentUser } = useAuth();

  const yearOptions = ['All', ...YEARS];

  useEffect(() => {
    setLoading(true);
    let readyCount = 0;
    const checkReady = () => {
      readyCount++;
      if (readyCount >= 2) setLoading(false);
    };

    const unsubStudents = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'student')),
      (studentSnap) => {
        const list = studentSnap.docs.map((d) => {
          const data = d.data();
          const isDeleted = data.isDeleted === true || data.status === 'deleted';
          const isApproved = data.isApproved === true || data.approved === true;
          const status = isDeleted ? 'deleted' : (data.status || (isApproved ? 'active' : 'pending'));
          return {
            id: d.id,
            uid: data.uid || d.id,
            ...data,
            isDeleted,
            isApproved,
            status,
          };
        });
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setStudents(list);
        checkReady();
      },
      (err) => {
        console.warn('Students listener error:', err);
        checkReady();
      }
    );

    const unsubDepts = onSnapshot(
      query(collection(db, 'departments')),
      (departmentSnap) => {
        const departmentList = sortDepartmentsByName(departmentSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setDepartments(departmentList);
        checkReady();
      },
      (err) => {
        console.warn('Departments listener error:', err);
        checkReady();
      }
    );

    return () => {
      unsubStudents();
      unsubDepts();
    };
  }, []);

  const filteredDepartments = useMemo(() => {
    const base = filterYear === 'All'
      ? departments.filter((d) => d.isActive === true)
      : departments.filter((d) => d.year === filterYear && d.isActive === true);

    return Array.from(
      new Map(
        base.map((department) => {
          const key = `${department.year}-${(department.name || '').trim().toLowerCase()}`;
          return [key, department];
        })
      ).values()
    );
  }, [departments, filterYear]);

  const filteredByYearAndDepartment = useMemo(
    () => students.filter((s) => {
      const yearMatch = filterYear === 'All' ? true : s.year === filterYear;
      const departmentMatch = filterDepartmentId === 'All' ? true : s.departmentId === filterDepartmentId;
      const sectionMatch = filterSection === 'All' ? true : (s.section || 'A').toUpperCase() === filterSection.toUpperCase();
      return yearMatch && departmentMatch && sectionMatch;
    }),
    [students, filterYear, filterDepartmentId, filterSection]
  );

  const pendingStudents = useMemo(
    () => filteredByYearAndDepartment.filter((s) => !s.isDeleted && (s.status === 'pending' || !s.isApproved)),
    [filteredByYearAndDepartment]
  );
  const activeStudents = useMemo(
    () => filteredByYearAndDepartment.filter((s) => !s.isDeleted && s.isApproved && s.status !== 'pending'),
    [filteredByYearAndDepartment]
  );
  const deletedStudents = useMemo(
    () => filteredByYearAndDepartment.filter((s) => s.isDeleted || s.status === 'deleted'),
    [filteredByYearAndDepartment]
  );

  const visibleStudents = activeTab === 'pending'
    ? pendingStudents
    : activeTab === 'active'
      ? activeStudents
      : deletedStudents;

  useEffect(() => {
    setSelectedStudentIds([]);
  }, [activeTab, filterYear, filterDepartmentId]);

  const handleToggleSelect = (uid) => {
    setSelectedStudentIds(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const handleToggleSelectAll = (checked) => {
    if (checked) {
      setSelectedStudentIds(visibleStudents.map(s => s.uid || s.id));
    } else {
      setSelectedStudentIds([]);
    }
  };

  const updateStudentInState = (uid, patch) => {
    setStudents((prev) => prev.map((s) => ((s.uid || s.id) === uid ? { ...s, ...patch } : s)));
    setSelected((prev) => (prev && (prev.uid || prev.id) === uid ? { ...prev, ...patch } : prev));
  };

  const handleCreate = async (payload) => {
    setError('');
    setMessage('');
    const createdUser = await createStudent(payload);
    await setDoc(doc(db, 'users', createdUser.uid), {
      uid: createdUser.uid,
      name: (payload.name || '').trim(),
      email: (payload.email || '').trim().toLowerCase(),
      role: 'student',
      year: payload.year,
      departmentId: payload.departmentId,
      departmentName: payload.departmentName,
      status: 'pending',
      isApproved: false,
      approved: false,
      isDeleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setModalOpen(false);
    setMessage('Student account created with pending approval. Verification email sent.');
    await load();
  };

  const handleApprove = async (student) => {
    const uid = student?.uid || student?.id;
    if (!uid) return;

    setError('');
    setMessage('');
    await updateDoc(doc(db, 'users', uid), {
      isApproved: true,
      approved: true,
      status: 'active',
      approvedAt: serverTimestamp(),
      approvedBy: currentUser?.uid || null,
      updatedAt: serverTimestamp(),
    });
    updateStudentInState(uid, { isApproved: true, approved: true, status: 'active' });
    setMessage('Student approved successfully.');
  };

  const handleDelete = async (student) => {
    const uid = student?.uid || student?.id;
    if (!uid) return;

    const ok = window.confirm(`Are you sure you want to delete student "${student.name || uid}"? This will completely delete the student from the users section and all system data.`);
    if (!ok) return;

    setError('');
    setMessage('');
    try {
      await deleteStudentCompletely(db, student);
      setStudents((prev) => prev.filter((s) => (s.uid || s.id) !== uid));
      setSelected((prev) => ((prev?.uid || prev?.id) === uid ? null : prev));
      setMessage('Student completely deleted from users section and Firestore.');
    } catch (err) {
      console.error('Delete failed:', err);
      setError(err?.message || 'Delete failed. Please try again.');
    }
  };

  const handleRestore = async (student) => {
    const uid = student?.uid || student?.id;
    if (!uid) return;

    setError('');
    setMessage('');
    await updateDoc(doc(db, 'users', uid), {
      isDeleted: false,
      status: 'active',
      isApproved: true,
      approved: true,
      updatedAt: serverTimestamp(),
    });
    updateStudentInState(uid, { isDeleted: false, status: 'active', isApproved: true, approved: true });
    setMessage('Student restored successfully.');
  };

  const handlePermanentDelete = async (student) => {
    const uid = student?.uid || student?.id;
    if (!uid) return;

    const ok = window.confirm('This will permanently delete the student data from Firestore. Continue?');
    if (!ok) return;

    setError('');
    setMessage('');
    try {
      await deleteStudentCompletely(db, student);
      setStudents((prev) => prev.filter((s) => (s.uid || s.id) !== uid));
      setSelected((prev) => ((prev?.uid || prev?.id) === uid ? null : prev));
      setMessage('Student permanently deleted from Firestore.');
    } catch (err) {
      console.error('Permanent delete failed:', err);
      setError(err?.message || 'Permanent delete failed. Please try again.');
    }
  };

  const openEditModal = (student) => {
    setEditTarget(student);
    setEditName(student?.name || '');
    setEditYear(student?.year || YEARS[0]);
    setEditDepartmentId(student?.departmentId || '');
  };

  const closeEditModal = () => {
    setEditTarget(null);
    setEditName('');
    setEditYear(YEARS[0]);
    setEditDepartmentId('');
  };

  const editDepartmentsForYear = useMemo(
    () => departments.filter((department) => department.year === editYear && department.isActive === true),
    [departments, editYear]
  );

  useEffect(() => {
    if (!editTarget) return;
    const found = editDepartmentsForYear.find((department) => department.id === editDepartmentId);
    if (found) return;
    setEditDepartmentId(editDepartmentsForYear[0]?.id || '');
  }, [editTarget, editDepartmentsForYear, editDepartmentId]);

  const handleSaveEdit = async () => {
    const uid = editTarget?.uid || editTarget?.id;
    if (!uid) return;

    const cleanName = editName.trim();
    const selectedDepartment = departments.find((department) => department.id === editDepartmentId);
    if (!cleanName) {
      setError('Student name is required.');
      return;
    }
    if (!selectedDepartment) {
      setError('Select a valid department.');
      return;
    }

    const isYearChanged = editTarget.year !== editYear;
    if (isYearChanged) {
      const ok = window.confirm(`Changing the year will permanently delete all previous results, reports, notes, and submissions for ${cleanName}. Continue?`);
      if (!ok) return;
    }

    setSavingEdit(true);
    setError('');
    setMessage('');
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', uid), {
        name: cleanName,
        year: editYear,
        departmentId: selectedDepartment.id,
        departmentName: selectedDepartment.name,
        updatedAt: serverTimestamp(),
      });

      if (isYearChanged) {
        const collectionsToClean = ['results', 'reports', 'notes', 'submissions', 'taskSubmissions'];
        for (const colName of collectionsToClean) {
          const snap = await getDocs(query(collection(db, colName), where('studentId', '==', uid)));
          snap.forEach((documentRef) => {
            batch.delete(documentRef.ref);
          });
        }
      }

      await batch.commit();

      updateStudentInState(uid, {
        name: cleanName,
        year: editYear,
        departmentId: selectedDepartment.id,
        departmentName: selectedDepartment.name,
      });
      setMessage('Student details updated successfully.');
      closeEditModal();
    } catch (err) {
      setError(err?.message || 'Failed to update student.');
    } finally {
      setSavingEdit(false);
    }
  };

  const bulkEditDepartmentsForYear = useMemo(
    () => departments.filter((department) => department.year === bulkEditYear && department.isActive === true),
    [departments, bulkEditYear]
  );

  useEffect(() => {
    if (!bulkEditOpen) return;
    const found = bulkEditDepartmentsForYear.find((department) => department.id === bulkEditDepartmentId);
    if (found) return;
    setBulkEditDepartmentId(bulkEditDepartmentsForYear[0]?.id || '');
  }, [bulkEditOpen, bulkEditDepartmentsForYear, bulkEditDepartmentId]);

  const handleSaveBulkEdit = async () => {
    if (selectedStudentIds.length === 0) return;
    const selectedDepartment = departments.find((department) => department.id === bulkEditDepartmentId);
    if (!selectedDepartment) {
      setError('Select a valid department for bulk edit.');
      return;
    }

    const studentsToUpdate = students.filter(s => selectedStudentIds.includes(s.uid || s.id));
    const studentsWithYearChange = studentsToUpdate.filter(s => s.year !== bulkEditYear);
    
    if (studentsWithYearChange.length > 0) {
       const ok = window.confirm(`Changing the year for ${studentsWithYearChange.length} student(s) will permanently delete all their previous results, reports, notes, and submissions. Continue?`);
       if (!ok) return;
    }

    setSavingBulkEdit(true);
    setError('');
    setMessage('');
    try {
      const batch = writeBatch(db);
      
      for (const student of studentsToUpdate) {
        const uid = student.uid || student.id;
        batch.update(doc(db, 'users', uid), {
          year: bulkEditYear,
          departmentId: selectedDepartment.id,
          departmentName: selectedDepartment.name,
          updatedAt: serverTimestamp(),
        });
        
        if (student.year !== bulkEditYear) {
          const collectionsToClean = ['results', 'reports', 'notes', 'submissions', 'taskSubmissions'];
          for (const colName of collectionsToClean) {
            const snap = await getDocs(query(collection(db, colName), where('studentId', '==', uid)));
            snap.forEach((documentRef) => {
              batch.delete(documentRef.ref);
            });
          }
        }
      }
      
      await batch.commit();
      
      setStudents(prev => prev.map(s => selectedStudentIds.includes(s.uid || s.id) ? {
        ...s,
        year: bulkEditYear,
        departmentId: selectedDepartment.id,
        departmentName: selectedDepartment.name,
      } : s));
      
      setBulkEditOpen(false);
      setSelectedStudentIds([]);
      setMessage(`${selectedStudentIds.length} students updated successfully.`);
    } catch (err) {
      setError(err?.message || 'Failed to bulk update students.');
    } finally {
      setSavingBulkEdit(false);
    }
  };

  const handleResetPassword = async (student) => {
    if (!student?.email) {
      setError('Student email is missing.');
      return;
    }
    setError('');
    setMessage('');
    try {
      await sendPasswordResetEmail(auth, student.email);
      setMessage('Password reset link sent to student email.');
    } catch (err) {
      setError(err?.message || 'Failed to send password reset email.');
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <PageHeader
          eyebrow="Admin / Students"
          title="Students Management"
          subtitle="Manage student accounts, approve registrations, and import student data."
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="input" style={{ width: 'auto' }} value={filterYear} onChange={(e) => {
            setFilterYear(e.target.value);
            setFilterDepartmentId('All');
          }}>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="input" style={{ width: 'auto' }} value={filterDepartmentId} onChange={(e) => setFilterDepartmentId(e.target.value)}>
            <option value="All">All Classes</option>
            {filteredDepartments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
          <select className="input" style={{ width: 'auto' }} value={filterSection} onChange={(e) => setFilterSection(e.target.value)}>
            <option value="All">All Sections</option>
            {['A', 'B', 'C', 'D', 'E'].map((sec) => (
              <option key={sec} value={sec}>Section {sec}</option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={() => setModalOpen(true)}>+ Add Student</button>
        </div>
      </div>

      {/* Import Section */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <FileSpreadsheet size={20} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>Import Students from Excel</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>Upload .xlsx / .xls with Name, Roll No., SIF Number, Date of Birth, Mobile Number. Students are auto-assigned to the selected Year, Class &amp; Section.</div>
          </div>
        </div>
        <button className="btn btn-secondary" style={{ flexShrink: 0 }} onClick={() => setImportModalOpen(true)}>
          <Upload size={14} /> Import Excel
        </button>
      </div>

      {/* Tab Bar */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <div className="tab-row">
          <button className={'tab-btn ' + (activeTab === 'pending' ? 'active' : '')} onClick={() => setActiveTab('pending')}>
            Pending ({pendingStudents.length})
          </button>
          <button className={'tab-btn ' + (activeTab === 'active' ? 'active' : '')} onClick={() => setActiveTab('active')}>
            Active ({activeStudents.length})
          </button>
          <button className={'tab-btn ' + (activeTab === 'deleted' ? 'active' : '')} onClick={() => setActiveTab('deleted')}>
            Deleted ({deletedStudents.length})
          </button>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {(error || createError) && <div className="alert error">{error || createError}</div>}

      {loading ? (
        <div style={{ padding: 20 }}><Loader /></div>
      ) : (
        <>
          {selectedStudentIds.length > 0 && (
            <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '12px 16px', background: 'var(--color-primary-light)', border: '1px solid var(--color-border-focus)' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{selectedStudentIds.length} selected</span>
              
              {activeTab === 'pending' && (
                <button className="btn btn-primary" onClick={async () => {
                  if(!window.confirm(`Approve ${selectedStudentIds.length} students?`)) return;
                  setLoading(true);
                  try {
                      const batch = writeBatch(db);
                      selectedStudentIds.forEach(uid => {
                        batch.update(doc(db, 'users', uid), {
                          isApproved: true, approved: true, status: 'active',
                          approvedAt: serverTimestamp(), approvedBy: currentUser?.uid || null, updatedAt: serverTimestamp()
                        });
                      });
                      await batch.commit();
                      setStudents(prev => prev.map(s => selectedStudentIds.includes(s.uid || s.id) ? { ...s, isApproved: true, approved: true, status: 'active' } : s));
                      setSelectedStudentIds([]);
                      setMessage(`${selectedStudentIds.length} students approved.`);
                  } catch(err) { setError(err.message); }
                  setLoading(false);
                }}>Approve Selected</button>
              )}
              
              {activeTab !== 'deleted' && (
                <>
                  <button className="btn btn-primary" style={{ background: 'linear-gradient(120deg,#6366f1,#8b5cf6)', border: 'none' }} onClick={() => setBulkEditOpen(true)}>Edit Selected</button>
                  <button className="btn btn-secondary" style={{ background: '#ef4444', color: '#fff', border: 'none' }} onClick={async () => {
                  if(!window.confirm(`Delete ${selectedStudentIds.length} students?`)) return;
                  setLoading(true);
                  try {
                      const batch = writeBatch(db);
                      selectedStudentIds.forEach(uid => {
                        batch.update(doc(db, 'users', uid), {
                          isDeleted: true, status: 'deleted', deletedAt: serverTimestamp(), updatedAt: serverTimestamp()
                        });
                      });
                      await batch.commit();
                      setStudents(prev => prev.map(s => selectedStudentIds.includes(s.uid || s.id) ? { ...s, isDeleted: true, status: 'deleted' } : s));
                      setSelectedStudentIds([]);
                      setMessage(`${selectedStudentIds.length} students deleted.`);
                  } catch(err) { setError(err.message); }
                  setLoading(false);
                }}>Delete Selected</button>
                </>
              )}
              
              {activeTab === 'deleted' && (
                <>
                  <button className="btn btn-primary" onClick={async () => {
                    if(!window.confirm(`Restore ${selectedStudentIds.length} students?`)) return;
                    setLoading(true);
                    try {
                        const batch = writeBatch(db);
                        selectedStudentIds.forEach(uid => {
                          batch.update(doc(db, 'users', uid), {
                            isDeleted: false, status: 'active', isApproved: true, approved: true, updatedAt: serverTimestamp()
                          });
                        });
                        await batch.commit();
                        setStudents(prev => prev.map(s => selectedStudentIds.includes(s.uid || s.id) ? { ...s, isDeleted: false, status: 'active', isApproved: true, approved: true } : s));
                        setSelectedStudentIds([]);
                        setMessage(`${selectedStudentIds.length} students restored.`);
                    } catch(err) { setError(err.message); }
                    setLoading(false);
                  }}>Restore Selected</button>
                </>
              )}
            </div>
          )}
          <StudentTable
            students={visibleStudents}
            selectedIds={selectedStudentIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onView={(s) => setSelected(s)}
            onEdit={openEditModal}
            onResetPassword={handleResetPassword}
            onApprove={handleApprove}
            onDelete={handleDelete}
            onRestore={handleRestore}
            onPermanentDelete={handlePermanentDelete}
          />
        </>
      )}

      {selected && (
        <div className="card" style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div>
              <div className="pill neutral" style={{ marginBottom: 6 }}>Student Details</div>
              <h3 style={{ margin: 0 }}>{selected.name}</h3>
              <div style={{ color: '#6b7a99', fontSize: 13 }}>{selected.email}</div>
            </div>
            <span className="pill info">{selected.year || '-'}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <span className="badge neutral">Department: {selected.departmentName || '-'}</span>
            <span className="badge neutral">Status: {selected.status || 'pending'}</span>
            <span className="badge neutral">Role: {selected.role || 'student'}</span>
            {(selected.isApproved || selected.approved) ? (
              <span className="badge success">Approved</span>
            ) : (
              <span className="badge warn">Pending Approval</span>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-secondary" onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Edit Student Modal */}
      <Modal
        open={Boolean(editTarget)}
        onClose={closeEditModal}
        size="md"
        title="Edit Student Profile"
        subtitle={`Update details for ${editTarget?.name || 'student'}`}
        icon={Edit3}
        iconVariant="primary"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeEditModal} disabled={savingEdit}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveEdit}
              disabled={savingEdit || !editDepartmentId}
            >
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Full Name *</label>
            <input
              className="input"
              placeholder="Student Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email Address (Read-only)</label>
            <input className="input" value={editTarget?.email || ''} disabled />
          </div>

          <div className="grid grid-2" style={{ gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Academic Year</label>
              <select className="input" value={editYear} onChange={(e) => setEditYear(e.target.value)}>
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Department / Class</label>
              <select
                className="input"
                value={editDepartmentId}
                onChange={(e) => setEditDepartmentId(e.target.value)}
              >
                {editDepartmentsForYear.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Modal>

      {/* Bulk Edit Students Modal */}
      <Modal
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        size="md"
        title="Bulk Assign Students"
        subtitle={`Update class/department for ${selectedStudentIds.length} selected students`}
        icon={Users}
        iconVariant="primary"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setBulkEditOpen(false)}
              disabled={savingBulkEdit}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveBulkEdit}
              disabled={savingBulkEdit || !bulkEditDepartmentId}
            >
              {savingBulkEdit ? 'Updating...' : `Update ${selectedStudentIds.length} Students`}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="alert info">
            Target changes will be applied simultaneously across all {selectedStudentIds.length} selected accounts.
          </div>

          <div className="grid grid-2" style={{ gap: 12 }}>
            <div className="form-group">
              <label className="form-label">New Academic Year</label>
              <select
                className="input"
                value={bulkEditYear}
                onChange={(e) => setBulkEditYear(e.target.value)}
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">New Department / Class</label>
              <select
                className="input"
                value={bulkEditDepartmentId}
                onChange={(e) => setBulkEditDepartmentId(e.target.value)}
              >
                {bulkEditDepartmentsForYear.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Modal>

      <AddStudentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreate}
        student={null}
        submitting={creating}
        error={createError}
        departments={departments}
      />

      <ImportStudentsModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        departments={departments}
        onImportSuccess={(count) => {
          setMessage(`Successfully imported and created ${count} student accounts!`);
          load();
        }}
      />
    </div>
  );
};

export default StudentsPage;
