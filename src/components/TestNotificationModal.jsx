import React, { useState, useEffect } from 'react';
import {
  Bell,
  Send,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Smartphone,
  Info
} from 'lucide-react';
import Modal from './ui/Modal';
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TITLES,
  getDefaultNotificationBody,
  dispatchTestNotification
} from '../utils/testNotificationService';

const TestNotificationModal = ({
  open,
  onClose,
  test,
  departments = [],
  currentYear = 'all'
}) => {
  const [notificationType, setNotificationType] = useState(NOTIFICATION_TYPES.NEW_TEST);
  const [targetType, setTargetType] = useState('all');
  const [targetYear, setTargetYear] = useState(currentYear || 'all');
  const [targetDepartmentId, setTargetDepartmentId] = useState(test?.departmentId || 'all');
  const [targetSection, setTargetSection] = useState('all');
  const [targetBatch, setTargetBatch] = useState('all');
  const [customTitle, setCustomTitle] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [testDate, setTestDate] = useState(test?.testDate || '');
  const [testTime, setTestTime] = useState(test?.testTime || '');
  const [duration, setDuration] = useState(test?.duration || '30');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [sending, setSending] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (open && test) {
      setNotificationType(NOTIFICATION_TYPES.NEW_TEST);
      setTestDate(test.testDate || new Date().toISOString().split('T')[0]);
      setTestTime(test.testTime || '10:00 AM');
      setDuration(test.duration || '30');
      setTargetDepartmentId(test.departmentId || 'all');
      setTargetYear(test.year || currentYear || 'all');
      setCustomTitle('');
      setCustomBody('');
      setIsScheduled(false);
      setScheduledDateTime('');
      setSuccessMsg('');
      setErrorMsg('');
    }
  }, [open, test, currentYear]);

  if (!open || !test) return null;

  const resolvedTitle = customTitle.trim() || NOTIFICATION_TITLES[notificationType];
  const resolvedBody =
    customBody.trim() ||
    getDefaultNotificationBody(notificationType, {
      title: test.title,
      subject: test.departmentName || test.subject || 'Tamil',
      testDate,
      testTime
    });

  const selectedDeptObj = departments.find((d) => d.id === targetDepartmentId);
  const targetDeptName =
    targetDepartmentId === 'all'
      ? 'All Departments'
      : selectedDeptObj?.name || 'Department';

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    setSending(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await dispatchTestNotification({
        type: notificationType,
        testId: test.id,
        testTitle: test.title,
        subject: targetDeptName,
        testDate,
        testTime,
        duration,
        description: test.description || '',
        customTitle,
        customBody,
        targetType,
        targetYear,
        targetDepartmentId,
        targetDepartmentName: targetDeptName,
        targetSection,
        targetBatch,
        isScheduled,
        scheduledFor: isScheduled ? scheduledDateTime : null
      });

      setSuccessMsg(
        isScheduled
          ? 'Notification successfully scheduled!'
          : 'Push notification successfully broadcast to enrolled students!'
      );
      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to dispatch notification');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Push Notification Dispatcher"
      subtitle={`Broadcast notification for "${test.title}" to enrolled students`}
      icon={Bell}
      iconVariant="primary"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSend}
            disabled={sending}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Send size={15} />
            {sending
              ? 'Broadcasting...'
              : isScheduled
              ? 'Schedule Notification'
              : 'Broadcast Notification Now'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {successMsg && (
          <div className="alert success" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="alert error" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Notification Type Selector */}
        <div className="form-group">
          <label className="form-label">Notification Type</label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 8
            }}
          >
            {[
              { id: NOTIFICATION_TYPES.NEW_TEST, label: 'New Test', emoji: '📝' },
              { id: NOTIFICATION_TYPES.REMINDER, label: 'Reminder', emoji: '⏰' },
              { id: NOTIFICATION_TYPES.TEST_UPDATED, label: 'Updated', emoji: '🔄' },
              { id: NOTIFICATION_TYPES.TEST_CANCELLED, label: 'Cancelled', emoji: '🚫' },
              { id: NOTIFICATION_TYPES.RESULTS_PUBLISHED, label: 'Results Out', emoji: '🏆' }
            ].map((item) => {
              const isSelected = notificationType === item.id;
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setNotificationType(item.id)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: isSelected
                      ? '1.5px solid var(--color-primary)'
                      : '1px solid var(--color-border)',
                    background: isSelected ? 'var(--color-primary-light)' : 'var(--color-bg)',
                    color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>{item.emoji}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Target Eligibility Criteria */}
        <div
          style={{
            background: 'var(--color-bg)',
            padding: 14,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>
            🎯 Target Audience Scope
          </span>
          <div className="grid grid-2" style={{ gap: 10 }}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: 11 }}>Target Group</label>
              <select
                className="input"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
              >
                <option value="all">All Enrolled Students</option>
                <option value="year">Specific Year Only</option>
                <option value="department">Specific Department</option>
                <option value="section">Specific Section / Batch</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: 11 }}>Academic Year</label>
              <select
                className="input"
                value={targetYear}
                onChange={(e) => setTargetYear(e.target.value)}
              >
                <option value="all">All Years</option>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: 11 }}>Department</label>
              <select
                className="input"
                value={targetDepartmentId}
                onChange={(e) => setTargetDepartmentId(e.target.value)}
              >
                <option value="all">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: 11 }}>Section</label>
              <select
                className="input"
                value={targetSection}
                onChange={(e) => setTargetSection(e.target.value)}
              >
                <option value="all">All Sections</option>
                <option value="A">Section A</option>
                <option value="B">Section B</option>
                <option value="C">Section C</option>
              </select>
            </div>
          </div>
        </div>

        {/* Test Schedule Parameters */}
        <div className="grid grid-3" style={{ gap: 10 }}>
          <div className="form-group">
            <label className="form-label">Test Date</label>
            <input
              type="date"
              className="input"
              value={testDate}
              onChange={(e) => setTestDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Test Time</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. 10:30 AM"
              value={testTime}
              onChange={(e) => setTestTime(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Duration</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. 30 mins"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
        </div>

        {/* Future Schedule Option */}
        <div
          style={{
            background: 'rgba(234, 179, 8, 0.08)',
            padding: 12,
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(234, 179, 8, 0.25)'
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              color: 'var(--color-warning)'
            }}
          >
            <input
              type="checkbox"
              checked={isScheduled}
              onChange={(e) => setIsScheduled(e.target.checked)}
            />
            Schedule Notification for Future Automatic Delivery
          </label>
          {isScheduled && (
            <div style={{ marginTop: 10 }}>
              <input
                type="datetime-local"
                className="input"
                value={scheduledDateTime}
                onChange={(e) => setScheduledDateTime(e.target.value)}
                required={isScheduled}
              />
            </div>
          )}
        </div>

        {/* Custom Content Overrides */}
        <div className="form-group">
          <label className="form-label">Custom Push Title (Optional)</label>
          <input
            className="input"
            placeholder={NOTIFICATION_TITLES[notificationType]}
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Custom Message Body (Optional)</label>
          <textarea
            className="input"
            rows={2}
            placeholder="Leave empty to use automatic standard template..."
            value={customBody}
            onChange={(e) => setCustomBody(e.target.value)}
          />
        </div>

        {/* Live Smartphone FCM Preview */}
        <div
          style={{
            border: '1px dashed var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 14,
            background: 'var(--color-card)'
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--color-text-light)',
              letterSpacing: '0.5px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 10
            }}
          >
            <Smartphone size={14} /> Student Notification Preview
          </span>
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              background: 'var(--color-bg)',
              padding: 12,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)'
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-primary)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 16,
                flexShrink: 0
              }}
            >
              த
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text)' }}>
                  {resolvedTitle}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-text-light)' }}>now</span>
              </div>
              <p
                style={{
                  margin: '4px 0 8px 0',
                  fontSize: 12,
                  color: 'var(--color-text)',
                  lineHeight: 1.4
                }}
              >
                {resolvedBody}
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
                <span
                  style={{
                    background: 'var(--color-card)',
                    padding: '2px 8px',
                    borderRadius: 4,
                    border: '1px solid var(--color-border)'
                  }}
                >
                  ⏱ {duration} mins
                </span>
                {testDate && (
                  <span
                    style={{
                      background: 'var(--color-card)',
                      padding: '2px 8px',
                      borderRadius: 4,
                      border: '1px solid var(--color-border)'
                    }}
                  >
                    📅 {testDate}
                  </span>
                )}
                <span
                  style={{
                    background: 'var(--color-primary-light)',
                    color: 'var(--color-primary)',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontWeight: 600
                  }}
                >
                  👉 Tap to open
                </span>
              </div>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
};

export default TestNotificationModal;
