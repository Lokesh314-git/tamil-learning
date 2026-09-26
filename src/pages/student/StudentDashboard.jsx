import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  BookOpen,
  ClipboardList,
  BarChart3,
  StickyNote,
  GraduationCap,
  Award,
  FileText,
  ListTodo,
  Calendar,
  Bell,
  Megaphone,
  FolderDown,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Download,
  Eye,
  Clock,
  UserCheck
} from "lucide-react";
import { db, functions } from "../../firebase";
import { httpsCallable } from 'firebase/functions';
import { useAuth } from "../../context/AuthContext";
import { openOrDownloadFile } from "../../utils/fileUpload";
import StudentPageHeader from "../../components/studentui/StudentPageHeader";
import StudentStatCard from "../../components/studentui/StudentStatCard";
import StudentActionCard from "../../components/studentui/StudentActionCard";
import StudentContentCard from "../../components/studentui/StudentContentCard";
import Button from "../../components/ui/Button";
import PdfViewerModal from "../../components/PdfViewerModal";

const StudentDashboard = () => {
  const { year } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const base = `/student/year/${encodeURIComponent(year || profile?.year || '1st Year')}`;

  const [counts, setCounts] = useState({
    units: 0,
    tests: 0,
    tasks: 0,
    materials: 0,
    notices: 0,
    notifications: 0,
    notes: 0,
  });

  const [viewingDoc, setViewingDoc] = useState(null);
  const [results, setResults] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [taskSubmissions, setTaskSubmissions] = useState({});
  const [materials, setMaterials] = useState([]);
  const [notices, setNotices] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    httpsCallable(functions, 'syncPublishedStudentTests')()
      .catch((err) => console.error('Unable to sync available tests:', err));
  }, []);

  useEffect(() => {
    if (!year || !user || !profile?.departmentId) return;

    setLoadError('');
    const unsubscribers = [];

    const onListenError = (err) => {
      console.warn('Dashboard listener error:', err);
    };

    const deptMatch = (data) => {
      return !data.departmentId || data.departmentId === 'all' || data.departmentId === profile.departmentId;
    };

    // 1. Units
    const qUnits = query(collection(db, 'units'), where('year', '==', year));
    unsubscribers.push(onSnapshot(qUnits, (snap) => {
      let count = 0;
      snap.forEach((d) => { if (deptMatch(d.data())) count++; });
      setCounts((c) => ({ ...c, units: count }));
    }, onListenError));

    // 2. Tests
    const qTests = query(collection(db, 'publishedTests'), where('year', '==', year));
    unsubscribers.push(onSnapshot(qTests, (snap) => {
      let count = 0;
      snap.forEach((d) => { if (deptMatch(d.data())) count++; });
      setCounts((c) => ({ ...c, tests: count }));
    }, onListenError));

    // 3. Tasks / Assignments
    const qTasks = query(collection(db, 'tasks'), where('year', '==', year));
    unsubscribers.push(onSnapshot(qTasks, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        if (deptMatch(data)) list.push({ id: d.id, ...data });
      });
      setTasks(list);
      setCounts((c) => ({ ...c, tasks: list.length }));
    }, onListenError));

    // 4. Task Submissions
    const qSubs = query(collection(db, 'task_submissions'), where('studentId', '==', user.uid));
    unsubscribers.push(onSnapshot(qSubs, (snap) => {
      const byTaskId = {};
      snap.forEach((d) => {
        const data = d.data();
        if (data.taskId) byTaskId[data.taskId] = { id: d.id, ...data };
      });
      setTaskSubmissions(byTaskId);
    }, onListenError));

    // 5. Test Results
    const qResults = query(
      collection(db, 'results'),
      where('studentId', '==', user.uid),
      where('year', '==', year)
    );
    unsubscribers.push(onSnapshot(qResults, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setResults(list);
    }, onListenError));

    // 6. Study Materials
    const qMaterials = query(collection(db, 'study_materials'));
    unsubscribers.push(onSnapshot(qMaterials, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        const yearOk = !data.year || data.year === 'All' || data.year === year;
        if (yearOk && deptMatch(data)) {
          list.push({ id: d.id, ...data });
        }
      });
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
      setMaterials(list.slice(0, 4));
      setCounts((c) => ({ ...c, materials: list.length }));
    }, onListenError));

    // 7. Announcements / Notices
    const qNotices = query(collection(db, 'announcements'));
    unsubscribers.push(onSnapshot(qNotices, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        const yearOk = !data.year || data.year === 'All' || data.year === year;
        if (yearOk && deptMatch(data)) {
          list.push({ id: d.id, ...data });
        }
      });
      list.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
      setNotices(list.slice(0, 3));
      setCounts((c) => ({ ...c, notices: list.length }));
    }, onListenError));

    // 8. Notifications
    const qNotifs = query(collection(db, 'notifications'));
    unsubscribers.push(onSnapshot(qNotifs, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        const scopeOk = !data.targetScope || data.targetScope === 'all' ||
          (data.targetScope === 'year' && (!data.targetYear || data.targetYear === year)) ||
          (data.targetScope === 'department' && (!data.targetDepartmentId || data.targetDepartmentId === profile.departmentId)) ||
          (data.targetScope === 'individual' && data.targetStudentId === user.uid);

        if (scopeOk) list.push({ id: d.id, ...data });
      });
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
      setNotifications(list.slice(0, 3));
      setCounts((c) => ({ ...c, notifications: list.length }));
    }, onListenError));

    // 9. Personal Notes count
    const qNotes = query(collection(db, 'notes'), where('studentId', '==', user.uid), where('year', '==', year));
    unsubscribers.push(onSnapshot(qNotes, (snap) => setCounts((c) => ({ ...c, notes: snap.size })), onListenError));

    // 10. Student Attendance History
    const qAtt = query(collection(db, 'attendance'), where('studentId', '==', user.uid));
    unsubscribers.push(onSnapshot(qAtt, (snap) => {
      setAttendanceRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, onListenError));

    return () => unsubscribers.forEach((u) => u());
  }, [year, user, profile?.departmentId]);

  // Attendance stats
  const attendanceStats = useMemo(() => {
    const total = attendanceRecords.length;
    if (!total) {
      // Default to profile attendance if set by admin
      const profPct = profile?.attendancePercentage != null ? Number(profile.attendancePercentage) : 0;
      const profileTotal = Number(profile?.attendanceStats?.totalDays || profile?.attendance?.totalDays) || 0;
      return {
        percentage: profPct,
        present: Number(profile?.attendanceStats?.presentDays || profile?.attendance?.presentDays) || 0,
        absent: Number(profile?.attendanceStats?.absentDays || profile?.attendance?.absentDays) || 0,
        total: profileTotal,
      };
    }
    let present = 0;
    attendanceRecords.forEach((r) => {
      const st = (r.status || '').toLowerCase();
      if (st === 'present' || st === 'od') present++;
    });
    const percentage = Math.round((present / total) * 100);
    return { percentage, present, absent: total - present, total };
  }, [attendanceRecords, profile?.attendancePercentage]);

  // Average test score
  const avgScore = useMemo(() => {
    if (!results.length) return 0;
    const total = results.reduce((sum, r) => {
      const score = Number(r.score) || 0;
      const totalQ = Number(r.total || r.totalQuestions) || 100;
      const pct = totalQ ? (score / totalQ) * 100 : score;
      return sum + pct;
    }, 0);
    return Math.round(total / results.length);
  }, [results]);

  // Pending assignments count
  const pendingTasksCount = useMemo(() => {
    return tasks.filter((t) => !taskSubmissions[t.id]).length;
  }, [tasks, taskSubmissions]);

  return (
    <div className="student-page student-dashboard-page grid" style={{ gap: 16 }}>
      {/* Welcome Banner */}
      <StudentContentCard style={{
        background: 'linear-gradient(135deg, var(--color-primary) 0%, #1e40af 100%)',
        color: '#ffffff',
        padding: '24px 28px',
        borderRadius: 16,
        boxShadow: '0 10px 25px -5px rgba(30, 58, 138, 0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.2)', color: '#fff', fontSize: 12, fontWeight: 600 }}>
                {year || profile?.year || '1st Year'}
              </span>
              <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.2)', color: '#fff', fontSize: 12 }}>
                Section {profile?.section || 'A'}
              </span>
              {profile?.sifNumber && (
                <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.2)', color: '#fff', fontSize: 12 }}>
                  SIF: {profile.sifNumber}
                </span>
              )}
            </div>
            <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#fff' }}>
              Welcome back, {profile?.name || 'Student'}! 👋
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: 'rgba(255, 255, 255, 0.85)' }}>
              {profile?.departmentName || 'B.A. Tamil Literature'} • Academic Year 2026-2027
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.15)',
              backdropFilter: 'blur(8px)',
              padding: '12px 18px',
              borderRadius: 12,
              textAlign: 'center',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'rgba(255, 255, 255, 0.8)' }}>
                Attendance
              </div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {attendanceStats.percentage}%
              </div>
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.15)',
              backdropFilter: 'blur(8px)',
              padding: '12px 18px',
              borderRadius: 12,
              textAlign: 'center',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'rgba(255, 255, 255, 0.8)' }}>
                Avg Score
              </div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {avgScore}%
              </div>
            </div>
          </div>
        </div>
      </StudentContentCard>

      {/* Primary Academic KPI Cards */}
      <div className="grid grid-4" style={{ gap: 14 }}>
        <StudentStatCard
          icon={<BookOpen size={20} />}
          title="Study Materials"
          value={counts.materials}
          subtitle="PDFs, Notes & Q-Banks"
          tone="primary"
          onClick={() => navigate(`${base}/materials`)}
        />
        <StudentStatCard
          icon={<ClipboardList size={20} />}
          title="Online Tests"
          value={counts.tests}
          subtitle={`${results.length} Attempted`}
          tone="secondary"
          onClick={() => navigate(`${base}/tests`)}
        />
        <StudentStatCard
          icon={<ListTodo size={20} />}
          title="Pending Tasks"
          value={pendingTasksCount}
          subtitle={`${tasks.length} Total Assignments`}
          tone={pendingTasksCount > 0 ? "warning" : "accent"}
          onClick={() => navigate(`${base}/tasks`)}
        />
        <StudentStatCard
          icon={<Calendar size={20} />}
          title="Attendance"
          value={`${attendanceStats.percentage}%`}
          subtitle={attendanceStats.percentage >= 75 ? "Eligible for Exams" : "Low Attendance Alert"}
          tone={attendanceStats.percentage >= 75 ? "accent" : "danger"}
          onClick={() => navigate(`${base}/attendance`)}
        />
      </div>

      {/* Quick Actions Matrix */}
      <div>
        <h3 style={{ margin: '8px 0 12px', fontSize: 17, fontWeight: 700, color: 'var(--color-text)' }}>
          Quick Learning Actions
        </h3>
        <div className="grid grid-3" style={{ gap: 12 }}>
          <StudentActionCard
            icon={<BookOpen size={20} />}
            title="Study Materials Hub"
            subtitle="Browse syllabus, notes & PDFs"
            onClick={() => navigate(`${base}/materials`)}
          />
          <StudentActionCard
            icon={<ClipboardList size={20} />}
            title="Take Online Test"
            subtitle={`${counts.tests} unit assessments available`}
            onClick={() => navigate(`${base}/tests`)}
          />
          <StudentActionCard
            icon={<ListTodo size={20} />}
            title="Submit Assignments"
            subtitle={`${pendingTasksCount} tasks awaiting submission`}
            onClick={() => navigate(`${base}/tasks`)}
          />
          <StudentActionCard
            icon={<BarChart3 size={20} />}
            title="Academic Reports"
            subtitle="View marks, grades & performance"
            onClick={() => navigate(`${base}/reports`)}
          />
          <StudentActionCard
            icon={<Megaphone size={20} />}
            title="Notice Board"
            subtitle="Official circulars & examination alerts"
            onClick={() => navigate(`${base}/notices`)}
          />
          <StudentActionCard
            icon={<FolderDown size={20} />}
            title="Downloads Center"
            subtitle="Access MongoDB files & archives"
            onClick={() => navigate(`${base}/downloads`)}
          />
        </div>
      </div>

      {/* 2-Column Section: Recent Announcements & Latest Study Materials */}
      <div className="grid grid-2" style={{ gap: 16 }}>
        {/* Recent Announcements */}
        <StudentContentCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Megaphone size={18} style={{ color: 'var(--color-primary)' }} />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Notice Board Highlights</h3>
            </div>
            <Button variant="secondary" onClick={() => navigate(`${base}/notices`)} style={{ fontSize: 12, padding: '4px 8px' }}>
              View All <ArrowRight size={13} style={{ marginLeft: 2 }} />
            </Button>
          </div>

          {notices.length > 0 ? (
            <div className="grid" style={{ gap: 10 }}>
              {notices.map((n) => (
                <div
                  key={n.id}
                  onClick={() => navigate(`${base}/notices`)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: n.priority === 'urgent' ? 'rgba(239, 68, 68, 0.05)' : 'var(--color-bg-secondary)',
                    borderLeft: n.priority === 'urgent' ? '3px solid var(--color-danger)' : '3px solid var(--color-primary)',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 2 }}>
                    <span className="badge badge-secondary" style={{ fontSize: 10 }}>{n.category || 'Academic'}</span>
                    <span>{n.createdAt?.toDate ? n.createdAt.toDate().toLocaleDateString() : 'Today'}</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>
                    {n.title}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
              No recent announcements posted.
            </div>
          )}
        </StudentContentCard>

        {/* Latest Study Materials */}
        <StudentContentCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookOpen size={18} style={{ color: 'var(--color-primary)' }} />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Latest Study Materials</h3>
            </div>
            <Button variant="secondary" onClick={() => navigate(`${base}/materials`)} style={{ fontSize: 12, padding: '4px 8px' }}>
              Explore Hub <ArrowRight size={13} style={{ marginLeft: 2 }} />
            </Button>
          </div>

          {materials.length > 0 ? (
            <div className="grid" style={{ gap: 10 }}>
              {materials.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--color-bg-secondary)'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>
                      {m.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', gap: 8, marginTop: 2 }}>
                      <span>{m.subject || 'Tamil'}</span>
                      <span>•</span>
                      <span>{m.unitNumber ? `Unit ${m.unitNumber}` : (m.unit || 'Notes')}</span>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => setViewingDoc(m)}
                    style={{ padding: '6px 10px', fontSize: 12 }}
                  >
                    <Eye size={14} style={{ marginRight: 4 }} /> View
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
              No study materials uploaded yet for this academic year.
            </div>
          )}
        </StudentContentCard>
      </div>

      {/* Notifications Banner */}
      {notifications.length > 0 && (
        <StudentContentCard style={{ borderLeft: '4px solid var(--color-primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Bell size={18} style={{ color: 'var(--color-primary)' }} />
              <div>
                <strong style={{ fontSize: 14 }}>Latest Alert: {notifications[0].title}</strong>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{notifications[0].body || notifications[0].message}</div>
              </div>
            </div>
            <Button variant="secondary" onClick={() => navigate(`${base}/notifications`)} style={{ fontSize: 12 }}>
              Notification Center ({counts.notifications})
            </Button>
          </div>
        </StudentContentCard>
      )}

      {/* In-App PDF Viewer Modal */}
      <PdfViewerModal
        isOpen={!!viewingDoc}
        onClose={() => setViewingDoc(null)}
        material={viewingDoc}
      />
    </div>
  );
};

export default StudentDashboard;
