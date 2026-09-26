import React from 'react';
import './FullScreenLoader.css';

const FullScreenLoader = () => {
  return (
    <div className="fullscreen-loader" aria-live="polite" aria-busy="true">
      <div className="fullscreen-ring-loader">
        <span className="fullscreen-ring r1" />
        <span className="fullscreen-ring r2" />
        <span className="fullscreen-ring r3" />
        <span className="fullscreen-ring r4" />
        <span className="fullscreen-ring r5" />
      </div>
      <p className="fullscreen-loader-text">Loading...</p>
    </div>
  );
};

export default FullScreenLoader;
