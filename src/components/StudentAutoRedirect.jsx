import React, { useEffect } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from './Loader';

const StudentAutoRedirect = () => {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!profile) return;
    if (profile.role === 'admin') {
      navigate('/admin/dashboard', { replace: true });
      return;
    }
    const targetYear = profile.year;
    if (!targetYear) return;

    // Preserve deep-link suffix if user hit /student/dashboard directly
    const suffix = location.pathname.endsWith('/dashboard') ? '/dashboard' : '/dashboard';
    navigate(`/student/year/${encodeURIComponent(targetYear)}${suffix}`, { replace: true });
  }, [profile, loading, navigate, location.pathname]);

  if (loading) return <Loader />;
  if (!profile) return <Navigate to="/auth" replace />;
  if (profile.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  if (!profile.year) return <Navigate to="/auth" replace />;
  return <Loader />;
};

export default StudentAutoRedirect;
