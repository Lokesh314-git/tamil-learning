import React from 'react';
import { NavLink } from 'react-router-dom';
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
  LogOut
} from 'lucide-react';

const StudentSidebar = ({ open, onNavigate, currentYear, profile, onLogout }) => {
  const encYear = encodeURIComponent(currentYear || '1st Year');

  const navItems = [
    { to: `/student/year/${encYear}/dashboard`,     label: 'Dashboard',        Icon: LayoutDashboard },
    { to: `/student/year/${encYear}/materials`,     label: 'Study Materials',  Icon: BookOpen },
    { to: `/student/year/${encYear}/units`,         label: 'Units (1-5)',      Icon: Layers },
    { to: `/student/year/${encYear}/tests`,         label: 'Online Tests',     Icon: ClipboardList },
    { to: `/student/year/${encYear}/tasks`,         label: 'Assignments',      Icon: ListTodo },
    { to: `/student/year/${encYear}/attendance`,    label: 'Attendance',       Icon: Calendar },
    { to: `/student/year/${encYear}/reports`,       label: 'Reports & Marks',  Icon: BarChart3 },
    { to: `/student/year/${encYear}/notices`,       label: 'Notice Board',     Icon: Megaphone },
    { to: `/student/year/${encYear}/notifications`, label: 'Notifications',    Icon: Bell },
    { to: `/student/year/${encYear}/downloads`,     label: 'Downloads Center', Icon: FolderDown },
    { to: `/student/year/${encYear}/notes`,         label: 'Personal Notes',   Icon: StickyNote },
    { to: `/student/year/${encYear}/feedback`,      label: 'Help & Feedback',  Icon: MessageSquare },
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
          <span className="sidebar-role-badge">{profile?.class || profile?.departmentName || 'Student'}</span>
        </div>
      </div>

      <div className="sidebar-nav-scroll">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) => ('sidebar-item ' + (isActive ? 'active' : '')).trim()}
          >
            <span className="sidebar-link">
              <span className="sidebar-icon-box" aria-hidden><Icon size={16} /></span>
              <span>{label}</span>
            </span>
          </NavLink>
        ))}
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