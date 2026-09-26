import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '../../firebase';
import { YEARS, sortDepartmentsByName } from '../../utils/departments';

const EMPTY_FORM = { name: '', year: YEARS[0] };

const AdminDepartments = () => {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    const q = query(collection(db, 'departments'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((department) => ({ id: department.id, ...department.data() }));
      setDepartments(sortDepartmentsByName(list));
      setLoading(false);
    }, (err) => {
      console.warn('Departments listener error:', err);
      setError('Failed to load departments.');
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const loadDepartments = () => {};

  const grouped = useMemo(() => {
    return YEARS.map((year) => ({
      year,
      items: departments.filter((department) => department.year === year)
    }));
  }, [departments]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name || !form.year) {
      setError('Department name and year are required.');
      return;
    }

    setError('');
    setMessage('');
    try {
      const normalizedName = name.toLowerCase();
      const duplicate = departments.some((department) => {
        if (editing?.id && department.id === editing.id) return false;
        return (
          department.year === form.year &&
          (department.name || '').trim().toLowerCase() === normalizedName
        );
      });

      if (duplicate) {
        setError('This department already exists for this year.');
        return;
      }

      if (editing?.id) {
        await updateDoc(doc(db, 'departments', editing.id), {
          name,
          year: form.year,
          updatedAt: serverTimestamp(),
        });
        setMessage('Department updated successfully.');
      } else {
        await addDoc(collection(db, 'departments'), {
          name,
          year: form.year,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          deletedAt: null,
        });
        setMessage('Department added successfully.');
      }
      resetForm();
      await loadDepartments();
    } catch (err) {
      console.error('Failed to save department', err);
      setError(err?.message || 'Failed to save department.');
    }
  };

  const onEdit = (department) => {
    setEditing(department);
    setForm({ name: department.name || '', year: department.year || YEARS[0] });
  };

  const onToggleStatus = async (department) => {
    setError('');
    setMessage('');
    try {
      const nextActive = !(department.isActive === true);
      await updateDoc(doc(db, 'departments', department.id), {
        isActive: nextActive,
        deletedAt: nextActive ? null : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setMessage(nextActive ? 'Department restored.' : 'Department deactivated.');
      await loadDepartments();
    } catch (err) {
      console.error('Failed to update department status', err);
      setError('Failed to update department status.');
    }
  };

  const onPermanentDelete = async (department) => {
    const ok = window.confirm('This will permanently delete this department from Firestore. Continue?');
    if (!ok) return;

    setError('');
    setMessage('');
    try {
      await deleteDoc(doc(db, 'departments', department.id));
      setDepartments((prev) => prev.filter((item) => item.id !== department.id));
      if (editing?.id === department.id) {
        resetForm();
      }
      setMessage('Department permanently deleted.');
    } catch (err) {
      console.error('Failed to permanently delete department', err);
      setError(err?.message || 'Failed to permanently delete department.');
    }
  };

  return (
    <div className="grid admin-departments-page" style={{ gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{editing ? 'Edit Department' : 'Add Department'}</h3>
        <form className="grid" style={{ gap: 10 }} onSubmit={onSubmit}>
          <input
            className="input"
            placeholder="Department name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            required
          />
          <select
            className="input"
            value={form.year}
            onChange={(e) => setForm((prev) => ({ ...prev, year: e.target.value }))}
          >
            {YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {editing && <button className="btn btn-secondary" type="button" onClick={resetForm}>Cancel</button>}
            <button className="btn btn-primary" type="submit">{editing ? 'Update Department' : 'Add Department'}</button>
          </div>
        </form>
        {message && <div className="alert success" style={{ marginTop: 10 }}>{message}</div>}
        {error && <div className="alert error" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {loading ? <div className="card">Loading departments...</div> : grouped.map((group) => (
        <div key={group.year} className="card">
          <h3 style={{ marginTop: 0 }}>{group.year}</h3>
          <div className="table-scroll departments-table-scroll">
            <table className="table departments-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((department) => (
                  <tr key={department.id}>
                    <td>{department.name}</td>
                    <td>
                      <span className={department.isActive === true ? 'pill success' : 'pill neutral'}>
                        {department.isActive === true ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="department-actions-cell">
                      <button className="btn btn-secondary" onClick={() => onEdit(department)}>Edit</button>
                      <button className="btn btn-secondary" onClick={() => onToggleStatus(department)}>
                        {department.isActive === true ? 'Deactivate' : 'Activate'}
                      </button>
                      <button className="btn btn-secondary" onClick={() => onPermanentDelete(department)}>
                        Permanent Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {group.items.length === 0 && <tr><td colSpan={3}>No departments added for this year.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AdminDepartments;
