import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  addDoc,
  where
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { openOrDownloadFile, uploadFileToStorage } from '../../utils/fileUpload';
import StudentPageHeader from '../../components/studentui/StudentPageHeader';
import StudentContentCard from '../../components/studentui/StudentContentCard';
import StatusBadge from '../../components/studentui/StatusBadge';
import EmptyState from '../../components/EmptyState';
import Loader from '../../components/Loader';
import Button from '../../components/ui/Button';
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
  Sparkles,
  ExternalLink,
  X,
  UploadCloud
} from 'lucide-react';

const StudentTasks = () => {
  const { year: routeYear } = useParams();
  const { profile, user } = useAuth();

  const studentYear = routeYear || profile?.year || '1st Year';
  const studentDeptId = profile?.departmentId;

  const [tasks, setTasks] = useState([]);
  const [submissions, setSubmissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'pending' | 'submitted'

  // Submission Modal State
  const [activeTaskModal, setActiveTaskModal] = useState(null);
  const [submissionFile, setSubmissionFile] = useState(null);
  const [submissionText, setSubmissionText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let ready = 0;
    const check = () => {
      ready++;
      if (ready >= 2) setLoading(false);
    };

    // 1. Listen to all tasks and filter client-side for year & department
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

      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });

      setTasks(list);
      check();
    }, (err) => {
      console.warn('Tasks listener error:', err);
      check();
    });

    // 2. Listen to student's submissions
    const qSubs = query(collection(db, 'task_submissions'), where('studentId', '==', user.uid));
    const unsubSubs = onSnapshot(qSubs, (snap) => {
      const byTaskId = {};
      snap.forEach((d) => {
        const data = d.data();
        if (data.taskId) {
          byTaskId[data.taskId] = { id: d.id, ...data };
        }
      });
      setSubmissions(byTaskId);
      check();
    }, (err) => {
      console.warn('Task submissions listener error:', err);
      check();
    });

    return () => {
      unsubTasks();
      unsubSubs();
    };
  }, [studentYear, studentDeptId, user?.uid, profile?.year]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const isSubmitted = Boolean(submissions[t.id]);
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
    setUploadProgress(0);
    setUploadError('');
    setUploadSuccess('');
  };

  const handleSubmitAssignment = async (e) => {
    e.preventDefault();
    if (!activeTaskModal || !user?.uid) return;

    if (!submissionFile && !submissionText.trim()) {
      setUploadError('Please enter your submission text or choose an attachment file.');
      return;
    }

    setSubmitting(true);
    setUploadProgress(15);
    setUploadError('');
    setUploadSuccess('');

    try {
      let fileMeta = null;

      // Upload file to MongoDB / Storage if selected
      if (submissionFile) {
        fileMeta = await uploadFileToStorage(
          submissionFile,
          'assignments',
          (pct) => setUploadProgress(pct),
          {
            title: `${profile?.name || 'Student'}_${activeTaskModal.title}`,
            subject: activeTaskModal.subject || activeTaskModal.departmentName || 'Tamil',
            year: studentYear,
            category: 'assignment_submission',
            studentId: user.uid,
            taskId: activeTaskModal.id,
          }
        );
      }

      const existing = submissions[activeTaskModal.id];
      const submissionDocId = existing?.id || `sub_${user.uid}_${activeTaskModal.id}`;

      const payload = {
        id: submissionDocId,
        taskId: activeTaskModal.id,
        taskTitle: activeTaskModal.title || 'Assignment',
        subject: activeTaskModal.subject || activeTaskModal.departmentName || 'Tamil',
        studentId: user.uid,
        studentName: profile?.name || user.displayName || 'Student',
        sifNumber: profile?.sifNumber || '',
        rollNumber: profile?.rollNumber || '',
        studentEmail: profile?.email || user.email || '',
        email: profile?.email || user.email || '',
        year: studentYear,
        departmentId: profile?.departmentId || '',
        departmentName: profile?.departmentName || 'Tamil',
        status: 'submitted',
        notes: submissionText.trim(),
        fileUrl: fileMeta?.url || fileMeta?.downloadUrl || existing?.fileUrl || '',
        fileId: fileMeta?.fileId || existing?.fileId || '',
        fileName: fileMeta?.fileName || submissionFile?.name || existing?.fileName || '',
        fileSize: fileMeta?.size || submissionFile?.size || existing?.fileSize || 0,
        mimeType: fileMeta?.mimeType || submissionFile?.type || existing?.mimeType || '',
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // 1. Save to primary task_submissions collection
      await setDoc(doc(db, 'task_submissions', submissionDocId), payload, { merge: true });

      // 2. Mirror to legacy taskSubmissions for compatibility
      await setDoc(doc(db, 'taskSubmissions', submissionDocId), payload, { merge: true }).catch(() => {});

      // 3. Dispatch real-time notification alert to Admin
      try {
        addDoc(collection(db, 'notifications'), {
          title: '📄 New Assignment Submission',
          body: `${profile?.name || user.displayName || 'Student'} (${studentYear}) submitted "${activeTaskModal.title || 'Assignment'}".`,
          type: 'assignment_submission',
          category: 'assignments',
          recipientRole: 'admin',
          targetScope: 'admin',
          taskId: activeTaskModal.id,
          studentId: user.uid,
          studentName: profile?.name || user.displayName || 'Student',
          read: false,
          isRead: false,
          status: 'pending',
          createdAt: serverTimestamp(),
        }).catch(() => {});
      } catch (_) {}

      setUploadSuccess('Assignment submitted successfully!');
      setTimeout(() => {
        setActiveTaskModal(null);
      }, 1200);
    } catch (err) {
      console.error('Assignment submission failed:', err);
      setUploadError(err.message || 'Failed to submit assignment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="student-page grid" style={{ gap: 18 }}>
      <StudentPageHeader
        title="Assignments & Tasks"
        subtitle={`${studentYear} / ${profile?.departmentName || 'Department'} • Submissions & Teacher Feedback`}
      />

      {/* Filter Tabs */}
      <div className="card" style={{ padding: '10px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          className={'tab-btn ' + (filterStatus === 'all' ? 'active' : '')}
          onClick={() => setFilterStatus('all')}
          style={{ padding: '6px 16px', fontSize: 13 }}
        >
          All Tasks ({tasks.length})
        </button>
        <button
          className={'tab-btn ' + (filterStatus === 'pending' ? 'active' : '')}
          onClick={() => setFilterStatus('pending')}
          style={{ padding: '6px 16px', fontSize: 13 }}
        >
          Pending ({tasks.filter((t) => !submissions[t.id]).length})
        </button>
        <button
          className={'tab-btn ' + (filterStatus === 'submitted' ? 'active' : '')}
          onClick={() => setFilterStatus('submitted')}
          style={{ padding: '6px 16px', fontSize: 13 }}
        >
          Submitted ({Object.keys(submissions).length})
        </button>
      </div>

      {/* Task List */}
      {loading ? (
        <Loader />
      ) : filteredTasks.length > 0 ? (
        <div className="grid grid-2" style={{ gap: 16 }}>
          {filteredTasks.map((t) => {
            const sub = submissions[t.id];
            const isSubmitted = Boolean(sub);
            const isGraded = Boolean(sub?.grade || sub?.marks || sub?.feedback);
            const isOverdue = t.dueDate && new Date(t.dueDate) < new Date();

            return (
              <div
                key={t.id}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderTop: isGraded ? '4px solid #10b981' : (isSubmitted ? '4px solid #3b82f6' : '4px solid #f59e0b'),
                  background: '#ffffff',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                  borderRadius: 14,
                  padding: 20
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span className="pill info" style={{ fontSize: 11, fontWeight: 700 }}>
                      {t.subject || t.departmentName || 'Tamil'}
                    </span>
                    <span
                      className="pill"
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        background: isGraded ? '#dcfce7' : (isSubmitted ? '#dbeafe' : '#fef3c7'),
                        color: isGraded ? '#15803d' : (isSubmitted ? '#1d4ed8' : '#b45309')
                      }}
                    >
                      {isGraded ? `Graded: ${sub.marks || sub.grade}` : (isSubmitted ? 'Submitted' : 'Pending')}
                    </span>
                  </div>

                  <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                    {t.title}
                  </h3>

                  <p style={{ fontSize: 13, color: '#475569', margin: '0 0 14px', lineHeight: 1.5 }}>
                    {t.description || 'Complete the assignment questions and upload your submission.'}
                  </p>

                  <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#64748b', marginBottom: 14, flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: isOverdue && !isSubmitted ? '#dc2626' : '#475569', fontWeight: isOverdue && !isSubmitted ? 700 : 500 }}>
                      <Calendar size={14} /> Due: <strong>{t.dueDate || 'No deadline'}</strong>
                    </span>
                    {t.totalMarks && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Award size={14} /> Max Marks: <strong>{t.totalMarks}</strong>
                      </span>
                    )}
                  </div>

                  {/* Teacher's Attachment */}
                  {t.fileLink && (
                    <div style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-primary)', fontWeight: 600 }}>
                        <FileText size={15} /> {t.fileName || 'Assignment_Brief.pdf'}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => openOrDownloadFile(t.fileLink, t.fileName || `${t.title}.pdf`, t.fileId || t.id)}
                        style={{ padding: '3px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Eye size={12} /> View File
                      </button>
                    </div>
                  )}

                  {/* Student's Submission Status Box */}
                  {isSubmitted && (
                    <div style={{ padding: '12px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <FileCheck size={15} /> Your Submission
                        </span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>
                          {sub.submittedAt?.toDate ? sub.submittedAt.toDate().toLocaleDateString() : 'Submitted'}
                        </span>
                      </div>
                      {sub.fileName && (
                        <div style={{ fontSize: 12, color: '#0f172a', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>📎 {sub.fileName}</span>
                          {sub.fileUrl && (
                            <button
                              type="button"
                              className="btn-ghost"
                              style={{ padding: '0 4px', fontSize: 11, color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={() => openOrDownloadFile(sub.fileUrl, sub.fileName, sub.fileId)}
                            >
                              Download
                            </button>
                          )}
                        </div>
                      )}
                      {sub.notes && (
                        <div style={{ fontSize: 12, color: '#475569', marginTop: 6, fontStyle: 'italic' }}>
                          "{sub.notes}"
                        </div>
                      )}
                    </div>
                  )}

                  {/* Teacher Feedback if graded */}
                  {sub?.feedback && (
                    <div style={{ padding: '12px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 2 }}>
                        Teacher Feedback:
                      </div>
                      <div style={{ fontSize: 13, color: '#166534', fontStyle: 'italic' }}>
                        "{sub.feedback}"
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleOpenSubmissionModal(t)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 16px', fontWeight: 600 }}
                  >
                    <Upload size={16} />
                    <span>{isSubmitted ? 'Resubmit / Update Work' : 'Submit Assignment'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          message="No assignments found for this year & department."
          icon={<ListTodo size={36} />}
        />
      )}

      {/* Styled Submission Modal */}
      {activeTaskModal && (
        <div
          className="modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setActiveTaskModal(null); }}
        >
          <div
            className="modal"
            style={{
              maxWidth: 580,
              width: '95%',
              background: '#ffffff',
              borderRadius: 18,
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div className="modal-header" style={{ padding: '18px 24px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="pill info" style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                  Submit Assignment
                </span>
                <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#0f172a' }}>
                  {activeTaskModal.title}
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
                  {activeTaskModal.subject || activeTaskModal.departmentName || 'Tamil'} • Due: {activeTaskModal.dueDate || 'No deadline'}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setActiveTaskModal(null)}
                style={{ borderRadius: '50%', width: 32, height: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body" style={{ padding: '20px 24px', background: '#ffffff' }}>
              {uploadSuccess && <div className="alert success" style={{ marginBottom: 14 }}>{uploadSuccess}</div>}
              {uploadError && <div className="alert error" style={{ marginBottom: 14 }}>{uploadError}</div>}

              <form onSubmit={handleSubmitAssignment} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* File Upload Area */}
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                    Attach Document / PDF File
                  </label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: '2px dashed #cbd5e1',
                      borderRadius: 12,
                      padding: '20px 16px',
                      textAlign: 'center',
                      background: '#f8fafc',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.background = '#f0f9ff'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
                  >
                    <UploadCloud size={32} color="var(--color-primary)" style={{ margin: '0 auto 8px' }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                      {submissionFile ? submissionFile.name : 'Click to select PDF or image file'}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                      {submissionFile
                        ? `${(submissionFile.size / 1024).toFixed(0)} KB • Ready to upload`
                        : 'Supports PDF, Word (.doc, .docx), PNG, JPG'}
                    </div>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => setSubmissionFile(e.target.files?.[0] || null)}
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    style={{ display: 'none' }}
                  />
                </div>

                {/* Text Notes Area */}
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                    Submission Notes / Text Answers (Optional)
                  </label>
                  <textarea
                    className="input"
                    rows={4}
                    placeholder="Type your notes, solution summary, or commentary here..."
                    value={submissionText}
                    onChange={(e) => setSubmissionText(e.target.value)}
                    style={{
                      width: '100%',
                      padding: 12,
                      fontSize: 13,
                      borderRadius: 10,
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#0f172a',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setActiveTaskModal(null)}
                    disabled={submitting}
                    style={{ padding: '8px 18px', fontSize: 13 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting}
                    style={{ padding: '8px 20px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
                  >
                    <Send size={14} />
                    <span>{submitting ? 'Submitting...' : 'Confirm Submission'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentTasks;
