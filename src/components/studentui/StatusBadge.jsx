import React from 'react';

const StatusBadge = ({ status = '', type = 'neutral' }) => (
  <span className={`student-status-badge ${type}`.trim()}>{status}</span>
);

export default StatusBadge;
