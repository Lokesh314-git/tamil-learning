import React from 'react';

const StudentContentCard = ({ children, className = '', style, ...rest }) => (
  <div className={`student-card ${className}`.trim()} style={style} {...rest}>
    {children}
  </div>
);

export default StudentContentCard;

