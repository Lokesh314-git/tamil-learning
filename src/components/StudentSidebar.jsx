import React from 'react';
import { NavLink } from 'react-router-dom';
import { useNotificationBadges } from '../context/NotificationBadgeContext';
import logoImg from '../assets/logo.png';
import {
  LayoutDashboard,
  BookOpen,
  Layers,
  ClipboardList,
  ListTodo,
  Calendar,
  BarChart3,
  Megaphone,
  Bell,
  FolderDown,
  StickyNote,
  MessageSquare,
  UserCircle2,
  ShieldCheck,
  LogOut
} from 'lucide-react';

const StudentSidebar = ({ open, onNavigate, currentYear, profile, onLogout }) => {
  const encYear = encodeURIComponent(currentYear || '1st Year');
  const { studentCounts } = useNotificationBadges();
  const isAdminUser = profile?.role === 'admin';

  const navItems = [
    { to: `/student/year/${encYear}/dashboard`,     label: 'Dashboard',        Icon: LayoutDashboard },
    { to: `/student/year/${encYear}/materials`,     label: 'Study Materials',  Icon: BookOpen,      badgeKey: 'materials' },
    { to: `/student/year/${encYear}/units`,         label: 'Units (1-5)',      Icon: Layers,        badgeKey: 'units' },
    { to: `/student/year/${encYear}/tests`,         label: 'Online Tests',     Icon: ClipboardList, badgeKey: 'tests' },
    { to: `/student/year/${encYear}/tasks`,         label: 'Assignments',      Icon: ListTodo,      badgeKey: 'tasks' },
    { to: `/student/year/${encYear}/attendance`,    label: 'Attendance',       Icon: Calendar },
    { to: `/student/year/${encYear}/reports`,       label: 'Reports & Marks',  Icon: BarChart3 },
    { to: `/student/year/${encYear}/notices`,       label: 'Notice Board',     Icon: Megaphone,     badgeKey: 'notices' },
    { to: `/student/year/${encYear}/notifications`, label: 'Notifications',    Icon: Bell,          badgeKey: 'notifications' },
    { to: `/student/year/${encYear}/downloads`,     label: 'Downloads Center', Icon: FolderDown },
    { to: `/student/year/${encYear}/notes`,         label: 'Personal Notes',   Icon: StickyNote },
    { to: `/student/year/${encYear}/feedback`,      label: 'Help & Feedback',  Icon: MessageSquare, badgeKey: 'feedback' },
    { to: '/student/profile',                       label: 'Student Profile',  Icon: UserCircle2 },
  ];

  const initial = (profile?.name || 'S').charAt(0).toUpperCase();

  return (
    <aside className={'student-sidebar ' + (open ? 'open' : 'is-closed')} aria-label="Student navigation">
      <div className="sidebar-header">
        <div className="sidebar-logo-mark" style={{ background: '#fff', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
          <img src={logoImg} alt="Tamil Learning Logo" style={{ width: 30, height: 30, objectFit: 'contain' }} />
        </div>
        <div>
          <div className="sidebar-app-name">Tamil Learning</div>
          <div className="sidebar-app-sub">{currentYear || 'Student Portal'}</div>
        </div>
      </div>

      <div className="sidebar-profile">
        <div className="sidebar-avatar">{initial}</div>
        <div className="sidebar-profile-meta">
          <div className="sidebar-name">{profile?.name || 'Student'}</div>
          <div className="sidebar-email">
            {profile?.sifNumber ? 'SIF: ' + profile.sifNumber : (profile?.email || '')}
          </div>
          <span className="sidebar-role-badge">
            {isAdminUser ? 'Admin Privileges' : (profile?.class || profile?.departmentName || 'Student')}
          </span>
        </div>
      </div>

      {isAdminUser && (
        <div style={{ padding: '0 12px 10px' }}>
          <NavLink
            to="/admin/dashboard"
            onClick={onNavigate}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.35)'
            }}
          >
            <ShieldCheck size={18} />
            <span>Admin Control Panel &rarr;</span>
          </NavLink>
        </div>
      )}

      <div className="sidebar-nav-scroll">
        {navItems.map(({ to, label, Icon, badgeKey }) => {
          const count = badgeKey && studentCounts ? (studentCounts[badgeKey] || 0) : 0;
          return (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              className={({ isActive }) => ('sidebar-item ' + (isActive ? 'active' : '')).trim()}
            >
              <span className="sidebar-link">
                <span className="sidebar-icon-box" aria-hidden><Icon size={16} /></span>
                <span className="sidebar-link-text">{label}</span>
                {count > 0 && (
                  <span className="sidebar-nav-badge" title={`${count} new items`}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </span>
            </NavLink>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-logout" onClick={onLogout}>
          <LogOut size={15} /><span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default StudentSidebar;