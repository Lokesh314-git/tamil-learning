import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../context/AuthContext';
import { useYear } from '../context/YearContext';
import StudentSidebar from './StudentSidebar';

const StudentLayout = () => {
  const { logout, profile } = useAuth();
  const { year } = useParams();
  const location = useLocation();
  const { selectedYear, setSelectedYear } = useYear();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const isDesktop = viewportWidth >= 1024;

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
          <div className="topbar-right">
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