import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, functions } from '../../firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../context/AuthContext';
import StudentPageHeader from '../../components/studentui/StudentPageHeader';
import StudentContentCard from '../../components/studentui/StudentContentCard';
import EmptyState from '../../components/EmptyState';
import Loader from '../../components/Loader';
import Button from '../../components/ui/Button';
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Award,
  Play,
  RotateCcw,
  Eye,
  Check,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  BookOpen
} from 'lucide-react';

const StudentTests = () => {
  const { year } = useParams();
  const { profile, user } = useAuth();

  const [tests, setTests] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('available'); // 'available' | 'completed'

  // Test Runner State
  const [takingTest, setTakingTest] = useState(null);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(0);
  const [submittingTest, setSubmittingTest] = useState(false);

  // Review Modal State
  const [reviewResult, setReviewResult] = useState(null);

  useEffect(() => {
    const syncPublishedTests = httpsCallable(functions, 'syncPublishedStudentTests');
    syncPublishedTests().catch((err) => console.error('Unable to sync available tests:', err));
  }, []);

  useEffect(() => {
    if (!year || !profile?.departmentId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let ready = 0;
    const check = () => {
      ready++;
      if (ready >= 2) setLoading(false);
    };

    // 1. Fetch Tests
    const qTests = query(collection(db, 'publishedTests'), where('year', '==', year));
    const unsubTests = onSnapshot(qTests, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        if (!data.departmentId || data.departmentId === 'all' || data.departmentId === profile.departmentId) {
          list.push({ id: d.id, ...data });
        }
      });
      setTests(list);
      check();
    }, () => check());

    // 2. Fetch Student Results
    const qResults = query(collection(db, 'results'), where('studentId', '==', user?.uid), where('year', '==', year));
    const unsubResults = onSnapshot(qResults, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const timeA = a.submittedAt?.toDate ? a.submittedAt.toDate().getTime() : 0;
        const timeB = b.submittedAt?.toDate ? b.submittedAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
      setResults(list);
      check();
    }, () => check());

    return () => {
      unsubTests();
      unsubResults();
    };
  }, [year, profile?.departmentId, user?.uid]);

  // Test Countdown Timer
  useEffect(() => {
    if (!takingTest || timeLeftSeconds <= 0) return;
    const interval = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleFinishTest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [takingTest, timeLeftSeconds]);

  const attemptsByTestId = useMemo(() => {
    const map = {};
    results.forEach((r) => {
      if (r.testId) map[r.testId] = r;
    });
    return map;
  }, [results]);

  const startTest = (test) => {
    setTakingTest(test);
    setCurrentQIndex(0);
    setSelectedAnswers({});
    const durationValue = Number(test.durationMinutes || test.duration);
    const duration = durationValue > 0 ? durationValue * 60 : (test.questions?.length || 10) * 60;
    setTimeLeftSeconds(duration);
  };

  const handleAnswerSelect = (qIndex, optionIndex) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [qIndex]: optionIndex
    }));
  };

  const handleFinishTest = async () => {
    if (!takingTest || submittingTest) return;
    setSubmittingTest(true);
    try {
      const submitResult = httpsCallable(functions, 'submitStudentTestResult');
      const durationSeconds = (Number(takingTest.durationMinutes || takingTest.duration) || (takingTest.questions?.length || 10)) * 60;
      const elapsedMinutes = Math.max(0, Math.round((durationSeconds - timeLeftSeconds) / 60));
      const response = await submitResult({
        testId: takingTest.id,
        answers: selectedAnswers,
        timeTakenMinutes: elapsedMinutes,
      });
      const result = response.data;
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
    <div className="student-page grid" style={{ gap: 16 }}>
      <StudentPageHeader
        title="Online Assessments"
        subtitle={`${year} / ${profile?.departmentName || 'Department'} • Interactive Exams & Quizzes`}
      />

      {/* Tabs */}
      {!takingTest && (
        <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
          <button
            className={`button ${activeTab === 'available' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('available')}
            style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8 }}
          >
            Available Tests ({tests.length})
          </button>
          <button
            className={`button ${activeTab === 'completed' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('completed')}
            style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8 }}
          >
            Completed Tests & History ({results.length})
          </button>
        </div>
      )}

      {/* Test Taking Engine Modal / Full Screen View */}
      {takingTest && (
        <StudentContentCard style={{ padding: '24px', border: '2px solid var(--color-primary)' }}>
          {/* Header & Timer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: 14, marginBottom: 18 }}>
            <div>
              <span className="badge badge-primary">{takingTest.subject || 'Tamil'}</span>
              <h2 style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 800 }}>{takingTest.title}</h2>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: timeLeftSeconds < 120 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)',
              color: timeLeftSeconds < 120 ? 'var(--color-danger)' : 'var(--color-primary)',
              padding: '8px 14px',
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 16
            }}>
              <Clock size={18} />
              <span>Time Left: {formatTimer(timeLeftSeconds)}</span>
            </div>
          </div>

          {/* Question Bubbles */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
            {(takingTest.questions || []).map((_, idx) => {
              const answered = selectedAnswers[idx] !== undefined;
              const isCurrent = currentQIndex === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentQIndex(idx)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    border: isCurrent ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: answered ? 'var(--color-primary)' : (isCurrent ? 'rgba(59, 130, 246, 0.1)' : 'var(--color-bg-secondary)'),
                    color: answered ? '#fff' : 'var(--color-text)',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Question Card */}
          {takingTest.questions && takingTest.questions[currentQIndex] ? (
            <div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 6, fontWeight: 600 }}>
                Question {currentQIndex + 1} of {takingTest.questions.length}
              </div>

              <h3 style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.5, marginBottom: 18 }}>
                {takingTest.questions[currentQIndex].question}
              </h3>

              {/* Options */}
              <div className="grid" style={{ gap: 10, marginBottom: 24 }}>
                {(takingTest.questions[currentQIndex].options || []).map((opt, optIdx) => {
                  const isSelected = selectedAnswers[currentQIndex] === optIdx;
                  return (
                    <div
                      key={optIdx}
                      onClick={() => handleAnswerSelect(currentQIndex, optIdx)}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 10,
                        border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'var(--color-bg-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        border: isSelected ? '6px solid var(--color-primary)' : '2px solid #94a3b8',
                        background: '#fff'
                      }} />
                      <span style={{ fontSize: 14, fontWeight: isSelected ? 600 : 400 }}>{opt}</span>
                    </div>
                  );
                })}
              </div>

              {/* Navigation Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
                <Button
                  variant="secondary"
                  onClick={() => setCurrentQIndex((prev) => Math.max(0, prev - 1))}
                  disabled={currentQIndex === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <ChevronLeft size={16} /> Previous
                </Button>

                {currentQIndex < (takingTest.questions.length - 1) ? (
                  <Button
                    onClick={() => setCurrentQIndex((prev) => prev + 1)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    Next Question <ChevronRight size={16} />
                  </Button>
                ) : (
                  <Button
                    onClick={handleFinishTest}
                    disabled={submittingTest}
                    style={{ background: 'var(--color-success)', borderColor: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <CheckCircle2 size={16} /> {submittingTest ? 'Submitting...' : 'Submit Assessment'}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div>No questions found in this test.</div>
          )}
        </StudentContentCard>
      )}

      {/* Review Result Modal */}
      {reviewResult && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16
        }}>
          <div style={{
            background: 'var(--color-bg-card)',
            borderRadius: 16,
            maxWidth: 750,
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: 24,
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)'
          }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                background: reviewResult.percentage >= 50 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                color: reviewResult.percentage >= 50 ? 'var(--color-success)' : 'var(--color-danger)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10
              }}>
                <Award size={32} />
              </div>
              <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800 }}>Test Score: {reviewResult.percentage}%</h2>
              <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: 14 }}>
                You scored {reviewResult.score} out of {reviewResult.totalQuestions} questions correctly!
              </p>
            </div>

            {/* Questions Breakdown */}
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '16px 0 12px' }}>Detailed Answer Review</h3>
            <div className="grid" style={{ gap: 12 }}>
              {(reviewResult.breakdown || []).map((b, idx) => (
                <div key={idx} style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  borderLeft: b.isCorrect ? '4px solid var(--color-success)' : '4px solid var(--color-danger)',
                  background: 'var(--color-bg-secondary)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                    {b.isCorrect ? <CheckCircle2 size={16} color="var(--color-success)" /> : <XCircle size={16} color="var(--color-danger)" />}
                    <span>Q{idx + 1}: {b.question}</span>
                  </div>

                  <div style={{ fontSize: 13, margin: '4px 0', color: b.isCorrect ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    Your Answer: <strong>{b.options[b.studentChoice] || 'Not answered'}</strong>
                  </div>

                  {!b.isCorrect && (
                    <div style={{ fontSize: 13, color: 'var(--color-success)', marginBottom: 4 }}>
                      Correct Answer: <strong>{b.options[b.correctAnswer]}</strong>
                    </div>
                  )}

                  {b.explanation && (
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6, fontStyle: 'italic' }}>
                      Explanation: {b.explanation}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <Button onClick={() => setReviewResult(null)} style={{ padding: '8px 24px' }}>
                Close Review
              </Button>
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
                  <StudentContentCard key={t.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <span className="badge badge-primary">{unitText}</span>
                          <span className="badge badge-secondary">{t.subject || 'Tamil'}</span>
                        </div>
                        {prevAttempt && (
                          <span className="badge" style={{ background: 'rgba(34, 197, 94, 0.12)', color: 'var(--color-success)', fontWeight: 700 }}>
                            Score: {prevAttempt.percentage}%
                          </span>
                        )}
                      </div>

                      <h3 style={{ margin: '12px 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
                        {t.title}
                      </h3>

                      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
                        {t.description || 'Complete this online multiple choice test to evaluate your understanding.'}
                      </p>

                      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 14, flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={14} /> {duration} Mins
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <HelpCircle size={14} /> {questionsCount} Questions
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Award size={14} /> {t.totalMarks || 100} Marks
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                      <Button
                        onClick={() => startTest(t)}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        <Play size={15} /> {prevAttempt ? 'Retake Test' : 'Start Assessment'}
                      </Button>
                      {prevAttempt && (
                        <Button
                          variant="secondary"
                          onClick={() => setReviewResult(prevAttempt)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <Eye size={15} /> Review
                        </Button>
                      )}
                    </div>
                  </StudentContentCard>
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
                <StudentContentCard key={r.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="badge badge-primary">{r.testTitle}</span>
                    <span className="badge" style={{ background: r.percentage >= 50 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)', color: r.percentage >= 50 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 800 }}>
                      {r.percentage}%
                    </span>
                  </div>

                  <div style={{ fontSize: 14, fontWeight: 600, margin: '10px 0 4px' }}>
                    Score: {r.score} / {r.totalQuestions || r.total || 10} Correct
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
                    Submitted: {r.submittedAt?.toDate ? r.submittedAt.toDate().toLocaleString() : 'Recently'}
                  </div>

                  <Button variant="secondary" onClick={() => setReviewResult(r)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Eye size={15} /> View Detailed Answer Key & Explanations
                  </Button>
                </StudentContentCard>
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
