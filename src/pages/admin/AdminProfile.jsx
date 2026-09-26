import React from 'react';
import { useAuth } from '../../context/AuthContext';
import InstallPWA from '../../components/InstallPWA';
import { User, ShieldCheck, Mail, Calendar, ShieldAlert } from 'lucide-react';

const AdminProfile = () => {
  const { profile, user } = useAuth();
  const displayName = profile?.name || user?.displayName || 'Admin';
  const role = profile?.role || 'admin';
  const email = profile?.email || user?.email || 'Not available';
  const initials = (displayName || 'Admin')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="profile-shell fade-in">
      <div className="profile-banner admin-profile-banner">
        <div className="admin-profile-heading">
          <span className="pill info">Tamil Learning System</span>
          <h1 className="admin-profile-title">Account Settings</h1>
          <p className="admin-profile-subtitle">Overview of your administrator profile and access privileges</p>
        </div>
        <div className="admin-profile-email-chip">
          <span className="admin-online-dot" aria-hidden />
          <Mail size={14} />
          <span>{email}</span>
        </div>
      </div>

      <div className="card profile-card admin-profile-card">
        <div className="admin-profile-header">
          <div className="profile-avatar">{initials}</div>
          <div className="admin-profile-meta">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 className="admin-profile-name">{displayName}</h2>
              <span className="pill success">Active</span>
            </div>
            <p className="admin-profile-role">
              <ShieldCheck size={14} style={{ color: 'var(--color-primary)' }} />
              {profile?.isRootAdmin ? 'Root Administrator' : 'System Administrator'}
            </p>
          </div>
        </div>

        <div className="profile-grid">
          <div className="profile-field">
            <div className="label"><User size={13} /> Display Name</div>
            <div className="value">{displayName}</div>
          </div>
          <div className="profile-field">
            <div className="label"><ShieldCheck size={13} /> System Role</div>
            <div className="value" style={{ textTransform: 'capitalize' }}>{role}</div>
          </div>
          <div className="profile-field">
            <div className="label"><Mail size={13} /> Email Address</div>
            <div className="value email-value">{email}</div>
          </div>
          <div className="profile-field">
            <div className="label"><Calendar size={13} /> Assigned Scope</div>
            <div className="value">{profile?.year || 'All Academic Years'}</div>
          </div>
        </div>

        <div className="admin-profile-pwa-wrap">
          <InstallPWA 
            className="btn btn-primary" 
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 22px', borderRadius: '8px', fontWeight: '600' }}
          />
        </div>

        <div className="admin-profile-note">
          <ShieldAlert size={16} style={{ flexShrink: 0, color: '#d97706' }} />
          <span>Keep this account secure. This administrator profile has full privileges to manage curriculum, students, and system reports.</span>
        </div>
      </div>
    </div>
  );
};

export default AdminProfile;

