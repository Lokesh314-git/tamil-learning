import React from 'react';

const Badge = ({ children, tone = 'neutral', className = '' }) => (
  <span className={`badge ${tone} ${className}`.trim()}>{children}</span>
);

export default Badge;
