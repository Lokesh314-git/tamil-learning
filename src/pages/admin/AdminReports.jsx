import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { 
  Users, 
  FileText, 
  CheckCircle2, 
  TrendingUp, 
  ArrowUpDown, 
  Filter, 
  X, 
  Mail, 
  GraduationCap, 
  Building2, 
  Hash, 
  Award, 
  Clock 
} from 'lucide-react';
import { db } from '../../firebase';
import EmptyState from '../../components/EmptyState';
import FullScreenLoader from '../../components/FullScreenLoader';
import { filterByActiveStudentIds, getActiveStudentIds, getActiveStudents } from '../../utils/studentFilters';

const years = ['1st Year', '2nd Year', '3rd Year'];

const AdminReports = () => {
  const [activeYear, setActiveYear] = useState('1st Year');
  const [students, setStudents] = useState([]);
  const [tests, setTests] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [detail, setDetail] = useState(null);
  const [sortType, setSortType] = useState('name-asc');
  const [departments, setDepartments] = useState([]);
  const [activeDepartmentId, setActiveDepartmentId] = useState('all');

  useEffect(() => {
    if (!activeYear) return;
    const q = query(collection(db, 'departments'), where('year', '==', activeYear), where('isActive', '==', true));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setDepartments(list);
      setActiveDepartmentId((prev) => (prev === 'all' || list.some((item) => item.id === prev) ? prev : 'all'));
    }, (err) => {
      console.warn('Departments listener error in reports:', err);
    });
    return () => unsub();
  }, [activeYear]);

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    const unsubs = [];
    const qStudents = query(collection(db, 'users'), where('role', '==', 'student'), where('year', '==', activeYear));
    const qTests = query(collection(db, 'tests'), where('year', '==', activeYear));
    const qResults = query(collection(db, 'results'), where('year', '==', activeYear));

    let received = 0;
    const checkDone = () => {
      received += 1;
      if (received >= 3) {
        setLoading(false);
      }
    };

    unsubs.push(onSnapshot(qStudents, (snap) => {
      const s = [];
      snap.forEach((d) => s.push({ uid: d.id, ...d.data() }));
      setStudents(s);
      checkDone();
    }, (err) => {
      setLoadError(err.message || 'Failed to load students');
      checkDone();
    }));

    unsubs.push(onSnapshot(qTests, (snap) => {
      const t = [];
      snap.forEach((d) => t.push({ id: d.id, ...d.data() }));
      setTests(t);
      checkDone();
    }, (err) => {
      setLoadError(err.message || 'Failed to load tests');
      checkDone();
    }));

    unsubs.push(onSnapshot(qResults, (snap) => {
      const r = [];
      snap.forEach((d) => r.push({ id: d.id, ...d.data() }));
      setResults(r);
      checkDone();
    }, (err) => {
      setLoadError(err.message || 'Failed to load results');
      checkDone();
    }));

    return () => unsubs.forEach((u) => u());
  }, [activeYear]);

  const activeStudents = useMemo(
    () => getActiveStudents(students).filter((student) => (activeDepartmentId === 'all' ? true : student.departmentId === activeDepartmentId)),
    [students, activeDepartmentId]
  );
  const activeStudentIds = useMemo(() => getActiveStudentIds(students), [students]);
  const visibleResults = useMemo(
    () => filterByActiveStudentIds(
      activeDepartmentId === 'all' ? results : results.filter((result) => result.departmentId === activeDepartmentId),
      activeStudentIds
    ),
    [results, activeStudentIds, activeDepartmentId]
  );

  const studentRows = useMemo(() => {
    const testCount = tests.length || 1;
    const priority = { Completed: 1, 'In Progress': 2, 'Not Started': 3 };

    const rows = activeStudents.map((s) => {
      const myResults = visibleResults.filter((r) => r.studentId === s.uid);
      const completed = myResults.length;
      const progress = Math.round((completed / testCount) * 100);
      const avgScore = myResults.length
        ? Math.round((myResults.reduce((acc, r) => acc + (r.score / (r.total || 1)) * 100, 0) / myResults.length))
        : 0;
      const latest = myResults.sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0))[0];
      const latestScore = latest ? Math.round((latest.score / (latest.total || 1)) * 100) : 0;
      const status =
        completed === 0
          ? 'Not Started'
          : completed < testCount
            ? 'In Progress'
            : testCount > 0
              ? 'Completed'
              : 'Not Started';

      return {
        ...s,
        totalTests: testCount,
        completed,
        progress,
        avgScore,
        latestScore,
        status,
        statusPriority: priority[status] ?? 4
      };
    });

    return rows.sort((a, b) => {
      if (sortType === 'name-asc') return (a.name || '').localeCompare(b.name || '');
      if (sortType === 'name-desc') return (b.name || '').localeCompare(a.name || '');
      if (sortType === 'status') return a.statusPriority - b.statusPriority;
      if (sortType === 'progress') return b.progress - a.progress;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [activeStudents, tests, visibleResults, sortType]);

  const summary = useMemo(() => {
    const totalStudents = activeStudents.length;
    const totalTests = tests.length;
    const completedTests = studentRows.reduce((acc, r) => acc + r.completed, 0);
    const avgProgress = studentRows.length
      ? Math.round(studentRows.reduce((acc, r) => acc + r.progress, 0) / studentRows.length)
      : 0;
    return { totalStudents, totalTests, completedTests, avgProgress };
  }, [activeStudents, tests, studentRows]);

  const detailResults = useMemo(() => {
    if (!detail) return [];
    return visibleResults.filter((r) => r.studentId === detail.uid || r.studentId === detail.id);
  }, [detail, visibleResults]);

  if (loading) {
    return <FullScreenLoader />;
  }

  if (loadError) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Reports</h3>
        <p style={{ marginBottom: 0, color: '#b91c1c' }}>{loadError}</p>
      </div>
    );
  }

  return (
    <div className="reports-page fade-in">
      <div className="reports-top-bar">
        <div className="reports-tabs">
          {years.map((y) => (
            <button
              key={y}
              className={`tab-btn small ${activeYear === y ? 'active' : ''}`}
              onClick={() => setActiveYear(y)}
            >
              {y}
            </button>
          ))}
        </div>

        <div className="reports-filter-box">
          <Filter size={15} className="reports-filter-icon" />
          <label htmlFor="report-dept-select" className="reports-filter-label">Department:</label>
          <select
            id="report-dept-select"
            className="input reports-filter-select"
            value={activeDepartmentId}
            onChange={(e) => setActiveDepartmentId(e.target.value)}
          >
            <option value="all">All Departments</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="reports-summary">
        <div className="stat-card stat-purple">
          <div className="stat-head">
            <span className="stat-title">Total Students</span>
            <div className="stat-icon purple">
              <Users size={16} />
            </div>
          </div>
          <div className="stat-value">{summary.totalStudents}</div>
          <div className="stat-meta">{activeYear} enrolled</div>
        </div>

        <div className="stat-card stat-blue">
          <div className="stat-head">
            <span className="stat-title">Total Tests</span>
            <div className="stat-icon blue">
              <FileText size={16} />
            </div>
          </div>
          <div className="stat-value">{summary.totalTests}</div>
          <div className="stat-meta">Active assignments</div>
        </div>

        <div className="stat-card stat-orange">
          <div className="stat-head">
            <span className="stat-title">Completed Tests</span>
            <div className="stat-icon orange">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="stat-value">{summary.completedTests}</div>
          <div className="stat-meta">Total submissions</div>
        </div>

        <div className="stat-card stat-green">
          <div className="stat-head">
            <span className="stat-title">Average Progress</span>
            <div className="stat-icon green">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="stat-value">{summary.avgProgress}%</div>
          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${Math.min(100, Math.max(0, summary.avgProgress))}%` }} />
          </div>
        </div>
      </div>

      <div className="card reports-card">
        <div className="reports-head">
          <div className="reports-head-left">
            <h3 className="reports-title">Student Progress &mdash; {activeYear}</h3>
            <span className="reports-count-pill">
              {studentRows.length} {studentRows.length === 1 ? 'Student' : 'Students'}
            </span>
          </div>

          <div className="reports-head-right">
            <ArrowUpDown size={14} className="sort-icon" />
            <span className="sort-label">Sort:</span>
            <select
              className="input sort-input"
              value={sortType}
              onChange={(e) => setSortType(e.target.value)}
            >
              <option value="name-asc">Name (A to Z)</option>
              <option value="name-desc">Name (Z to A)</option>
              <option value="status">Status (Completed First)</option>
              <option value="progress">Progress (High to Low)</option>
            </select>
          </div>
        </div>

        {studentRows.length === 0 && <EmptyState message="No students found for this year." />}
        {studentRows.length > 0 && (
          <>
            <div className="table-hint">Swipe left/right to view full report</div>
            <div className="reports-mobile-wrapper">
              <div className="report-table-scroll">
                <table className="table progress-table report-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>SIF Number</th>
                      <th>Tests Completed</th>
                      <th>Total Tests</th>
                      <th>Progress %</th>
                      <th>Avg Score</th>
                      <th>Latest Score</th>
                      <th>Status</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentRows.map((r) => (
                      <tr key={r.uid}>
                        <td style={{ fontWeight: 600 }}>{r.name}</td>
                        <td className="email-cell" style={{ fontWeight: 600, color: '#2563eb', fontFamily: 'monospace' }}>
                          {r.sifNumber || r.email || '-'}
                        </td>
                        <td>{r.completed}</td>
                        <td>{r.totalTests}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ minWidth: 32, fontSize: 13, fontWeight: 600 }}>{r.progress}%</span>
                            <div className="progress-track" style={{ width: 60, margin: 0 }}>
                              <div className="progress-bar" style={{ width: `${Math.min(100, Math.max(0, r.progress))}%` }} />
                            </div>
                          </div>
                        </td>
                        <td>{r.avgScore}%</td>
                        <td>{r.latestScore}%</td>
                        <td>
                          <span className={`pill ${r.status === 'Completed' ? 'success' : r.status === 'In Progress' ? 'info' : 'neutral'}`}>
                            {r.status}
                          </span>
                        </td>
                        <td>
                          <button className="btn btn-secondary btn-compact" onClick={() => setDetail(r)}>
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="report-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="report-detail-top">
              <div className="report-detail-user">
                <div className="report-detail-avatar">
                  {(detail.name || 'S')
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <div className="report-detail-title-row">
                    <h3 className="report-detail-name">{detail.name}</h3>
                    <span className={`pill ${detail.status === 'Completed' ? 'success' : detail.status === 'In Progress' ? 'info' : 'neutral'}`}>
                      {detail.status}
                    </span>
                  </div>
                  <div className="report-detail-tags">
                    {detail.sifNumber && (
                      <span className="report-tag">
                        <Hash size={12} /> {detail.sifNumber}
                      </span>
                    )}
                    {detail.email && (
                      <span className="report-tag">
                        <Mail size={12} /> {detail.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDetail(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="report-detail-section-label">Academic Profile</div>
            <div className="report-detail-grid">
              <div className="report-detail-item">
                <div className="label"><GraduationCap size={13} /> Academic Year</div>
                <div className="value">{activeYear}</div>
              </div>
              <div className="report-detail-item">
                <div className="label"><Building2 size={13} /> Department</div>
                <div className="value">{detail.departmentName || 'Not Assigned'}</div>
              </div>
            </div>

            <div className="report-detail-section-label">Performance Metrics</div>
            <div className="report-detail-grid report-detail-grid-3">
              <div className="report-detail-item">
                <div className="label"><FileText size={13} /> Tests Done</div>
                <div className="value">{detail.completed} / {detail.totalTests}</div>
              </div>
              <div className="report-detail-item">
                <div className="label"><Award size={13} /> Avg Score</div>
                <div className="value" style={{ color: '#2563eb' }}>{detail.avgScore}%</div>
              </div>
              <div className="report-detail-item">
                <div className="label"><TrendingUp size={13} /> Progress</div>
                <div className="value" style={{ color: '#16a34a' }}>{detail.progress}%</div>
              </div>
            </div>

            <div className="report-detail-progress-section">
              <div className="report-detail-progress-head">
                <span className="report-progress-label">Overall Completion</span>
                <span className="report-progress-value">{detail.progress}%</span>
              </div>
              <div className="progress-track" style={{ height: 8 }}>
                <div className="progress-bar" style={{ width: `${Math.max(0, Math.min(100, detail.progress || 0))}%` }} />
              </div>
            </div>

            {detailResults.length > 0 && (
              <div className="report-detail-tests">
                <div className="report-detail-section-label">
                  Submissions ({detailResults.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                  {detailResults.map((tr, idx) => (
                    <div key={tr.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>{tr.testTitle || `Test #${idx + 1}`}</span>
                      <span style={{ color: '#2563eb', fontWeight: 700 }}>
                        {tr.score !== undefined ? `${tr.score} / ${tr.total || 100}` : 'Completed'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReports;
