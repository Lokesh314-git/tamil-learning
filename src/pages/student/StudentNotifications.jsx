import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import StudentPageHeader from '../../components/studentui/StudentPageHeader';
import StudentContentCard from '../../components/studentui/StudentContentCard';
import EmptyState from '../../components/EmptyState';
import Loader from '../../components/Loader';
import {
  Bell,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  Layers,
  Filter,
  CheckCheck,
  Award,
  BookOpen,
  ListTodo,
  FileText
} from 'lucide-react';

const CATEGORY_TABS = [
  { id: 'all', label: 'All Notifications' },
  { id: 'tests', label: 'Tests & Quizzes' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'results', label: 'Results & Marks' }
];

const StudentNotifications = () => {
  const { year } = useParams();
  const { profile, user } = useAuth();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [readIds, setReadIds] = useState(() => {
    try {
      const saved = localStorage.getItem(`student_read_notifications_${user?.uid || 'guest'}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'notifications'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
      setNotifications(list);
      setLoading(false);
    }, (err) => {
      console.warn('Notifications listener err:', err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const markAsRead = (id) => {
    if (readIds.includes(id)) return;
    const next = [...readIds, id];
    setReadIds(next);
    try {
      localStorage.setItem(`student_read_notifications_${user?.uid || 'guest'}`, JSON.stringify(next));
    } catch (err) {
      console.warn('Failed to save read state:', err);
    }
  };

  const markAllAsRead = () => {
    const allIds = notifications.map((n) => n.id);
    setReadIds(allIds);
    try {
      localStorage.setItem(`student_read_notifications_${user?.uid || 'guest'}`, JSON.stringify(allIds));
    } catch (err) {
      console.warn('Failed to save read state:', err);
    }
  };

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      // Target scope match
      if (n.targetScope === 'individual' && n.targetStudentId && n.targetStudentId !== user?.uid) {
        return false;
      }
      if (n.targetScope === 'year' && n.targetYear && n.targetYear !== 'all' && n.targetYear !== year) {
        return false;
      }
      if (n.targetScope === 'department' && n.targetDepartmentId && n.targetDepartmentId !== 'all' && n.targetDepartmentId !== profile?.departmentId) {
        return false;
      }
      if (n.targetSection && n.targetSection !== 'all' && profile?.section && n.targetSection.toUpperCase() !== profile.section.toUpperCase()) {
        return false;
      }

      // Category match
      if (selectedCategory !== 'all') {
        const titleLower = (n.title || '').toLowerCase();
        const bodyLower = (n.body || '').toLowerCase();
        const catLower = (n.category || '').toLowerCase();

        if (selectedCategory === 'tests' && !titleLower.includes('test') && !titleLower.includes('quiz') && !catLower.includes('test')) return false;
        if (selectedCategory === 'assignments' && !titleLower.includes('assignment') && !titleLower.includes('task') && !catLower.includes('task')) return false;
        if (selectedCategory === 'announcements' && !titleLower.includes('announcement') && !titleLower.includes('notice') && !catLower.includes('notice')) return false;
        if (selectedCategory === 'attendance' && !titleLower.includes('attendance') && !bodyLower.includes('attendance') && !catLower.includes('attendance')) return false;
        if (selectedCategory === 'results' && !titleLower.includes('result') && !titleLower.includes('score') && !titleLower.includes('mark') && !catLower.includes('result')) return false;
      }

      return true;
    });
  }, [notifications, user?.uid, year, profile?.departmentId, profile?.section, selectedCategory]);

  const unreadCount = useMemo(() => {
    return filteredNotifications.filter((n) => !readIds.includes(n.id)).length;
  }, [filteredNotifications, readIds]);

  return (
    <div className="student-page grid" style={{ gap: 16 }}>
      <StudentPageHeader
        title="Notifications Center"
        subtitle={`${year} / Direct Alerts & Push Updates`}
      />

      {/* Action Bar */}
      <StudentContentCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id)}
                className={`button ${selectedCategory === tab.id ? 'primary' : 'secondary'}`}
                style={{ fontSize: 13, padding: '6px 12px', borderRadius: 20 }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {unreadCount} Unread
            </span>
            {unreadCount > 0 && (
              <button
                className="button secondary"
                onClick={markAllAsRead}
                style={{ fontSize: 12, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <CheckCheck size={14} /> Mark All as Read
              </button>
            )}
          </div>
        </div>
      </StudentContentCard>

      {/* Notification Stream */}
      {loading ? (
        <Loader />
      ) : filteredNotifications.length > 0 ? (
        <div className="grid" style={{ gap: 12 }}>
          {filteredNotifications.map((n) => {
            const isRead = readIds.includes(n.id);
            const isUrgent = n.priority === 'urgent' || n.priority === 'high';
            const timeStr = n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Recently';

            return (
              <StudentContentCard
                key={n.id}
                onClick={() => markAsRead(n.id)}
                style={{
                  cursor: 'pointer',
                  borderLeft: !isRead ? '4px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: !isRead ? 'rgba(59, 130, 246, 0.02)' : 'var(--color-bg-card)',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {!isRead ? (
                      <span className="badge badge-primary" style={{ fontSize: 10, padding: '2px 6px' }}>NEW</span>
                    ) : (
                      <span style={{ fontSize: 10, color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <CheckCircle2 size={12} /> Read
                      </span>
                    )}

                    {isUrgent && (
                      <span className="badge badge-danger" style={{ fontSize: 10, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                        High Priority
                      </span>
                    )}

                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} /> {timeStr}
                    </span>
                  </div>

                  {n.targetDepartmentName && (
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {n.targetDepartmentName}
                    </span>
                  )}
                </div>

                <h4 style={{ margin: '8px 0 4px', fontSize: 15, fontWeight: isRead ? 600 : 700, color: 'var(--color-text)' }}>
                  {n.title}
                </h4>

                <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                  {n.body || n.message}
                </p>
              </StudentContentCard>
            );
          })}
        </div>
      ) : (
        <EmptyState
          message="No notifications in this category."
          icon={<Bell size={36} />}
        />
      )}
    </div>
  );
};

export default StudentNotifications;
