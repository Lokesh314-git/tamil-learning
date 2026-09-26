import React, { useRef } from 'react';
import { useAuth } from '../context/AuthContext';

const AdminTopbar = ({ onMenu, showMenu = true }) => {
  const touchStartRef = useRef({ x: 0, y: 0, moved: false });

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
      <div className="topbar-right">
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Admin Panel</span>
      </div>
    </div>
  );
};

export default AdminTopbar;