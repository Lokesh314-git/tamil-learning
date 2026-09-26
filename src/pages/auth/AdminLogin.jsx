import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const AdminLogin = () => {
  const { loginAdmin } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: 'tamillearning2024@gmail.com', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await loginAdmin(form);
      navigate('/admin/dashboard', { replace: true });
    } catch (err) {
      console.error('Admin Auth Error:', err);
      const code = err.code || '';
      const msg = err.message || '';

      if (code === 'not-admin') {
        setError('Only administrator accounts can sign in here.');
      } else if (code === 'admin-profile-missing') {
        setError(msg);
      } else if (code === 'admin-profile-permission-denied' || code === 'permission-denied') {
        setError('Firestore denied access to your admin profile. Ask the project owner to check Firestore rules for your account.');
      } else if (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || msg.includes('user-not-found') || msg.includes('invalid-credential')) {
        setError('No Firebase Authentication account was found for this email. Ask the project owner to create the admin account.');
      } else if (code === 'auth/wrong-password') {
        setError('Incorrect password. Please verify and try again.');
      } else if (code === 'auth/operation-not-allowed') {
        setError('Email/Password sign-in is not enabled in Firebase Authentication.');
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

        <h1 className="auth-title">Admin Sign In</h1>
        <p className="auth-subtitle">Enter your credentials to access the admin panel</p>

        <form onSubmit={handleSubmit} className="grid" style={{ gap: 12 }}>
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
          <button type="submit" className="btn btn-primary" disabled={loading}
            style={{ justifyContent: 'center', padding: '10px 16px', marginTop: 4 }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="form-hint" style={{ marginTop: 14, lineHeight: 1.6 }}>
          Admin access is assigned by the Firebase project owner. If sign-in reports a missing profile, the owner must create a <code>users/{'{uid}'}</code> Firestore document with <code>role: "admin"</code>.
        </p>

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
