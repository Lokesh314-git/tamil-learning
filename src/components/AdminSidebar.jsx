import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useYear } from '../context/YearContext';
import logoImg from '../assets/logo.png';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  BookOpen,
  FileText,
  Layers,
  ClipboardList,
  ListTodo,
  Megaphone,
  Bell,
  MessageSquare,
  DownloadCloud,
  StickyNote,
  ScrollText,
  Globe,
  Settings,
  ShieldCheck,
  GraduationCap,
  LogOut
} from 'lucide-react';

const years = ['1st Year', '2nd Year', '3rd Year'];

const academicNav = [
  { to: '/admin/dashboard',        label: 'Dashboard',             Icon: LayoutDashboard, end: true },
  { to: '/admin/students',         label: 'Student Management',    Icon: Users },
  { to: '/admin/attendance',       label: 'Attendance Management', Icon: UserCheck },
  { to: '/admin/classes',          label: 'Classes & Sections',    Icon: BookOpen },
  { to: '/admin/study-materials',  label: 'Study Materials Hub',   Icon: FileText },
  { to: '/admin/units',            label: 'Units (1 to 5)',        Icon: Layers },
  { to: '/admin/tests',            label: 'Online Assessments',    Icon: ClipboardList },
  { to: '/admin/assignments',      label: 'Assignments & Tasks',   Icon: ListTodo },
  { to: '/admin/announcements',    label: 'Notice Board',          Icon: Megaphone },
  { to: '/admin/notifications',    label: 'Push Alerts (FCM)',     Icon: Bell },
  { to: '/admin/feedback',         label: 'Student Feedback',      Icon: MessageSquare },
  { to: '/admin/downloads',        label: 'Downloads & Storage',   Icon: DownloadCloud },
  { to: '/admin/notes',            label: 'Student Notes',         Icon: StickyNote },
];

const systemNav = [
  { to: '/admin/thirukkural',      label: 'Thirukkural Hub',       Icon: ScrollText },
  { to: '/admin/language',         label: 'Language (EN / TA)',    Icon: Globe },
  { to: '/admin/settings',         label: 'Academic Settings',     Icon: Settings },
  { to: '/admin/users',            label: 'Admin Users',           Icon: ShieldCheck },
];

const AdminSidebar = ({ onNavigate }) => {
  const { logout, user } = useAuth();
  const { selectedYear } = useYear();
  const initial = (user?.email || 'A').charAt(0).toUpperCase();

  return (
    <aside style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header with App Logo */}
      <div className="sidebar-header">
        <div className="sidebar-logo-mark" style={{ background: '#fff', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={logoImg} alt="Tamil Learning Logo" style={{ width: 32, height: 32, objectFit: 'contain' }} />
        </div>
        <div>
          <div className="sidebar-app-name">Tamil Learning</div>
          <div className="sidebar-app-sub">Management System</div>
        </div>
      </div>

      {/* Admin Profile Widget */}
      <div className="sidebar-profile">
        <div className="sidebar-avatar">{initial}</div>
        <div className="sidebar-profile-meta">
          <div className="sidebar-name">{user?.displayName || 'Administrator'}</div>
          <div className="sidebar-email">{user?.email || 'admin@console'}</div>
          <span className="sidebar-role-badge">System Admin</span>
        </div>
      </div>

      {/* Nav Menu Items */}
      <div className="sidebar-nav-scroll">
        <div className="nav-label">Academic Management</div>
        {academicNav.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate}
            className={({ isActive }) => ('sidebar-item ' + (isActive ? 'active' : '')).trim()}>
            <span className="sidebar-link">
              <span className="sidebar-icon-box" aria-hidden><Icon size={16} /></span>
              <span>{label}</span>
            </span>
          </NavLink>
        ))}

        <div className="nav-label">Academic Years</div>
        {years.map((y) => (
          <NavLink key={y} to={'/admin/year/' + encodeURIComponent(y) + '/dashboard'} onClick={onNavigate}
            className={({ isActive }) => ('sidebar-item ' + (isActive ? 'active' : '')).trim()}>
            <span className="sidebar-link">
              <span className="sidebar-icon-box" aria-hidden><GraduationCap size={16} /></span>
              <span style={{ flex: 1 }}>{y}</span>
              {selectedYear === y && <span style={{ fontSize: 10, color: 'var(--color-primary)', fontWeight: 600 }}>Active</span>}
            </span>
          </NavLink>
        ))}

        <div className="nav-label">System Administration</div>
        {systemNav.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate}
            className={({ isActive }) => ('sidebar-item ' + (isActive ? 'active' : '')).trim()}>
            <span className="sidebar-link">
              <span className="sidebar-icon-box" aria-hidden><Icon size={16} /></span>
              <span>{label}</span>
            </span>
          </NavLink>
        ))}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <button className="sidebar-logout" onClick={() => { if (onNavigate) onNavigate(); logout(); }}>
          <LogOut size={15} /><span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;