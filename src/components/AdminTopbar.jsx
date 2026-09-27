import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useNotificationBadges } from '../context/NotificationBadgeContext';
import { Bell } from 'lucide-react';

const AdminTopbar = ({ onMenu, showMenu = true }) => {
  const { adminCounts } = useNotificationBadges();
  const touchStartRef = useRef({ x: 0, y: 0, moved: false });
  const totalAlerts = (adminCounts.feedback || 0) + (adminCounts.notifications || 0) + (adminCounts.assignments || 0);

  const onMenuTouchStart = (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY, moved: false };
  };
  const onMenuTouchMove = (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    if (Math.abs(t.clientX - touchStartRef.current.x) > 10 || Math.abs(t.clientY - touchStartRef.current.y) > 10)
      touchStartRef.current.moved = true;
  };
  const onMenuTouchEnd = (e) => {
    if (touchStartRef.current.moved) return;
    e.preventDefault();
    onMenu?.();
  };

  return (
    <div className="topbar">
      <div className="topbar-left">
        {showMenu && (
          <button
            type="button"
            className="hamburger"
            onClick={onMenu}
            onTouchStart={onMenuTouchStart}
            onTouchMove={onMenuTouchMove}
            onTouchEnd={onMenuTouchEnd}
            aria-label="Toggle sidebar"
          >
            <span /><span /><span />
          </button>
        )}
        <div>
          <div className="topbar-title">Tamil Learning</div>
        </div>
      </div>
      <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link
          to="/admin/notifications"
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-muted)',
            padding: 6,
            borderRadius: 'var(--radius-md)',
            transition: 'color 0.15s, background 0.15s'
          }}
          title="Push Alerts & System Notifications"
        >
          <Bell size={18} />
          {totalAlerts > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                minWidth: 16,
                height: 16,
                padding: '0 4px',
                fontSize: 10,
                fontWeight: 700,
                color: '#fff',
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                borderRadius: 999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                boxShadow: '0 2px 5px rgba(220, 38, 38, 0.45)'
              }}
            >
              {totalAlerts > 99 ? '99+' : totalAlerts}
            </span>
          )}
        </Link>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Admin Panel</span>
      </div>
    </div>
  );
};

export default AdminTopbar;