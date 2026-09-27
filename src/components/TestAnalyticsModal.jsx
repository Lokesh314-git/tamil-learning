import React, { useMemo, useState } from 'react';
import { Award, CheckCircle, XCircle, BarChart3, Users, Clock, HelpCircle, FileText, Search, UserX, UserCheck, Sparkles } from 'lucide-react';
import Modal from './ui/Modal';

const formatDateSafe = (val, fallback = 'Recent') => {
  if (!val) return fallback;
  if (typeof val?.toDate === 'function') {
    try {
      return val.toDate().toLocaleString();
    } catch {
      return fallback;
    }
  }
  if (val?.seconds) {
    try {
      return new Date(val.seconds * 1000).toLocaleString();
    } catch {
      return fallback;
    }
  }
  if (typeof val === 'string' || typeof val === 'number') {
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toLocaleString();
      return String(val);
    } catch {
      return fallback;
    }
  }
  return fallback;
};

const TestAnalyticsModal = ({ open, test, results = [], students = [], onClose }) => {
  const [activeTab, setActiveTab] = useState('attended'); // 'attended' | 'not_attended'
  const [searchQuery, setSearchQuery] = useState('');

  // Filter results for this specific test with resilient multi-key matching
  const testResults = useMemo(() => {
    if (!test) return [];
    const testIdStr = String(test.id || '');
    const testTitleNorm = String(test.title || '').trim().toLowerCase();

    return (results || []).filter((r) => {
      if (!r) return false;
      const matchId = (r.testId && String(r.testId) === testIdStr) ||
        (r.assessmentId && String(r.assessmentId) === testIdStr) ||
        (r.id && String(r.id) === testIdStr);

      const rTitleNorm = String(r.testTitle || r.title || '').trim().toLowerCase();
      const matchTitle = Boolean(testTitleNorm && rTitleNorm && testTitleNorm === rTitleNorm);

      return matchId || matchTitle;
    });
  }, [results, test]);

  // Find eligible students based on test's year and department
  const eligibleStudents = useMemo(() => {
    if (!test) return [];
    const testYear = test.year || 'All Years';
    const testDeptId = test.departmentId || 'all';

    return (students || []).filter((s) => {
      if (!s || s.isDeleted || s.status === 'deleted') return false;

      // Check year match
      const yearOk =
        testYear === 'All Years' ||
        testYear === 'All' ||
        testYear === 'all' ||
        (s.year && s.year.toLowerCase() === testYear.toLowerCase());

      // Check department match
      const deptOk =
        !testDeptId ||
        testDeptId === 'all' ||
        s.departmentId === testDeptId;

      return yearOk && deptOk;
    });
  }, [students, test]);

  // Compute analytics and rank list
  const stats = useMemo(() => {
    if (!test) {
      return {
        totalAttempts: 0,
        eligibleCount: 0,
        averageScore: 0,
        passCount: 0,
        failCount: 0,
        passPercentage: 0,
        highestScore: 0,
        lowestScore: 0,
        rankList: [],
        notAttendedList: [],
      };
    }

    const passMark = Number(test.passMark || 40);
    const totalQuestions = Number(test.totalQuestions || test.questions?.length || 100);

    let totalScorePercent = 0;
    let passCount = 0;
    let highest = 0;
    let lowest = 100;

    const attendedStudentKeys = new Set();

    // Deduplicate and group results by unique student (keep best/latest score per student)
    const studentBestAttemptsMap = new Map();

    (testResults || []).forEach((r) => {
      // Find matching student profile if available
      const matchedStudent = (students || []).find(
        (s) => (s.uid && s.uid === r.studentId) || (s.id && s.id === r.studentId) || (s.sifNumber && s.sifNumber === r.sifNumber)
      );

      const studentKey = r.studentId || matchedStudent?.uid || matchedStudent?.id || r.sifNumber || matchedStudent?.sifNumber || r.email || r.studentName;
      if (!studentKey) return;

      const score = Number(r.score) || 0;
      const total = Number(r.total || r.totalQuestions) || totalQuestions;
      const percentage = total > 0 ? Math.round((score / total) * 100) : score;

      const attemptObj = {
        ...r,
        studentName: r.studentName || matchedStudent?.name || 'Student',
        sifNumber: r.sifNumber || matchedStudent?.sifNumber || '',
        rollNumber: r.rollNo || r.rollNumber || matchedStudent?.rollNumber || '',
        departmentName: r.departmentName || matchedStudent?.departmentName || test.departmentName || 'General',
        calculatedScore: score,
        calculatedTotal: total,
        percentage,
        isPassed: percentage >= passMark,
        timeTakenMinutes: r.timeTakenMinutes || r.timeTaken || 0,
        submittedDate: formatDateSafe(r.submittedAt, 'Recent'),
        attemptsCount: Number(r.attemptsCount) || 1,
      };

      if (!studentBestAttemptsMap.has(studentKey)) {
        studentBestAttemptsMap.set(studentKey, attemptObj);
      } else {
        const existing = studentBestAttemptsMap.get(studentKey);
        // Keep the higher percentage / score, or more recent
        if (percentage > existing.percentage || (percentage === existing.percentage && score >= existing.calculatedScore)) {
          studentBestAttemptsMap.set(studentKey, {
            ...attemptObj,
            attemptsCount: Math.max(existing.attemptsCount + 1, attemptObj.attemptsCount),
          });
        } else {
          existing.attemptsCount = Math.max(existing.attemptsCount + 1, attemptObj.attemptsCount);
        }
      }
    });

    const uniqueRankList = Array.from(studentBestAttemptsMap.values());

    // Compute stats across distinct students
    uniqueRankList.forEach((item) => {
      if (item.studentId) attendedStudentKeys.add(item.studentId);
      if (item.sifNumber) attendedStudentKeys.add(item.sifNumber);
      if (item.email) attendedStudentKeys.add(item.email);

      if (item.isPassed) passCount++;
      if (item.percentage > highest) highest = item.percentage;
      if (item.percentage < lowest) lowest = item.percentage;
      totalScorePercent += item.percentage;
    });

    // Rank list sorted by percentage descending, then by score descending
    uniqueRankList.sort((a, b) => {
      if (b.percentage !== a.percentage) return b.percentage - a.percentage;
      return b.calculatedScore - a.calculatedScore;
    });

    // Find not-attended eligible students
    const notAttended = (eligibleStudents || []).filter((s) => {
      return !attendedStudentKeys.has(s.uid) && !attendedStudentKeys.has(s.id) && !attendedStudentKeys.has(s.sifNumber) && !attendedStudentKeys.has(s.email);
    });

    const totalAttended = uniqueRankList.length;

    return {
      totalAttempts: totalAttended,
      eligibleCount: eligibleStudents.length,
      averageScore: totalAttended > 0 ? Math.round(totalScorePercent / totalAttended) : 0,
      passCount,
      failCount: totalAttended - passCount,
      passPercentage: totalAttended > 0 ? Math.round((passCount / totalAttended) * 100) : 0,
      highestScore: totalAttended > 0 ? highest : 0,
      lowestScore: totalAttended > 0 ? lowest : 0,
      rankList: uniqueRankList,
      notAttendedList: notAttended,
    };
  }, [testResults, test, students, eligibleStudents]);

  const filteredRankList = useMemo(() => {
    if (!searchQuery.trim()) return stats.rankList;
    const q = searchQuery.toLowerCase();
    return stats.rankList.filter(
      (item) =>
        (item.studentName || '').toLowerCase().includes(q) ||
        (item.sifNumber || '').toLowerCase().includes(q) ||
        (item.rollNumber || '').toLowerCase().includes(q) ||
        (item.departmentName || '').toLowerCase().includes(q)
    );
  }, [stats.rankList, searchQuery]);

  const filteredNotAttendedList = useMemo(() => {
    if (!searchQuery.trim()) return stats.notAttendedList;
    const q = searchQuery.toLowerCase();
    return stats.notAttendedList.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.sifNumber || '').toLowerCase().includes(q) ||
        (s.rollNumber || '').toLowerCase().includes(q) ||
        (s.departmentName || '').toLowerCase().includes(q)
    );
  }, [stats.notAttendedList, searchQuery]);

  if (!test) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Online Test Rank & Analytics"
      subtitle={`${test.title} • ${test.subject || test.departmentName || 'Tamil'} • ${test.year || 'All Years'} • Unit ${test.unitNumber || 1} • ${test.questions?.length || 0} Questions`}
      icon={Award}
      iconVariant="primary"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            Pass Threshold: {test.passMark || 40}% • Total Questions: {test.questions?.length || 0}
          </span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      }
    >
      {/* Top KPIs */}
      <div className="grid grid-4" style={{ gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <UserCheck size={15} color="#0284c7" /> ATTENDED
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
            {stats.totalAttempts} <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>/ {stats.eligibleCount} Enrolled</span>
          </div>
        </div>

        <div className="card" style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <BarChart3 size={15} color="#6366f1" /> AVG SCORE
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-primary)', marginTop: 4 }}>
            {stats.averageScore}%
          </div>
        </div>

        <div className="card" style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle size={15} color="#059669" /> PASS RATE
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#059669', marginTop: 4 }}>
            {stats.passPercentage}% <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>({stats.passCount} passed)</span>
          </div>
        </div>

        <div className="card" style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Award size={15} color="#d97706" /> TOP SCORE
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#d97706', marginTop: 4 }}>
            {stats.highestScore}%
          </div>
        </div>
      </div>

      {/* Navigation Tabs and Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div className="tab-row" style={{ margin: 0 }}>
          <button
            type="button"
            className={'tab-btn ' + (activeTab === 'attended' ? 'active' : '')}
            onClick={() => setActiveTab('attended')}
          >
            Attended &amp; Ranks ({stats.rankList.length})
          </button>
          <button
            type="button"
            className={'tab-btn ' + (activeTab === 'not_attended' ? 'active' : '')}
            onClick={() => setActiveTab('not_attended')}
          >
            Not Attended ({stats.notAttendedList.length})
          </button>
        </div>

        <div style={{ position: 'relative', width: 240 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            className="input"
            style={{ paddingLeft: 30, fontSize: 12, height: 36 }}
            placeholder="Search student or SIF..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tab 1: Attended Students & Ranks */}
      {activeTab === 'attended' && (
        <div className="table-scroll" style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 65 }}>Rank</th>
                <th>Student Name</th>
                <th>SIF / Roll No</th>
                <th>Class / Dept</th>
                <th>Score</th>
                <th>Percentage</th>
                <th>Status</th>
                <th>Submitted At</th>
              </tr>
            </thead>
            <tbody>
              {filteredRankList.map((item, idx) => (
                <tr key={item.id || idx}>
                  <td>
                    {idx === 0 ? (
                      <span style={{ color: '#d97706', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        🥇 #1
                      </span>
                    ) : idx === 1 ? (
                      <span style={{ color: '#64748b', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        🥈 #2
                      </span>
                    ) : idx === 2 ? (
                      <span style={{ color: '#b45309', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        🥉 #3
                      </span>
                    ) : (
                      <span style={{ fontWeight: 700, color: '#475569' }}>#{idx + 1}</span>
                    )}
                  </td>
                  <td style={{ fontWeight: 600, color: '#0f172a' }}>{item.studentName}</td>
                  <td style={{ fontSize: 12, fontFamily: 'monospace', color: '#2563eb', fontWeight: 600 }}>
                    {item.sifNumber || item.rollNumber || item.email || '-'}
                  </td>
                  <td style={{ fontSize: 12, color: '#64748b' }}>{item.departmentName}</td>
                  <td style={{ fontWeight: 600 }}>
                    {item.calculatedScore} / {item.calculatedTotal}
                  </td>
                  <td>
                    <div style={{ fontWeight: 800, color: item.percentage >= (test.passMark || 40) ? '#059669' : '#dc2626' }}>
                      {item.percentage}%
                    </div>
                  </td>
                  <td>
                    {item.isPassed ? (
                      <span className="pill success" style={{ fontSize: 11, padding: '2px 8px' }}>Passed</span>
                    ) : (
                      <span className="pill" style={{ fontSize: 11, background: '#fee2e2', color: '#dc2626', padding: '2px 8px' }}>Failed</span>
                    )}
                  </td>
                  <td style={{ fontSize: 11, color: '#64748b' }}>
                    {item.submittedDate}
                  </td>
                </tr>
              ))}
              {filteredRankList.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 28, color: '#94a3b8' }}>
                    No students have submitted this assessment yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Not Attended Students */}
      {activeTab === 'not_attended' && (
        <div className="table-scroll" style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Student Name</th>
                <th>SIF Number</th>
                <th>Roll Number</th>
                <th>Class / Department</th>
                <th>Year</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredNotAttendedList.map((student, idx) => (
                <tr key={student.uid || student.id || idx}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{student.name}</td>
                  <td style={{ fontSize: 12, fontFamily: 'monospace', color: '#2563eb', fontWeight: 600 }}>
                    {student.sifNumber || '-'}
                  </td>
                  <td style={{ fontSize: 12, fontFamily: 'monospace', color: '#64748b' }}>
                    {student.rollNumber || '-'}
                  </td>
                  <td>{student.departmentName || '-'}</td>
                  <td><span className="pill info" style={{ fontSize: 11 }}>{student.year || test.year}</span></td>
                  <td>
                    <span className="pill warn" style={{ fontSize: 11, background: '#fef3c7', color: '#d97706' }}>
                      Not Attempted
                    </span>
                  </td>
                </tr>
              ))}
              {filteredNotAttendedList.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 28, color: '#059669', fontWeight: 600 }}>
                    🎉 All eligible students have attended this test!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
};

export default TestAnalyticsModal;
