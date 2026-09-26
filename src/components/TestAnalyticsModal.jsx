import React, { useMemo } from 'react';
import { Award, CheckCircle, XCircle, BarChart3, Users, Clock, HelpCircle, FileText } from 'lucide-react';

const TestAnalyticsModal = ({ open, test, results = [], students = [], onClose }) => {
  if (!open || !test) return null;

  const testResults = useMemo(() => {
    return results.filter((r) => r.testId === test.id || r.testTitle === test.title);
  }, [results, test]);

  const stats = useMemo(() => {
    if (testResults.length === 0) {
      return {
        totalAttempts: 0,
        averageScore: 0,
        passCount: 0,
        failCount: 0,
        passPercentage: 0,
        highestScore: 0,
        lowestScore: 0,
        rankList: [],
      };
    }

    const passMark = Number(test.passMark || 40);
    let totalScorePercent = 0;
    let passCount = 0;
    let highest = 0;
    let lowest = 100;

    const formatted = testResults.map((r) => {
      const score = Number(r.score) || 0;
      const total = Number(r.total) || (test.questions?.length ? test.questions.length : 100);
      const percentage = total > 0 ? Math.round((score / total) * 100) : score;

      if (percentage >= passMark) passCount++;
      if (percentage > highest) highest = percentage;
      if (percentage < lowest) lowest = percentage;
      totalScorePercent += percentage;

      return {
        ...r,
        calculatedScore: score,
        calculatedTotal: total,
        percentage,
        isPassed: percentage >= passMark,
      };
    });

    // Rank list sorted by percentage descending
    formatted.sort((a, b) => b.percentage - a.percentage);

    return {
      totalAttempts: testResults.length,
      averageScore: Math.round(totalScorePercent / testResults.length),
      passCount,
      failCount: testResults.length - passCount,
      passPercentage: Math.round((passCount / testResults.length) * 100),
      highestScore: highest,
      lowestScore: lowest === 100 && testResults.length === 0 ? 0 : lowest,
      rankList: formatted,
    };
  }, [testResults, test]);

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <div>
            <span className="pill info" style={{ fontSize: 11, marginBottom: 4, fontWeight: 700 }}>Assessment Analytics</span>
            <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#0f172a' }}>{test.title}</h3>
            <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: 12 }}>
              {test.subject || test.departmentName || 'Tamil'} • {test.year || 'All Years'} • Unit {test.unitNumber || 1}
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Top KPIs */}
          <div className="grid grid-4" style={{ gap: 10 }}>
            <div className="card" style={{ padding: 12, background: '#f8fafc' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>ATTEMPTS</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{stats.totalAttempts}</div>
            </div>
            <div className="card" style={{ padding: 12, background: '#f8fafc' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>AVG SCORE</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-primary)' }}>{stats.averageScore}%</div>
            </div>
            <div className="card" style={{ padding: 12, background: '#f8fafc' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>PASS RATE</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#059669' }}>{stats.passPercentage}%</div>
            </div>
            <div className="card" style={{ padding: 12, background: '#f8fafc' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>HIGHEST SCORE</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#d97706' }}>{stats.highestScore}%</div>
            </div>
          </div>

          {/* Rank List Table */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Student Rank List & Performance</h4>
            <span style={{ fontSize: 12, color: '#64748b' }}>Pass Mark: {test.passMark || 40}%</span>
          </div>

          <div className="table-scroll" style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>Rank</th>
                  <th>Student Name</th>
                  <th>Roll / SIF</th>
                  <th>Score</th>
                  <th>Percentage</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.rankList.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td>
                      {idx === 0 ? (
                        <span style={{ color: '#d97706', fontWeight: 800 }}>🥇 1</span>
                      ) : idx === 1 ? (
                        <span style={{ color: '#94a3b8', fontWeight: 800 }}>🥈 2</span>
                      ) : idx === 2 ? (
                        <span style={{ color: '#b45309', fontWeight: 800 }}>🥉 3</span>
                      ) : (
                        `#${idx + 1}`
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{item.studentName || 'Student'}</td>
                    <td style={{ fontSize: 12, fontFamily: 'monospace', color: '#64748b' }}>
                      {item.rollNo || item.sifNumber || item.studentEmail || '-'}
                    </td>
                    <td>{item.calculatedScore} / {item.calculatedTotal}</td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{item.percentage}%</div>
                    </td>
                    <td>
                      {item.isPassed ? (
                        <span className="pill success" style={{ fontSize: 11 }}>Pass</span>
                      ) : (
                        <span className="pill" style={{ fontSize: 11, background: '#fee2e2', color: '#dc2626' }}>Fail</span>
                      )}
                    </td>
                  </tr>
                ))}
                {stats.rankList.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                      No student submission records found for this assessment yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default TestAnalyticsModal;
