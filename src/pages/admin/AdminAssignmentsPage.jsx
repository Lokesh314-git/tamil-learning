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
  where,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { db } from '../../firebase';
import { YEARS } from '../../utils/departments';
import { mongoService } from '../../services/mongoService';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';
import TaskFormModal from '../../components/TaskFormModal';
import Modal from '../../components/ui/Modal';
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
  User,
  Users,
  UserCheck,
  UserX,
  FileCheck
} from 'lucide-react';

const AdminAssignmentsPage = () => {
  const [tasks, setTasks] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedYear, setSelectedYear] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [taskFormModal, setTaskFormModal] = useState(null);
  const [submissionsModal, setSubmissionsModal] = useState(null);
  const [submissionsModalTab, setSubmissionsModalTab] = useState('submitted'); // 'submitted' | 'not_submitted'
  const [modalSearch, setModalSearch] = useState('');
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
      if (ready >= 4) setLoading(false);
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

    // 4. Listen to students
    const unsubStudents = onSnapshot(query(collection(db, 'users'), where('role', '==', 'student')), (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    });

    return () => {
      unsubTasks();
      unsubSubmissions();
      unsubDepts();
      unsubStudents();
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
      const batch = writeBatch(db);
      batch.delete(doc(db, 'tasks', deleteTarget.id));

      // 1. Delete all student submissions in task_submissions and taskSubmissions
      const subSnap1 = await getDocs(query(collection(db, 'task_submissions'), where('taskId', '==', deleteTarget.id)));
      subSnap1.forEach((d) => batch.delete(d.ref));

      const subSnap2 = await getDocs(query(collection(db, 'taskSubmissions'), where('taskId', '==', deleteTarget.id)));
      subSnap2.forEach((d) => batch.delete(d.ref));

      // 2. Delete task notifications
      const notifSnap = await getDocs(query(collection(db, 'notifications'), where('taskId', '==', deleteTarget.id)));
      notifSnap.forEach((d) => batch.delete(d.ref));

      await batch.commit();

      // 3. Clean associated GridFS file and chunks if attached
      if (deleteTarget.fileId) {
        try {
          await mongoService.deleteFileFromGridFS(deleteTarget.fileId);
        } catch (_) {}
      }

      setMessage('Assignment and all student submissions were removed permanently.');
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
        marks: gradeScore,
        feedback: gradeFeedback,
        status: 'graded',
        gradedAt: serverTimestamp(),
      });

      // Dispatch individual notification to the student
      const targetStudent = gradingItem.studentId || gradingItem.userId;
      if (targetStudent) {
        addDoc(collection(db, 'notifications'), {
          title: '📝 Assignment Graded',
          body: `Your submission for "${gradingItem.taskTitle || 'Assignment'}" has been graded: ${gradeScore}. ${gradeFeedback ? `Remarks: "${gradeFeedback}"` : ''}`,
          type: 'assignment_graded',
          category: 'tasks',
          targetUserId: targetStudent,
          studentId: targetStudent,
          targetScope: 'individual',
          recipientRole: 'student',
          read: false,
          isRead: false,
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }

      setMessage('Grade and feedback saved successfully.');
      setGradingItem(null);
      setGradeScore('');
      setGradeFeedback('');
    } catch (err) {
      setError(err.message || 'Failed to save grade.');
    }
  };

  // Calculate modal student lists when a task's submissions modal is opened
  const currentModalData = useMemo(() => {
    if (!submissionsModal?.task) return { submittedList: [], notSubmittedList: [] };

    const t = submissionsModal.task;
    const subs = submissionsByTaskId[t.id] || submissionsByTaskId[t.title] || [];

    const submittedStudentIds = new Set();
    const formattedSubs = subs.map((s) => {
      if (s.studentId) submittedStudentIds.add(s.studentId);
      if (s.sifNumber) submittedStudentIds.add(s.sifNumber);
      if (s.email || s.studentEmail) submittedStudentIds.add(s.email || s.studentEmail);

      const matchedStudent = students.find((st) =>
        (st.uid && st.uid === s.studentId) || (st.id && st.id === s.studentId) || (st.sifNumber && st.sifNumber === s.sifNumber)
      );

      return {
        ...s,
        studentName: s.studentName || matchedStudent?.name || 'Student',
        sifNumber: s.sifNumber || matchedStudent?.sifNumber || '',
        rollNumber: s.rollNumber || matchedStudent?.rollNumber || '',
        departmentName: s.departmentName || matchedStudent?.departmentName || t.departmentName || 'General',
        submittedAtDate: s.submittedAt?.toDate ? s.submittedAt.toDate().toLocaleString() : (s.submittedAt || 'Recent'),
      };
    });

    // Eligible students for this task
    const eligibleStudents = students.filter((s) => {
      if (s.isDeleted || s.status === 'deleted') return false;
      const yearOk = !t.year || t.year === 'All Years' || t.year === 'All' || (s.year && s.year.toLowerCase() === t.year.toLowerCase());
      const deptOk = !t.departmentId || t.departmentId === 'all' || s.departmentId === t.departmentId;
      return yearOk && deptOk;
    });

    const notSubmitted = eligibleStudents.filter((s) => {
      return !submittedStudentIds.has(s.uid) && !submittedStudentIds.has(s.id) && !submittedStudentIds.has(s.sifNumber) && !submittedStudentIds.has(s.email);
    });

    return {
      submittedList: formattedSubs,
      notSubmittedList: notSubmitted,
      eligibleCount: eligibleStudents.length,
    };
  }, [submissionsModal, submissionsByTaskId, students]);

  const filteredSubmittedList = useMemo(() => {
    if (!modalSearch.trim()) return currentModalData.submittedList;
    const q = modalSearch.toLowerCase();
    return currentModalData.submittedList.filter((s) =>
      (s.studentName || '').toLowerCase().includes(q) ||
      (s.sifNumber || '').toLowerCase().includes(q) ||
      (s.rollNumber || '').toLowerCase().includes(q) ||
      (s.departmentName || '').toLowerCase().includes(q)
    );
  }, [currentModalData.submittedList, modalSearch]);

  const filteredNotSubmittedList = useMemo(() => {
    if (!modalSearch.trim()) return currentModalData.notSubmittedList;
    const q = modalSearch.toLowerCase();
    return currentModalData.notSubmittedList.filter((s) =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.sifNumber || '').toLowerCase().includes(q) ||
      (s.rollNumber || '').toLowerCase().includes(q) ||
      (s.departmentName || '').toLowerCase().includes(q)
    );
  }, [currentModalData.notSubmittedList, modalSearch]);

  if (loading) return <Loader />;

  return (
    <div className="grid fade-in" style={{ gap: 20 }}>
      {/* Header Banner */}
      <div className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="pill info" style={{ marginBottom: 6 }}>Assignments &amp; Projects</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Assignment Management</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-light)', fontSize: 13 }}>
            Create homework tasks, track student submissions, download attached PDFs, and evaluate student work.
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

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <button
                  className="btn btn-primary"
                  style={{ padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={() => {
                    setSubmissionsModal({ task: t });
                    setSubmissionsModalTab('submitted');
                    setModalSearch('');
                  }}
                >
                  <Users size={14} />
                  <span>View Submissions ({subs.length})</span>
                </button>

                {t.fileLink && (
                  <button
                    type="button"
                    onClick={() => openOrDownloadFile(t.fileLink, t.fileName || `${t.title || 'Assignment'}.pdf`, t.fileId || t.id)}
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
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
        <Modal
          open={Boolean(submissionsModal)}
          onClose={() => setSubmissionsModal(null)}
          size="xl"
          title="Assignment Submissions & Evaluation"
          subtitle={`Review student submissions, evaluate answers, and track submissions for "${submissionsModal.task.title}" • ${submissionsModal.task.year || 'All Years'} • Due: ${submissionsModal.task.dueDate || 'No deadline'}`}
          icon={FileCheck}
          iconVariant="primary"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                {submissionsModal.task.title} • {submissionsModal.task.departmentName || 'All Departments'}
              </span>
              <button type="button" className="btn btn-secondary" onClick={() => setSubmissionsModal(null)}>
                Close
              </button>
            </div>
          }
        >
          {/* Summary KPIs */}
          <div className="grid grid-3" style={{ gap: 12, marginBottom: 16 }}>
            <div className="card" style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserCheck size={15} color="#059669" /> SUBMITTED
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#059669', marginTop: 4 }}>
                {currentModalData.submittedList.length} <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>/ {currentModalData.eligibleCount} Students</span>
              </div>
            </div>

            <div className="card" style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserX size={15} color="#dc2626" /> PENDING SUBMISSION
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#dc2626', marginTop: 4 }}>
                {currentModalData.notSubmittedList.length}
              </div>
            </div>

            <div className="card" style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileCheck size={15} color="#2563eb" /> GRADED
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#2563eb', marginTop: 4 }}>
                {currentModalData.submittedList.filter(s => s.grade || s.marks).length}
              </div>
            </div>
          </div>

          {/* Submissions Tabs & Search */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <div className="tab-row" style={{ margin: 0 }}>
              <button
                type="button"
                className={'tab-btn ' + (submissionsModalTab === 'submitted' ? 'active' : '')}
                onClick={() => setSubmissionsModalTab('submitted')}
              >
                Submitted Students ({currentModalData.submittedList.length})
              </button>
              <button
                type="button"
                className={'tab-btn ' + (submissionsModalTab === 'not_submitted' ? 'active' : '')}
                onClick={() => setSubmissionsModalTab('not_submitted')}
              >
                Not Submitted ({currentModalData.notSubmittedList.length})
              </button>
            </div>

            <div style={{ position: 'relative', width: 240 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                className="input"
                style={{ paddingLeft: 30, fontSize: 12, height: 36 }}
                placeholder="Search student or SIF..."
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Tab 1: Submitted Students */}
          {submissionsModalTab === 'submitted' && (
            <div className="table-scroll" style={{ maxHeight: 360, overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 45 }}>#</th>
                    <th>Student Name</th>
                    <th>SIF / Roll No</th>
                    <th>Class / Dept</th>
                    <th>Submitted At</th>
                    <th>Submission / File</th>
                    <th>Grade</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubmittedList.map((s, idx) => (
                    <tr key={s.id || idx}>
                      <td>{idx + 1}</td>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>
                        {s.studentName}
                      </td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace', color: '#2563eb', fontWeight: 600 }}>
                        {s.sifNumber || s.rollNumber || '-'}
                      </td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>{s.departmentName}</td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>
                        {s.submittedAtDate}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {s.fileUrl ? (
                            <button
                              type="button"
                              onClick={() => openOrDownloadFile(s.fileUrl, s.fileName || `${s.studentName}_Assignment.pdf`, s.fileId)}
                              className="btn btn-secondary"
                              style={{ padding: '3px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, width: 'fit-content' }}
                            >
                              <ExternalLink size={12} />
                              <span>{s.fileName ? s.fileName.substring(0, 16) + '...' : 'View PDF'}</span>
                            </button>
                          ) : (
                            <span style={{ fontSize: 11, color: '#64748b' }}>Text submission</span>
                          )}
                          {s.notes && (
                            <span style={{ fontSize: 11, color: '#475569', fontStyle: 'italic', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.notes}>
                              "{s.notes}"
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {s.grade || s.marks ? (
                          <span className="pill success" style={{ fontSize: 11, padding: '2px 8px' }}>
                            {s.grade || s.marks}
                          </span>
                        ) : (
                          <span className="pill warn" style={{ fontSize: 11, background: '#fef3c7', color: '#d97706', padding: '2px 8px' }}>
                            Pending Grade
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{ padding: '4px 10px', fontSize: 11 }}
                          onClick={() => {
                            setGradingItem(s);
                            setGradeScore(s.grade || s.marks || '');
                            setGradeFeedback(s.feedback || '');
                          }}
                        >
                          {s.grade ? 'Update Grade' : 'Grade'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredSubmittedList.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: 28, color: '#94a3b8' }}>
                        No student submissions found for this assignment yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 2: Not Submitted Students */}
          {submissionsModalTab === 'not_submitted' && (
            <div className="table-scroll" style={{ maxHeight: 360, overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 45 }}>#</th>
                    <th>Student Name</th>
                    <th>SIF Number</th>
                    <th>Roll Number</th>
                    <th>Class / Department</th>
                    <th>Year</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNotSubmittedList.map((st, idx) => (
                    <tr key={st.uid || st.id || idx}>
                      <td>{idx + 1}</td>
                      <td style={{ fontWeight: 600 }}>{st.name}</td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace', color: '#2563eb', fontWeight: 600 }}>
                        {st.sifNumber || '-'}
                      </td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace', color: '#64748b' }}>
                        {st.rollNumber || '-'}
                      </td>
                      <td>{st.departmentName || '-'}</td>
                      <td><span className="pill info" style={{ fontSize: 11 }}>{st.year || '1st Year'}</span></td>
                      <td>
                        <span className="pill warn" style={{ fontSize: 11, background: '#fee2e2', color: '#dc2626' }}>
                          Not Submitted
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredNotSubmittedList.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 28, color: '#059669', fontWeight: 600 }}>
                        🎉 All eligible students have submitted this assignment!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* In-Modal Grading Form */}
          {gradingItem && (
            <form onSubmit={handleSaveGrade} style={{ marginTop: 16, background: '#f8fafc', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                  Grading: {gradingItem.studentName} ({gradingItem.sifNumber || gradingItem.rollNumber || 'Student'})
                </h4>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  {gradingItem.fileName ? `Attached: ${gradingItem.fileName}` : 'Text only'}
                </span>
              </div>
              <div className="grid grid-2" style={{ gap: 12, marginBottom: 12 }}>
                <div>
                  <label className="form-label">Grade / Score (e.g. 95/100, A+, Excellent)</label>
                  <input
                    className="input"
                    value={gradeScore}
                    onChange={(e) => setGradeScore(e.target.value)}
                    placeholder="e.g. 90/100 or A+"
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Feedback / Remarks</label>
                  <input
                    className="input"
                    value={gradeFeedback}
                    onChange={(e) => setGradeFeedback(e.target.value)}
                    placeholder="Well researched, clean handwriting..."
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setGradingItem(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontSize: 12 }}>
                  Save Grade &amp; Send Feedback
                </button>
              </div>
            </form>
          )}
        </Modal>
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
