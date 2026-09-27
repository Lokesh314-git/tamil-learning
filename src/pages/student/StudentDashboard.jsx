import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, onSnapshot, query, where } from "../../services/studentMongoApi";
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
import { db } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { openOrDownloadFile } from "../../utils/fileUpload";
import StudentPageHeader from "../../components/studentui/StudentPageHeader";
import StudentStatCard from "../../components/studentui/StudentStatCard";
import StudentActionCard from "../../components/studentui/StudentActionCard";
import StudentContentCard from "../../components/studentui/StudentContentCard";
import Button from "../../components/ui/Button";
import PdfViewerModal from "../../components/PdfViewerModal";

const DEFAULT_KURALS = [
  {
    kuralNo: 1,
    line1: 'அகர முதல எழுத்தெல்லாம் ஆதி',
    line2: 'பகவன் முதற்றே உலகு.',
    meaning: 'எழுத்துக்களுக்கெல்லாம் அகரமே தொடக்கம்; அதுபோல உலகிற்கு ஆதிபகவனே தொடக்கம்.',
    author: 'திருவள்ளுவர்'
  },
  {
    kuralNo: 2,
    line1: 'கற்றதனா லாய பயனென்கொல் வாலறிவன்',
    line2: 'நற்றாள் தொழாஅர் எனின்.',
    meaning: 'தூய அறிவு வடிவான இறைவனின் நற்றாள்களைத் தொழாவிட்டால், கற்ற கல்வியால் என்ன பயன்?',
    author: 'திருவள்ளுவர்'
  },
  {
    kuralNo: 391,
    line1: 'கற்க கசடறக் கற்பவை கற்றபின்',
    line2: 'நிற்க அதற்குத் தக.',
    meaning: 'கற்கத் தகுந்த நூல்களைக் குற்றமறக் கற்க வேண்டும்; கற்ற பிறகு அதன்படி நடக்க வேண்டும்.',
    author: 'திருவள்ளுவர்'
  },
  {
    kuralNo: 392,
    line1: 'எண்ணென்ப ஏனை எழுத்தென்ப இவ்விரண்டும்',
    line2: 'கண்ணென்ப வாழும் உயிர்க்கு.',
    meaning: 'எண்ணும் எழுத்தும் ஆகிய இரண்டுமே இவ்வுலகில் வாழும் மக்களுக்கு இரு கண்கள் போன்றவை.',
    author: 'திருவள்ளுவர்'
  },
  {
    kuralNo: 396,
    line1: 'தொட்டனைத் தூறும் மணற்கேணி மாந்தர்க்குக்',
    line2: 'கற்றனைத் தூறும் அறிவு.',
    meaning: 'மணற்கேணியில் தோண்டத் தோண்ட நீர் ஊறும்; அதுபோல மக்கள் கற்கக் கற்க அறிவு பெருகும்.',
    author: 'திருவள்ளுவர்'
  },
  {
    kuralNo: 131,
    line1: 'ஒழுக்கம் விழுப்பந் தரலான் ஒழுக்கம்',
    line2: 'உயிரினும் ஓம்பப் படும்.',
    meaning: 'ஒழுக்கமே ஒருவருக்கு மேன்மையைத் தரும்; அதனால் ஒழுக்கம் உயிரை விட மேலானதாகக் காக்கப்பட வேண்டும்.',
    author: 'திருவள்ளுவர்'
  },
  {
    kuralNo: 619,
    line1: 'தெய்வத்தான் ஆகா தெனினும் முயற்சிதன்',
    line2: 'மெய்வருத்தக் கூலி தரும்.',
    meaning: 'விதியினால் இயலாது போனாலும், ஒருவரது உடலுழைப்பும் விடாமுயற்சியும் உரிய பலனைத் தரும்.',
    author: 'திருவள்ளுவர்'
  },
  {
    kuralNo: 102,
    line1: 'காலத்தினாற் செய்த நன்றி சிறிதெனினும்',
    line2: 'ஞாலத்தின் மாணப் பெரிது.',
    meaning: 'தக்க சமயத்தில் ஒருவர் செய்த உதவி சிறியதாக இருந்தாலும், அது உலகத்தை விடப் பெரியதாகும்.',
    author: 'திருவள்ளுவர்'
  },
  {
    kuralNo: 129,
    line1: 'தீயினால் சுட்டபுண் உள்ளாறும் ஆறாதே',
    line2: 'நாவினால் சுட்ட வடு.',
    meaning: 'தீயினால் சுட்ட காயம் ஆறிவிடும்; ஆனால் நாவினால் சுட்ட கொடிய சொல் வடு ஒருபோதும் ஆறாது.',
    author: 'திருவள்ளுவர்'
  },
  {
    kuralNo: 95,
    line1: 'பணிவுடையன் இன்சொலன் ஆதல் ஒருவற்கு',
    line2: 'அணியல்ல மற்றுப் பிற.',
    meaning: 'பணிவும் இனிய சொற்களுமே ஒருவருக்கு உண்மையான அணிகலன்கள்; மற்றவை அணிகலன்கள் ஆகா.',
    author: 'திருவள்ளுவர்'
  },
  {
    kuralNo: 108,
    line1: 'நன்றி மறப்பது நன்றன்று நன்றல்லது',
    line2: 'அன்றே மறப்பது நன்று.',
    meaning: 'ஒருவர் செய்த நன்மையை மறப்பது நல்லதல்ல; அவர் செய்த தீமையை உடனே மறந்துவிடுவது நல்லது.',
    author: 'திருவள்ளுவர்'
  },
  {
    kuralNo: 11,
    line1: 'துப்பார்க்குத் துப்பாய துப்பாக்கித் துப்பார்க்குத்',
    line2: 'துப்பாய தூஉம் மழை.',
    meaning: 'உண்பவர்க்கு நல்ல உணவுகளை உண்டாக்கித் தந்து, தானும் ஓர் உணவாக இருப்பது மழையாகும்.',
    author: 'திருவள்ளுவர்'
  }
];

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
  const [adminKurals, setAdminKurals] = useState([]);
  const [loadError, setLoadError] = useState('');

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

    const studentYear = year || profile?.year || '1st Year';

    // 1. Units
    const qUnits = query(collection(db, 'units'), where('year', '==', year));
    unsubscribers.push(onSnapshot(qUnits, (snap) => {
      let count = 0;
      snap.forEach((d) => { if (deptMatch(d.data())) count++; });
      setCounts((c) => ({ ...c, units: count }));
    }, onListenError));

    // 2. Tests (matches student's year or All Years)
    unsubscribers.push(onSnapshot(collection(db, 'tests'), (snap) => {
      let count = 0;
      snap.forEach((d) => {
        const data = d.data() || {};
        const testYear = data.year || 'All Years';
        const yearOk =
          testYear === 'All Years' ||
          testYear === 'All' ||
          testYear === 'all' ||
          testYear.toLowerCase() === studentYear.toLowerCase() ||
          (profile?.year && testYear.toLowerCase() === profile.year.toLowerCase());

        if (yearOk && deptMatch(data)) count++;
      });
      setCounts((c) => ({ ...c, tests: count }));
    }, onListenError));

    // 3. Tasks / Assignments
    unsubscribers.push(onSnapshot(collection(db, 'tasks'), (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        const taskYear = data.year || 'All Years';
        const yearOk =
          taskYear === 'All Years' ||
          taskYear === 'All' ||
          taskYear === 'all' ||
          taskYear.toLowerCase() === studentYear.toLowerCase() ||
          (profile?.year && taskYear.toLowerCase() === profile.year.toLowerCase());

        if (yearOk && deptMatch(data)) list.push({ id: d.id, ...data });
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
      where('studentId', '==', user.uid)
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
        const yearOk = !data.year || data.year === 'All' || data.year === 'All Years' || data.year === year;
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
        const yearOk = !data.year || data.year === 'All' || data.year === 'All Years' || data.year === year;
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

    // 11. Thirukkurals added by admin
    const qKurals = query(collection(db, 'thirukkurals'));
    unsubscribers.push(onSnapshot(qKurals, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        if (data.isActive !== false && data.line1 && data.line2) {
          list.push({ id: d.id, ...data });
        }
      });
      setAdminKurals(list);
    }, onListenError));

    return () => unsubscribers.forEach((u) => u());
  }, [year, user, profile?.departmentId, profile?.year]);

  // Deterministic daily Thirukkural rotation (changes automatically every single day)
  const dailyKural = useMemo(() => {
    const now = new Date();
    const dayNumber = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
    const list = adminKurals.length > 0 ? adminKurals : DEFAULT_KURALS;
    const index = Math.abs(dayNumber) % list.length;
    return list[index];
  }, [adminKurals]);

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
      {/* Welcome Banner with Daily Thirukkural */}
      <StudentContentCard style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #2563eb 100%)',
        color: '#ffffff',
        padding: '24px 28px',
        borderRadius: 16,
        boxShadow: '0 10px 25px -5px rgba(30, 58, 138, 0.35)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Subtle decorative background watermark */}
        <div style={{
          position: 'absolute',
          top: -20,
          right: -20,
          fontSize: 140,
          color: 'rgba(255, 255, 255, 0.04)',
          fontWeight: 900,
          fontFamily: 'serif',
          pointerEvents: 'none',
          userSelect: 'none'
        }}>
          குறள்
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 18, position: 'relative', zIndex: 1 }}>
          <div style={{ maxWidth: '650px', flex: '1 1 320px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.22)', color: '#fff', fontSize: 12, fontWeight: 600 }}>
                {year || profile?.year || '1st Year'}
              </span>
              <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.22)', color: '#fff', fontSize: 12 }}>
                Section {profile?.section || 'A'}
              </span>
              {profile?.sifNumber && (
                <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.22)', color: '#fff', fontSize: 12 }}>
                  SIF: {profile.sifNumber}
                </span>
              )}
            </div>
            <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#ffffff' }}>
              Welcome back, {profile?.name || 'Student'}! 👋
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255, 255, 255, 0.9)' }}>
              {profile?.departmentName || 'B.A. Tamil Literature'} • Academic Year 2026-2027
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.16)',
              backdropFilter: 'blur(8px)',
              padding: '12px 18px',
              borderRadius: 12,
              textAlign: 'center',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              minWidth: 100
            }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'rgba(255, 255, 255, 0.85)' }}>
                Attendance
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>
                {attendanceStats.percentage}%
              </div>
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.16)',
              backdropFilter: 'blur(8px)',
              padding: '12px 18px',
              borderRadius: 12,
              textAlign: 'center',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              minWidth: 100
            }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'rgba(255, 255, 255, 0.85)' }}>
                Avg Score
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>
                {avgScore}%
              </div>
            </div>
          </div>
        </div>

        {/* Daily Thirukkural Widget */}
        <div style={{
          marginTop: 20,
          padding: '16px 20px',
          background: 'rgba(15, 23, 42, 0.25)',
          backdropFilter: 'blur(12px)',
          borderRadius: 14,
          border: '1px solid rgba(255, 255, 255, 0.22)',
          position: 'relative',
          zIndex: 1
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 8,
            paddingBottom: 6,
            borderBottom: '1px solid rgba(255, 255, 255, 0.15)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 20,
                letterSpacing: 0.5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}>
                📜 இன்றைய திருக்குறள்
              </span>
              <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.85)', fontWeight: 500 }}>
                Thirukkural of the Day
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.75)' }}>
              {new Date().toLocaleDateString('ta-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>

          <div style={{
            fontFamily: "'Mukta Malar', 'Noto Sans Tamil', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 16,
            lineHeight: 1.6,
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '0.3px',
            textShadow: '0 1px 2px rgba(0,0,0,0.2)'
          }}>
            <div>{dailyKural.line1}</div>
            <div>{dailyKural.line2}</div>
          </div>

          {(dailyKural.meaning || dailyKural.porul) && (
            <div style={{
              marginTop: 8,
              fontSize: 13,
              color: 'rgba(255, 255, 255, 0.92)',
              lineHeight: 1.4,
              display: 'flex',
              alignItems: 'baseline',
              gap: 6
            }}>
              <span style={{ fontWeight: 700, color: '#fde047', fontSize: 12 }}>பொருள்:</span>
              <span>{dailyKural.meaning || dailyKural.porul}</span>
            </div>
          )}

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            marginTop: 6,
            fontSize: 11,
            color: 'rgba(255, 255, 255, 0.7)',
            fontStyle: 'italic'
          }}>
            — {dailyKural.author || 'திருவள்ளுவர்'}
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
