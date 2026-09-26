import React from 'react';
import './FancyLoader.css';

const FancyLoader = ({ fullscreen = true, label = 'Loading...' }) => {
  return (
    <div className={`fancy-loader-screen${fullscreen ? ' fullscreen' : ''}`}>
      <div className="ring-loader" style={{ width: 180, height: 180 }}>
        <span className="ring ring-1" />
        <span className="ring ring-2" />
        <span className="ring ring-3" />
        <span className="ring ring-4" />
        <span className="ring ring-5" />
      </div>
      {label ? <div className="loader-text">{label}</div> : null}
    </div>
  );
};

export default FancyLoader;
