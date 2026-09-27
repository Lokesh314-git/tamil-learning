import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../context/AuthContext';
import { useYear } from '../context/YearContext';
import { useNotificationBadges } from '../context/NotificationBadgeContext';
import StudentSidebar from './StudentSidebar';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';

const StudentLayout = () => {
  const { logout, profile } = useAuth();
  const { year } = useParams();
  const location = useLocation();
  const { selectedYear, setSelectedYear } = useYear();
  const { studentCounts } = useNotificationBadges();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const isDesktop = viewportWidth >= 1024;
  const encYear = encodeURIComponent(year || profile?.year || selectedYear || '1st Year');
  const studentAlerts = (studentCounts.notifications || 0) + (studentCounts.notices || 0);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isDesktop) setSidebarOpen(true);
    else setSidebarOpen(false);
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) setSidebarOpen(false);
  }, [location.pathname, isDesktop]);

  useEffect(() => {
    const assignedYear = profile?.year;
    if (!assignedYear) return;
    if (year && year !== selectedYear) setSelectedYear(year);
    if (!year) {
      if (location.pathname.startsWith('/student/profile')) {
        if (selectedYear !== assignedYear) setSelectedYear(assignedYear);
        return;
      }
      navigate('/student/year/' + encodeURIComponent(assignedYear) + '/dashboard', { replace: true });
      return;
    }
    if (year !== assignedYear) {
      const segments = location.pathname.split('/').slice(4);
      const suffix = segments.length ? '/' + segments.join('/') : '/dashboard';
      navigate('/student/year/' + encodeURIComponent(assignedYear) + suffix, { replace: true });
      return;
    }
    if (selectedYear !== assignedYear) setSelectedYear(assignedYear);
  }, [year, selectedYear, setSelectedYear, navigate, profile, location.pathname]);

  const currentYear = year || profile?.year || selectedYear || '';

  return (
    <div className="student-layout">
      <Helmet>
        <meta name="robots" content="noindex,nofollow" />
        <title>Student | Tamil Learning App</title>
      </Helmet>

      {!isDesktop && sidebarOpen && (
        <div className="overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <StudentSidebar
        open={sidebarOpen}
        onNavigate={() => { if (!isDesktop) setSidebarOpen(false); }}
        currentYear={currentYear}
        profile={profile}
        onLogout={() => { setSidebarOpen(false); logout(); }}
      />

      <main className="student-main">
        <div className="topbar">
          <div className="topbar-left">
            <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar">
              <span /><span /><span />
            </button>
            <div>
              <div className="topbar-title">Tamil Learning</div>
            </div>
          </div>
          <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link
              to={`/student/year/${encYear}/notifications`}
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-muted)',
                padding: 6,
                borderRadius: 'var(--radius-md)',
                transition: 'color 0.15s, background 0.15s'
              }}
              title="Notifications"
            >
              <Bell size={18} />
              {studentAlerts > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    minWidth: 16,
                    height: 16,
                    padding: '0 4px',
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#fff',
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    borderRadius: 999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                    boxShadow: '0 2px 5px rgba(220, 38, 38, 0.45)'
                  }}
                >
                  {studentAlerts > 99 ? '99+' : studentAlerts}
                </span>
              )}
            </Link>
            {profile?.name && (
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                {profile.name}
              </span>
            )}
          </div>
        </div>
        <div className="container main-content student-reports-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default StudentLayout;