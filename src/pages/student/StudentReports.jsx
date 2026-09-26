import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import StudentPageHeader from '../../components/studentui/StudentPageHeader';
import StudentContentCard from '../../components/studentui/StudentContentCard';
import StudentStatCard from '../../components/studentui/StudentStatCard';
import EmptyState from '../../components/EmptyState';
import Loader from '../../components/Loader';
import Button from '../../components/ui/Button';
import {
  BarChart3,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  FileText,
  Printer,
  TrendingUp,
  Download,
  Layers,
  Sparkles
} from 'lucide-react';

const StudentReports = () => {
  const { year } = useParams();
  const { profile, user } = useAuth();

  const [results, setResults] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid || !year) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let ready = 0;
    const check = () => {
      ready++;
      if (ready >= 3) setLoading(false);
    };

    // 1. Fetch test results
    const qResults = query(
      collection(db, 'results'),
      where('studentId', '==', user.uid),
      where('year', '==', year)
    );
    const unsubRes = onSnapshot(qResults, (snap) => {
      setResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    }, () => check());

    // 2. Fetch tasks
    const qTasks = query(collection(db, 'tasks'), where('year', '==', year));
    const unsubTasks = onSnapshot(qTasks, (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    }, () => check());

    // 3. Fetch submissions
    const qSubs = query(collection(db, 'task_submissions'), where('studentId', '==', user.uid));
    const unsubSubs = onSnapshot(qSubs, (snap) => {
      setSubmissions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    }, () => check());

    return () => {
      unsubRes();
      unsubTasks();
      unsubSubs();
    };
  }, [user?.uid, year]);

  // Calculations
  const averageScore = useMemo(() => {
    if (!results.length) return 0;
    const total = results.reduce((acc, r) => acc + (Number(r.percentage) || (Number(r.score) / (Number(r.totalQuestions) || 10)) * 100 || 0), 0);
    return Math.round(total / results.length);
  }, [results]);

  const assignmentCompletionRate = useMemo(() => {
    if (!tasks.length) return 100;
    return Math.round((submissions.length / tasks.length) * 100);
  }, [tasks, submissions]);

  const gradeLetter = useMemo(() => {
    if (averageScore >= 90) return 'O (Outstanding)';
    if (averageScore >= 80) return 'A+ (Excellent)';
    if (averageScore >= 70) return 'A (Very Good)';
    if (averageScore >= 60) return 'B+ (Good)';
    if (averageScore >= 50) return 'B (Above Average)';
    return 'RA (Re-Appear)';
  }, [averageScore]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="student-page grid" style={{ gap: 16 }}>
      <StudentPageHeader
        title="Academic Performance & Reports"
        subtitle={`${year} / ${profile?.departmentName || 'Department'} • Transcripts & Continuous Assessment`}
      />

      {/* Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Printer size={16} /> Print / Export Report Card
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-4" style={{ gap: 14 }}>
        <StudentStatCard
          icon={<Award size={20} />}
          title="Average Assessment Score"
          value={`${averageScore}%`}
          subtitle={`Across ${results.length} tests`}
          tone="primary"
        />
        <StudentStatCard
          icon={<TrendingUp size={20} />}
          title="Academic Grade"
          value={gradeLetter.split(' ')[0]}
          subtitle={gradeLetter}
          tone="accent"
        />
        <StudentStatCard
          icon={<CheckCircle2 size={20} />}
          title="Assignments Handed"
          value={`${submissions.length}/${tasks.length}`}
          subtitle={`${assignmentCompletionRate}% Completed`}
          tone="secondary"
        />
        <StudentStatCard
          icon={<BookOpen size={20} />}
          title="Semester Status"
          value="Regular"
          subtitle="All prerequisites met"
          tone="neutral"
        />
      </div>

      {/* Assessments Breakdown Table */}
      <StudentContentCard>
        <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>
          Continuous Internal Assessment (CIA) Records
        </h3>

        {loading ? (
          <Loader />
        ) : results.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)' }}>
                  <th style={{ padding: '10px 12px' }}>Test Title</th>
                  <th style={{ padding: '10px 12px' }}>Department / Year</th>
                  <th style={{ padding: '10px 12px' }}>Score</th>
                  <th style={{ padding: '10px 12px' }}>Percentage</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const pct = r.percentage != null ? r.percentage : Math.round(((r.score || 0) / (r.totalQuestions || 10)) * 100);
                  const isPass = pct >= 50;
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{r.testTitle}</td>
                      <td style={{ padding: '12px', color: 'var(--color-text-muted)' }}>{r.year}</td>
                      <td style={{ padding: '12px' }}>{r.score} / {r.totalQuestions || r.total || 10}</td>
                      <td style={{ padding: '12px', fontWeight: 700, color: isPass ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {pct}%
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span className={`badge ${isPass ? 'badge-primary' : 'badge-danger'}`} style={{ background: isPass ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)', color: isPass ? 'var(--color-success)' : 'var(--color-danger)' }}>
                          {isPass ? 'Pass' : 'Re-test'}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: 'var(--color-text-muted)' }}>
                        {r.submittedAt?.toDate ? r.submittedAt.toDate().toLocaleDateString() : 'N/A'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="No assessment scores recorded yet." icon={<BarChart3 size={32} />} />
        )}
      </StudentContentCard>

      {/* Assignment Scores Breakdown Table */}
      <StudentContentCard>
        <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>
          Assignment Evaluation & Faculty Feedback
        </h3>

        {submissions.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)' }}>
                  <th style={{ padding: '10px 12px' }}>Assignment</th>
                  <th style={{ padding: '10px 12px' }}>Submitted Date</th>
                  <th style={{ padding: '10px 12px' }}>Grade / Marks</th>
                  <th style={{ padding: '10px 12px' }}>Faculty Feedback</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{s.taskTitle}</td>
                    <td style={{ padding: '12px', color: 'var(--color-text-muted)' }}>
                      {s.submittedAt?.toDate ? s.submittedAt.toDate().toLocaleDateString() : 'Recent'}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {s.marks || s.grade || 'Under Review'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--color-text)', fontStyle: s.feedback ? 'normal' : 'italic' }}>
                      {s.feedback || 'Awaiting teacher evaluation'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="No assignment submissions evaluated yet." icon={<FileText size={32} />} />
        )}
      </StudentContentCard>
    </div>
  );
};

export default StudentReports;
