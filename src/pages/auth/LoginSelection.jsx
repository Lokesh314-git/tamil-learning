import React from 'react';
import { Link } from 'react-router-dom';

const LoginSelection = () => {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-mark" style={{ background: '#fff', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="assets\logo.png" alt="Tamil Learning Logo" style={{ width: 34, height: 34, objectFit: 'contain' }} />
          </div>
          <div>
            <div className="auth-logo-text">Tamil Learning</div>
            <div className="auth-logo-sub">Education Management System</div>
          </div>
        </div>

        <h1 className="auth-title">Welcome</h1>
        <p className="auth-subtitle">Select your role to continue</p>

        <div className="grid" style={{ gap: 10 }}>
          <Link to="/auth/student-login">
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '11px 16px', fontSize: 14 }}>
              Student Login
            </button>
          </Link>
          <Link to="/auth/admin-login">
            <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', padding: '11px 16px', fontSize: 14 }}>
              Admin Login
            </button>
          </Link>
        </div>

        <p style={{ marginTop: 24, fontSize: 12, color: 'var(--color-text-light)', textAlign: 'center' }}>
          Student accounts are created by the administration.
        </p>
      </div>
    </div>
  );
};

export default LoginSelection;
