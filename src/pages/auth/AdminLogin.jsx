import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const AdminLogin = () => {
  const { loginAdmin, createInitialAdmin } = useAuth();
  const navigate = useNavigate();
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [form, setForm] = useState({ email: 'tamillearning2024@gmail.com', password: '', name: 'Tamil Learning Admin' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (isRegisterMode) {
        await createInitialAdmin(form);
        setSuccess('Administrator account created successfully! Redirecting...');
        setTimeout(() => navigate('/admin/dashboard', { replace: true }), 800);
      } else {
        await loginAdmin(form);
        navigate('/admin/dashboard', { replace: true });
      }
    } catch (err) {
      console.error('Admin Auth Error:', err);
      const code = err.code || '';
      const msg = err.message || '';

      if (code === 'not-admin') {
        setError('Only administrator accounts can sign in here.');
      } else if (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || msg.includes('user-not-found') || msg.includes('invalid-credential')) {
        setError('Account not found in new Firebase project (tamil-learning-2d773). Click "First time? Initialize Admin Account" below to register.');
      } else if (code === 'auth/wrong-password') {
        setError('Incorrect password. Please verify and try again.');
      } else if (code === 'auth/operation-not-allowed') {
        setError('Email/Password provider is not enabled in Firebase Console -> Authentication.');
      } else {
        setError(msg || 'Login failed. Please check your credentials or register the account.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-mark" style={{ background: '#fff', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="src\assets\logo.png" alt="Tamil Learning Logo" style={{ width: 34, height: 34, objectFit: 'contain' }} onError={(e) => { e.target.src = '/icon.png'; }} />
          </div>
          <div>
            <div className="auth-logo-text">Tamil Learning</div>
            <div className="auth-logo-sub">Administration</div>
          </div>
        </div>

        <h1 className="auth-title">{isRegisterMode ? 'Initialize Admin' : 'Admin Sign In'}</h1>
        <p className="auth-subtitle">
          {isRegisterMode
            ? 'Set up administrator credentials for Firebase project tamil-learning-2d773'
            : 'Enter your credentials to access the admin panel'}
        </p>

        <form onSubmit={handleSubmit} className="grid" style={{ gap: 12 }}>
          {isRegisterMode && (
            <div className="form-group">
              <label className="form-label" htmlFor="admin-name">Admin Name</label>
              <input
                id="admin-name"
                className="input"
                type="text"
                placeholder="Administrator Name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="admin-email">Email Address</label>
            <input
              id="admin-email"
              className="input"
              type="email"
              placeholder="admin@example.com"
              required
              autoFocus
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              className="input"
              type="password"
              placeholder="••••••••"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          {error && <div className="alert error" style={{ fontSize: 13, lineHeight: 1.4 }}>{error}</div>}
          {success && <div className="alert success" style={{ fontSize: 13 }}>{success}</div>}

          <button type="submit" className="btn btn-primary" disabled={loading}
            style={{ justifyContent: 'center', padding: '10px 16px', marginTop: 4 }}>
            {loading ? (isRegisterMode ? 'Creating Admin...' : 'Signing in...') : (isRegisterMode ? 'Create & Sign In as Admin' : 'Sign In')}
          </button>
        </form>

        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%', fontSize: 12, justifyContent: 'center', padding: '8px 12px' }}
            onClick={() => {
              setIsRegisterMode(!isRegisterMode);
              setError('');
              setSuccess('');
            }}
          >
            {isRegisterMode ? 'Already have an Admin account? Sign In' : 'First time on this Firebase project? Initialize Admin Account'}
          </button>
        </div>

        <hr className="auth-divider" />

        <div style={{ fontSize: 13, textAlign: 'center' }}>
          <Link to="/auth" style={{ color: 'var(--color-primary)' }}>
            &larr; Back to role selection
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;