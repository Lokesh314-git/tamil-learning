import React from 'react';
import Modal from './ui/Modal';
import { KeyRound, MailCheck, Send } from 'lucide-react';

const ResetPasswordModal = ({ open, student, onSendLink, onClose, sending = false, error, success }) => {
  if (!student) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reset Password"
      subtitle={`Send password recovery link for ${student.name || 'Student'}`}
      icon={KeyRound}
      iconVariant="primary"
      size="sm"
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSendLink}
            disabled={sending}
          >
            <Send size={15} />
            <span>{sending ? 'Sending Link...' : 'Send Reset Link'}</span>
          </button>
        </>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }}>
          <div style={{ fontWeight: 700, color: '#0f172a' }}>{student.name || 'Student'}</div>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
            Email: <strong>{student.email || 'No email attached'}</strong>
          </div>
          {student.sifNumber && (
            <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
              SIF: <code>{student.sifNumber}</code>
            </div>
          )}
        </div>

        <div className="alert info" style={{ margin: 0, fontSize: 12, lineHeight: 1.4 }}>
          A secure password reset link will be dispatched to the student's email address.
        </div>

        {error && <div className="alert error" style={{ margin: 0 }}>{error}</div>}
        {success && <div className="alert success" style={{ margin: 0 }}>{success}</div>}
      </div>
    </Modal>
  );
};

export default ResetPasswordModal;
