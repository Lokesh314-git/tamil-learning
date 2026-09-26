import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  addDoc,
  serverTimestamp,
  where
} from 'firebase/firestore';
import { db } from '../../firebase';
import { YEARS } from '../../utils/departments';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import {
  Bell,
  Send,
  Users,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  Radio
} from 'lucide-react';

const PRIORITIES = [
  { id: 'normal', label: 'Normal Notification', icon: Info, color: '#3b82f6' },
  { id: 'important', label: 'Important Notice', icon: AlertTriangle, color: '#d97706' },
  { id: 'urgent', label: 'Urgent Alert', icon: AlertTriangle, color: '#dc2626' },
];

const AdminNotificationsPage = () => {
  const [history, setHistory] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('normal');
  const [targetScope, setTargetScope] = useState('all'); // all, year, class, individual
  const [targetYear, setTargetYear] = useState(YEARS[0]);
  const [targetDeptId, setTargetDeptId] = useState('all');
  const [targetSection, setTargetSection] = useState('all');
  const [targetStudentId, setTargetStudentId] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    let ready = 0;
    const check = () => {
      ready++;
      if (ready >= 3) setLoading(false);
    };

    const unsubNotifications = onSnapshot(query(collection(db, 'notifications')), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
      setHistory(list);
      check();
    });

    const unsubDepts = onSnapshot(query(collection(db, 'departments')), (snap) => {
      setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    });

    const unsubStudents = onSnapshot(query(collection(db, 'users'), where('role', '==', 'student')), (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    });

    return () => {
      unsubNotifications();
      unsubDepts();
      unsubStudents();
    };
  }, []);

  const handleSendNotification = async (e) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanBody = body.trim();

    if (!cleanTitle || !cleanBody) {
      setError('Please provide notification title and message body.');
      return;
    }

    setSending(true);
    setError('');
    setMessage('');

    try {
      const selectedDept = departments.find((d) => d.id === targetDeptId);
      const targetDeptName = targetDeptId === 'all' ? 'All Classes' : (selectedDept?.name || 'General');

      await addDoc(collection(db, 'notifications'), {
        title: cleanTitle,
        body: cleanBody,
        priority,
        type: 'direct_broadcast',
        targetScope,
        targetYear: targetScope === 'all' ? 'all' : targetYear,
        targetDepartmentId: targetDeptId,
        targetDepartmentName,
        targetSection,
        targetStudentId: targetScope === 'individual' ? targetStudentId : null,
        createdAt: serverTimestamp(),
      });

      setMessage('Notification sent and dispatched via Firebase Cloud Messaging (FCM) successfully!');
      setTitle('');
      setBody('');
    } catch (err) {
      setError(err.message || 'Failed to dispatch notification.');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="grid fade-in" style={{ gap: 20 }}>
      {/* Header Banner */}
      <div className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="pill info" style={{ marginBottom: 6 }}>Push Alert Dispatcher</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Notification Management (FCM)</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-light)', fontSize: 13 }}>
            Send real-time instant notifications to students (All Students, Specific Class, Section, or Individual).
          </p>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="grid grid-2" style={{ gap: 20 }}>
        {/* Compose Form */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Send size={18} color="var(--color-primary)" />
            <span>Compose Push Notification</span>
          </h3>

          <form onSubmit={handleSendNotification} className="grid" style={{ gap: 14 }}>
            <div>
              <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>Notification Title *</label>
              <input
                className="input"
                placeholder="e.g. Test Result Published / Class Reminder"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>Priority Level</label>
              <div className="grid grid-3" style={{ gap: 8 }}>
                {PRIORITIES.map((p) => {
                  const active = priority === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPriority(p.id)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: active ? `2px solid ${p.color}` : '1px solid #cbd5e1',
                        background: active ? '#f8fafc' : '#ffffff',
                        color: active ? p.color : '#475569',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>Target Audience</label>
              <select className="input" value={targetScope} onChange={(e) => setTargetScope(e.target.value)}>
                <option value="all">Broadcast to All Students</option>
                <option value="year">Specific Academic Year</option>
                <option value="class">Specific Class / Department</option>
                <option value="individual">Individual Student</option>
              </select>
            </div>

            {targetScope === 'year' && (
              <div>
                <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>Select Year</label>
                <select className="input" value={targetYear} onChange={(e) => setTargetYear(e.target.value)}>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            )}

            {targetScope === 'class' && (
              <div className="grid grid-2" style={{ gap: 10 }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>Select Class</label>
                  <select className="input" value={targetDeptId} onChange={(e) => setTargetDeptId(e.target.value)}>
                    <option value="all">All Classes</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.year})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>Section</label>
                  <select className="input" value={targetSection} onChange={(e) => setTargetSection(e.target.value)}>
                    <option value="all">All Sections</option>
                    <option value="A">Section A</option>
                    <option value="B">Section B</option>
                    <option value="C">Section C</option>
                  </select>
                </div>
              </div>
            )}

            {targetScope === 'individual' && (
              <div>
                <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>Select Student</label>
                <select className="input" value={targetStudentId} onChange={(e) => setTargetStudentId(e.target.value)} required>
                  <option value="">Select a student...</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.rollNo || s.sifNumber || s.email}) - {s.year}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="form-label" style={{ fontWeight: 600, fontSize: 13 }}>Message Body *</label>
              <textarea
                className="input"
                rows={3}
                placeholder="Type the message that will pop up on student phones..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }} disabled={sending}>
              <Send size={15} />
              <span>{sending ? 'Broadcasting...' : 'Send Push Notification'}</span>
            </button>
          </form>
        </div>

        {/* History Log */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={18} color="var(--color-primary)" />
            <span>Sent Notification History</span>
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 460, overflowY: 'auto' }}>
            {history.map((n) => (
              <div key={n.id} style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{n.title}</div>
                  <span className="pill info" style={{ fontSize: 10 }}>
                    {n.priority || 'Normal'}
                  </span>
                </div>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#475569' }}>{n.body}</p>
                <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Target: {n.targetYear || 'All'} • {n.targetDepartmentName || 'All'}</span>
                  <span>{n.createdAt?.toDate ? n.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent'}</span>
                </div>
              </div>
            ))}
            {history.length === 0 && (
              <EmptyState message="No push notifications sent yet." />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminNotificationsPage;
