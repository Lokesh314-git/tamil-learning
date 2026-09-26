import React from 'react';
const Card = ({ children, className = '', glass, style, ...props }) => (
  <div className={'card ' + (glass ? 'glass ' : '') + className} style={style} {...props}>
    {children}
  </div>
);
export default Card;