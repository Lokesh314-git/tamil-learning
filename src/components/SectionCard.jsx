import React from 'react';
const SectionCard = ({ title, subtitle, onClick, children }) => (
  <div className="section-card" onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
    <div className="section-card-title">{title}</div>
    {subtitle && <div className="section-card-subtitle">{subtitle}</div>}
    {children}
  </div>
);
export default SectionCard;