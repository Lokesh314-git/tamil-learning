import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  where
} from 'firebase/firestore';
import { db } from '../../firebase';
import { YEARS } from '../../utils/departments';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';
import TaskFormModal from '../../components/TaskFormModal';
import { dispatchAssignmentNotification } from '../../utils/testNotificationService';
import { openOrDownloadFile } from '../../utils/fileUpload';
import {
  ListTodo,
  Plus,
  Calendar,
  FileText,
  CheckCircle2,
  Clock,
  Edit,
  Trash2,
  Download,
  ExternalLink,
  MessageSquare,
  Award,
  Search,
  User
} from 'lucide-react';

const AdminAssignmentsPage = () => {
  const [tasks, setTasks] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedYear, setSelectedYear] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [taskFormModal, setTaskFormModal] = useState(null);
  const [submissionsModal, setSubmissionsModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [gradingItem, setGradingItem] = useState(null);
  const [gradeScore, setGradeScore] = useState('');
  const [gradeFeedback, setGradeFeedback] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    let ready = 0;
    const check = () => {
      ready++;
      if (ready >= 3) setLoading(false);
    };

    // 1. Listen to tasks / assignments
    const unsubTasks = onSnapshot(query(collection(db, 'tasks')), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
      setTasks(list);
      check();
    });

    // 2. Listen to task submissions
    const unsubSubmissions = onSnapshot(query(collection(db, 'task_submissions')), (snap) => {
      setSubmissions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    });

    // 3. Listen to departments
    const unsubDepts = onSnapshot(query(collection(db, 'departments')), (snap) => {
      setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    });

    return () => {
      unsubTasks();
      unsubSubmissions();
      unsubDepts();
    };
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const yearMatch = selectedYear === 'All' || t.year === selectedYear;
      const searchMatch = !searchQuery.trim() ||
        (t.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(searchQuery.toLowerCase());
      return yearMatch && searchMatch;
    });
  }, [tasks, selectedYear, searchQuery]);

  const submissionsByTaskId = useMemo(() => {
    const map = {};
    submissions.forEach((s) => {
      const key = s.taskId || s.taskTitle;
      if (key) {
        if (!map[key]) map[key] = [];
        map[key].push(s);
      }
    });
    return map;
  }, [submissions]);

  const handleSaveTask = async (data) => {
    try {
      const selectedDept = departments.find((d) => d.id === data.departmentId);
      const departmentName = data.departmentId === 'all' ? 'All Classes' : (selectedDept?.name || 'General');

      if (taskFormModal?.id) {
        await updateDoc(doc(db, 'tasks', taskFormModal.id), {
          ...data,
          departmentName,
          updatedAt: serverTimestamp(),
        });
        setMessage('Assignment updated successfully.');
      } else {
        const ref = await addDoc(collection(db, 'tasks'), {
          ...data,
          departmentName,
          status: data.status || 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setMessage('New Assignment created and assigned to students.');

        // Dispatch instant push notification to students
        try {
          await dispatchAssignmentNotification({
            taskId: ref.id,
            title: `New Assignment: ${data.title}`,
            testTitle: data.title,
            subject: departmentName,
            dueDate: data.dueDate,
            description: data.description,
            targetType: data.departmentId === 'all' ? 'all' : 'department',
            targetDepartmentId: data.departmentId || 'all',
            targetDepartmentName: departmentName,
            route: '/student/tasks',
          });
        } catch (notifErr) {
          console.warn('Assignment notification error:', notifErr);
        }
      }
      setTaskFormModal(null);
    } catch (err) {
      setError(err.message || 'Failed to save assignment.');
    }
  };

  const handleDeleteTask = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, 'tasks', deleteTarget.id));
      setMessage('Assignment removed successfully.');
    } catch (err) {
      setError(err.message || 'Failed to delete assignment.');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleSaveGrade = async (e) => {
    e.preventDefault();
    if (!gradingItem) return;
    try {
      await updateDoc(doc(db, 'task_submissions', gradingItem.id), {
        grade: gradeScore,
        feedback: gradeFeedback,
        status: 'graded',
        gradedAt: serverTimestamp(),
      });
      setMessage('Grade and feedback saved successfully.');
      setGradingItem(null);
      setGradeScore('');
      setGradeFeedback('');
    } catch (err) {
      setError(err.message || 'Failed to save grade.');
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="grid fade-in" style={{ gap: 20 }}>
      {/* Header Banner */}
      <div className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="pill info" style={{ marginBottom: 6 }}>Assignments & Projects</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Assignment Management</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-light)', fontSize: 13 }}>
            Create homework tasks, upload assignment PDFs, track student submissions, and provide grades & feedback.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setTaskFormModal({})} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} />
          <span>Create Assignment</span>
        </button>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      {/* Filters Bar */}
      <div className="card" style={{ padding: '14px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            className="input"
            style={{ paddingLeft: 36 }}
            placeholder="Search assignment by title or instructions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className="input"
          style={{ width: 'auto', minWidth: 140 }}
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
        >
          <option value="All">All Years</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Assignments Grid */}
      <div className="grid grid-3" style={{ gap: 16 }}>
        {filteredTasks.map((t) => {
          const subs = submissionsByTaskId[t.id] || submissionsByTaskId[t.title] || [];
          const isOverdue = t.dueDate && new Date(t.dueDate) < new Date();

          return (
            <div
              key={t.id}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderTop: '4px solid #d97706',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="pill info" style={{ fontSize: 11 }}>{t.year || 'All Years'} • {t.departmentName || 'General'}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className="btn-icon"
                      onClick={() => setTaskFormModal({ ...t })}
                      title="Edit Assignment"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-light)' }}
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => setDeleteTarget(t)}
                      title="Delete Assignment"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <h3 style={{ margin: '10px 0 6px', fontSize: 17, fontWeight: 700 }}>{t.title}</h3>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--color-text-light)', lineHeight: 1.4, minHeight: 36 }}>
                  {t.description || 'Complete the assignment questions and submit before the deadline.'}
                </p>

                <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: 8, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: isOverdue ? '#dc2626' : '#475569', fontWeight: 600 }}>
                  <Calendar size={14} />
                  <span>Due: {t.dueDate || 'No Deadline'}</span>
                </div>

                {t.fileName && (
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <FileText size={13} />
                    <span style={{ wordBreak: 'break-all' }}>{t.fileName}</span>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '5px 12px', fontSize: 12 }}
                  onClick={() => setSubmissionsModal({ task: t, list: subs })}
                >
                  Submissions ({subs.length})
                </button>

                {t.fileLink && (
                  <button
                    type="button"
                    onClick={() => openOrDownloadFile(t.fileLink, t.fileName || `${t.title || 'Assignment'}.pdf`, t.fileId || t.id)}
                    className="btn btn-primary"
                    style={{ padding: '5px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <ExternalLink size={13} />
                    <span>File</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredTasks.length === 0 && (
        <EmptyState message="No assignments found. Click 'Create Assignment' to assign work." />
      )}

      {/* Task Creation & Edit Modal */}
      <TaskFormModal
        open={Boolean(taskFormModal)}
        initial={taskFormModal && taskFormModal.id ? taskFormModal : null}
        year={selectedYear !== 'All' ? selectedYear : '1st Year'}
        departments={departments}
        selectedDepartmentId="all"
        onClose={() => setTaskFormModal(null)}
        onSave={handleSaveTask}
      />

      {/* Student Submissions Review Modal */}
      {submissionsModal && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setSubmissionsModal(null); }}>
          <div className="modal" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <div>
                <span className="pill info" style={{ fontSize: 11, marginBottom: 4, fontWeight: 700 }}>Student Submissions</span>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{submissionsModal.task.title}</h3>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSubmissionsModal(null)}>✕</button>
            </div>

            <div className="modal-body">
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>Submitted At</th>
                      <th>Attached File</th>
                      <th>Grade / Marks</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissionsModal.list.map((s, idx) => (
                      <tr key={s.id || idx}>
                        <td style={{ fontWeight: 600 }}>{s.studentName || s.studentEmail || 'Student'}</td>
                        <td style={{ fontSize: 12 }}>
                          {s.submittedAt?.toDate ? s.submittedAt.toDate().toLocaleString() : 'Recent'}
                        </td>
                        <td>
                          {s.fileUrl ? (
                            <a href={s.fileUrl} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }}>
                              View PDF
                            </a>
                          ) : (
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>Text Only</span>
                          )}
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: s.grade ? 'var(--color-primary)' : '#64748b' }}>
                            {s.grade || 'Not Graded'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-primary"
                            style={{ padding: '3px 8px', fontSize: 11 }}
                            onClick={() => {
                              setGradingItem(s);
                              setGradeScore(s.grade || '');
                              setGradeFeedback(s.feedback || '');
                            }}
                          >
                            Grade / Feedback
                          </button>
                        </td>
                      </tr>
                    ))}
                    {submissionsModal.list.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
                          No submissions uploaded by students for this assignment yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* In-Modal Grading Box */}
              {gradingItem && (
                <form onSubmit={handleSaveGrade} style={{ marginTop: 16, background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                    Grading Submission: {gradingItem.studentName || 'Student'}
                  </h4>
                  <div className="grid grid-2" style={{ gap: 10, marginBottom: 10 }}>
                    <div>
                      <label className="form-label">Grade / Score (e.g. A+, 95/100)</label>
                      <input
                        className="input"
                        value={gradeScore}
                        onChange={(e) => setGradeScore(e.target.value)}
                        placeholder="e.g. 90/100"
                        required
                      />
                    </div>
                    <div>
                      <label className="form-label">Feedback / Comments</label>
                      <input
                        className="input"
                        value={gradeFeedback}
                        onChange={(e) => setGradeFeedback(e.target.value)}
                        placeholder="Well done, neat explanation..."
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setGradingItem(null)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" style={{ fontSize: 12 }}>
                      Save Grade
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSubmissionsModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteTask}
        text={`Are you sure you want to delete assignment "${deleteTarget?.title}"?`}
      />
    </div>
  );
};

export default AdminAssignmentsPage;
