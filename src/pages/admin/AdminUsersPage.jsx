import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import UsersTable from '../../components/UsersTable';
import Loader from '../../components/Loader';
import {
  ROOT_ADMIN_EMAIL,
  canDemote,
  canPromote,
  isProtectedAdmin,
  isRootAdmin,
} from '../../utils/roles';
import { deleteStudentCompletely } from '../../utils/studentDelete';

const YEAR_FILTERS = ['All', '1st Year', '2nd Year', '3rd Year'];
const ROLE_FILTERS = ['all', 'admin', 'student'];
const STATUS_FILTERS = ['all', 'active', 'pending', 'blocked'];

const AdminUsersPage = () => {
  const { user: currentUser, profile } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('all');
  const [updatingUid, setUpdatingUid] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setUsers(list);
        setLoading(false);
      },
      (err) => {
        setError(err?.message || 'Failed to load users.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const normalizedUsers = useMemo(() => users
    .filter((u) => u.isDeleted !== true && u.status !== 'deleted')
    .map((u) => ({
      ...u,
      uid: u.uid || u.id,
      status: u.status || 'active',
      isDeleted: false,
      role: u.role === 'admin' ? 'admin' : 'student',
      isRootAdmin: isRootAdmin(u),
      isProtectedAdmin: isProtectedAdmin(u),
    })), [users]);

  const currentUserData = useMemo(() => {
    const uid = currentUser?.uid;
    if (!uid) return null;

    const fromList = normalizedUsers.find((u) => u.uid === uid);
    if (fromList) return fromList;

    return {
      uid,
      email: profile?.email || currentUser?.email || '',
      role: profile?.role || 'student',
      isRootAdmin: isRootAdmin(profile || currentUser),
      isProtectedAdmin: isProtectedAdmin(profile || currentUser),
    };
  }, [currentUser, profile, normalizedUsers]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();

    return normalizedUsers.filter((u) => {
      const matchesSearch = !term ||
        (u.name || '').toLowerCase().includes(term) ||
        (u.email || '').toLowerCase().includes(term) ||
        (u.sifNumber || '').toLowerCase().includes(term) ||
        (u.rollNumber || '').toLowerCase().includes(term);

      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const matchesYear = yearFilter === 'All' || u.year === yearFilter;
      const matchesStatus = statusFilter === 'all' || u.status === statusFilter;

      return matchesSearch && matchesRole && matchesYear && matchesStatus;
    });
  }, [normalizedUsers, search, roleFilter, yearFilter, statusFilter]);

  const updateRole = async (targetUser, nextRole) => {
    const targetUid = targetUser.uid || targetUser.id;
    const actingUid = currentUser?.uid || '';
    if (!targetUid || !actingUid) return;

    const isPromoteAction = nextRole === 'admin';

    if (isPromoteAction && !canPromote(currentUserData, targetUser)) {
      setError('You are not allowed to promote this user.');
      return;
    }

    if (!isPromoteAction) {
      if (isRootAdmin(targetUser)) {
        setError('Root admin cannot be changed.');
        return;
      }

      if (targetUid === actingUid) {
        setError('You cannot remove your own admin access.');
        return;
      }

      if (!canDemote(currentUserData, targetUser, actingUid)) {
        setError('You are not allowed to demote this admin.');
        return;
      }
    }

    const actionText = nextRole === 'admin' ? 'promote' : 'make student';
    const ok = window.confirm(`Are you sure you want to ${actionText} this user?`);
    if (!ok) return;

    setUpdatingUid(targetUid);
    setError('');
    setMessage('');

    try {
      if (isPromoteAction) {
        await updateDoc(doc(db, 'users', targetUid), {
          role: 'admin',
          isRootAdmin: false,
          promotedAt: serverTimestamp(),
          promotedBy: actingUid,
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, 'users', targetUid), {
          role: 'student',
          demotedAt: serverTimestamp(),
          demotedBy: actingUid,
          updatedAt: serverTimestamp(),
        });
      }

      setMessage(nextRole === 'admin' ? 'User promoted to admin.' : 'Admin role removed successfully.');
    } catch (err) {
      setError(err?.message || 'Failed to update role.');
    } finally {
      setUpdatingUid(null);
    }
  };

  const deleteUser = async (targetUser) => {
    const targetUid = targetUser.uid || targetUser.id;
    const actingUid = currentUser?.uid || '';
    if (!targetUid || !actingUid) return;

    if (isRootAdmin(targetUser) || targetUser.isProtectedAdmin) {
      setError('Root and protected administrators cannot be deleted.');
      return;
    }

    if (targetUid === actingUid) {
      setError('You cannot delete your own account.');
      return;
    }

    const ok = window.confirm(`Are you sure you want to delete user "${targetUser.name || targetUser.email || targetUid}"? All their associated records will be permanently deleted.`);
    if (!ok) return;

    setUpdatingUid(targetUid);
    setError('');
    setMessage('');

    try {
      await deleteStudentCompletely(db, targetUser);
      setMessage(`User ${targetUser.name || targetUser.email || ''} deleted successfully.`);
    } catch (err) {
      console.error('Failed to delete user:', err);
      setError(err?.message || 'Failed to delete user.');
    } finally {
      setUpdatingUid(null);
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ maxWidth: 320 }}
            placeholder="Search name, SIF, or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            {ROLE_FILTERS.map((r) => <option key={r} value={r}>{r === 'all' ? 'All roles' : r}</option>)}
          </select>
          <select className="input" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            {YEAR_FILTERS.map((y) => <option key={y} value={y}>{y === 'All' ? 'All years' : y}</option>)}
          </select>
          <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
          </select>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 20 }}><Loader /></div>
        ) : (
          <UsersTable
            users={filteredUsers}
            currentUid={currentUser?.uid}
            currentUserData={currentUserData}
            updatingUid={updatingUid}
            onMakeAdmin={(u) => updateRole(u, 'admin')}
            onMakeStudent={(u) => updateRole(u, 'student')}
            onDeleteUser={deleteUser}
          />
        )}
      </div>
    </div>
  );
};

export default AdminUsersPage;
