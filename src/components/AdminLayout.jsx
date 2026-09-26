import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import AdminSidebar from './AdminSidebar';
import AdminTopbar from './AdminTopbar';
import { useYear } from '../context/YearContext';

const DESKTOP_BREAKPOINT = 1024;

const AdminLayout = () => {
  const { yearId } = useParams();
  const location = useLocation();
  const { selectedYear, setSelectedYear } = useYear();
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [isSidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= DESKTOP_BREAKPOINT);
  const lastScrollAtRef = useRef(0);

  useEffect(() => {
    if (yearId && yearId !== selectedYear) setSelectedYear(yearId);
  }, [yearId, selectedYear, setSelectedYear]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const markScroll = () => {
      lastScrollAtRef.current = Date.now();
    };
    window.addEventListener('scroll', markScroll, { passive: true });
    return () => window.removeEventListener('scroll', markScroll);
  }, []);

  const isDesktop = useMemo(() => viewportWidth >= DESKTOP_BREAKPOINT, [viewportWidth]);

  useEffect(() => {
    // Keep sidebar open on desktop; close by default on tablet/mobile
    if (isDesktop) {
      setSidebarOpen(true);
    } else {
      setSidebarOpen(false);
    }
  }, [isDesktop]);

  useEffect(() => {
    const shouldLockScroll = !isDesktop && isSidebarOpen;
    document.body.style.overflow = shouldLockScroll ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isDesktop, isSidebarOpen]);

  useEffect(() => {
    if (!isDesktop) setSidebarOpen(false);
  }, [location.pathname, isDesktop]);

  const sidebarClasses = `admin-sidebar ${isDesktop ? 'fixed' : 'drawer'} ${!isDesktop && isSidebarOpen ? 'is-open' : ''} ${isDesktop && !isSidebarOpen ? 'is-closed' : ''}`;
  const shellClasses = `admin-shell ${isDesktop && isSidebarOpen ? 'has-fixed-sidebar' : ''} ${isDesktop && !isSidebarOpen ? 'has-mini-sidebar' : ''} ${!isDesktop && isSidebarOpen ? 'sidebar-open' : ''}`.trim();
  const closeMobileSidebar = () => {
    if (!isDesktop) setSidebarOpen(false);
  };
  const handleMenuOpen = () => {
    if (!isDesktop && Date.now() - lastScrollAtRef.current < 250) return;
    setSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className={shellClasses}>
      <Helmet>
        <meta name="robots" content="noindex,nofollow" />
        <title>Admin | Tamil Learning App</title>
      </Helmet>
      <aside className={sidebarClasses} aria-label="Admin sidebar navigation">
        <AdminSidebar onNavigate={() => { if (!isDesktop) setSidebarOpen(false); }} />
      </aside>

      {!isDesktop && isSidebarOpen && (
        <div
          className="overlay"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar overlay"
          role="presentation"
        />
      )}

      <main className="admin-main">
        <AdminTopbar
          year={yearId || selectedYear}
          onMenu={handleMenuOpen}
          showMenu={true}
        />
        <div className="container main-content admin-content" onClick={closeMobileSidebar} onTouchStart={closeMobileSidebar}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
