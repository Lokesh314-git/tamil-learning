import React from 'react';

const StudentStatCard = ({ icon, title, value, tone = 'primary', subtitle }) => (
  <div className={`student-card student-stat-card ${tone}`}>
    <div className="student-stat-head">
      <div className="student-stat-title">{title}</div>
      <div className="student-stat-icon" aria-hidden>{icon}</div>
    </div>
    <div className="student-stat-value">{value}</div>
    {subtitle ? <div className="student-stat-sub">{subtitle}</div> : null}
  </div>
);

export default StudentStatCard;
