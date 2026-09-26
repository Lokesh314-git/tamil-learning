import React from "react";
import { Link } from "react-router-dom";

const DashboardCard = ({ title, value, subtitle, to, pill }) => {
  const content = (
    <div className="card dashboard-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <div className="stat-title">{title}</div>
          <div className="stat-value">{value}</div>
          {subtitle && <div className="stat-meta">{subtitle}</div>}
        </div>
        {pill && <div className="pill info">{pill}</div>}
      </div>
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: "none" }}>{content}</Link> : content;
};

export default DashboardCard;
