import React from 'react';
import Modal from './ui/Modal';
import { Trash2, AlertTriangle } from 'lucide-react';

const ConfirmDeleteModal = ({ open, onClose, onConfirm, text, title = 'Confirm Deletion' }) => {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle="This action cannot be undone."
      icon={AlertTriangle}
      iconVariant="danger"
      size="sm"
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            <Trash2 size={15} />
            <span>Confirm Delete</span>
          </button>
        </>
      )}
    >
      <div style={{ padding: '8px 0', fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
        {text || 'Are you sure you want to delete this record permanently?'}
      </div>
    </Modal>
  );
};

export default ConfirmDeleteModal;
