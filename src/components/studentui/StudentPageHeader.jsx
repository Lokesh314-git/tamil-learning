import React from 'react';

const StudentPageHeader = ({ title, subtitle, right }) => (
  <div className="student-page-header student-card">
    <div>
      <h2 className="student-title">{title}</h2>
      {subtitle ? <p className="student-subtitle">{subtitle}</p> : null}
    </div>
    {right ? <div>{right}</div> : null}
  </div>
);

export default StudentPageHeader;
