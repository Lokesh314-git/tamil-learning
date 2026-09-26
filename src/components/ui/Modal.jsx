import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Enterprise Grade Unified Modal Component for Tamil Learning Platform
 * @param {boolean} open - Whether the modal is visible
 * @param {function} onClose - Callback to close modal
 * @param {string|React.ReactNode} title - Modal title
 * @param {string|React.ReactNode} subtitle - Optional subtitle/eyebrow
 * @param {React.ReactNode} icon - Optional Lucide icon component
 * @param {'sm'|'md'|'lg'|'xl'} size - Modal max-width preset ('sm'=450px, 'md'=680px, 'lg'=880px, 'xl'=1180px)
 * @param {React.ReactNode} children - Modal body content
 * @param {React.ReactNode} footer - Custom footer actions
 * @param {string} maxWidth - Optional custom CSS max-width override
 * @param {boolean} closeOnOutsideClick - Close when clicking overlay (default: true)
 */
const Modal = ({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  iconVariant = 'primary', // 'primary' | 'danger' | 'success' | 'warning'
  size = 'md',
  maxWidth,
  children,
  footer,
  closeOnOutsideClick = true,
  labelledBy,
}) => {
  const dialogRef = useRef(null);
  const generatedId = useId();
  const titleId = labelledBy || `modal-title-${generatedId}`;
  // Listen for Escape key
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = () => dialog?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [];
    requestAnimationFrame(() => (focusable()[0] || dialog)?.focus());
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      if (e.key === 'Tab') {
        const items = [...focusable()];
        if (!items.length) { e.preventDefault(); dialog?.focus(); return; }
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); previousFocus?.focus?.(); };
  }, [open, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (open) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const sizeClass = `modal-${size}`;

  return (
    <div
      onClick={(e) => {
        if (closeOnOutsideClick && e.target === e.currentTarget) {
          onClose?.();
        }
      }}
      className="modal-backdrop"
    >
      <div
        ref={dialogRef}
        className={`modal ${sizeClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            {Icon && (
              <div className={`modal-header-icon ${iconVariant}`}>
                <Icon size={20} />
              </div>
            )}
            <div>
              {title && <h3 id={titleId} className="modal-title">{title}</h3>}
              {subtitle && <p className="modal-subtitle">{subtitle}</p>}
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="modal-body">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
