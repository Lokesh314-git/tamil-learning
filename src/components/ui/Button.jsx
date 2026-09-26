import React from 'react';
const Button = ({ children, variant = 'primary', className = '', style, ...props }) => (
  <button className={'btn btn-' + variant + ' ' + className} style={style} {...props}>
    {children}
  </button>
);
export default Button;