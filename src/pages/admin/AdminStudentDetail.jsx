import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where
} from 'firebase/firestore';
import { db } from '../../firebase';
import EmptyState from '../../components/EmptyState';
import Loader from '../../components/Loader';
import { updateDoc } from 'firebase/firestore';
import { formatDisplayDob } from '../../utils/studentImport';

const TABS = ['Units', 'Tests', 'Reports', 'Tasks', 'Attendance'];
const normalizeUnitNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.match(/\d+/);
    if (match) return Number(match[0]);
  }
  return 1;
};

const AdminStudentDetail = () => {
  const { studentId } = useParams();
  const [student, setStudent] = useState(null);
  const [units, setUnits] = useState([]);
  const [tests, setTests] = useState([]);
  const [results, setResults] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [tab, setTab] = useState('Reports');
  const [loading, setLoading] = useState(true);

  const [isEditingReg, setIsEditingReg] = useState(false);
  const [regInput, setRegInput] = useState('');
  const [isSavingReg, setIsSavingReg] = useState(false);

  const handleSaveReg = async () => {
    const trimmed = regInput.trim();
    if (!trimmed) return;
    setIsSavingReg(true);
    try {
      await updateDoc(doc(db, 'users', studentId), {
        registerNumber: trimmed
      });
      setStudent(prev => ({ ...prev, registerNumber: trimmed }));
      setIsEditingReg(false);
    } catch (err) {
      console.error(err);
      alert("Failed to update register number.");
    } finally {
      setIsSavingReg(false);
    }
  };

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    const unsubs = [];

    // 1. Student doc listener
    const unsubUser = onSnapshot(doc(db, 'users', studentId), async (userSnap) => {
      if (!userSnap.exists()) {
        setStudent(null);
        setLoading(false);
        return;
      }
      const user = { id: userSnap.id, ...userSnap.data() };
      setStudent(user);

      if (!user.year) {
        setLoading(false);
        return;
      }

      try {
        const [unitSnap, testSnap, taskSnap] = await Promise.all([
          getDocs(query(collection(db, 'units'), where('year', '==', user.year))),
          getDocs(query(collection(db, 'tests'), where('year', '==', user.year))),
          getDocs(query(collection(db, 'tasks'), where('year', '==', user.year)))
        ]);

        const byUnitId = new Map();
        unitSnap.forEach((d) => {
          const data = d.data();
          if (!data.departmentId || data.departmentId === 'all' || data.departmentId === (user.departmentId || '')) {
            const unitNumber = normalizeUnitNumber(data.unitNumber);
            const current = byUnitId.get(unitNumber);
            const currentTime = current?.updatedAt?.seconds || current?.createdAt?.seconds || 0;
            const nextTime = data.updatedAt?.seconds || data.createdAt?.seconds || 0;
            if (!current || nextTime >= currentTime) {
              byUnitId.set(unitNumber, { id: d.id, ...data, unitNumber });
            }
          }
        });
        const uList = Array.from(byUnitId.values()).sort((a, b) => Number(a.unitNumber) - Number(b.unitNumber));
        const tList = [];
        testSnap.forEach((d) => {
          const data = d.data();
          if (!data.departmentId || data.departmentId === 'all' || data.departmentId === (user.departmentId || '')) {
            tList.push({ id: d.id, ...data });
          }
        });
        const taskList = [];
        taskSnap.forEach((d) => {
          const data = d.data();
          if (!data.departmentId || data.departmentId === 'all' || data.departmentId === (user.departmentId || '')) {
            taskList.push({ id: d.id, ...data });
          }
        });

        setUnits(uList);
        setTests(tList);
        setTasks(taskList);
      } catch (err) {
        console.warn('Units/tests load error in detail:', err);
      } finally {
        setLoading(false);
      }
    }, (err) => {
      console.warn('Student detail user listener error:', err);
      setLoading(false);
    });
    unsubs.push(unsubUser);

    // 2. Results listener
    const qResults = query(collection(db, 'results'), where('studentId', '==', studentId));
    unsubs.push(onSnapshot(qResults, (resultSnap) => {
      const rList = [];
      resultSnap.forEach((d) => rList.push({ id: d.id, ...d.data() }));
      setResults(rList);
    }, (err) => console.warn('Results listener error:', err)));

    // 3. Attendance listener
    const qAtt = query(collection(db, 'attendance'), where('studentId', '==', studentId));
    unsubs.push(onSnapshot(qAtt, (attSnap) => {
      const aList = [];
      attSnap.forEach((d) => aList.push({ id: d.id, ...d.data() }));
      aList.sort((a, b) => new Date(b.date) - new Date(a.date));
      setAttendance(aList);
    }, (err) => console.warn('Attendance listener error:', err)));

    return () => unsubs.forEach((u) => u());
  }, [studentId]);

  const progress = useMemo(() => {
    if (!tests.length) return 0;
    const completed = results.length;
    return Math.round((completed / tests.length) * 100);
  }, [tests.length, results.length]);

  const latestScore = useMemo(() => {
    if (!results.length) return 0;
    const latest = results
      .slice()
      .sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0))[0];
    return latest ? Math.round((latest.score / (latest.total || 1)) * 100) : 0;
  }, [results]);

  if (loading) return <Loader />;
  if (!student) return <div className="card">Student not found.</div>;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="pill">Admin / {student.year || 'Year'}</div>
          <h3 style={{ margin: 8, marginLeft: 0 }}>Student Profile Details</h3>
        </div>
        <button className="btn-secondary" onClick={() => navigate(-1)}>
          Back
        </button>
      </div>

      <div className="card glass" style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{student.name}</div>
            <div style={{ color: '#475569', fontSize: 14 }}>{student.email}</div>
            
            <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', padding: '12px', background: 'rgba(255,255,255,0.7)', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Roll Number</div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>{student.rollNumber || student.registerNumber || student.rollNo || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>SIF Number</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#2563eb', fontFamily: 'monospace' }}>{student.sifNumber || student.sifNo || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Date of Birth</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{formatDisplayDob(student.dob)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Mobile Number</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{student.mobileNumber || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Class / Section</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{student.class || student.departmentName || 'Tamil'} (Sec {student.section || 'A'})</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {student.year && <span className="badge soft">{student.year}</span>}
            <span className="badge success">{student.status || 'active'}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginTop: 16 }}>
        {TABS.map((t) => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ marginTop: 16 }}>
        {tab === 'Units' && (
          <div className="grid" style={{ gap: 12 }}>
            <div className="card glass">
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Overview</div>
              <div className="grid grid-2" style={{ gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#475569' }}>Overall Test Progress</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#2563eb' }}>{progress}%</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#475569' }}>Latest Score</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{latestScore}%</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#475569' }}>Attendance Rate</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: attendanceStats.percentage >= 75 ? '#2563eb' : '#dc2626' }}>
                    {attendanceStats.percentage}%
                  </div>
                </div>
              </div>
            </div>

            {units.map((u) => (
              <div key={u.id} className="card">
                <div style={{ fontWeight: 700 }}>Unit {u.unitNumber}</div>
                <div style={{ fontSize: 14, color: '#475569' }}>{u.title}</div>
                {u.pdfLink && <a className="btn btn-secondary" style={{ marginTop: 6 }} href={u.pdfLink} target="_blank" rel="noreferrer">View PDF</a>}
              </div>
            ))}
            {units.length === 0 && <EmptyState message="No units for this year." />}
          </div>
        )}

      {tab === 'Attendance' && (
        <div className="grid" style={{ gap: 12 }}>
          {/* Summary */}
          <div className="card glass" style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
            <div>
              <div style={{ fontSize: 12, color: '#475569' }}>Total Days</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{attendanceStats.total}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#475569' }}>Present</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>{attendanceStats.present}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#475569' }}>Absent</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>{attendanceStats.absent}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#475569' }}>On Duty (OD)</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#8b5cf6' }}>{attendanceStats.od}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#475569' }}>Percentage</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: attendanceStats.percentage >= 75 ? '#3b82f6' : '#ef4444' }}>
                {attendanceStats.percentage}%
              </div>
            </div>
          </div>

          {/* History */}
          <div className="table-scroll">
            <table className="table progress-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Period / Subject</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {attendance.map(a => {
                  const s = (a.status || '').toString().toLowerCase();
                  return (
                    <tr key={a.id}>
                      <td>{a.date}</td>
                      <td>{a.period ? `Period ${a.period}` : (a.departmentName || 'Daily')}</td>
                      <td>
                        {(s === 'present' || s === 'p') && <span className="badge" style={{ backgroundColor: '#dcfce7', color: '#15803d', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700 }}>Present</span>}
                        {(s === 'absent' || s === 'a') && <span className="badge" style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700 }}>Absent</span>}
                        {(s === 'od' || s === 'onduty') && <span className="badge" style={{ backgroundColor: '#f3e8ff', color: '#6b21a8', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700 }}>On Duty (OD)</span>}
                        {(s === 'leave') && <span className="badge" style={{ backgroundColor: '#fef3c7', color: '#b45309', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700 }}>Leave</span>}
                        {(s === 'late' || s === 'l') && <span className="badge" style={{ backgroundColor: '#fef3c7', color: '#d97706', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700 }}>Late</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {attendance.length === 0 && <EmptyState message="No attendance records found." />}
        </div>
      )}

      {tab === 'Tests' && (
        <div className="grid" style={{ gap: 12 }}>
          <div className="table-scroll">
            <table className="table progress-table">
              <thead>
                <tr><th>Title</th><th>Unit</th><th>Completed</th><th>Score</th></tr>
              </thead>
              <tbody>
                {tests.map((t) => {
                  const r = results.find((x) => x.testId === t.id);
                  return (
                    <tr key={t.id}>
                      <td>{t.title}</td>
                      <td>{t.unitNumber}</td>
                      <td>{r ? 'Yes' : 'No'}</td>
                      <td>{r ? `${Math.round((r.score / (r.total || 1)) * 100)}%` : '—'}</td>
                    </tr>
                  );
                })}
                {tests.length === 0 && <tr><td colSpan={4}>No tests.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Reports' && (
        <div className="grid" style={{ gap: 12 }}>
          <div className="report-table-scroll">
            <table className="table progress-table report-table">
              <thead>
                <tr><th>Test</th><th>Score</th><th>Total</th><th>Date</th></tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id}>
                    <td>{r.testTitle || r.testId}</td>
                    <td>{r.score}</td>
                    <td>{r.total}</td>
                    <td>{r.submittedAt?.toDate ? r.submittedAt.toDate().toLocaleString() : ''}</td>
                  </tr>
                ))}
                {results.length === 0 && <tr><td colSpan={4}>No reports yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Tasks' && (
        <div className="grid" style={{ gap: 12 }}>
          {tasks.map((t) => (
            <div key={t.id} className="card">
              <div style={{ fontWeight: 700 }}>{t.title}</div>
              <div style={{ fontSize: 14, color: '#475569', marginBottom: 4 }}>{t.description}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Due: {t.dueDate || 'N/A'}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Status: {t.status || 'active'}</div>
              {t.fileLink && <a className="btn btn-secondary" style={{ marginTop: 6 }} href={t.fileLink} target="_blank" rel="noreferrer">Open Link</a>}
            </div>
          ))}
          {tasks.length === 0 && <EmptyState message="No tasks for this year." />}
        </div>
      )}
      </div>
    </div>
  );
};

export default AdminStudentDetail;
