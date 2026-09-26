import React from 'react';
const Select = ({ className = '', children, ...props }) => (
  <select className={'input ' + className} {...props}>{children}</select>
);
export default Select;