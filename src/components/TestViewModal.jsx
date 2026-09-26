import React from 'react';
import { Eye, CheckCircle2, BookOpen, Clock, Layers } from 'lucide-react';
import Modal from './ui/Modal';

const TestViewModal = ({ open, onClose, test }) => {
  if (!open || !test) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={test.title || 'Assessment Preview'}
      subtitle={`Unit ${test.unitNumber || 1} • ${test.subject || 'Tamil'} • ${test.duration || '30'} Minutes`}
      icon={Eye}
      iconVariant="primary"
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close Preview
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Info Highlights */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            background: 'var(--color-bg)',
            padding: 12,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)'
          }}
        >
          <div className="pill info" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Layers size={13} /> Unit {test.unitNumber || 1}
          </div>
          <div className="pill neutral" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={13} /> {test.duration || 30} mins
          </div>
          {test.testDate && (
            <div className="pill neutral">
              📅 {test.testDate} {test.testTime ? `at ${test.testTime}` : ''}
            </div>
          )}
          <div className="pill success">
            {test.questions?.length || 0} Questions
          </div>
        </div>

        {test.description && (
          <p style={{ fontSize: 13, color: 'var(--color-text-light)', margin: 0, lineHeight: 1.5 }}>
            {test.description}
          </p>
        )}

        {/* Questions list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(test.questions || []).map((q, idx) => (
            <div
              key={idx}
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    background: 'var(--color-primary)',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {idx + 1}
                </span>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text)' }}>
                  {q.questionText}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginTop: 4 }}>
                {q.options?.map((opt, oi) => {
                  const isCorrect = q.correctAnswer === oi;
                  return (
                    <div
                      key={oi}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: isCorrect ? 'rgba(34, 197, 94, 0.12)' : 'var(--color-card)',
                        border: isCorrect
                          ? '1px solid var(--color-success)'
                          : '1px solid var(--color-border)',
                        color: isCorrect ? 'var(--color-success)' : 'var(--color-text)',
                        fontWeight: isCorrect ? 700 : 400,
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6
                      }}
                    >
                      <span>{opt || `Option ${oi + 1}`}</span>
                      {isCorrect && <CheckCircle2 size={14} color="var(--color-success)" style={{ flexShrink: 0 }} />}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default TestViewModal;
