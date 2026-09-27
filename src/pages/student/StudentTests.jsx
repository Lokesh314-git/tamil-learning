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
import { studentMongoApi } from '../../services/studentMongoApi';
import StudentPageHeader from '../../components/studentui/StudentPageHeader';
import EmptyState from '../../components/EmptyState';
import Loader from '../../components/Loader';
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle,
  Award,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Eye,
  AlertCircle,
  BookOpen,
  ClipboardList,
  Check,
  X
} from 'lucide-react';

const StudentTests = () => {
  const { year } = useParams();
  const { profile, user } = useAuth();

  const [tests, setTests] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('available'); // 'available' | 'completed'

  // Test Taking Engine State
  const [takingTest, setTakingTest] = useState(null);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(0);
  const [submittingTest, setSubmittingTest] = useState(false);

  // Review Modal State
  const [reviewResult, setReviewResult] = useState(null);

  useEffect(() => {
    const studentYear = year || profile?.year || '1st Year';
    const studentDeptId = profile?.departmentId;

    setLoading(true);
    let ready = 0;
    const check = () => {
      ready++;
      if (ready >= 2) setLoading(false);
    };

    // 1. Fetch Tests (Filtered strictly by Student's Year & Department)
    const unsubTests = onSnapshot(collection(db, 'tests'), (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        const testYear = data.year || 'All Years';

        // Check Year: 'All Years' / 'all' or matches student's year
        const isYearMatch =
          testYear === 'All Years' ||
          testYear === 'All' ||
          testYear === 'all' ||
          testYear.toLowerCase() === studentYear.toLowerCase() ||
          (profile?.year && testYear.toLowerCase() === profile.year.toLowerCase());

        // Check Department / Class
        const isDeptMatch =
          !data.departmentId ||
          data.departmentId === 'all' ||
          !studentDeptId ||
          data.departmentId === studentDeptId;

        if (isYearMatch && isDeptMatch) {
          list.push({ id: d.id, ...data });
        }
      });
      setTests(list);
      check();
    }, () => check());

    // 2. Fetch Student's Completed Test Results
    const qResults = query(collection(db, 'results'), where('studentId', '==', user?.uid));
    const unsubResults = onSnapshot(qResults, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
      setResults(list);
      check();
    }, () => check());

    return () => {
      unsubTests();
      unsubResults();
    };
  }, [year, profile?.departmentId, profile?.year, user?.uid]);

  const attemptsByTestId = useMemo(() => {
    const map = {};
    results.forEach((r) => {
      if (r.testId && (!map[r.testId] || r.percentage > map[r.testId].percentage)) {
        map[r.testId] = r;
      }
    });
    return map;
  }, [results]);

  // Timer Countdown Handler
  useEffect(() => {
    if (!takingTest || timeLeftSeconds <= 0) return;

    const timer = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleFinishTest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [takingTest, timeLeftSeconds]);

  const startTest = (test) => {
    const duration = Number(test.durationMinutes || test.duration) || (test.questions?.length || 10);
    setTakingTest(test);
    setCurrentQIndex(0);
    setSelectedAnswers({});
    setTimeLeftSeconds(duration * 60);
  };

  const handleAnswerSelect = (qIdx, optIdx) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [qIdx]: optIdx,
    }));
  };

  const handleFinishTest = async () => {
    if (!takingTest || submittingTest) return;
    setSubmittingTest(true);
    try {
      const durationSeconds = (Number(takingTest.durationMinutes || takingTest.duration) || (takingTest.questions?.length || 10)) * 60;
      const elapsedMinutes = Math.max(0, Math.round((durationSeconds - timeLeftSeconds) / 60));
      const result = await studentMongoApi.submitTest({
        testId: takingTest.id,
        testData: takingTest,
        answers: selectedAnswers,
        timeTakenMinutes: elapsedMinutes,
      });
      setReviewResult(result);
      setTakingTest(null);
    } catch (err) {
      console.error('Failed to submit test:', err);
    } finally {
      setSubmittingTest(false);
    }
  };

  const formatTimer = (totalSecs) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="student-page grid" style={{ gap: 18 }}>
      <StudentPageHeader
        title="Online Assessments"
        subtitle={`${year || profile?.year || 'Your Year'} / ${profile?.departmentName || 'Department'} • Interactive Exams & Quizzes`}
      />

      {/* Tabs */}
      {!takingTest && (
        <div className="card" style={{ padding: '10px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className={'tab-btn ' + (activeTab === 'available' ? 'active' : '')}
            onClick={() => setActiveTab('available')}
            style={{ padding: '6px 16px', fontSize: 13 }}
          >
            Available Tests ({tests.length})
          </button>
          <button
            className={'tab-btn ' + (activeTab === 'completed' ? 'active' : '')}
            onClick={() => setActiveTab('completed')}
            style={{ padding: '6px 16px', fontSize: 13 }}
          >
            Completed Tests &amp; History ({results.length})
          </button>
        </div>
      )}

      {/* Test Taking Engine View */}
      {takingTest && (
        <div
          className="card"
          style={{
            background: '#ffffff',
            borderRadius: 16,
            padding: 24,
            border: '2px solid var(--color-primary)',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'
          }}
        >
          {/* Header & Timer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 16, marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <span className="pill info" style={{ fontSize: 11, fontWeight: 700 }}>
                {takingTest.subject || takingTest.departmentName || 'Tamil'}
              </span>
              <h2 style={{ margin: '6px 0 0', fontSize: 19, fontWeight: 800, color: '#0f172a' }}>{takingTest.title}</h2>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: timeLeftSeconds < 120 ? '#fee2e2' : '#eff6ff',
              color: timeLeftSeconds < 120 ? '#dc2626' : '#2563eb',
              padding: '8px 16px',
              borderRadius: 12,
              fontWeight: 800,
              fontSize: 16,
              border: timeLeftSeconds < 120 ? '1px solid #fca5a5' : '1px solid #bfdbfe'
            }}>
              <Clock size={18} />
              <span>Time Remaining: {formatTimer(timeLeftSeconds)}</span>
            </div>
          </div>

          {/* Question Bubbles */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {(takingTest.questions || []).map((_, idx) => {
              const answered = selectedAnswers[idx] !== undefined;
              const isCurrent = currentQIndex === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentQIndex(idx)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    border: isCurrent ? '2px solid var(--color-primary)' : '1px solid #cbd5e1',
                    background: answered ? 'var(--color-primary)' : (isCurrent ? '#eff6ff' : '#f8fafc'),
                    color: answered ? '#ffffff' : '#0f172a',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Question Card */}
          {takingTest.questions && takingTest.questions[currentQIndex] ? (
            <div style={{ background: '#f8fafc', padding: 20, borderRadius: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8, fontWeight: 700 }}>
                QUESTION {currentQIndex + 1} OF {takingTest.questions.length}
              </div>

              <h3 style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.5, marginBottom: 20, color: '#0f172a' }}>
                {takingTest.questions[currentQIndex].question || takingTest.questions[currentQIndex].questionText}
              </h3>

              {/* Options */}
              <div className="grid" style={{ gap: 12, marginBottom: 24 }}>
                {(takingTest.questions[currentQIndex].options || []).map((opt, optIdx) => {
                  const isSelected = selectedAnswers[currentQIndex] === optIdx;
                  const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F'];

                  return (
                    <div
                      key={optIdx}
                      onClick={() => handleAnswerSelect(currentQIndex, optIdx)}
                      style={{
                        padding: '14px 18px',
                        borderRadius: 12,
                        border: isSelected ? '2px solid var(--color-primary)' : '1px solid #cbd5e1',
                        background: isSelected ? '#eff6ff' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? '0 0 0 1px var(--color-primary)' : '0 1px 3px rgba(0,0,0,0.04)'
                      }}
                    >
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: isSelected ? 'var(--color-primary)' : '#f1f5f9',
                        color: isSelected ? '#ffffff' : '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: 13
                      }}>
                        {optionLetters[optIdx] || optIdx + 1}
                      </div>
                      <span style={{ fontSize: 15, fontWeight: isSelected ? 700 : 500, color: isSelected ? '#1e40af' : '#0f172a' }}>
                        {opt}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Navigation Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: 18, flexWrap: 'wrap', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCurrentQIndex((prev) => Math.max(0, prev - 1))}
                  disabled={currentQIndex === 0}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <ChevronLeft size={16} /> Previous Question
                </button>

                {currentQIndex < (takingTest.questions.length - 1) ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setCurrentQIndex((prev) => prev + 1)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <span>Next Question</span>
                    <ChevronRight size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleFinishTest}
                    disabled={submittingTest}
                    style={{ background: '#059669', borderColor: '#059669', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800 }}
                  >
                    <CheckCircle2 size={16} />
                    <span>{submittingTest ? 'Submitting...' : 'Submit Assessment'}</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div>No questions found in this test.</div>
          )}
        </div>
      )}

      {/* Styled Review Result Modal */}
      {reviewResult && (
        <div
          className="modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setReviewResult(null); }}
        >
          <div
            className="modal"
            style={{
              maxWidth: 720,
              width: '95%',
              background: '#ffffff',
              borderRadius: 18,
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div className="modal-header" style={{ padding: '16px 24px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="pill info" style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Assessment Result</span>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                  {reviewResult.testTitle || 'Test Review'}
                </h3>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setReviewResult(null)}
                style={{ borderRadius: '50%', width: 32, height: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body" style={{ padding: '24px', background: '#ffffff', maxHeight: '72vh', overflowY: 'auto' }}>
              {/* Score Hero Banner */}
              <div style={{
                textAlign: 'center',
                padding: '20px 16px',
                background: reviewResult.percentage >= 40 ? '#f0fdf4' : '#fef2f2',
                borderRadius: 14,
                border: reviewResult.percentage >= 40 ? '1px solid #bbf7d0' : '1px solid #fecaca',
                marginBottom: 20
              }}>
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  background: reviewResult.percentage >= 40 ? '#dcfce7' : '#fee2e2',
                  color: reviewResult.percentage >= 40 ? '#15803d' : '#dc2626',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 8
                }}>
                  <Award size={30} />
                </div>
                <h2 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 900, color: reviewResult.percentage >= 40 ? '#15803d' : '#dc2626' }}>
                  Test Score: {reviewResult.percentage}%
                </h2>
                <p style={{ margin: 0, color: '#475569', fontSize: 14, fontWeight: 600 }}>
                  You answered {reviewResult.score} out of {reviewResult.totalQuestions || reviewResult.total || 0} questions correctly!
                </p>
              </div>

              {/* Questions Breakdown */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  Detailed Answer Review
                </h3>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  Total Questions: {reviewResult.breakdown?.length || 0}
                </span>
              </div>

              <div className="grid" style={{ gap: 12 }}>
                {(reviewResult.breakdown || []).map((b, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '14px 18px',
                      borderRadius: 12,
                      border: b.isCorrect ? '1px solid #bbf7d0' : '1px solid #fecaca',
                      borderLeft: b.isCorrect ? '5px solid #10b981' : '5px solid #ef4444',
                      background: b.isCorrect ? '#f0fdf4' : '#fff5f5'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#0f172a' }}>
                      <span style={{ marginTop: 2, flexShrink: 0 }}>
                        {b.isCorrect ? <CheckCircle2 size={18} color="#10b981" /> : <XCircle size={18} color="#ef4444" />}
                      </span>
                      <span>Q{idx + 1}: {b.question}</span>
                    </div>

                    <div style={{ fontSize: 13, margin: '4px 0', color: b.isCorrect ? '#15803d' : '#b91c1c' }}>
                      Your Answer: <strong>{b.options?.[b.studentChoice] || (b.studentChoice >= 0 ? `Option ${b.studentChoice + 1}` : 'Not answered')}</strong>
                    </div>

                    {!b.isCorrect && (
                      <div style={{ fontSize: 13, color: '#15803d', marginTop: 4, background: '#dcfce7', padding: '6px 10px', borderRadius: 8, width: 'fit-content' }}>
                        Correct Answer: <strong>{b.options?.[b.correctAnswer] || `Option ${b.correctAnswer + 1}`}</strong>
                      </div>
                    )}

                    {b.explanation && (
                      <div style={{ fontSize: 12, color: '#475569', marginTop: 8, fontStyle: 'italic', background: '#f8fafc', padding: '6px 10px', borderRadius: 8 }}>
                        💡 Explanation: {b.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="modal-footer" style={{ padding: '14px 24px', background: '#ffffff', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setReviewResult(null)}
                style={{ padding: '8px 24px', fontWeight: 700 }}
              >
                Close Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Available Tests List */}
      {!takingTest && activeTab === 'available' && (
        <div>
          {loading ? (
            <Loader />
          ) : tests.length > 0 ? (
            <div className="grid grid-2" style={{ gap: 16 }}>
              {tests.map((t) => {
                const prevAttempt = attemptsByTestId[t.id];
                const unitText = t.unitNumber ? `Unit ${t.unitNumber}` : 'Assessment';
                const questionsCount = t.questions?.length || 10;
                const duration = t.durationMinutes || t.duration || 20;

                return (
                  <div
                    key={t.id}
                    className="card"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      background: '#ffffff',
                      borderRadius: 14,
                      padding: 20,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                      borderTop: prevAttempt ? '4px solid #10b981' : '4px solid var(--color-primary)'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <span className="pill info" style={{ fontSize: 11, fontWeight: 700 }}>{unitText}</span>
                          <span className="pill info" style={{ fontSize: 11, background: '#f1f5f9', color: '#475569' }}>{t.subject || t.departmentName || 'Tamil'}</span>
                        </div>
                        {prevAttempt && (
                          <span className="pill success" style={{ fontSize: 11, fontWeight: 800 }}>
                            Score: {prevAttempt.percentage}%
                          </span>
                        )}
                      </div>

                      <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                        {t.title}
                      </h3>

                      <p style={{ fontSize: 13, color: '#475569', margin: '0 0 14px', lineHeight: 1.5 }}>
                        {t.description || 'Complete this online multiple choice test to evaluate your understanding.'}
                      </p>

                      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#64748b', marginBottom: 14, flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={14} /> {duration} Mins
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <HelpCircle size={14} /> {questionsCount} Questions
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Award size={14} /> Pass Mark: {t.passMark || 40}%
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => startTest(t)}
                        style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700 }}
                      >
                        <Play size={15} /> {prevAttempt ? 'Retake Test' : 'Start Assessment'}
                      </button>
                      {prevAttempt && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setReviewResult(prevAttempt)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <Eye size={15} /> Review
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState message="No online tests available for your current syllabus." icon={<ClipboardList size={36} />} />
          )}
        </div>
      )}

      {/* Completed Tests List */}
      {!takingTest && activeTab === 'completed' && (
        <div>
          {results.length > 0 ? (
            <div className="grid grid-2" style={{ gap: 16 }}>
              {results.map((r) => (
                <div
                  key={r.id}
                  className="card"
                  style={{
                    background: '#ffffff',
                    borderRadius: 14,
                    padding: 20,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                    borderTop: r.percentage >= 40 ? '4px solid #10b981' : '4px solid #ef4444'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span className="pill info" style={{ fontSize: 11, fontWeight: 700 }}>{r.testTitle}</span>
                    <span
                      className="pill"
                      style={{
                        fontSize: 12,
                        fontWeight: 900,
                        background: r.percentage >= 40 ? '#dcfce7' : '#fee2e2',
                        color: r.percentage >= 40 ? '#15803d' : '#dc2626'
                      }}
                    >
                      {r.percentage}% {r.percentage >= 40 ? 'PASSED' : 'FAILED'}
                    </span>
                  </div>

                  <div style={{ fontSize: 14, fontWeight: 700, margin: '8px 0 4px', color: '#0f172a' }}>
                    Score: {r.score} / {r.totalQuestions || r.total || 10} Correct
                  </div>

                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
                    Submitted: {r.submittedAt?.toDate ? r.submittedAt.toDate().toLocaleString() : (r.submittedAt || 'Recently')}
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setReviewResult(r)}
                    style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600 }}
                  >
                    <Eye size={15} /> View Detailed Answer Key &amp; Explanations
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="You haven't completed any tests yet. Click 'Available Tests' to start." icon={<Award size={36} />} />
          )}
        </div>
      )}
    </div>
  );
};

export default StudentTests;
