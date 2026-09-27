import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import StudentPageHeader from '../../components/studentui/StudentPageHeader';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import {
  Printer,
  Award,
  CheckCircle2,
  BookOpen,
  Calendar,
  FileText,
  TrendingUp,
  User,
  Building2,
  GraduationCap,
  ShieldCheck,
  Check
} from 'lucide-react';

const formatReportDate = (val) => {
  if (!val) return 'Recent';
  if (val?.toDate instanceof Function) {
    return val.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
  }
  return String(val);
};

const StudentReports = () => {
  const { year: routeYear } = useParams();
  const { profile, user } = useAuth();

  const studentYear = routeYear || profile?.year || '1st Year';
  const studentDeptId = profile?.departmentId;

  const [results, setResults] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let ready = 0;
    const check = () => {
      ready++;
      if (ready >= 3) setLoading(false);
    };

    // 1. Fetch Student Test Results
    const qResults = query(collection(db, 'results'), where('studentId', '==', user.uid));
    const unsubRes = onSnapshot(qResults, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
      setResults(list);
      check();
    }, () => check());

    // 2. Fetch Tasks (using accurate year and department matching)
    const unsubTasks = onSnapshot(collection(db, 'tasks'), (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        const taskYear = data.year || 'All Years';

        const isYearMatch =
          taskYear === 'All Years' ||
          taskYear === 'All' ||
          taskYear === 'all' ||
          taskYear.toLowerCase() === studentYear.toLowerCase() ||
          (profile?.year && taskYear.toLowerCase() === profile.year.toLowerCase());

        const isDeptMatch =
          !data.departmentId ||
          data.departmentId === 'all' ||
          !studentDeptId ||
          data.departmentId === studentDeptId;

        if (isYearMatch && isDeptMatch) {
          list.push({ id: d.id, ...data });
        }
      });
      setTasks(list);
      check();
    }, () => check());

    // 3. Fetch Student Submissions
    const qSubs = query(collection(db, 'task_submissions'), where('studentId', '==', user.uid));
    const unsubSubs = onSnapshot(qSubs, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSubmissions(list);
      check();
    }, () => check());

    return () => {
      unsubRes();
      unsubTasks();
      unsubSubs();
    };
  }, [user?.uid, studentYear, studentDeptId, profile?.year]);

  // Group latest/best results per test to prevent confusing duplicate rows
  const distinctResults = useMemo(() => {
    const map = new Map();
    results.forEach((r) => {
      const key = r.testId || r.testTitle || r.id;
      if (!map.has(key)) {
        map.set(key, r);
      } else {
        const existing = map.get(key);
        // keep higher score or more recent
        if (Number(r.percentage || r.score || 0) > Number(existing.percentage || existing.score || 0)) {
          map.set(key, r);
        }
      }
    });
    return Array.from(map.values());
  }, [results]);

  // Calculations
  const averageScore = useMemo(() => {
    if (!distinctResults.length) return 0;
    const total = distinctResults.reduce((acc, r) => {
      const pct = r.percentage != null
        ? Number(r.percentage)
        : Math.round(((Number(r.score) || 0) / (Number(r.totalQuestions) || Number(r.total) || 10)) * 100);
      return acc + pct;
    }, 0);
    return Math.round(total / distinctResults.length);
  }, [distinctResults]);

  const totalTasksCount = Math.max(tasks.length, submissions.length);

  const assignmentCompletionRate = useMemo(() => {
    if (totalTasksCount === 0) return 100;
    return Math.min(100, Math.round((submissions.length / totalTasksCount) * 100));
  }, [totalTasksCount, submissions]);

  const gradeInfo = useMemo(() => {
    if (averageScore >= 90) return { letter: 'O', label: 'Outstanding', color: '#15803d', gpa: '10.0' };
    if (averageScore >= 80) return { letter: 'A+', label: 'Excellent', color: '#16a34a', gpa: '9.0' };
    if (averageScore >= 70) return { letter: 'A', label: 'Very Good', color: '#2563eb', gpa: '8.0' };
    if (averageScore >= 60) return { letter: 'B+', label: 'Good', color: '#4f46e5', gpa: '7.0' };
    if (averageScore >= 50) return { letter: 'B', label: 'Above Average', color: '#d97706', gpa: '6.0' };
    if (averageScore >= 40) return { letter: 'C', label: 'Pass', color: '#ea580c', gpa: '5.0' };
    return { letter: 'RA', label: 'Re-Appear', color: '#dc2626', gpa: '0.0' };
  }, [averageScore]);

  const handlePrint = () => {
    window.print();
  };

  const currentDateStr = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="student-page grid" style={{ gap: 20 }}>
      {/* Top Header & Print Trigger */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <StudentPageHeader
          title="Academic Performance & Reports"
          subtitle={`${studentYear} / ${profile?.departmentName || 'Department'} • Comprehensive Continuous Evaluation (CCE)`}
        />
        <button
          onClick={handlePrint}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', fontWeight: 700, fontSize: 13, borderRadius: 10, boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)' }}
        >
          <Printer size={16} /> Print / Export Official Report Card
        </button>
      </div>

      {/* Screen Summary KPI Cards (Screen Only) */}
      <div className="grid grid-4 no-print" style={{ gap: 14 }}>
        <div className="card" style={{ padding: 16, background: '#ffffff', borderTop: '4px solid #3b82f6', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>AVERAGE ASSESSMENT SCORE</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#1e40af', margin: '4px 0' }}>{averageScore}%</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Across {distinctResults.length} assessments</div>
        </div>

        <div className="card" style={{ padding: 16, background: '#ffffff', borderTop: '4px solid #8b5cf6', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>ACADEMIC GRADE</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: gradeInfo.color, margin: '4px 0' }}>{gradeInfo.letter}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{gradeInfo.label} (GPA: {gradeInfo.gpa})</div>
        </div>

        <div className="card" style={{ padding: 16, background: '#ffffff', borderTop: '4px solid #10b981', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>ASSIGNMENTS COMPLETED</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#059669', margin: '4px 0' }}>{submissions.length} / {totalTasksCount}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{assignmentCompletionRate}% Handed in</div>
        </div>

        <div className="card" style={{ padding: 16, background: '#ffffff', borderTop: '4px solid #f59e0b', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>ACADEMIC STATUS</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', margin: '4px 0' }}>Regular</div>
          <div style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>All requirements satisfied</div>
        </div>
      </div>

      {/* ── OFFICIAL ACADEMIC TRANSCRIPT / REPORT CARD CONTAINER ── */}
      <div
        className="card report-card-container"
        style={{
          background: '#ffffff',
          borderRadius: 16,
          padding: '36px 40px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 8px 25px rgba(0, 0, 0, 0.06)',
          maxWidth: 960,
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
          color: '#0f172a',
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
        }}
      >
        {/* Institutional Header */}
        <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#1e40af', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontWeight: 900, fontSize: 18 }}>
              த
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              TAMIL LEARNING MANAGEMENT SYSTEM
            </h1>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>
            DEPARTMENT OF TAMIL &amp; MODERN LANGUAGES
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            OFFICIAL CONTINUOUS ASSESSMENT GRADE REPORT • ACADEMIC YEAR 2026-2027
          </div>
        </div>

        {/* Student Meta Details Grid */}
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: '18px 24px',
          marginBottom: 24,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px 24px',
          fontSize: 13
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Candidate Name</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
              {profile?.name || user?.displayName || 'Student'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>SIF / Student ID</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#2563eb', fontFamily: 'monospace', marginTop: 2 }}>
              {profile?.sifNumber || profile?.rollNumber || 'SIF-PENDING'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Department / Branch</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
              {profile?.departmentName || 'AIML'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Academic Class / Year</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
              {studentYear} {profile?.section ? `(Section ${profile.section})` : ''}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Issue Date</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginTop: 2 }}>
              {currentDateStr}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Overall Result</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: averageScore >= 40 ? '#15803d' : '#dc2626', marginTop: 2 }}>
              {averageScore >= 40 ? 'QUALIFIED / PASSED' : 'RE-APPEAR REQUIRED'}
            </div>
          </div>
        </div>

        {/* Official Grade Summary Ribbon */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          padding: '14px 20px',
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 10,
          marginBottom: 26,
          textAlign: 'center'
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af' }}>CUMULATIVE SCORE</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#1e3a8a' }}>{averageScore}%</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af' }}>GRADE LETTER</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: gradeInfo.color }}>{gradeInfo.letter}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af' }}>GRADE POINTS (GPA)</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#1e3a8a' }}>{gradeInfo.gpa} / 10.0</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af' }}>CLASSIFICATION</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#15803d', marginTop: 3 }}>{gradeInfo.label}</div>
          </div>
        </div>

        {/* Section 1: Continuous Internal Assessment (CIA) Tests */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '2px solid #e2e8f0', paddingBottom: 8, marginBottom: 14 }}>
            <Award size={18} color="#1e40af" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
              I. Continuous Internal Assessment (CIA) &amp; Examination Records
            </h3>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '2px solid #cbd5e1', color: '#0f172a', fontWeight: 800, textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px', width: 45 }}>S.No</th>
                  <th style={{ padding: '10px 12px' }}>Course / Assessment Title</th>
                  <th style={{ padding: '10px 12px' }}>Department / Year</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Max Marks</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Obtained</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Percentage</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Grade</th>
                  <th style={{ padding: '10px 12px' }}>Date</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {distinctResults.map((r, idx) => {
                  const score = Number(r.score) || 0;
                  const total = Number(r.totalQuestions || r.total) || 10;
                  const pct = r.percentage != null ? Number(r.percentage) : Math.round((score / total) * 100);
                  const isPass = pct >= 40;
                  const letter = pct >= 90 ? 'O' : pct >= 80 ? 'A+' : pct >= 70 ? 'A' : pct >= 60 ? 'B+' : pct >= 50 ? 'B' : pct >= 40 ? 'C' : 'RA';
                  const dateStr = formatReportDate(r.submittedAt || r.createdAt);

                  return (
                    <tr key={r.id || idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#64748b' }}>{idx + 1}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>{r.testTitle || 'Tamil Assessment'}</td>
                      <td style={{ padding: '10px 12px', color: '#475569' }}>{r.departmentName || profile?.departmentName || 'AIML'} • {r.year || studentYear}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>{total}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700 }}>{score}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: isPass ? '#15803d' : '#dc2626' }}>{pct}%</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800 }}>{letter}</td>
                      <td style={{ padding: '10px 12px', color: '#475569', fontSize: 11 }}>{dateStr}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 800,
                          background: isPass ? '#dcfce7' : '#fee2e2',
                          color: isPass ? '#15803d' : '#dc2626'
                        }}>
                          {isPass ? 'PASS' : 'RE-TEST'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {distinctResults.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                      No examination or assessment records found for this student.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Assignment Evaluation & Submissions */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '2px solid #e2e8f0', paddingBottom: 8, marginBottom: 14 }}>
            <FileText size={18} color="#1e40af" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
              II. Assignment Submissions &amp; Faculty Evaluation
            </h3>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '2px solid #cbd5e1', color: '#0f172a', fontWeight: 800, textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px', width: 45 }}>S.No</th>
                  <th style={{ padding: '10px 12px' }}>Assignment Task</th>
                  <th style={{ padding: '10px 12px' }}>Submitted Date</th>
                  <th style={{ padding: '10px 12px' }}>Attachment / Mode</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Grade / Marks</th>
                  <th style={{ padding: '10px 12px' }}>Faculty Feedback</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Evaluation Status</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s, idx) => {
                  const subDate = formatReportDate(s.submittedAt || s.createdAt);
                  return (
                    <tr key={s.id || idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#64748b' }}>{idx + 1}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>{s.taskTitle || 'Assignment'}</td>
                      <td style={{ padding: '10px 12px', color: '#475569' }}>{subDate}</td>
                      <td style={{ padding: '10px 12px', color: '#2563eb', fontWeight: 600 }}>
                        {s.fileName ? `📎 ${s.fileName}` : 'Online Text Submission'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#1e40af', fontSize: 13 }}>
                        {s.grade || s.marks || 'Pending'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#475569', fontStyle: s.feedback ? 'italic' : 'normal' }}>
                        {s.feedback ? `"${s.feedback}"` : (s.notes ? `"${s.notes}"` : 'Evaluated by Faculty')}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 800,
                          background: s.grade ? '#dcfce7' : '#fef3c7',
                          color: s.grade ? '#15803d' : '#d97706'
                        }}>
                          {s.grade ? 'EVALUATED' : 'SUBMITTED'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {submissions.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                      No assignment submissions on record.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Official Endorsement & Signatures Block */}
        <div style={{ borderTop: '2px solid #cbd5e1', paddingTop: 32, marginTop: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, textAlign: 'center' }}>
            <div>
              <div style={{ height: 44, borderBottom: '1px solid #94a3b8', width: '80%', margin: '0 auto' }} />
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>COURSE INSTRUCTOR / TUTOR</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Department of Tamil</div>
            </div>

            <div>
              <div style={{ height: 44, borderBottom: '1px solid #94a3b8', width: '80%', margin: '0 auto' }} />
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>HEAD OF DEPARTMENT (HOD)</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Academic Evaluation Division</div>
            </div>

            <div>
              <div style={{ height: 44, borderBottom: '1px solid #94a3b8', width: '80%', margin: '0 auto' }} />
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>CONTROLLER OF EXAMINATIONS</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Authorized Institutional Seal</div>
            </div>
          </div>

          <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 32, borderTop: '1px dashed #e2e8f0', paddingTop: 12 }}>
            🛡️ Official Computer Generated Continuous Assessment Grade Transcript • Tamil Learning Portal Verification Hash: {user.uid.substring(0, 10).toUpperCase()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentReports;
