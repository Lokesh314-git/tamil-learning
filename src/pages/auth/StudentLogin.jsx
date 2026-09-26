import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const StudentLogin = () => {
  const { loginStudentWithCredentials } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [dob, setDob] = useState('');
  const [dobType, setDobType] = useState('date');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanId = identifier.trim();
    const cleanDob = dob.trim();
    if (!cleanId) { setError('Please enter your SIF Number or Mobile Number.'); return; }
    if (!cleanDob) { setError('Please enter your Date of Birth.'); return; }
    setLoading(true);
    setError('');
    try {
      const studentProfile = await loginStudentWithCredentials({ identifier: cleanId, dob: cleanDob });
      const targetYear = studentProfile?.year || '1st Year';
      navigate('/student/year/' + encodeURIComponent(targetYear) + '/dashboard', { replace: true });
    } catch (err) {
      if (err?.code === 'student-not-found')
        setError('Student record not found. Please check your SIF or Mobile number.');
      else if (err?.code === 'dob-mismatch')
        setError('Date of Birth does not match our records.');
      else if (err?.code === 'account-deleted')
        setError('Your account has been removed. Please contact your administrator.');
      else if (err?.code === 'account-blocked')
        setError('Your account is inactive. Please contact your administrator.');
      else
        setError(err?.message || 'Login failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-mark" style={{ background: '#fff', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/logo.png" alt="Tamil Learning Logo" style={{ width: 34, height: 34, objectFit: 'contain' }} />
          </div>
          <div>
            <div className="auth-logo-text">Tamil Learning</div>
            <div className="auth-logo-sub">Student Portal</div>
          </div>
        </div>

        <h1 className="auth-title">Student Sign In</h1>
        <p className="auth-subtitle">Enter your SIF / Mobile number and Date of Birth</p>

        <form onSubmit={handleSubmit} className="grid" style={{ gap: 14 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="student-id">SIF Number / Mobile Number</label>
            <input
              id="student-id"
              className="input"
              type="text"
              placeholder="e.g. SIF1001 or 9876543210"
              required
              autoFocus
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
            <span className="form-hint">Enter your registered SIF ID or 10-digit mobile number</span>
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <label className="form-label" htmlFor="student-dob">Date of Birth</label>
              <button type="button"
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: 12, cursor: 'pointer', padding: 0 }}
                onClick={() => setDobType(dobType === 'date' ? 'text' : 'date')}>
                {dobType === 'date' ? 'Type manually' : 'Use date picker'}
              </button>
            </div>
            {dobType === 'date' ? (
              <input id="student-dob" className="input" type="date" required value={dob} onChange={(e) => setDob(e.target.value)} />
            ) : (
              <input id="student-dob" className="input" type="text" placeholder="DD/MM/YYYY or YYYY-MM-DD" required value={dob} onChange={(e) => setDob(e.target.value)} />
            )}
            <span className="form-hint">Your Date of Birth is used as your access credential</span>
          </div>

          {error && <div className="alert error">{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={loading}
            style={{ justifyContent: 'center', padding: '10px 16px', marginTop: 4 }}>
            {loading ? 'Verifying...' : 'Sign In'}
          </button>
        </form>

        <hr className="auth-divider" />

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <Link to="/auth" style={{ color: 'var(--color-text-muted)' }}>&larr; Back</Link>
          <Link to="/auth/admin-login" style={{ color: 'var(--color-primary)' }}>Admin Login</Link>
        </div>

        <div className="alert info" style={{ marginTop: 14, fontSize: 12 }}>
          Student accounts are created by the administration. If you cannot sign in, please contact your department admin.
        </div>
      </div>
    </div>
  );
};

export default StudentLogin;