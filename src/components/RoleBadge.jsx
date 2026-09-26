import React from 'react';

const RoleBadge = ({ role }) => {
  const normalized = role === 'admin' ? 'admin' : 'student';
  const className = normalized === 'admin' ? 'badge success' : 'badge neutral';
  return <span className={className}>{normalized === 'admin' ? 'Admin' : 'Student'}</span>;
};

export default RoleBadge;
