import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const StudentLogin = () => {
  const { loginStudentWithCredentials } = useAuth();
  const navigate = useNavigate();
  const [mobileNumber, setMobileNumber] = useState('');
  const [dob, setDob] = useState('');
  const [dobType, setDobType] = useState('date');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Maximum allowed date for date picker (cannot be a future date)
  const todayDateString = new Date().toISOString().split('T')[0];

  const handleMobileChange = (e) => {
    // Keep only digits and slice to max 10
    const raw = e.target.value.replace(/\D/g, '');
    const cleaned = raw.length > 10 && raw.startsWith('91') ? raw.slice(2, 12) : raw.slice(0, 10);
    setMobileNumber(cleaned);
    if (error) setError('');
  };

  const handleDobChange = (e) => {
    setDob(e.target.value);
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanMobile = mobileNumber.trim().replace(/\D/g, '');
    const cleanDob = dob.trim();

    if (!cleanMobile) {
      setError('Please enter your registered mobile number.');
      return;
    }

    if (cleanMobile.length !== 10) {
      setError('Please enter a valid 10-digit registered mobile number.');
      return;
    }

    if (!cleanDob) {
      setError('Please enter your Date of Birth.');
      return;
    }

    // Check future date
    if (cleanDob > todayDateString) {
      setError('Date of Birth cannot be in the future.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const studentProfile = await loginStudentWithCredentials({
        mobileNumber: cleanMobile,
        dob: cleanDob
      });

      if (studentProfile?.role === 'admin') {
        navigate('/admin/dashboard', { replace: true });
        return;
      }

      const targetYear = studentProfile?.year || '1st Year';
      navigate('/student/year/' + encodeURIComponent(targetYear) + '/dashboard', { replace: true });
    } catch (err) {
      console.warn('[StudentLogin] Sign in failed:', err.message);
      setError(
        err?.message ||
        'Invalid registered mobile number or date of birth. Please check your credentials or contact administration.'
      );
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
        <p className="auth-subtitle">Enter your registered Mobile Number and Date of Birth</p>

        <form onSubmit={handleSubmit} className="grid" style={{ gap: 14 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="student-mobile">Registered Mobile Number</label>
            <input
              id="student-mobile"
              className="input"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]{10}"
              placeholder="e.g. 9876543210"
              required
              autoFocus
              maxLength={10}
              value={mobileNumber}
              onChange={handleMobileChange}
              disabled={loading}
            />
            <span className="form-hint">Enter your 10-digit registered mobile number</span>
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <label className="form-label" htmlFor="student-dob">Date of Birth</label>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: 12, cursor: 'pointer', padding: 0 }}
                onClick={() => setDobType(dobType === 'date' ? 'text' : 'date')}
                disabled={loading}
              >
                {dobType === 'date' ? 'Type manually' : 'Use date picker'}
              </button>
            </div>
            {dobType === 'date' ? (
              <input
                id="student-dob"
                className="input"
                type="date"
                required
                max={todayDateString}
                value={dob}
                onChange={handleDobChange}
                disabled={loading}
              />
            ) : (
              <input
                id="student-dob"
                className="input"
                type="text"
                placeholder="DD/MM/YYYY or YYYY-MM-DD"
                required
                value={dob}
                onChange={handleDobChange}
                disabled={loading}
              />
            )}
            <span className="form-hint">Your registered Date of Birth is used for authentication</span>
          </div>

          {error && <div className="alert error">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ justifyContent: 'center', padding: '10px 16px', marginTop: 4 }}
          >
            {loading ? 'Verifying...' : 'Sign In'}
          </button>
        </form>

        <hr className="auth-divider" />

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <Link to="/auth" style={{ color: 'var(--color-text-muted)' }}>&larr; Back</Link>
          <Link to="/auth/admin-login" style={{ color: 'var(--color-primary)' }}>Admin Login</Link>
        </div>

        <div className="alert info" style={{ marginTop: 14, fontSize: 12 }}>
          Student accounts are registered by the administration. If your mobile number is not registered or you cannot sign in, please contact your department admin.
        </div>
      </div>
    </div>
  );
};

export default StudentLogin;
