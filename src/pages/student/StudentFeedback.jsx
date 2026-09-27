import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import StudentPageHeader from '../../components/studentui/StudentPageHeader';
import StudentContentCard from '../../components/studentui/StudentContentCard';
import EmptyState from '../../components/EmptyState';
import Loader from '../../components/Loader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import {
  MessageSquare,
  Send,
  HelpCircle,
  AlertCircle,
  CheckCircle2,
  Clock,
  User,
  ShieldCheck,
  LifeBuoy
} from 'lucide-react';

const CATEGORIES = [
  { id: 'academic', label: 'Academic Question / Doubt' },
  { id: 'technical', label: 'Technical / App Issue' },
  { id: 'general', label: 'General Feedback' },
  { id: 'query', label: 'Course / Department Query' }
];

const StudentFeedback = () => {
  const { year } = useParams();
  const { profile, user } = useAuth();

  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Form State
  const [category, setCategory] = useState('academic');
  const [subject, setSubject] = useState('');
  const [queryText, setQueryText] = useState('');

  useEffect(() => {
    const studentUid = user?.uid || profile?.id || profile?.uid;
    const studentEmail = profile?.email || user?.email;
    const sifNumber = profile?.sifNumber || profile?.rollNumber || profile?.registerNumber;

    if (!studentUid && !studentEmail && !sifNumber) {
      setLoading(false);
      return;
    }

    setLoading(true);
    // Listen to real-time feedback updates and match by student identity
    const unsub = onSnapshot(collection(db, 'feedback'), (snap) => {
      const allFeedback = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const myFeedback = allFeedback.filter((f) => {
        if (studentUid && (f.studentId === studentUid || f.userId === studentUid)) return true;
        if (studentEmail && f.email && String(f.email).toLowerCase() === String(studentEmail).toLowerCase()) return true;
        if (sifNumber && (f.sifNumber === sifNumber || f.studentRoll === sifNumber)) return true;
        if (f.studentName && profile?.name && String(f.studentName).toLowerCase() === String(profile.name).toLowerCase() && f.year === (year || profile?.year)) return true;
        return false;
      });

      myFeedback.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
        return timeB - timeA;
      });

      setQueries(myFeedback);
      setLoading(false);
    }, (err) => {
      console.warn('Feedback listener err:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user?.uid, profile?.id, profile?.uid, profile?.email, profile?.sifNumber, profile?.name, year, profile?.year]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanSubject = subject.trim();
    const cleanMessage = queryText.trim();

    if (!cleanSubject || !cleanMessage) {
      setError('Please provide a subject title and message content.');
      return;
    }

    const currentStudentId = user?.uid || profile?.id || profile?.uid || '';
    const currentSif = profile?.sifNumber || profile?.rollNumber || profile?.registerNumber || '';
    const currentName = profile?.name || 'Student';
    const currentEmail = profile?.email || user?.email || '';
    const currentYear = year || profile?.year || '1st Year';
    const currentDeptId = profile?.departmentId || 'all';
    const currentDeptName = profile?.departmentName || 'Tamil';
    const currentSection = profile?.section || 'A';

    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        studentId: currentStudentId,
        userId: currentStudentId,
        studentName: currentName,
        email: currentEmail,
        sifNumber: currentSif,
        studentRoll: currentSif,
        year: currentYear,
        departmentId: currentDeptId,
        departmentName: currentDeptName,
        section: currentSection,
        category: category || 'academic',
        subject: cleanSubject,
        message: cleanMessage,
        status: 'open',
        adminReply: '',
        studentRead: true,
        createdAt: serverTimestamp(),
        timestamp: new Date().toISOString()
      };

      // Strip any undefined keys
      Object.keys(payload).forEach((k) => {
        if (payload[k] === undefined) delete payload[k];
      });

      const notifPayload = {
        title: `💬 New Feedback from ${currentName}`,
        body: `"${cleanSubject}": ${cleanMessage.substring(0, 80)}`,
        type: 'feedback',
        category: 'feedback',
        priority: 'normal',
        recipientRole: 'admin',
        targetScope: 'admin',
        studentId: currentStudentId,
        studentName: currentName,
        read: false,
        isRead: false,
        status: 'pending',
        createdAt: serverTimestamp(),
        timestamp: new Date().toISOString()
      };
      Object.keys(notifPayload).forEach((k) => {
        if (notifPayload[k] === undefined) delete notifPayload[k];
      });

      await addDoc(collection(db, 'feedback'), payload);
      addDoc(collection(db, 'notifications'), notifPayload).catch(() => {});

      setSubject('');
      setQueryText('');
      setMessage('Your query has been submitted successfully to the faculty / administration!');
    } catch (err) {
      console.error('Feedback submit error:', err);
      setError(err?.message || 'Failed to submit feedback. Please check your network and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="student-page grid" style={{ gap: 16 }}>
      <StudentPageHeader
        title="Student Support & Feedback"
        subtitle={`${year} / Ask Academic Doubts, Report Technical Issues, or Share Feedback`}
      />

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="grid grid-2" style={{ gap: 16 }}>
        {/* Left Column: Submit New Query */}
        <StudentContentCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <LifeBuoy size={20} style={{ color: 'var(--color-primary)' }} />
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Submit New Query / Feedback</h3>
          </div>

          <form onSubmit={handleSubmit} className="grid" style={{ gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--color-text)' }}>
                Category
              </label>
              <select
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ width: '100%' }}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--color-text)' }}>
                Subject / Title
              </label>
              <Input
                placeholder="e.g., Clarification in Unit 3 Grammar rule"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--color-text)' }}>
                Detailed Question or Issue
              </label>
              <textarea
                className="input"
                rows={5}
                placeholder="Describe your question, doubt, or issue in detail..."
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                required
              />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}
            >
              <Send size={16} /> {submitting ? 'Submitting...' : 'Submit to Admin'}
            </Button>
          </form>
        </StudentContentCard>

        {/* Right Column: Query History & Replies */}
        <div>
          <h3 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 700 }}>Your Query History & Replies</h3>

          {loading ? (
            <Loader />
          ) : queries.length > 0 ? (
            <div className="grid" style={{ gap: 12 }}>
              {queries.map((q) => {
                const replyContent = q.adminReply || q.reply || q.adminResponse || q.response || q.solution;
                const hasReply = Boolean(replyContent && String(replyContent).trim());
                const isResolved = q.status === 'resolved';
                const isInProgress = q.status === 'in_progress' || (hasReply && !isResolved);
                const timeStr = q.createdAt?.toDate ? q.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Recent';

                return (
                  <StudentContentCard key={q.id} style={{ borderLeft: isResolved ? '4px solid var(--color-success)' : (isInProgress ? '4px solid var(--color-warning)' : '4px solid var(--color-primary)') }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span className="badge badge-secondary" style={{ fontSize: 11, textTransform: 'capitalize' }}>
                        {q.category || 'General'}
                      </span>
                      <span
                        className="badge"
                        style={{
                          fontSize: 11,
                          background: isResolved ? 'rgba(34, 197, 94, 0.12)' : (isInProgress ? 'rgba(234, 179, 8, 0.12)' : 'rgba(59, 130, 246, 0.12)'),
                          color: isResolved ? 'var(--color-success)' : (isInProgress ? 'var(--color-warning)' : 'var(--color-primary)')
                        }}
                      >
                        {isResolved ? 'Resolved' : (isInProgress ? 'In Progress' : 'Pending')}
                      </span>
                    </div>

                    <h4 style={{ margin: '8px 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
                      {q.subject || q.title}
                    </h4>

                    <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                      {q.message}
                    </p>

                    {/* Admin Response */}
                    {hasReply ? (
                      <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(34, 197, 94, 0.06)', borderRadius: 8, border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                          <CheckCircle2 size={14} /> Teacher / Admin Reply:
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--color-text)', whiteSpace: 'pre-wrap', lineHeight: 1.5, fontWeight: 500 }}>
                          {replyContent}
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} /> Awaiting response from faculty
                      </div>
                    )}
                  </StudentContentCard>
                );
              })}
            </div>
          ) : (
            <EmptyState
              message="You haven't submitted any queries yet. Use the form on the left to reach out."
              icon={<MessageSquare size={36} />}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentFeedback;
