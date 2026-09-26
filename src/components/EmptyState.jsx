import React from 'react';
import { BookOpen } from 'lucide-react';

const EmptyState = ({ message = 'Nothing to show yet.', action = null, icon = null }) => (
  <div className="empty-state">
    <div className="empty-state-icon">
      {icon || <BookOpen size={28} />}
    </div>
    <p>{message}</p>
    {action ? <div>{action}</div> : null}
  </div>
);

export default EmptyState;
