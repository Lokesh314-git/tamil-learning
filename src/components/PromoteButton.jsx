import React from 'react';

const PromoteButton = ({
  onClick,
  disabled = false,
  loading = false,
  label = 'Make Admin',
  loadingLabel = 'Updating...',
  className = 'btn btn-primary',
}) => {
  return (
    <button className={className} onClick={onClick} disabled={disabled || loading}>
      {loading ? loadingLabel : label}
    </button>
  );
};

export default PromoteButton;
