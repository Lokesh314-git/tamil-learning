import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { openOrDownloadFile, uploadFileToStorage } from '../../utils/fileUpload';
import StudentPageHeader from '../../components/studentui/StudentPageHeader';
import StudentContentCard from '../../components/studentui/StudentContentCard';
import StatusBadge from '../../components/studentui/StatusBadge';
import EmptyState from '../../components/EmptyState';
import Loader from '../../components/Loader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import {
  ListTodo,
  FileText,
  Upload,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  AlertCircle,
  Award,
  MessageSquare,
  FileCheck,
  Send,
  Sparkles
} from 'lucide-react';

const StudentTasks = () => {
  const { year } = useParams();
  const { profile, user } = useAuth();

  const [tasks, setTasks] = useState([]);
  const [submissions, setSubmissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'pending' | 'submitted'

  // Submission Modal State
  const [activeTaskModal, setActiveTaskModal] = useState(null);
  const [submissionFile, setSubmissionFile] = useState(null);
  const [submissionText, setSubmissionText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!year || !user?.uid || !profile?.departmentId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let ready = 0;
    const check = () => {
      ready++;
      if (ready >= 2) setLoading(false);
    };

    // 1. Listen to tasks
    const qTasks = query(collection(db, 'tasks'), where('year', '==', year));
    const unsubTasks = onSnapshot(qTasks, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        if (!data.departmentId || data.departmentId === 'all' || data.departmentId === profile.departmentId) {
          list.push({ id: d.id, ...data });
        }
      });
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
      setTasks(list);
      check();
    }, () => check());

    // 2. Listen to student's task submissions
    const qSubs = query(collection(db, 'task_submissions'), where('studentId', '==', user.uid));
    const unsubSubs = onSnapshot(qSubs, (snap) => {
      const byTaskId = {};
      snap.forEach((d) => {
        const data = d.data();
        if (data.taskId) byTaskId[data.taskId] = { id: d.id, ...data };
      });
      setSubmissions(byTaskId);
      check();
    }, () => check());

    return () => {
      unsubTasks();
      unsubSubs();
    };
  }, [year, profile?.departmentId, user?.uid]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const isSubmitted = !!submissions[t.id];
      if (filterStatus === 'pending') return !isSubmitted;
      if (filterStatus === 'submitted') return isSubmitted;
      return true;
    });
  }, [tasks, submissions, filterStatus]);

  const handleOpenSubmissionModal = (task) => {
    setActiveTaskModal(task);
    const existing = submissions[task.id];
    setSubmissionText(existing?.notes || existing?.comment || '');
    setSubmissionFile(null);
    setUploadError('');
    setUploadSuccess('');
  };

  const handleSubmitAssignment = async (e) => {
    e.preventDefault();
    if (!activeTaskModal || !user?.uid) return;

    setSubmitting(true);
    setUploadError('');
    setUploadSuccess('');

    try {
      let fileMeta = null;

      // Upload file to MongoDB GridFS if selected
      if (submissionFile) {
        fileMeta = await uploadFileToStorage(submissionFile, {
          title: `${profile?.name || 'Student'}_${activeTaskModal.title}`,
          subject: activeTaskModal.subject || 'Tamil',
          year: year || '1st Year',
          category: 'assignment_submission',
          studentId: user.uid,
          taskId: activeTaskModal.id
        });
      }

      const existing = submissions[activeTaskModal.id];
      const payload = {
        taskId: activeTaskModal.id,
        taskTitle: activeTaskModal.title || 'Assignment',
        studentId: user.uid,
        studentName: profile?.name || 'Student',
        email: profile?.email || '',
        year: year || profile?.year || '1st Year',
        departmentId: profile?.departmentId || '',
        departmentName: profile?.departmentName || 'Tamil',
        status: 'submitted',
        notes: submissionText.trim(),
        fileUrl: fileMeta?.downloadUrl || fileMeta?.fileUrl || existing?.fileUrl || '',
        fileId: fileMeta?.fileId || existing?.fileId || '',
        fileName: fileMeta?.fileName || submissionFile?.name || existing?.fileName || '',
        fileSize: fileMeta?.fileSize || submissionFile?.size || existing?.fileSize || 0,
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (existing?.id) {
        await setDoc(doc(db, 'task_submissions', existing.id), payload, { merge: true });
      } else {
        await addDoc(collection(db, 'task_submissions'), payload);
      }

      // Also mirror to legacy taskSubmissions collection
      await addDoc(collection(db, 'taskSubmissions'), payload);

      setUploadSuccess('Assignment submitted successfully to your faculty!');
      setTimeout(() => {
        setActiveTaskModal(null);
      }, 1200);
    } catch (err) {
      setUploadError(err.message || 'Failed to submit assignment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="student-page grid" style={{ gap: 16 }}>
      <StudentPageHeader
        title="Assignments & Tasks"
        subtitle={`${year} / ${profile?.departmentName || 'Department'} • Submissions & Teacher Feedback`}
      />

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
        <button
          className={`button ${filterStatus === 'all' ? 'primary' : 'secondary'}`}
          onClick={() => setFilterStatus('all')}
          style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8 }}
        >
          All Tasks ({tasks.length})
        </button>
        <button
          className={`button ${filterStatus === 'pending' ? 'primary' : 'secondary'}`}
          onClick={() => setFilterStatus('pending')}
          style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8 }}
        >
          Pending Submission ({tasks.filter((t) => !submissions[t.id]).length})
        </button>
        <button
          className={`button ${filterStatus === 'submitted' ? 'primary' : 'secondary'}`}
          onClick={() => setFilterStatus('submitted')}
          style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8 }}
        >
          Submitted & Graded ({Object.keys(submissions).length})
        </button>
      </div>

      {/* Task List */}
      {loading ? (
        <Loader />
      ) : filteredTasks.length > 0 ? (
        <div className="grid grid-2" style={{ gap: 16 }}>
          {filteredTasks.map((t) => {
            const sub = submissions[t.id];
            const isSubmitted = !!sub;
            const isGraded = sub?.grade || sub?.marks || sub?.feedback;

            return (
              <StudentContentCard key={t.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span className="badge badge-secondary">{t.subject || 'Tamil'}</span>
                    <span
                      className="badge"
                      style={{
                        background: isGraded ? 'rgba(16, 185, 129, 0.12)' : (isSubmitted ? 'rgba(59, 130, 246, 0.12)' : 'rgba(234, 179, 8, 0.12)'),
                        color: isGraded ? 'var(--color-success)' : (isSubmitted ? 'var(--color-primary)' : 'var(--color-warning)')
                      }}
                    >
                      {isGraded ? `Graded: ${sub.marks || sub.grade}` : (isSubmitted ? 'Submitted' : 'Pending')}
                    </span>
                  </div>

                  <h3 style={{ margin: '10px 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
                    {t.title}
                  </h3>

                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
                    {t.description}
                  </p>

                  <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12, flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={14} /> Due: <strong>{t.dueDate || 'No deadline'}</strong>
                    </span>
                    {t.totalMarks && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Award size={14} /> Max Marks: <strong>{t.totalMarks}</strong>
                      </span>
                    )}
                  </div>

                  {/* Teacher's Attachment */}
                  {t.fileLink && (
                    <div style={{ padding: '8px 12px', background: 'var(--color-bg-secondary)', borderRadius: 8, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-primary)', fontWeight: 500 }}>
                        <FileText size={14} /> {t.fileName || 'Assignment_Brief.pdf'}
                      </span>
                      <button
                        className="button secondary"
                        onClick={() => openOrDownloadFile(t.fileLink, t.fileName || `${t.title}.pdf`, t.fileId || t.id)}
                        style={{ padding: '2px 8px', fontSize: 11 }}
                      >
                        <Eye size={12} style={{ marginRight: 4 }} /> View Brief
                      </button>
                    </div>
                  )}

                  {/* Teacher Feedback if graded */}
                  {sub?.feedback && (
                    <div style={{ padding: '10px 12px', background: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: 8, marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-success)', marginBottom: 2 }}>
                        Teacher Feedback:
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--color-text)', fontStyle: 'italic' }}>
                        "{sub.feedback}"
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                  <Button
                    onClick={() => handleOpenSubmissionModal(t)}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <Upload size={15} /> {isSubmitted ? 'Resubmit / Edit Submission' : 'Submit Assignment'}
                  </Button>
                </div>
              </StudentContentCard>
            );
          })}
        </div>
      ) : (
        <EmptyState
          message="No assignments matching this filter."
          icon={<ListTodo size={36} />}
        />
      )}

      {/* Submission Modal */}
      {activeTaskModal && (
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
            maxWidth: 550,
            width: '100%',
            padding: 24,
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800 }}>
              Submit: {activeTaskModal.title}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-text-muted)' }}>
              Subject: {activeTaskModal.subject || 'Tamil'} • Due: {activeTaskModal.dueDate || 'N/A'}
            </p>

            {uploadSuccess && <div className="alert success">{uploadSuccess}</div>}
            {uploadError && <div className="alert error">{uploadError}</div>}

            <form onSubmit={handleSubmitAssignment} className="grid" style={{ gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Upload Document / PDF (Stored in MongoDB GridFS)
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => setSubmissionFile(e.target.files?.[0] || null)}
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  className="input"
                  style={{ width: '100%' }}
                />
                {submissionFile && (
                  <div style={{ fontSize: 12, color: 'var(--color-primary)', marginTop: 4, fontWeight: 600 }}>
                    Selected: {submissionFile.name} ({(submissionFile.size / 1024).toFixed(0)} KB)
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Submission Notes / Text Answer
                </label>
                <textarea
                  className="input"
                  rows={4}
                  placeholder="Type your notes, commentary, or links here..."
                  value={submissionText}
                  onChange={(e) => setSubmissionText(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setActiveTaskModal(null)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Send size={15} /> {submitting ? 'Uploading to MongoDB...' : 'Confirm Submission'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentTasks;
