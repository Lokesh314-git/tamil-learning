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
  updateDoc,
  where
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

  // Real-time Department Listener (Auto Refresh)
  useEffect(() => {
    if (!yearId) return;
    const q = query(collection(db, 'departments'), where('year', '==', yearId), where('isActive', '==', true));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setDepartments(list);
      setSelectedDepartmentId((prev) => (prev === 'all' || list.some((department) => department.id === prev) ? prev : 'all'));
    }, (err) => {
      console.warn('Departments listener error:', err);
    });
    return () => unsub();
  }, [yearId]);

  // Real-time Listeners for Units, Tests, Students, Reports, Tasks (Auto Refresh)
  useEffect(() => {
    if (!yearId) return;

    const unsubs = [];

    // 1. Units
    const qUnits = query(collection(db, 'units'), where('year', '==', yearId));
    unsubs.push(onSnapshot(qUnits, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        const unitNumber = normalizeUnitNumber(data.unitNumber);
        list.push({ id: d.id, ...data, unitNumber });
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

  const loadUnits = () => {};
  const loadTests = () => {};
  const loadTasks = () => {};

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
    await loadUnits();
  };

  const deleteUnit = async () => {
    if (!deleteTarget) return;
    await deleteDoc(doc(db, deleteTarget.collection, deleteTarget.id));
    setDeleteTarget(null);
    if (deleteTarget.collection === 'units') loadUnits();
    if (deleteTarget.collection === 'tests') loadTests();
    if (deleteTarget.collection === 'tasks') loadTasks();
  };

  const saveTest = async (data) => {
    const targetDeptId = data.departmentId || (selectedDepartment?.id || 'all');
    const targetDeptName = targetDeptId === 'all'
      ? 'All Departments'
      : (departments.find((d) => d.id === targetDeptId)?.name || selectedDepartment?.name || 'General');

    let savedTestId = testForm?.id;

    if (testForm?.id) {
      await updateDoc(doc(db, 'tests', testForm.id), {
        title: data.title,
        unitNumber: Number(data.unitNumber),
        subject: data.subject || targetDeptName,
        testDate: data.testDate || '',
        testTime: data.testTime || '',
        duration: data.duration || '30',
        description: data.description || '',
        questions: data.questions,
        departmentId: targetDeptId,
        departmentName: targetDeptName,
        updatedAt: new Date()
      });
    } else {
      const docRef = await addDoc(collection(db, 'tests'), {
        year: yearId,
        departmentId: targetDeptId,
        departmentName: targetDeptName,
        title: data.title,
        unitNumber: Number(data.unitNumber),
        subject: data.subject || targetDeptName,
        testDate: data.testDate || '',
        testTime: data.testTime || '',
        duration: data.duration || '30',
        description: data.description || '',
        questions: data.questions,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      savedTestId = docRef.id;
    }

    if (data.notifyStudents) {
      try {
        await dispatchTestNotification({
          type: testForm?.id ? NOTIFICATION_TYPES.TEST_UPDATED : NOTIFICATION_TYPES.NEW_TEST,
          testId: savedTestId,
          testTitle: data.title,
          subject: data.subject || targetDeptName,
          testDate: data.testDate,
          testTime: data.testTime,
          duration: data.duration,
          description: data.description,
          targetType: data.targetType || (targetDeptId === 'all' ? 'year' : 'department'),
          targetYear: yearId,
          targetDepartmentId: targetDeptId,
          targetDepartmentName: targetDeptName,
          targetSection: data.targetSection || 'all'
        });
      } catch (notifErr) {
        console.warn('Failed to dispatch auto test notification:', notifErr);
      }
    }

    setTestForm(null);
    await loadTests();
  };

  const saveTask = async (data) => {
    const targetDeptId = data.departmentId || (selectedDepartment?.id || 'all');
    const targetDeptName = targetDeptId === 'all'
      ? 'All Departments'
      : (departments.find((d) => d.id === targetDeptId)?.name || selectedDepartment?.name || 'General');

    if (taskForm?.id) {
      await updateDoc(doc(db, 'tasks', taskForm.id), {
        title: data.title,
        description: data.description || '',
        dueDate: data.dueDate || '',
        fileLink: data.fileLink || '',
        fileName: data.fileName || '',
        departmentId: targetDeptId,
        departmentName: targetDeptName,
        status: data.status || 'active',
        updatedAt: new Date()
      });
    } else {
      await addDoc(collection(db, 'tasks'), {
        year: yearId,
        departmentId: targetDeptId,
        departmentName: targetDeptName,
        title: data.title,
        description: data.description || '',
        dueDate: data.dueDate || '',
        fileLink: data.fileLink || '',
        fileName: data.fileName || '',
        status: data.status || 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    setTaskForm(null);
    await loadTasks();
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
          <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div style={{ margin: '10px 0 14px' }}>
        <select className="input" value={selectedDepartmentId} onChange={(e) => setSelectedDepartmentId(e.target.value)}>
          <option value="all">All Departments</option>
          {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
      </div>

      {tab === 'units' && <div className="grid" style={{ gap: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ margin: 0 }}>Units - {yearId}</h3><button className="btn btn-primary" onClick={(e) => openUploadModal(1, null, e)}>Add Unit</button></div><div className="grid grid-2">{unitCards.map((unit) => { const u = units.find((x) => Number(x.unitNumber) === Number(unit.id)); return (<div key={unit.id} className="card"><div style={{ fontWeight: 700 }}>{unit.label}</div><div style={{ fontSize: 14, color: '#475569' }}>{u ? u.title : 'Not added yet'}</div><div style={{ fontSize: 12, color: '#94a3b8', wordBreak: 'break-all' }}>{u?.fileName ? `Attached: ${u.fileName}` : u?.pdfLink}</div><div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}><button className="btn btn-primary" onClick={(e) => openUploadModal(unit.id, u, e)}>{u ? 'Edit / Update' : 'Upload'}</button>{u && u.pdfLink && <a className="btn btn-secondary" href={u.pdfLink} target="_blank" rel="noreferrer">View</a>}{u && <button className="btn btn-secondary" onClick={() => setDeleteTarget({ collection: 'units', id: u.id })}>Delete</button>}</div></div>); })}</div>{units.length === 0 && <EmptyState message="No units added yet. Click Add Unit to create one." />}</div>}

      {tab === 'tests' && <div className="grid" style={{ gap: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ margin: 0 }}>Tests - {yearId}</h3><button className="btn btn-primary" onClick={() => setTestForm({})}>Create Test</button></div><div className="grid grid-2">{tests.map((t) => (<div key={t.id} className="card"><div style={{ fontWeight: 700 }}>{t.title}</div><div style={{ fontSize: 13, color: '#475569' }}>Unit {t.unitNumber} - {t.questions?.length || 0} questions</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{t.updatedAt?.toDate ? t.updatedAt.toDate().toLocaleDateString() : ''}</div><div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}><button className="btn btn-primary" onClick={() => setViewTest(t)}>View</button><button className="btn btn-secondary" onClick={() => setTestForm({ ...t })}>Edit / Update</button><button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => setNotifyTest({ ...t, year: yearId, departmentName: t.departmentName || selectedDepartment?.name })}>🔔 Push Alert</button><button className="btn btn-secondary" onClick={() => setDeleteTarget({ collection: 'tests', id: t.id })}>Delete</button></div></div>))}{tests.length === 0 && <EmptyState message="No tests added yet. Click Create Test to add one." />}</div></div>}

      {tab === 'students' && <div className="grid" style={{ gap: 12 }}><input className="input" placeholder="Search student" value={searchStudent} onChange={(e) => setSearchStudent(e.target.value)} /><div className="table-scroll"><table className="table progress-table"><thead><tr><th>Name</th><th>SIF Number</th><th>Year</th><th>Department</th><th>Joined</th></tr></thead><tbody>{filteredStudents.map((s) => (<tr key={s.uid || s.id}><td>{s.name}</td><td className="email-cell" style={{ fontWeight: 600, color: '#2563eb', fontFamily: 'monospace' }}>{s.sifNumber || s.email || '-'}</td><td>{s.year}</td><td>{s.departmentName || '-'}</td><td>{s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString() : ''}</td></tr>))}{filteredStudents.length === 0 && <tr><td colSpan={5}>No students found.</td></tr>}</tbody></table></div></div>}

      {tab === 'reports' && <div className="grid" style={{ gap: 12 }}><div className="grid grid-3" style={{ gap: 10 }}><input className="input" placeholder="Search student" value={searchReport} onChange={(e) => setSearchReport(e.target.value)} /><select className="input" value={filterTest} onChange={(e) => setFilterTest(e.target.value)}><option value="">All tests</option>{tests.map((t) => <option key={t.id} value={t.title}>{t.title}</option>)}</select><div /></div><div className="table-scroll"><table className="table progress-table"><thead><tr><th>Student</th><th>Test</th><th>Score</th><th>Total</th><th>Date</th></tr></thead><tbody>{filteredReports.map((r) => (<tr key={r.id}><td>{r.studentName}</td><td>{r.testTitle}</td><td>{r.score}</td><td>{r.total}</td><td>{r.submittedAt?.toDate ? r.submittedAt.toDate().toLocaleString() : ''}</td></tr>))}{filteredReports.length === 0 && <tr><td colSpan={5}>No reports yet.</td></tr>}</tbody></table></div></div>}

      {tab === 'tasks' && <div className="grid" style={{ gap: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ margin: 0 }}>Tasks - {yearId}</h3><button className="btn btn-primary" onClick={() => setTaskForm({})}>Add Task</button></div><div className="grid grid-2">{tasks.map((t) => (<div key={t.id} className="card"><div style={{ fontWeight: 700 }}>{t.title}</div><div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>{t.description}</div><div style={{ fontSize: 12, color: '#94a3b8' }}>Due: {t.dueDate || 'N/A'}</div><div style={{ fontSize: 12, color: '#94a3b8' }}>Status: {t.status || 'active'}</div>{t.fileName && <div style={{ fontSize: 12, color: 'var(--color-primary)', marginTop: 4 }}>File: {t.fileName}</div>}{t.fileLink && <a className="btn btn-secondary" style={{ marginTop: 6 }} href={t.fileLink} target="_blank" rel="noreferrer">Open File / Link</a>}<div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button className="btn btn-primary" onClick={() => setTaskForm({ ...t })}>Edit / Update</button><button className="btn btn-secondary" onClick={() => setDeleteTarget({ collection: 'tasks', id: t.id })}>Delete</button></div></div>))}{tasks.length === 0 && <EmptyState message="No tasks yet. Click Add Task to create one." />}</div></div>}

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
