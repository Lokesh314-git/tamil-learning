import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ClipboardList,
  ListTodo,
  Megaphone,
  Bell,
  MessageSquare,
  Award,
  Calendar,
  UserPlus,
  FileCheck,
  X,
  ArrowRight,
  Layers,
  Sparkles
} from 'lucide-react';

const ICON_MAP = {
  material: { Icon: BookOpen, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  unit: { Icon: Layers, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  test: { Icon: ClipboardList, color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  task: { Icon: ListTodo, color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  announcement: { Icon: Megaphone, color: '#e11d48', bg: '#fff1f2', border: '#fecdd3' },
  result: { Icon: Award, color: '#ca8a04', bg: '#fefce8', border: '#fef08a' },
  attendance: { Icon: Calendar, color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
  feedback: { Icon: MessageSquare, color: '#0d9488', bg: '#f0fdfa', border: '#99f6e4' },
  notification: { Icon: Bell, color: '#6366f1', bg: '#eef2ff', border: '#c7d2fe' },
  student: { Icon: UserPlus, color: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe' },
  submission: { Icon: FileCheck, color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  default: { Icon: Sparkles, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' }
};

const ToastItem = ({ toast, onDismiss }) => {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);
  const [progress, setProgress] = useState(100);
  const [isExiting, setIsExiting] = useState(false);
  const duration = 3200; // 3.2 seconds
  const startTimeRef = useRef(Date.now());
  const remainingRef = useRef(duration);
  const timerRef = useRef(null);

  const config = ICON_MAP[toast.type] || ICON_MAP.default;
  const { Icon } = config;

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(toast.id);
    }, 280);
  };

  const handleClick = (e) => {
    // If clicked on close button, do not navigate
    if (e.target.closest('.toast-close-btn')) return;
    if (typeof toast.onRead === 'function') {
      try {
        toast.onRead();
      } catch (_) {}
    }
    if (toast.link) {
      navigate(toast.link);
      handleClose();
    }
  };

  useEffect(() => {
    if (isHovered) return;

    const interval = 25;
    const intervalTimer = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const left = Math.max(0, remainingRef.current - elapsed);
      const pct = (left / duration) * 100;
      setProgress(pct);

      if (left <= 0) {
        clearInterval(intervalTimer);
        handleClose();
      }
    }, interval);

    return () => clearInterval(intervalTimer);
  }, [isHovered]);

  const handleMouseEnter = () => {
    setIsHovered(true);
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startTimeRef.current));
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    startTimeRef.current = Date.now();
  };

  return (
    <div
      className={`notification-toast ${isExiting ? 'toast-exit' : 'toast-enter'}`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="alert"
      style={{
        cursor: toast.link ? 'pointer' : 'default',
        borderLeft: `4px solid ${config.color}`
      }}
    >
      <div className="toast-body">
        <div
          className="toast-icon-wrapper"
          style={{
            background: config.bg,
            color: config.color,
            border: `1px solid ${config.border}`
          }}
        >
          <Icon size={18} />
        </div>

        <div className="toast-content">
          <div className="toast-header">
            <h4 className="toast-title">{toast.title}</h4>
            <span className="toast-time">Just now</span>
          </div>

          {toast.message && (
            <p className="toast-desc">{toast.message}</p>
          )}

          {toast.linkText && (
            <div className="toast-action" style={{ color: config.color }}>
              <span>{toast.linkText}</span>
              <ArrowRight size={13} />
            </div>
          )}
        </div>

        <button
          type="button"
          className="toast-close-btn"
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
          aria-label="Dismiss notification"
        >
          <X size={15} />
        </button>
      </div>

      {/* Progress countdown bar */}
      <div className="toast-progress-track">
        <div
          className="toast-progress-fill"
          style={{
            width: `${progress}%`,
            background: config.color
          }}
        />
      </div>
    </div>
  );
};

export const NotificationToastContainer = ({ toasts = [], onDismiss }) => {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="notification-toast-container" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

export default NotificationToastContainer;
