import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { db } from '../../firebase';
import EmptyState from '../../components/EmptyState';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';
import UnitFormModal from '../../components/UnitFormModal';
import TestFormModal from '../../components/TestFormModal';
import TestViewModal from '../../components/TestViewModal';
import TaskFormModal from '../../components/TaskFormModal';
import TestNotificationModal from '../../components/TestNotificationModal';
import { dispatchTestNotification, NOTIFICATION_TYPES } from '../../utils/testNotificationService';
import { filterByActiveStudentIds, getActiveStudentIds, getActiveStudents } from '../../utils/studentFilters';
import { openOrDownloadFile } from '../../utils/fileUpload';
import { ExternalLink, Users, FileCheck } from 'lucide-react';

const unitCards = [
  { id: 1, label: 'Unit 1' },
  { id: 2, label: 'Unit 2' },
  { id: 3, label: 'Unit 3' },
  { id: 4, label: 'Unit 4' },
  { id: 5, label: 'Unit 5' }
];

const normalizeUnitNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.match(/\d+/);
    if (match) return Number(match[0]);
  }
  return value;
};

const AdminYear = () => {
  const { yearId } = useParams();
  const [activeTab, setActiveTab] = useState('units');
  const [rawUnits, setRawUnits] = useState([]);
  const [rawTests, setRawTests] = useState([]);
  const [rawStudents, setRawStudents] = useState([]);
  const [rawReports, setRawReports] = useState([]);
  const [rawTasks, setRawTasks] = useState([]);
  const [rawSubmissions, setRawSubmissions] = useState([]);
  const [unitForm, setUnitForm] = useState(null);
  const [testForm, setTestForm] = useState(null);
  const [taskForm, setTaskForm] = useState(null);
  const [viewTest, setViewTest] = useState(null);
  const [notifyTest, setNotifyTest] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [searchStudent, setSearchStudent] = useState('');
  const [searchReport, setSearchReport] = useState('');
  const [filterTest, setFilterTest] = useState('');
  const [departments, setDepartments] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('all');

  // Submissions Modal State
  const [submissionsModal, setSubmissionsModal] = useState(null);
  const [gradingItem, setGradingItem] = useState(null);
  const [gradeScore, setGradeScore] = useState('');
  const [gradeFeedback, setGradeFeedback] = useState('');

  useEffect(() => {
    if (!yearId) return;
    const qDepts = query(collection(db, 'departments'), where('year', '==', yearId));
    const unsub = onSnapshot(qDepts, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setDepartments(list);
    }, (err) => {
      console.warn('Departments listener error:', err);
    });
    return () => unsub();
  }, [yearId]);

  useEffect(() => {
    if (!yearId) return;
    const unsubs = [];

    // 1. Units
    const qUnits = query(collection(db, 'units'), where('year', '==', yearId));
    unsubs.push(onSnapshot(qUnits, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          unitNumber: normalizeUnitNumber(data.unitNumber),
          title: data.title,
          pdfLink: data.pdfLink,
          fileName: data.fileName,
          departmentId: data.departmentId,
          departmentName: data.departmentName,
          updatedAt: data.updatedAt
        });
      });
      list.sort((a, b) => Number(a.unitNumber) - Number(b.unitNumber));
      setRawUnits(list);
    }, (err) => console.warn('Units listener error:', err)));

    // 2. Tests
    const qTests = query(collection(db, 'tests'), where('year', '==', yearId));
    unsubs.push(onSnapshot(qTests, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setRawTests(list);
    }, (err) => console.warn('Tests listener error:', err)));

    // 3. Students
    const qStudents = query(collection(db, 'users'), where('role', '==', 'student'), where('year', '==', yearId));
    unsubs.push(onSnapshot(qStudents, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setRawStudents(list);
    }, (err) => console.warn('Students listener error:', err)));

    // 4. Reports (Test Results)
    const qReports = query(collection(db, 'results'), where('year', '==', yearId));
    unsubs.push(onSnapshot(qReports, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setRawReports(list);
    }, (err) => console.warn('Reports listener error:', err)));

    // 5. Tasks
    const qTasks = query(collection(db, 'tasks'), where('year', '==', yearId));
    unsubs.push(onSnapshot(qTasks, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setRawTasks(list);
    }, (err) => console.warn('Tasks listener error:', err)));

    // 6. Task Submissions
    const qSubs = query(collection(db, 'task_submissions'), where('year', '==', yearId));
    unsubs.push(onSnapshot(qSubs, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setRawSubmissions(list);
    }, (err) => console.warn('Submissions listener error:', err)));

    return () => unsubs.forEach((u) => u());
  }, [yearId]);

  const withDepartmentFilter = (list) => (
    selectedDepartmentId === 'all'
      ? list
      : list.filter((item) => !item.departmentId || item.departmentId === 'all' || item.departmentId === selectedDepartmentId)
  );

  const units = useMemo(() => withDepartmentFilter(rawUnits), [rawUnits, selectedDepartmentId]);
  const tests = useMemo(() => withDepartmentFilter(rawTests), [rawTests, selectedDepartmentId]);
  const students = useMemo(() => withDepartmentFilter(rawStudents), [rawStudents, selectedDepartmentId]);
  const reports = useMemo(() => withDepartmentFilter(rawReports), [rawReports, selectedDepartmentId]);
  const tasks = useMemo(() => withDepartmentFilter(rawTasks), [rawTasks, selectedDepartmentId]);

  const submissionsByTaskId = useMemo(() => {
    const map = {};
    rawSubmissions.forEach((s) => {
      const key = s.taskId || s.taskTitle;
      if (key) {
        if (!map[key]) map[key] = [];
        map[key].push(s);
      }
    });
    return map;
  }, [rawSubmissions]);

  const selectedDepartment = departments.find((department) => department.id === selectedDepartmentId);
  const activeStudents = useMemo(() => getActiveStudents(students), [students]);
  const activeStudentIds = useMemo(() => getActiveStudentIds(students), [students]);
  const visibleReports = useMemo(
    () => filterByActiveStudentIds(reports, activeStudentIds),
    [reports, activeStudentIds]
  );

  const saveUnit = async (data) => {
    const selectedUnit = normalizeUnitNumber(data.unitNumber);
    const existingUnit = units.find((u) => (
      u.id === unitForm?.id ||
      Number(u.unitNumber) === selectedUnit
    ));

    const targetDeptId = data.departmentId || (selectedDepartment?.id || 'all');
    const targetDeptName = targetDeptId === 'all'
      ? 'All Departments'
      : (departments.find((d) => d.id === targetDeptId)?.name || selectedDepartment?.name || 'General');

    if (existingUnit?.id) {
      await updateDoc(doc(db, 'units', existingUnit.id), {
        unitNumber: selectedUnit,
        title: data.title,
        pdfLink: data.pdfLink || '',
        fileName: data.fileName || '',
        departmentId: targetDeptId,
        departmentName: targetDeptName,
        unitId: deleteField(),
        updatedAt: new Date()
      });
    } else {
      await addDoc(collection(db, 'units'), {
        year: yearId,
        departmentId: targetDeptId,
        departmentName: targetDeptName,
        unitNumber: selectedUnit,
        title: data.title,
        pdfLink: data.pdfLink || '',
        fileName: data.fileName || '',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    setUnitForm(null);
  };

  const deleteUnit = async () => {
    if (!deleteTarget) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, deleteTarget.collection, deleteTarget.id));

      if (deleteTarget.collection === 'tests') {
        batch.delete(doc(db, 'publishedTests', deleteTarget.id));
        const resSnap = await getDocs(query(collection(db, 'results'), where('testId', '==', deleteTarget.id)));
        resSnap.forEach((d) => batch.delete(d.ref));
      }

      if (deleteTarget.collection === 'tasks') {
        const subSnap1 = await getDocs(query(collection(db, 'task_submissions'), where('taskId', '==', deleteTarget.id)));
        subSnap1.forEach((d) => batch.delete(d.ref));
        const subSnap2 = await getDocs(query(collection(db, 'taskSubmissions'), where('taskId', '==', deleteTarget.id)));
        subSnap2.forEach((d) => batch.delete(d.ref));
      }

      await batch.commit();
    } catch (err) {
      console.warn('Delete item notice:', err);
    } finally {
      setDeleteTarget(null);
    }
  };

  const saveTest = async (data) => {
    const selectedDept = departments.find((d) => d.id === (data.departmentId || selectedDepartmentId));
    const targetDeptId = data.departmentId || (selectedDepartment?.id || 'all');
    const targetDeptName = targetDeptId === 'all' ? 'All Classes' : (selectedDept?.name || selectedDepartment?.name || 'General');

    const testPayload = {
      ...data,
      year: data.year || yearId,
      departmentId: targetDeptId,
      departmentName: targetDeptName,
      unitNumber: data.unitNumber ? Number(data.unitNumber) : 1,
      passMark: Number(data.passMark) || 40,
      updatedAt: new Date()
    };

    if (testForm?.id) {
      await updateDoc(doc(db, 'tests', testForm.id), testPayload);
      await updateDoc(doc(db, 'publishedTests', testForm.id), testPayload).catch(() => {});
    } else {
      const newDoc = await addDoc(collection(db, 'tests'), {
        ...testPayload,
        createdAt: new Date()
      });
      await addDoc(collection(db, 'publishedTests'), {
        ...testPayload,
        id: newDoc.id,
        createdAt: new Date()
      }).catch(() => {});
    }
    setTestForm(null);
  };

  const saveTask = async (data) => {
    const selectedDept = departments.find((d) => d.id === (data.departmentId || selectedDepartmentId));
    const targetDeptId = data.departmentId || (selectedDepartment?.id || 'all');
    const targetDeptName = targetDeptId === 'all' ? 'All Classes' : (selectedDept?.name || selectedDepartment?.name || 'General');

    if (taskForm?.id) {
      await updateDoc(doc(db, 'tasks', taskForm.id), {
        ...data,
        year: yearId,
        departmentId: targetDeptId,
        departmentName: targetDeptName,
        updatedAt: new Date()
      });
    } else {
      await addDoc(collection(db, 'tasks'), {
        ...data,
        year: yearId,
        departmentId: targetDeptId,
        departmentName: targetDeptName,
        status: data.status || 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    setTaskForm(null);
  };

  const handleSaveGrade = async (e) => {
    e.preventDefault();
    if (!gradingItem) return;
    try {
      await updateDoc(doc(db, 'task_submissions', gradingItem.id), {
        grade: gradeScore,
        marks: gradeScore,
        feedback: gradeFeedback,
        status: 'graded',
        gradedAt: serverTimestamp(),
      });
      setGradingItem(null);
      setGradeScore('');
      setGradeFeedback('');
    } catch (err) {
      console.error('Failed to save grade:', err);
    }
  };

  const filteredStudents = useMemo(() => {
    return activeStudents.filter((s) => s.name?.toLowerCase().includes(searchStudent.toLowerCase()));
  }, [activeStudents, searchStudent]);

  const filteredReports = useMemo(() => {
    return visibleReports.filter((r) =>
      r.studentName?.toLowerCase().includes(searchReport.toLowerCase()) &&
      (filterTest ? r.testTitle === filterTest : true)
    );
  }, [visibleReports, searchReport, filterTest]);

  const openUploadModal = (unitId, existingUnit = null, event = null) => {
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    const anchorTop = rect?.top ?? null;
    const anchorBottom = rect?.bottom ?? null;
    const anchorY = typeof event?.clientY === 'number'
      ? event.clientY
      : (typeof event?.nativeEvent?.clientY === 'number' ? event.nativeEvent.clientY : null);
    if (existingUnit) {
      setUnitForm({
        ...existingUnit,
        unitNumber: unitId,
        anchorTop,
        anchorBottom,
        anchorY
      });
      return;
    }
    setUnitForm({
      unitNumber: unitId,
      title: '',
      pdfLink: '',
      anchorTop,
      anchorBottom,
      anchorY
    });
  };

  return (
    <div className="card admin-year-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="pill">Admin / {yearId}</div>
          <h3 style={{ margin: 8, marginLeft: 0 }}>Manage Year</h3>
        </div>
      </div>

      <div className="tab-row" style={{ flexWrap: 'wrap' }}>
        {[{ key: 'units', label: 'Units' }, { key: 'tests', label: 'Tests' }, { key: 'students', label: 'View Students' }, { key: 'reports', label: 'Reports' }, { key: 'tasks', label: 'Tasks' }].map((t) => (
          <button key={t.key} className={`tab-btn ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div style={{ margin: '10px 0 14px' }}>
        <select className="input" value={selectedDepartmentId} onChange={(e) => setSelectedDepartmentId(e.target.value)}>
          <option value="all">All Departments</option>
          {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
      </div>

      {activeTab === 'units' && <div className="grid" style={{ gap: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ margin: 0 }}>Units - {yearId}</h3><button className="btn btn-primary" onClick={(e) => openUploadModal(1, null, e)}>Add Unit</button></div><div className="grid grid-2">{unitCards.map((unit) => { const u = units.find((x) => Number(x.unitNumber) === Number(unit.id)); return (<div key={unit.id} className="card"><div style={{ fontWeight: 700 }}>{unit.label}</div><div style={{ fontSize: 14, color: '#475569' }}>{u ? u.title : 'Not added yet'}</div><div style={{ fontSize: 12, color: '#94a3b8', wordBreak: 'break-all' }}>{u?.fileName ? `Attached: ${u.fileName}` : u?.pdfLink}</div><div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}><button className="btn btn-primary" onClick={(e) => openUploadModal(unit.id, u, e)}>{u ? 'Edit / Update' : 'Upload'}</button>{u && u.pdfLink && <a className="btn btn-secondary" href={u.pdfLink} target="_blank" rel="noreferrer">View</a>}{u && <button className="btn btn-secondary" onClick={() => setDeleteTarget({ collection: 'units', id: u.id })}>Delete</button>}</div></div>); })}</div>{units.length === 0 && <EmptyState message="No units added yet. Click Add Unit to create one." />}</div>}

      {activeTab === 'tests' && <div className="grid" style={{ gap: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ margin: 0 }}>Tests - {yearId}</h3><button className="btn btn-primary" onClick={() => setTestForm({})}>Create Test</button></div><div className="grid grid-2">{tests.map((t) => (<div key={t.id} className="card"><div style={{ fontWeight: 700 }}>{t.title}</div><div style={{ fontSize: 13, color: '#475569' }}>Unit {t.unitNumber} - {t.questions?.length || 0} questions</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{t.updatedAt?.toDate ? t.updatedAt.toDate().toLocaleDateString() : ''}</div><div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}><button className="btn btn-primary" onClick={() => setViewTest(t)}>View</button><button className="btn btn-secondary" onClick={() => setTestForm({ ...t })}>Edit / Update</button><button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => setNotifyTest({ ...t, year: yearId, departmentName: t.departmentName || selectedDepartment?.name })}>🔔 Push Alert</button><button className="btn btn-secondary" onClick={() => setDeleteTarget({ collection: 'tests', id: t.id })}>Delete</button></div></div>))}{tests.length === 0 && <EmptyState message="No tests added yet. Click Create Test to add one." />}</div></div>}

      {activeTab === 'students' && <div className="grid" style={{ gap: 12 }}><input className="input" placeholder="Search student" value={searchStudent} onChange={(e) => setSearchStudent(e.target.value)} /><div className="table-scroll"><table className="table progress-table"><thead><tr><th>Name</th><th>SIF Number</th><th>Year</th><th>Department</th><th>Joined</th></tr></thead><tbody>{filteredStudents.map((s) => (<tr key={s.uid || s.id}><td>{s.name}</td><td className="email-cell" style={{ fontWeight: 600, color: '#2563eb', fontFamily: 'monospace' }}>{s.sifNumber || s.email || '-'}</td><td>{s.year}</td><td>{s.departmentName || '-'}</td><td>{s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString() : ''}</td></tr>))}{filteredStudents.length === 0 && <tr><td colSpan={5}>No students found.</td></tr>}</tbody></table></div></div>}

      {activeTab === 'reports' && <div className="grid" style={{ gap: 12 }}><div className="grid grid-3" style={{ gap: 10 }}><input className="input" placeholder="Search student" value={searchReport} onChange={(e) => setSearchReport(e.target.value)} /><select className="input" value={filterTest} onChange={(e) => setFilterTest(e.target.value)}><option value="">All tests</option>{tests.map((t) => <option key={t.id} value={t.title}>{t.title}</option>)}</select><div /></div><div className="table-scroll"><table className="table progress-table"><thead><tr><th>Student</th><th>Test</th><th>Score</th><th>Total</th><th>Date</th></tr></thead><tbody>{filteredReports.map((r) => (<tr key={r.id}><td>{r.studentName}</td><td>{r.testTitle}</td><td>{r.score}</td><td>{r.total}</td><td>{r.submittedAt?.toDate ? r.submittedAt.toDate().toLocaleString() : ''}</td></tr>))}{filteredReports.length === 0 && <tr><td colSpan={5}>No reports yet.</td></tr>}</tbody></table></div></div>}

      {activeTab === 'tasks' && (
        <div className="grid" style={{ gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Tasks &amp; Assignments - {yearId}</h3>
            <button className="btn btn-primary" onClick={() => setTaskForm({})}>Add Task</button>
          </div>
          <div className="grid grid-2">
            {tasks.map((t) => {
              const subs = submissionsByTaskId[t.id] || submissionsByTaskId[t.title] || [];
              return (
                <div key={t.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{t.title}</div>
                    <div style={{ fontSize: 13, color: '#475569', margin: '4px 0 6px' }}>{t.description}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Due: <strong>{t.dueDate || 'N/A'}</strong></div>
                    {t.fileName && <div style={{ fontSize: 12, color: 'var(--color-primary)', marginTop: 4 }}>Attachment: {t.fileName}</div>}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                    <button
                      className="btn btn-primary"
                      style={{ padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                      onClick={() => setSubmissionsModal({ task: t, list: subs })}
                    >
                      <Users size={13} />
                      <span>Submissions ({subs.length})</span>
                    </button>
                    <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setTaskForm({ ...t })}>Edit</button>
                    {t.fileLink && (
                      <button
                        type="button"
                        onClick={() => openOrDownloadFile(t.fileLink, t.fileName || `${t.title}.pdf`, t.fileId || t.id)}
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                      >
                        File
                      </button>
                    )}
                    <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12, color: '#ef4444' }} onClick={() => setDeleteTarget({ collection: 'tasks', id: t.id })}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
          {tasks.length === 0 && <EmptyState message="No tasks yet. Click Add Task to create one." />}
        </div>
      )}

      {/* Submissions Modal in AdminYear */}
      {submissionsModal && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setSubmissionsModal(null); }}>
          <div className="modal" style={{ maxWidth: 760, width: '95%' }}>
            <div className="modal-header">
              <div>
                <span className="pill info" style={{ fontSize: 11, marginBottom: 4, fontWeight: 700 }}>Student Submissions</span>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{submissionsModal.task.title}</h3>
                <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: 12 }}>
                  {yearId} • Due: {submissionsModal.task.dueDate || 'No deadline'}
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSubmissionsModal(null)}>✕</button>
            </div>

            <div className="modal-body">
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Student Name</th>
                      <th>SIF / Roll No</th>
                      <th>Submitted Date</th>
                      <th>Attachment</th>
                      <th>Grade</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissionsModal.list.map((s, idx) => (
                      <tr key={s.id || idx}>
                        <td>{idx + 1}</td>
                        <td style={{ fontWeight: 600 }}>{s.studentName || 'Student'}</td>
                        <td style={{ fontSize: 12, fontFamily: 'monospace', color: '#2563eb' }}>{s.sifNumber || s.rollNumber || '-'}</td>
                        <td style={{ fontSize: 12 }}>{s.submittedAt?.toDate ? s.submittedAt.toDate().toLocaleDateString() : 'Recent'}</td>
                        <td>
                          {s.fileUrl ? (
                            <button
                              type="button"
                              onClick={() => openOrDownloadFile(s.fileUrl, s.fileName || `${s.studentName}_Assignment.pdf`, s.fileId)}
                              className="btn btn-secondary"
                              style={{ padding: '2px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              <ExternalLink size={12} /> View PDF
                            </button>
                          ) : (
                            <span style={{ fontSize: 11, color: '#64748b' }}>{s.notes ? 'Text Answer' : 'No attachment'}</span>
                          )}
                        </td>
                        <td>
                          {s.grade || s.marks ? (
                            <span className="pill success" style={{ fontSize: 11 }}>{s.grade || s.marks}</span>
                          ) : (
                            <span className="pill warn" style={{ fontSize: 11, background: '#fef3c7', color: '#d97706' }}>Pending</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn btn-primary"
                            style={{ padding: '3px 8px', fontSize: 11 }}
                            onClick={() => {
                              setGradingItem(s);
                              setGradeScore(s.grade || s.marks || '');
                              setGradeFeedback(s.feedback || '');
                            }}
                          >
                            Grade
                          </button>
                        </td>
                      </tr>
                    ))}
                    {submissionsModal.list.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                          No student submissions received for this task yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {gradingItem && (
                <form onSubmit={handleSaveGrade} style={{ marginTop: 14, background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700 }}>Grading: {gradingItem.studentName}</h4>
                  <div className="grid grid-2" style={{ gap: 8, marginBottom: 8 }}>
                    <input
                      className="input"
                      value={gradeScore}
                      onChange={(e) => setGradeScore(e.target.value)}
                      placeholder="Grade (e.g. 90/100, A+)"
                      required
                    />
                    <input
                      className="input"
                      value={gradeFeedback}
                      onChange={(e) => setGradeFeedback(e.target.value)}
                      placeholder="Feedback comments..."
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: 11 }} onClick={() => setGradingItem(null)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" style={{ fontSize: 11 }}>Save Grade</button>
                  </div>
                </form>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSubmissionsModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <UnitFormModal open={!!unitForm} initial={unitForm} year={yearId} departments={departments} selectedDepartmentId={selectedDepartmentId} onClose={() => setUnitForm(null)} onSave={saveUnit} />
      <TestFormModal open={!!testForm} initial={testForm && testForm.id ? testForm : null} year={yearId} departments={departments} selectedDepartmentId={selectedDepartmentId} onClose={() => setTestForm(null)} onSave={saveTest} />
      <TestViewModal open={!!viewTest} test={viewTest} onClose={() => setViewTest(null)} />
      <TestNotificationModal open={!!notifyTest} test={notifyTest} departments={departments} currentYear={yearId} onClose={() => setNotifyTest(null)} />
      <TaskFormModal open={!!taskForm} initial={taskForm && taskForm.id ? taskForm : null} year={yearId} departments={departments} selectedDepartmentId={selectedDepartmentId} onClose={() => setTaskForm(null)} onSave={saveTask} />
      <ConfirmDeleteModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={deleteUnit} text="Are you sure you want to delete this item?" />
    </div>
  );
};

export default AdminYear;
