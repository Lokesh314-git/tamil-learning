import React from 'react';
const PageHeader = ({ eyebrow, title, subtitle }) => (
  <div>
    {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
    {title && <h1>{title}</h1>}
    {subtitle && <p style={{ marginTop: 4, fontSize: 13 }}>{subtitle}</p>}
  </div>
);
export default PageHeader;