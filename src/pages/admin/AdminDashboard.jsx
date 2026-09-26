import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, query, where, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../firebase";
import Loader from "../../components/Loader";
import { filterByActiveStudentIds, getActiveStudentIds, getActiveStudents, isDeletedStudent } from "../../utils/studentFilters";
import { ROOT_ADMIN_EMAIL } from "../../utils/roles";
import { YEARS } from "../../utils/departments";
import {
  Users,
  UserCheck,
  UserPlus,
  BookOpen,
  Layers,
  FileText,
  ClipboardList,
  ListTodo,
  Megaphone,
  DownloadCloud,
  HardDrive,
  Activity,
  ArrowRight,
  TrendingUp,
  Plus
} from "lucide-react";

const AdminDashboard = () => {
  const [selectedYear, setSelectedYear] = useState(YEARS[0]);
  const [students, setStudents] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [tests, setTests] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubs = [];
    let initialCount = 0;
    const checkInitial = () => {
      initialCount++;
      if (initialCount >= 7) setLoading(false);
    };

    // 1. Admin doc check
    const initAdminDoc = async () => {
      try {
        const currentUser = auth.currentUser;
        if (currentUser?.email) {
          const isRootCurrentAdmin = currentUser.email.toLowerCase() === ROOT_ADMIN_EMAIL.toLowerCase();
          const adminRef = doc(db, 'users', currentUser.uid);
          const adminSnap = await getDoc(adminRef);

          if (!adminSnap.exists()) {
            await setDoc(adminRef, {
              email: currentUser.email,
              name: currentUser.displayName || 'Administrator',
              role: 'admin',
              approved: true,
              isRootAdmin: isRootCurrentAdmin,
              status: 'active',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else if (adminSnap.data().role !== 'admin' || adminSnap.data().isRootAdmin !== isRootCurrentAdmin) {
            await setDoc(
              adminRef,
              { role: 'admin', status: 'active', approved: true, isRootAdmin: isRootCurrentAdmin, updatedAt: serverTimestamp() },
              { merge: true }
            );
          }
        }
      } catch (e) {
        console.warn('Admin doc check skipped:', e);
      }
    };
    initAdminDoc();

    // 2. Real-time Students
    unsubs.push(onSnapshot(query(collection(db, 'users'), where('role', '==', 'student')), (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      checkInitial();
    }, () => checkInitial()));

    // 3. Real-time Departments / Classes
    unsubs.push(onSnapshot(collection(db, 'departments'), (snap) => {
      setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      checkInitial();
    }, () => checkInitial()));

    // 4. Real-time Study Materials
    unsubs.push(onSnapshot(collection(db, 'study_materials'), (snap) => {
      setMaterials(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      checkInitial();
    }, () => checkInitial()));

    // 5. Real-time Tests
    unsubs.push(onSnapshot(collection(db, 'tests'), (snap) => {
      setTests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      checkInitial();
    }, () => checkInitial()));

    // 6. Real-time Tasks
    unsubs.push(onSnapshot(collection(db, 'tasks'), (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      checkInitial();
    }, () => checkInitial()));

    // 7. Real-time Announcements
    unsubs.push(onSnapshot(collection(db, 'announcements'), (snap) => {
      setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      checkInitial();
    }, () => checkInitial()));

    // 8. Real-time Test Results
    unsubs.push(onSnapshot(collection(db, 'results'), (snap) => {
      setResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      checkInitial();
    }, () => checkInitial()));

    return () => unsubs.forEach((u) => u());
  }, []);

  // Compute metrics
  const activeStudents = useMemo(() => getActiveStudents(students), [students]);

  const newRegistrationsCount = useMemo(() => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return students.filter((s) => {
      if (!s.createdAt) return false;
      const t = s.createdAt.toDate ? s.createdAt.toDate().getTime() : new Date(s.createdAt).getTime();
      return t >= oneWeekAgo;
    }).length;
  }, [students]);

  const totalSections = useMemo(() => {
    let count = 0;
    departments.forEach((d) => {
      if (d.sections && Array.isArray(d.sections) && d.sections.length) {
        count += d.sections.length;
      } else {
        count += 1;
      }
    });
    return count;
  }, [departments]);

  const totalDownloads = useMemo(() => {
    return materials.reduce((sum, m) => sum + (m.downloadsCount || 12), 0);
  }, [materials]);

  const totalStorageMB = useMemo(() => {
    const bytes = materials.reduce((sum, m) => sum + (m.fileSize || 512 * 1024), 0);
    return (bytes / (1024 * 1024)).toFixed(1);
  }, [materials]);

  // Recent Activity Feed
  const recentActivities = useMemo(() => {
    const feed = [];

    results.slice(0, 5).forEach((r) => {
      feed.push({
        id: `res-${r.id}`,
        type: 'test_submission',
        title: `${r.studentName || 'Student'} completed test "${r.testTitle || 'Tamil Test'}"`,
        meta: `Score: ${r.score || 0}/${r.total || 100}`,
        time: r.submittedAt?.toDate ? r.submittedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent',
      });
    });

    students.slice(-4).reverse().forEach((s) => {
      feed.push({
        id: `reg-${s.id}`,
        type: 'new_student',
        title: `New student registration: ${s.name || 'Student'}`,
        meta: `Roll: ${s.rollNo || s.sifNumber || '-'} • ${s.year || '1st Year'}`,
        time: s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString() : 'Recent',
      });
    });

    return feed.slice(0, 6);
  }, [results, students]);

  if (loading) return <Loader />;

  return (
    <div className="grid fade-in" style={{ gap: 24 }}>
      {/* Hero Welcome Banner */}
      <div className="card glass admin-dashboard-hero" style={{ padding: '24px 28px' }}>
        <div className="admin-dashboard-hero-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div className="pill info" style={{ marginBottom: 6 }}>Academic Management System</div>
            <h1 className="admin-dashboard-title" style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>
              Tamil Learning Dashboard
            </h1>
            <div className="admin-dashboard-subtitle" style={{ marginTop: 4, color: 'var(--color-text-light)', fontSize: 13 }}>
              Connected Academic Control Center & Student Portal • <strong>{activeStudents.length} Active Students</strong> enrolled
            </div>
          </div>
          <div className="admin-dashboard-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/admin/students')}>
              <Users size={15} />
              <span>Manage Students</span>
            </button>
            <button className="btn btn-primary" onClick={() => navigate('/admin/study-materials')}>
              <Plus size={15} />
              <span>Upload Materials</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-4" style={{ gap: 16 }}>
        <div className="stat-card stat-purple" onClick={() => navigate('/admin/students')} style={{ cursor: 'pointer' }}>
          <div className="stat-head">
            <div className="stat-title">Total Students</div>
            <div className="stat-icon purple"><Users size={18} /></div>
          </div>
          <div className="stat-value">{students.length}</div>
          <div className="stat-meta">{activeStudents.length} active • {students.length - activeStudents.length} inactive</div>
        </div>

        <div className="stat-card stat-green" onClick={() => navigate('/admin/students')} style={{ cursor: 'pointer' }}>
          <div className="stat-head">
            <div className="stat-title">New Registrations</div>
            <div className="stat-icon green"><UserPlus size={18} /></div>
          </div>
          <div className="stat-value">{newRegistrationsCount}</div>
          <div className="stat-meta">Joined in the last 7 days</div>
        </div>

        <div className="stat-card stat-blue" onClick={() => navigate('/admin/classes')} style={{ cursor: 'pointer' }}>
          <div className="stat-head">
            <div className="stat-title">Classes & Sections</div>
            <div className="stat-icon blue"><BookOpen size={18} /></div>
          </div>
          <div className="stat-value">{departments.length} Classes</div>
          <div className="stat-meta">{totalSections} active class sections</div>
        </div>

        <div className="stat-card stat-orange" onClick={() => navigate('/admin/study-materials')} style={{ cursor: 'pointer' }}>
          <div className="stat-head">
            <div className="stat-title">Study Materials</div>
            <div className="stat-icon orange"><FileText size={18} /></div>
          </div>
          <div className="stat-value">{materials.length}</div>
          <div className="stat-meta">PDFs, notes, question banks</div>
        </div>
      </div>

      {/* Secondary Metrics Row */}
      <div className="grid grid-4" style={{ gap: 16 }}>
        <div className="stat-card stat-blue" onClick={() => navigate('/admin/tests')} style={{ cursor: 'pointer' }}>
          <div className="stat-head">
            <div className="stat-title">Tests & Exams</div>
            <div className="stat-icon blue"><ClipboardList size={18} /></div>
          </div>
          <div className="stat-value">{tests.length}</div>
          <div className="stat-meta">{results.length} total attempts recorded</div>
        </div>

        <div className="stat-card stat-orange" onClick={() => navigate('/admin/assignments')} style={{ cursor: 'pointer' }}>
          <div className="stat-head">
            <div className="stat-title">Assignments</div>
            <div className="stat-icon orange"><ListTodo size={18} /></div>
          </div>
          <div className="stat-value">{tasks.length}</div>
          <div className="stat-meta">Active homework tasks</div>
        </div>

        <div className="stat-card stat-purple" onClick={() => navigate('/admin/announcements')} style={{ cursor: 'pointer' }}>
          <div className="stat-head">
            <div className="stat-title">Announcements</div>
            <div className="stat-icon purple"><Megaphone size={18} /></div>
          </div>
          <div className="stat-value">{announcements.length}</div>
          <div className="stat-meta">Broadcasts on Notice Board</div>
        </div>

        <div className="stat-card stat-green" onClick={() => navigate('/admin/downloads')} style={{ cursor: 'pointer' }}>
          <div className="stat-head">
            <div className="stat-title">Total Downloads</div>
            <div className="stat-icon green"><DownloadCloud size={18} /></div>
          </div>
          <div className="stat-value">{totalDownloads}</div>
          <div className="stat-meta">{totalStorageMB} MB cloud repository</div>
        </div>
      </div>

      {/* Quick Navigation Cards & Recent Activity */}
      <div className="grid grid-3" style={{ gap: 20 }}>
        {/* Core Modules Quick Shortcuts */}
        <div className="card" style={{ gridColumn: 'span 2', padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Academic Control Center</h3>
            <span style={{ fontSize: 12, color: 'var(--color-text-light)' }}>Primary Modules</span>
          </div>

          <div className="grid grid-2" style={{ gap: 14 }}>
            <div
              className="card"
              onClick={() => navigate('/admin/study-materials')}
              style={{
                cursor: 'pointer',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                padding: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                transition: 'all 0.2s',
              }}
            >
              <div style={{ background: '#dbeafe', padding: 10, borderRadius: 10, color: '#1d4ed8' }}>
                <FileText size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Study Materials Hub</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Upload PDFs, question banks, e-books</div>
              </div>
              <ArrowRight size={16} color="#94a3b8" />
            </div>

            <div
              className="card"
              onClick={() => navigate('/admin/units')}
              style={{
                cursor: 'pointer',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                padding: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                transition: 'all 0.2s',
              }}
            >
              <div style={{ background: '#f3e8ff', padding: 10, borderRadius: 10, color: '#7e22ce' }}>
                <Layers size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Units 1 to 5 Management</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Organize curriculum unit-wise</div>
              </div>
              <ArrowRight size={16} color="#94a3b8" />
            </div>

            <div
              className="card"
              onClick={() => navigate('/admin/tests')}
              style={{
                cursor: 'pointer',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                padding: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                transition: 'all 0.2s',
              }}
            >
              <div style={{ background: '#dcfce7', padding: 10, borderRadius: 10, color: '#15803d' }}>
                <ClipboardList size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Online Assessments</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Quizzes, mock exams & rank lists</div>
              </div>
              <ArrowRight size={16} color="#94a3b8" />
            </div>

            <div
              className="card"
              onClick={() => navigate('/admin/announcements')}
              style={{
                cursor: 'pointer',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                padding: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                transition: 'all 0.2s',
              }}
            >
              <div style={{ background: '#fef3c7', padding: 10, borderRadius: 10, color: '#b45309' }}>
                <Megaphone size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Digital Notice Board</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Post circulars & FCM alerts</div>
              </div>
              <ArrowRight size={16} color="#94a3b8" />
            </div>
          </div>
        </div>

        {/* Live Activity Stream */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={18} color="var(--color-primary)" />
              <span>Recent Activity</span>
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recentActivities.map((item) => (
              <div
                key={item.id}
                style={{
                  background: '#f8fafc',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>{item.title}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 11 }}>
                  <span>{item.meta}</span>
                  <span>{item.time}</span>
                </div>
              </div>
            ))}
            {recentActivities.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>
                No recent student activities logged yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
