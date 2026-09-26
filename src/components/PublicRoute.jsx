import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from './Loader';
import { isApprovedAccount, isDeletedAccount } from '../utils/studentStatus';

const PublicRoute = () => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  // When visiting specific login forms explicitly, render them immediately without locking behind loading
  const isExplicitLogin =
    location.pathname === '/auth/student-login' ||
    location.pathname === '/auth/admin-login' ||
    location.pathname === '/auth/student-signup';

  if (isExplicitLogin) {
    return <Outlet />;
  }

  if (loading) return <Loader />;

  if (!isExplicitLogin && user && profile) {
    if (isDeletedAccount(profile)) {
      return <Outlet />;
    }
    
    if (profile.role === 'admin') {
      return <Navigate to="/admin/dashboard" replace />;
    }
    
    if (profile.role === 'student') {
      if (isApprovedAccount(profile)) {
         const y = profile.year ? encodeURIComponent(profile.year) : '';
         return <Navigate to={y ? `/student/year/${y}/dashboard` : '/student/dashboard'} replace />;
      }
    }
  }

  return <Outlet />;
};

export default PublicRoute;
