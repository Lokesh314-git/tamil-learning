import React from 'react';

const StudentActionCard = ({ icon, title, subtitle, onClick, actionLabel = 'Open' }) => (
  <button className="student-card student-action-card" onClick={onClick}>
    <div className="student-action-icon" aria-hidden>{icon}</div>
    <div className="student-action-title">{title}</div>
    <div className="student-action-subtitle">{subtitle}</div>
    <span className="student-action-link">{actionLabel}</span>
  </button>
);

export default StudentActionCard;
