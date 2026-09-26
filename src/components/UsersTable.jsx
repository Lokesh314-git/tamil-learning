import React from 'react';
import RoleBadge from './RoleBadge';
import PromoteButton from './PromoteButton';
import { canDemote, canPromote, isProtectedAdmin } from '../utils/roles';

const UsersTable = ({
  users,
  currentUid,
  currentUserData,
  updatingUid,
  onMakeAdmin,
  onMakeStudent,
  onDeleteUser,
}) => {
  return (
    <div className="table-scroll">
      <table className="table users-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email / SIF Number</th>
            <th>Role</th>
            <th>Year</th>
            <th>Status</th>
            <th style={{ width: 280 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const uid = user.uid || user.id;
            const isSelf = uid === currentUid;
            const isDeleted = user.isDeleted === true || user.status === 'deleted';
            const isAdmin = user.role === 'admin';
            const isProtected = isProtectedAdmin(user);
            const status = isDeleted ? 'deleted' : (user.status || 'active');
            const loading = updatingUid === uid;
            const showPromote = canPromote(currentUserData, user);
            const showDemote = canDemote(currentUserData, user, currentUid);
            const studentSif = user.sifNumber || user.sif || user.rollNumber || (user.email && !user.email.includes('@student') ? user.email : '-');

            return (
              <tr key={uid}>
                <td>{user.name || '-'}</td>
                <td className="email-cell">
                  {isAdmin ? (
                    user.email || '-'
                  ) : (
                    <span style={{ fontWeight: 600, color: '#2563eb', fontFamily: 'monospace', fontSize: '13px' }}>
                      {studentSif}
                    </span>
                  )}
                </td>
                <td>
                  <div className="users-role-cell">
                    <RoleBadge role={user.role} />
                    {isProtected && <span className="pill warning">Protected</span>}
                    {isSelf && <span className="pill info">You</span>}
                  </div>
                </td>
                <td>{user.year || '-'}</td>
                <td>
                  <span className={`badge ${status === 'active' ? 'success' : 'neutral'}`}>{status}</span>
                </td>
                <td>
                  <div className="users-actions-cell">
                    {isProtected && <span className="pill warning">Protected Admin</span>}
                    {isSelf && <span className="pill info">You</span>}
                    {showPromote && !isDeleted && (
                      <PromoteButton
                        onClick={() => onMakeAdmin(user)}
                        loading={loading}
                        label="Make Admin"
                        loadingLabel="Promoting..."
                      />
                    )}
                    {isAdmin && !isSelf && showDemote && (
                      <PromoteButton
                        onClick={() => onMakeStudent(user)}
                        loading={loading}
                        label="Make Student"
                        loadingLabel="Updating..."
                        className="btn btn-secondary"
                      />
                    )}
                    {!isProtected && !isSelf && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ background: '#ef4444', color: '#fff', border: 'none' }}
                        disabled={loading}
                        onClick={() => onDeleteUser?.(user)}
                      >
                        Delete
                      </button>
                    )}
                    {isDeleted && <span className="pill warning">Deleted user</span>}
                  </div>
                </td>
              </tr>
            );
          })}
          {!users.length && (
            <tr>
              <td colSpan={6}>No users found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default UsersTable;
