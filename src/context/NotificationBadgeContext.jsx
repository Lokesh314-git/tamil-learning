import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  collection,
  onSnapshot,
  query,
  where
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import NotificationToastContainer from '../components/NotificationToastContainer';

const NotificationBadgeContext = createContext({
  adminCounts: {},
  studentCounts: {},
  toasts: [],
  addToast: () => {},
  dismissToast: () => {},
  markSectionAsSeen: () => {},
  markItemAsRead: () => {},
  refreshCounts: () => {}
});

export const useNotificationBadges = () => useContext(NotificationBadgeContext);

export const NotificationBadgeProvider = ({ children }) => {
  const { user, profile, role } = useAuth();
  const location = useLocation();

  const userKey = user?.uid || role || 'guest';
  const storageKey = `tl_seen_${userKey}`;
  const readNotifsKey = `tl_read_notifs_${userKey}`;

  // Session-bound tracked doc IDs to avoid popping toasts for existing records on first page load
  const knownDocIds = useRef(new Set());
  const initialLoadDone = useRef(false);
  const mountTime = useRef(Date.now());

  // Real-time popups state
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((toastData) => {
    const id = toastData.id || `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newToast = { ...toastData, id };
    setToasts((prev) => [newToast, ...prev.slice(0, 4)]); // max 5 simultaneous toasts
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Read saved timestamps and read IDs from localStorage
  const [seenTimestamps, setSeenTimestamps] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [readNotifIds, setReadNotifIds] = useState(() => {
    try {
      const saved = localStorage.getItem(readNotifsKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Reload user's saved state whenever authentication changes
  useEffect(() => {
    try {
      const savedSeen = localStorage.getItem(`tl_seen_${userKey}`);
      if (savedSeen) setSeenTimestamps(JSON.parse(savedSeen));
      else setSeenTimestamps({});

      const savedReads = localStorage.getItem(`tl_read_notifs_${userKey}`);
      if (savedReads) setReadNotifIds(JSON.parse(savedReads));
      else setReadNotifIds([]);
    } catch (_) {}
  }, [userKey]);

  const [adminCounts, setAdminCounts] = useState({
    students: 0,
    attendance: 0,
    studyMaterials: 0,
    units: 0,
    tests: 0,
    assignments: 0,
    announcements: 0,
    notifications: 0,
    feedback: 0,
    downloads: 0,
    notes: 0
  });

  const [studentCounts, setStudentCounts] = useState({
    materials: 0,
    units: 0,
    tests: 0,
    tasks: 0,
    attendance: 0,
    reports: 0,
    notices: 0,
    notifications: 0,
    downloads: 0,
    notes: 0,
    feedback: 0
  });

  // Mark a section as read/opened
  const markSectionAsSeen = useCallback((sectionKey) => {
    if (!sectionKey) return;
    const now = Date.now();
    setSeenTimestamps((prev) => {
      const updated = { ...prev, [sectionKey]: now };
      try {
        localStorage.setItem(`tl_seen_${userKey}`, JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save seen timestamp:', e);
      }
      return updated;
    });
  }, [userKey]);

  // Mark an individual notification as read
  const markItemAsRead = useCallback((itemId) => {
    if (!itemId) return;
    setReadNotifIds((prev) => {
      if (prev.includes(itemId)) return prev;
      const updated = [...prev, itemId];
      try {
        localStorage.setItem(`tl_read_notifs_${userKey}`, JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save read notification:', e);
      }
      return updated;
    });
  }, [userKey]);

  // Automatically mark sections as read when navigating to their respective routes
  useEffect(() => {
    const path = location.pathname;

    if (role === 'admin') {
      if (path.includes('/admin/students')) markSectionAsSeen('students');
      else if (path.includes('/admin/attendance')) markSectionAsSeen('attendance');
      else if (path.includes('/admin/study-materials')) markSectionAsSeen('studyMaterials');
      else if (path.includes('/admin/units')) markSectionAsSeen('units');
      else if (path.includes('/admin/tests')) markSectionAsSeen('tests');
      else if (path.includes('/admin/assignments') || path.includes('/admin/tasks')) markSectionAsSeen('assignments');
      else if (path.includes('/admin/announcements')) markSectionAsSeen('announcements');
      else if (path.includes('/admin/notifications')) markSectionAsSeen('notifications');
      else if (path.includes('/admin/feedback')) markSectionAsSeen('feedback');
      else if (path.includes('/admin/downloads')) markSectionAsSeen('downloads');
      else if (path.includes('/admin/notes')) markSectionAsSeen('notes');
    } else {
      if (path.includes('/materials')) markSectionAsSeen('materials');
      else if (path.includes('/units')) markSectionAsSeen('units');
      else if (path.includes('/tests')) markSectionAsSeen('tests');
      else if (path.includes('/tasks')) markSectionAsSeen('tasks');
      else if (path.includes('/attendance')) markSectionAsSeen('attendance');
      else if (path.includes('/reports')) markSectionAsSeen('reports');
      else if (path.includes('/notices')) markSectionAsSeen('notices');
      else if (path.includes('/notifications')) markSectionAsSeen('notifications');
      else if (path.includes('/feedback')) markSectionAsSeen('feedback');
      else if (path.includes('/downloads')) markSectionAsSeen('downloads');
      else if (path.includes('/notes')) markSectionAsSeen('notes');
    }
  }, [location.pathname, role, markSectionAsSeen]);

  // Helper to extract timestamp from firestore or JS Date or ISO string
  const getItemTime = (item) => {
    if (!item) return 0;
    if (item.createdAt?.toDate) return item.createdAt.toDate().getTime();
    if (item.createdAt instanceof Date) return item.createdAt.getTime();
    if (typeof item.createdAt === 'string') {
      const t = new Date(item.createdAt).getTime();
      if (!Number.isNaN(t)) return t;
    }
    if (typeof item.createdAt === 'number') return item.createdAt;
    if (item.timestamp?.toDate) return item.timestamp.toDate().getTime();
    if (item.timestamp) {
      const t = new Date(item.timestamp).getTime();
      if (!Number.isNaN(t)) return t;
    }
    if (item.updatedAt?.toDate) return item.updatedAt.toDate().getTime();
    if (item.updatedAt instanceof Date) return item.updatedAt.getTime();
    if (item.repliedAt?.toDate) return item.repliedAt.toDate().getTime();
    if (item.repliedAt instanceof Date) return item.repliedAt.getTime();
    if (item.submittedAt) {
      const t = new Date(item.submittedAt).getTime();
      if (!Number.isNaN(t)) return t;
    }
    return 0;
  };

  // ============================================================
  // ADMIN REAL-TIME BADGE LISTENERS & REAL-TIME POPUP TOASTS
  // ============================================================
  useEffect(() => {
    if (!user || role !== 'admin') {
      return;
    }

    const unsubs = [];
    let isInitialUsers = true;
    let isInitialSubs = true;
    let isInitialFeedback = true;
    let isInitialAttendance = true;

    // 1. Student Management
    try {
      const qUsers = query(collection(db, 'users'), where('role', '==', 'student'));
      unsubs.push(onSnapshot(qUsers, (snap) => {
        let pending = 0;
        const lastSeen = seenTimestamps.students || 0;

        snap.docChanges().forEach((change) => {
          const u = change.doc.data();
          const docId = change.doc.id;

          if (isInitialUsers) {
            knownDocIds.current.add(docId);
          } else if (change.type === 'added' && !knownDocIds.current.has(docId)) {
            knownDocIds.current.add(docId);
            addToast({
              type: 'student',
              title: '👤 New Student Registered',
              message: `${u.name || 'New Student'} (${u.sifNumber || u.rollNumber || 'Student'}) joined ${u.year || ''}.`,
              link: '/admin/students',
              linkText: 'View Student Profile →'
            });
          }
        });
        isInitialUsers = false;

        snap.forEach((d) => {
          const u = d.data();
          const createdTime = getItemTime(u);
          const isPendingStatus = u.status === 'pending' || u.isPending === true || u.isVerified === false;
          if (isPendingStatus && createdTime > lastSeen) {
            pending++;
          }
        });
        setAdminCounts((prev) => ({ ...prev, students: pending }));
      }, (err) => console.warn('Admin badge users listener:', err)));
    } catch (err) {
      console.warn('Users query error:', err);
    }

    // 2. Student Feedback
    try {
      const qFeedback = collection(db, 'feedback');
      unsubs.push(onSnapshot(qFeedback, (snap) => {
        let unread = 0;
        const lastSeen = seenTimestamps.feedback || 0;

        snap.docChanges().forEach((change) => {
          const f = change.doc.data();
          const docId = change.doc.id;

          if (isInitialFeedback) {
            knownDocIds.current.add(docId);
          } else if (change.type === 'added' && !knownDocIds.current.has(docId)) {
            knownDocIds.current.add(docId);
            addToast({
              type: 'feedback',
              title: '💬 New Student Feedback',
              message: `${f.studentName || 'A student'} submitted: "${(f.message || f.subject || '').substring(0, 55)}..."`,
              link: '/admin/feedback',
              linkText: 'View Feedback & Reply →'
            });
          }
        });
        isInitialFeedback = false;

        snap.forEach((d) => {
          const f = d.data();
          const createdTime = getItemTime(f);
          const isResolved = f.status === 'resolved';
          const hasReply = Boolean(f.adminReply || f.reply || f.response || f.adminResponse);
          const isUnanswered = !hasReply && !isResolved;
          const isPending = f.status === 'open' || f.status === 'pending' || f.status === 'new';

          if (isUnanswered || isPending) {
            unread++;
          } else if (f.isRead === false && createdTime > lastSeen) {
            unread++;
          }
        });
        setAdminCounts((prev) => ({ ...prev, feedback: unread }));
      }, (err) => console.warn('Admin badge feedback listener:', err)));
    } catch (err) {
      console.warn('Feedback query error:', err);
    }

    // 3. Assignment Submissions
    try {
      const qSubs = collection(db, 'task_submissions');
      unsubs.push(onSnapshot(qSubs, (snap) => {
        let pendingGrading = 0;
        const lastSeen = seenTimestamps.assignments || 0;

        snap.docChanges().forEach((change) => {
          const s = change.doc.data();
          const docId = change.doc.id;

          if (isInitialSubs) {
            knownDocIds.current.add(docId);
          } else if (change.type === 'added' && !knownDocIds.current.has(docId)) {
            knownDocIds.current.add(docId);
            addToast({
              type: 'submission',
              title: '📄 New Assignment Submission',
              message: `${s.studentName || 'Student'} submitted "${s.taskTitle || 'Assignment'}" (${s.year || ''}).`,
              link: '/admin/assignments',
              linkText: 'Grade Submission →'
            });
          }
        });
        isInitialSubs = false;

        snap.forEach((d) => {
          const s = d.data();
          const submittedTime = s.submittedAt?.toDate ? s.submittedAt.toDate().getTime() : getItemTime(s);
          const isUngraded = s.status === 'submitted' || s.status === 'pending' || (!s.grade && s.grade !== 0 && !s.marks && s.marks !== 0 && !s.isGraded);
          if (isUngraded && submittedTime > lastSeen) {
            pendingGrading++;
          }
        });
        setAdminCounts((prev) => ({ ...prev, assignments: pendingGrading }));
      }, (err) => console.warn('Admin badge task_submissions listener:', err)));
    } catch (err) {
      console.warn('Task submissions query error:', err);
    }

    // 4. Online Assessments
    try {
      const qTests = collection(db, 'tests');
      unsubs.push(onSnapshot(qTests, (snap) => {
        let activeTests = 0;
        const lastSeen = seenTimestamps.tests || 0;
        snap.forEach((d) => {
          const t = d.data();
          const createdTime = getItemTime(t);
          if ((t.status === 'active' || t.isActive === true) && createdTime > lastSeen) {
            activeTests++;
          }
        });
        setAdminCounts((prev) => ({ ...prev, tests: activeTests }));
      }, (err) => console.warn('Admin badge tests listener:', err)));
    } catch (err) {
      console.warn('Tests query error:', err);
    }

    // 5. Notice Board
    try {
      const qNotices = collection(db, 'announcements');
      unsubs.push(onSnapshot(qNotices, (snap) => {
        let count = 0;
        const lastSeen = seenTimestamps.announcements || 0;
        snap.forEach((d) => {
          const a = d.data();
          const createdTime = getItemTime(a);
          if (createdTime > lastSeen) {
            count++;
          }
        });
        setAdminCounts((prev) => ({ ...prev, announcements: count }));
      }, (err) => console.warn('Admin badge announcements listener:', err)));
    } catch (err) {
      console.warn('Announcements query error:', err);
    }

    // 6. Push Alerts
    try {
      const qNotifs = collection(db, 'notifications');
      unsubs.push(onSnapshot(qNotifs, (snap) => {
        let unread = 0;
        const lastSeen = seenTimestamps.notifications || 0;
        snap.forEach((d) => {
          const n = d.data();
          // Exclude student-only announcements or student alerts from admin unread counter
          if (n.recipientRole === 'student') return;
          const createdTime = getItemTime(n);
          if ((n.status === 'pending' || n.isRead === false || n.read === false) && createdTime > lastSeen) {
            unread++;
          }
        });
        setAdminCounts((prev) => ({ ...prev, notifications: unread }));
      }, (err) => console.warn('Admin badge notifications listener:', err)));
    } catch (err) {
      console.warn('Notifications query error:', err);
    }


    // 7. Study Materials Hub
    try {
      const qMaterials = collection(db, 'study_materials');
      unsubs.push(onSnapshot(qMaterials, (snap) => {
        let newMaterials = 0;
        const lastSeen = seenTimestamps.studyMaterials || 0;
        snap.forEach((d) => {
          const m = d.data();
          const createdTime = getItemTime(m);
          if ((m.status === 'pending' || createdTime > lastSeen) && createdTime > 0) {
            newMaterials++;
          }
        });
        setAdminCounts((prev) => ({ ...prev, studyMaterials: newMaterials }));
      }, (err) => console.warn('Admin badge study materials listener:', err)));
    } catch (err) {
      console.warn('Study materials query error:', err);
    }

    // 8. Test Attempts / Results
    try {
      let isInitialResultsAdmin = true;
      const qResults = collection(db, 'results');
      unsubs.push(onSnapshot(qResults, (snap) => {
        snap.docChanges().forEach((change) => {
          const r = change.doc.data();
          const docId = change.doc.id;

          if (isInitialResultsAdmin) {
            knownDocIds.current.add(docId);
          } else if (change.type === 'added' && !knownDocIds.current.has(docId)) {
            knownDocIds.current.add(docId);
            addToast({
              type: 'result',
              title: '📊 Test Completed by Student',
              message: `${r.studentName || 'A student'} completed "${r.testTitle || 'Test'}": Score ${r.score}/${r.totalQuestions || r.total || 100} (${r.percentage}%).`,
              link: '/admin/tests',
              linkText: 'View Test Analytics →'
            });
          }
        });
        isInitialResultsAdmin = false;
      }, (err) => console.warn('Admin badge results listener:', err)));
    } catch (err) {
      console.warn('Results query error:', err);
    }

    return () => {
      unsubs.forEach((unsub) => unsub && unsub());
    };
  }, [user, role, seenTimestamps, addToast]);

  // ============================================================
  // STUDENT REAL-TIME BADGE LISTENERS & REAL-TIME POPUP TOASTS
  // ============================================================
  useEffect(() => {
    if (!user || role === 'admin') {
      return;
    }

    const studentYear = profile?.year || '1st Year';
    const studentDeptId = profile?.departmentId || '';
    const studentSection = profile?.section || '';
    const studentUid = user.uid || profile?.id || '';
    const encYear = encodeURIComponent(studentYear);

    // Strict multi-dimensional class matching helpers
    const checkYearMatch = (itemYear) => {
      if (!itemYear || itemYear === 'all' || itemYear === 'All' || itemYear === 'All Years') return true;
      return String(itemYear).toLowerCase() === String(studentYear).toLowerCase();
    };

    const checkDeptMatch = (itemDeptId) => {
      if (!itemDeptId || itemDeptId === 'all' || itemDeptId === 'All') return true;
      if (!studentDeptId) return true;
      return String(itemDeptId).toLowerCase() === String(studentDeptId).toLowerCase();
    };

    const checkSectionMatch = (itemSection) => {
      if (!itemSection || itemSection === 'all' || itemSection === 'All') return true;
      if (!studentSection) return true;
      return String(itemSection).trim().toUpperCase() === String(studentSection).trim().toUpperCase();
    };

    const unsubs = [];
    let isInitialMaterials = true;
    let isInitialUnits = true;
    let isInitialTests = true;
    let isInitialTasks = true;
    let isInitialNotices = true;
    let isInitialResults = true;
    let isInitialFeedback = true;
    let isInitialNotifs = true;

    let allTests = [];
    let studentResults = [];
    let allTasks = [];
    let studentSubmissions = [];

    const updateTestBadges = () => {
      const attemptedTestIds = new Set(
        studentResults.map((r) => r.testId || r.testTitle)
      );

      const unattempted = allTests.filter((t) => {
        const tYear = t.year || 'All Years';
        const isYearMatch =
          tYear === 'All Years' ||
          tYear === 'All' ||
          tYear === 'all' ||
          tYear.toLowerCase() === studentYear.toLowerCase();

        const isDeptMatch =
          !t.departmentId ||
          t.departmentId === 'all' ||
          !studentDeptId ||
          t.departmentId === studentDeptId;

        const isNotAttempted = !attemptedTestIds.has(t.id) && !attemptedTestIds.has(t.title);
        return isYearMatch && isDeptMatch && isNotAttempted;
      });

      setStudentCounts((prev) => ({ ...prev, tests: unattempted.length }));
    };

    const updateTaskBadges = () => {
      const submittedTaskIds = new Set(
        studentSubmissions.map((s) => s.taskId)
      );

      const unsubmitted = allTasks.filter((t) => {
        const tYear = t.year || 'All Years';
        const isYearMatch =
          tYear === 'All Years' ||
          tYear === 'All' ||
          tYear === 'all' ||
          tYear.toLowerCase() === studentYear.toLowerCase();

        const isDeptMatch =
          !t.departmentId ||
          t.departmentId === 'all' ||
          !studentDeptId ||
          t.departmentId === studentDeptId;

        const isPending = !submittedTaskIds.has(t.id);
        return isYearMatch && isDeptMatch && isPending;
      });

      setStudentCounts((prev) => ({ ...prev, tasks: unsubmitted.length }));
    };

    // 1. Online Tests
    try {
      unsubs.push(onSnapshot(collection(db, 'tests'), (snap) => {
        const list = [];
        snap.docChanges().forEach((change) => {
          const t = change.doc.data();
          const docId = change.doc.id;
          const tYear = t.year || 'All Years';
          const isYearMatch = tYear === 'All Years' || tYear === 'all' || tYear.toLowerCase() === studentYear.toLowerCase();

          if (isInitialTests) {
            knownDocIds.current.add(docId);
          } else if (change.type === 'added' && !knownDocIds.current.has(docId) && isYearMatch) {
            knownDocIds.current.add(docId);
            addToast({
              type: 'test',
              title: '📝 New Online Test Available',
              message: `"${t.title || 'Online Assessment'}" (${t.subject || 'Tamil'}) has been published for ${studentYear}.`,
              link: `/student/year/${encYear}/tests`,
              linkText: 'Take Test Now →'
            });
          }
        });
        isInitialTests = false;

        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        allTests = list;
        updateTestBadges();
      }, (err) => console.warn('Student badge tests listener:', err)));
    } catch (err) {
      console.warn('Tests listener error:', err);
    }

    // 2. Test Results & Reports
    try {
      const qRes = query(collection(db, 'results'), where('studentId', '==', studentUid));
      unsubs.push(onSnapshot(qRes, (snap) => {
        const list = [];
        const lastSeen = seenTimestamps.reports || 0;
        let newResults = 0;

        snap.docChanges().forEach((change) => {
          const r = change.doc.data();
          const docId = change.doc.id;

          if (isInitialResults) {
            knownDocIds.current.add(docId);
          } else if (change.type === 'added' && !knownDocIds.current.has(docId)) {
            knownDocIds.current.add(docId);
            addToast({
              type: 'result',
              title: '🏆 Test Result Released',
              message: `Your score for "${r.testTitle || 'Test'}" is published: ${r.score}/${r.totalQuestions} (${r.percentage}%).`,
              link: `/student/year/${encYear}/reports`,
              linkText: 'View Report Card →'
            });
          }
        });
        isInitialResults = false;

        snap.forEach((d) => {
          const r = d.data();
          list.push({ id: d.id, ...r });
          const createdTime = getItemTime(r);
          if (createdTime > lastSeen) {
            newResults++;
          }
        });
        studentResults = list;
        updateTestBadges();
        setStudentCounts((prev) => ({ ...prev, reports: newResults }));
      }, (err) => console.warn('Student badge results listener:', err)));
    } catch (err) {
      console.warn('Results listener error:', err);
    }

    // 3. Assignments & Tasks
    try {
      unsubs.push(onSnapshot(collection(db, 'tasks'), (snap) => {
        const list = [];
        snap.docChanges().forEach((change) => {
          const task = change.doc.data();
          const docId = change.doc.id;
          const taskYear = task.year || 'All Years';
          const isYearMatch = taskYear === 'All Years' || taskYear === 'all' || taskYear.toLowerCase() === studentYear.toLowerCase();

          if (isInitialTasks) {
            knownDocIds.current.add(docId);
          } else if (change.type === 'added' && !knownDocIds.current.has(docId) && isYearMatch) {
            knownDocIds.current.add(docId);
            addToast({
              type: 'task',
              title: '📋 New Assignment Posted',
              message: `"${task.title || 'Assignment'}" has been assigned for ${studentYear}.`,
              link: `/student/year/${encYear}/tasks`,
              linkText: 'View Assignment →'
            });
          }
        });
        isInitialTasks = false;

        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        allTasks = list;
        updateTaskBadges();
      }, (err) => console.warn('Student badge tasks listener:', err)));
    } catch (err) {
      console.warn('Tasks listener error:', err);
    }

    // 4. Submissions
    try {
      const qSubs = query(collection(db, 'task_submissions'), where('studentId', '==', studentUid));
      unsubs.push(onSnapshot(qSubs, (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        studentSubmissions = list;
        updateTaskBadges();
      }, (err) => console.warn('Student badge submissions listener:', err)));
    } catch (err) {
      console.warn('Submissions listener error:', err);
    }

    // 5. Study Materials
    try {
      unsubs.push(onSnapshot(collection(db, 'study_materials'), (snap) => {
        let count = 0;
        const lastSeen = seenTimestamps.materials || 0;

        snap.docChanges().forEach((change) => {
          const m = change.doc.data();
          const docId = change.doc.id;
          const isYearMatch = !m.year || m.year === 'All' || m.year === 'all' || m.year === 'All Years' || m.year.toLowerCase() === studentYear.toLowerCase();

          if (isInitialMaterials) {
            knownDocIds.current.add(docId);
          } else if (change.type === 'added' && !knownDocIds.current.has(docId) && isYearMatch) {
            knownDocIds.current.add(docId);
            addToast({
              type: 'material',
              title: '📚 New Study Material Uploaded',
              message: `"${m.title || 'Study Material'}" (${m.subject || 'Tamil'}) is now available.`,
              link: `/student/year/${encYear}/materials`,
              linkText: 'View Material →'
            });
          }
        });
        isInitialMaterials = false;

        snap.forEach((d) => {
          const m = d.data();
          const isYearMatch = !m.year || m.year === 'All' || m.year === 'all' || m.year === 'All Years' || m.year.toLowerCase() === studentYear.toLowerCase();
          const isDeptMatch = !m.departmentId || m.departmentId === 'all' || !studentDeptId || m.departmentId === studentDeptId;
          const createdTime = getItemTime(m);

          if (isYearMatch && isDeptMatch && createdTime > lastSeen) {
            count++;
          }
        });
        setStudentCounts((prev) => ({ ...prev, materials: count }));
      }, (err) => console.warn('Student badge materials listener:', err)));
    } catch (err) {
      console.warn('Materials listener error:', err);
    }

    // 6. Units
    try {
      unsubs.push(onSnapshot(collection(db, 'units'), (snap) => {
        let unitCount = 0;
        const lastSeen = seenTimestamps.units || 0;

        snap.docChanges().forEach((change) => {
          const u = change.doc.data();
          const docId = change.doc.id;
          const isYearMatch = !u.year || u.year === 'All' || u.year === 'all' || u.year.toLowerCase() === studentYear.toLowerCase();

          if (isInitialUnits) {
            knownDocIds.current.add(docId);
          } else if (change.type === 'added' && !knownDocIds.current.has(docId) && isYearMatch) {
            knownDocIds.current.add(docId);
            addToast({
              type: 'unit',
              title: '📖 New Unit Published',
              message: `Unit ${u.unitNumber || ''}: "${u.title || 'Curriculum Notes'}" published for ${studentYear}.`,
              link: `/student/year/${encYear}/units`,
              linkText: 'Open Unit →'
            });
          }
        });
        isInitialUnits = false;

        snap.forEach((d) => {
          const u = d.data();
          const isYearMatch = !u.year || u.year === 'All' || u.year === 'all' || u.year.toLowerCase() === studentYear.toLowerCase();
          const createdTime = getItemTime(u);
          if (isYearMatch && createdTime > lastSeen) {
            unitCount++;
          }
        });
        setStudentCounts((prev) => ({ ...prev, units: unitCount }));
      }, (err) => console.warn('Student badge units listener:', err)));
    } catch (err) {
      console.warn('Units listener error:', err);
    }

    // 7. Notice Board / Announcements (Strictly targeted by Year, Department, and Section)
    try {
      unsubs.push(onSnapshot(collection(db, 'announcements'), (snap) => {
        let activeNotices = 0;
        const lastSeen = seenTimestamps.notices || 0;

        snap.docChanges().forEach((change) => {
          const a = change.doc.data();
          const docId = change.doc.id;
          const aYear = a.targetYear || a.year;
          const aDept = a.targetDepartmentId || a.targetDeptId || a.departmentId;
          const aSec = a.targetSection || a.section;

          const isClassMatch = checkYearMatch(aYear) && checkDeptMatch(aDept) && checkSectionMatch(aSec);

          if (isInitialNotices) {
            knownDocIds.current.add(docId);
          } else if (change.type === 'added' && !knownDocIds.current.has(docId) && isClassMatch) {
            knownDocIds.current.add(docId);
            addToast({
              type: 'announcement',
              title: '📢 New Notice Published',
              message: `"${a.title || 'Official Announcement'}" - ${(a.body || a.content || a.message || '').substring(0, 50)}...`,
              link: `/student/year/${encYear}/notices`,
              linkText: 'Read Notice →'
            });
          }
        });
        isInitialNotices = false;

        snap.forEach((d) => {
          const a = d.data();
          const aYear = a.targetYear || a.year;
          const aDept = a.targetDepartmentId || a.targetDeptId || a.departmentId;
          const aSec = a.targetSection || a.section;

          const isClassMatch = checkYearMatch(aYear) && checkDeptMatch(aDept) && checkSectionMatch(aSec);
          const createdTime = getItemTime(a);
          if (isClassMatch && createdTime > lastSeen) {
            activeNotices++;
          }
        });
        setStudentCounts((prev) => ({ ...prev, notices: activeNotices }));
      }, (err) => console.warn('Student badge announcements listener:', err)));
    } catch (err) {
      console.warn('Announcements listener error:', err);
    }

    // 8. Notifications (Strictly targeted by Year, Department, and Section)
    try {
      const qNotifs = collection(db, 'notifications');
      unsubs.push(onSnapshot(qNotifs, (snap) => {
        let unread = 0;
        const lastSeen = seenTimestamps.notifications || 0;

        snap.docChanges().forEach((change) => {
          const n = change.doc.data();
          const docId = change.doc.id;
          if (n.recipientRole === 'admin') return;

          const isForStudent = !n.targetUserId || n.targetUserId === 'all' || n.targetUserId === studentUid || n.studentId === studentUid || n.targetStudentId === studentUid;
          const nYear = n.targetYear || n.year;
          const nDept = n.targetDepartmentId || n.targetDeptId || n.departmentId;
          const nSec = n.targetSection || n.section;

          const isClassMatch = checkYearMatch(nYear) && checkDeptMatch(nDept) && checkSectionMatch(nSec);

          if (isInitialNotifs) {
            knownDocIds.current.add(docId);
          } else if (change.type === 'added' && !knownDocIds.current.has(docId) && isForStudent && isClassMatch) {
            knownDocIds.current.add(docId);
            addToast({
              type: 'notification',
              title: '🔔 New Alert Received',
              message: `${n.title || n.body || 'New notification arrived.'}`,
              link: `/student/year/${encYear}/notifications`,
              linkText: 'Open Notification →'
            });
          }
        });
        isInitialNotifs = false;

        snap.forEach((d) => {
          const n = d.data();
          if (n.recipientRole === 'admin') return;

          const isForStudent = !n.targetUserId || n.targetUserId === 'all' || n.targetUserId === studentUid || n.studentId === studentUid || n.targetStudentId === studentUid;
          const nYear = n.targetYear || n.year;
          const nDept = n.targetDepartmentId || n.targetDeptId || n.departmentId;
          const nSec = n.targetSection || n.section;

          const isClassMatch = checkYearMatch(nYear) && checkDeptMatch(nDept) && checkSectionMatch(nSec);
          const isLocallyRead = readNotifIds.includes(d.id);
          const isDocUnread = n.read === false || n.isRead === false || !n.read;
          const createdTime = getItemTime(n);

          if (isForStudent && isClassMatch && !isLocallyRead && (isDocUnread || createdTime > lastSeen)) {
            unread++;
          }
        });
        setStudentCounts((prev) => ({ ...prev, notifications: unread }));
      }, (err) => console.warn('Student badge notifications listener:', err)));
    } catch (err) {
      console.warn('Notifications listener error:', err);
    }

    // 9. Feedback Replies
    try {
      const isMyFeedback = (f) => {
        if (!f) return false;
        if (studentUid && (f.studentId === studentUid || f.userId === studentUid)) return true;
        if (profile?.email && f.email && String(f.email).toLowerCase() === String(profile.email).toLowerCase()) return true;
        if (user?.email && f.email && String(f.email).toLowerCase() === String(user.email).toLowerCase()) return true;
        if (profile?.sifNumber && (f.sifNumber === profile.sifNumber || f.studentRoll === profile.sifNumber)) return true;
        if (f.studentName && profile?.name && String(f.studentName).toLowerCase() === String(profile.name).toLowerCase()) return true;
        return false;
      };

      unsubs.push(onSnapshot(collection(db, 'feedback'), (snap) => {
        let adminReplies = 0;
        const lastSeen = seenTimestamps.feedback || 0;

        snap.docChanges().forEach((change) => {
          const f = change.doc.data();
          const docId = change.doc.id;
          const hasReply = Boolean(f.adminReply || f.reply || f.response || f.adminResponse);

          if (isInitialFeedback) {
            knownDocIds.current.add(docId);
          } else if ((change.type === 'modified' || change.type === 'added') && hasReply && isMyFeedback(f)) {
            addToast({
              type: 'feedback',
              title: '💬 Teacher Replied to Your Feedback',
              message: `Response: "${(f.adminReply || f.reply || f.adminResponse || f.response || '').substring(0, 55)}..."`,
              link: `/student/year/${encYear}/feedback`,
              linkText: 'Read Reply →'
            });
          }
        });
        isInitialFeedback = false;

        snap.forEach((d) => {
          const f = d.data();
          if (!isMyFeedback(f)) return;
          const replyTime = f.repliedAt?.toDate ? f.repliedAt.toDate().getTime() : getItemTime(f);
          const hasReply = Boolean(f.adminReply || f.reply || f.response || f.adminResponse);
          if (hasReply && (f.studentRead === false || replyTime > lastSeen)) {
            adminReplies++;
          }
        });
        setStudentCounts((prev) => ({ ...prev, feedback: adminReplies }));
      }, (err) => console.warn('Student badge feedback listener:', err)));
    } catch (err) {
      console.warn('Feedback listener error:', err);
    }

    return () => {
      unsubs.forEach((unsub) => unsub && unsub());
    };
  }, [user, role, profile?.year, profile?.departmentId, profile?.section, seenTimestamps, readNotifIds, addToast]);

  const value = useMemo(() => ({
    adminCounts,
    studentCounts,
    toasts,
    addToast,
    dismissToast,
    markSectionAsSeen,
    markItemAsRead,
    seenTimestamps
  }), [adminCounts, studentCounts, toasts, addToast, dismissToast, markSectionAsSeen, markItemAsRead, seenTimestamps]);

  return (
    <NotificationBadgeContext.Provider value={value}>
      {children}
      <NotificationToastContainer toasts={toasts} onDismiss={dismissToast} />
    </NotificationBadgeContext.Provider>
  );
};
