import React from 'react';

const StudentContentCard = ({ children, className = '' }) => (
  <div className={`student-card ${className}`.trim()}>{children}</div>
);

export default StudentContentCard;
