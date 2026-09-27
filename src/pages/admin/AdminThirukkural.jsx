import React, { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { db } from '../../firebase';

const EMPTY_FORM = { line1: '', line2: '', meaning: '' };

const AdminThirukkural = () => {
  const [kurals, setKurals] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'thirukkurals'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setKurals(list);
    }, (err) => {
      setError(err?.message || 'Failed to load Thirukkural entries.');
    });
    return () => unsub();
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId('');
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    const line1 = form.line1.trim();
    const line2 = form.line2.trim();
    const meaning = (form.meaning || '').trim();
    if (!line1 || !line2) {
      setError('Both lines of Thirukkural are required.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (editingId) {
        await updateDoc(doc(db, 'thirukkurals', editingId), {
          line1,
          line2,
          meaning,
          updatedAt: serverTimestamp()
        });
        setMessage('Thirukkural updated successfully.');
      } else {
        await addDoc(collection(db, 'thirukkurals'), {
          line1,
          line2,
          meaning,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setMessage('Thirukkural added successfully.');
      }
      resetForm();
    } catch (err) {
      setError(err?.message || 'Failed to save Thirukkural.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (kural) => {
    setEditingId(kural.id);
    setForm({
      line1: kural.line1 || '',
      line2: kural.line2 || '',
      meaning: kural.meaning || kural.porul || ''
    });
    setError('');
    setMessage('');
  };

  const onToggleStatus = async (kural) => {
    setError('');
    setMessage('');
    try {
      await updateDoc(doc(db, 'thirukkurals', kural.id), {
        isActive: !kural.isActive,
        updatedAt: serverTimestamp()
      });
      setMessage(!kural.isActive ? 'Thirukkural activated.' : 'Thirukkural deactivated.');
    } catch (err) {
      setError(err?.message || 'Failed to update status.');
    }
  };

  const onDelete = async (kural) => {
    const ok = window.confirm('Delete this Thirukkural permanently?');
    if (!ok) return;
    setError('');
    setMessage('');
    try {
      await deleteDoc(doc(db, 'thirukkurals', kural.id));
      if (editingId === kural.id) resetForm();
      setMessage('Thirukkural deleted.');
    } catch (err) {
      setError(err?.message || 'Failed to delete Thirukkural.');
    }
  };

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="card">
        <h2 style={{ margin: 0 }}>Thirukkural Management</h2>
        <form className="grid" style={{ gap: 10, marginTop: 12 }} onSubmit={onSubmit}>
          <textarea
            className="input"
            rows={2}
            placeholder="Line 1 (முதல் வரி)"
            value={form.line1}
            onChange={(e) => setForm((prev) => ({ ...prev, line1: e.target.value }))}
          />
          <textarea
            className="input"
            rows={2}
            placeholder="Line 2 (இரண்டாம் வரி)"
            value={form.line2}
            onChange={(e) => setForm((prev) => ({ ...prev, line2: e.target.value }))}
          />
          <textarea
            className="input"
            rows={2}
            placeholder="Meaning / விளக்கம் (Optional)"
            value={form.meaning}
            onChange={(e) => setForm((prev) => ({ ...prev, meaning: e.target.value }))}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {editingId && (
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                Cancel
              </button>
            )}
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
            </button>
          </div>
        </form>
        {message && <div className="alert success" style={{ marginTop: 10 }}>{message}</div>}
        {error && <div className="alert error" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Thirukkural</th>
                <th>Meaning (பொருள்)</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {kurals.map((kural) => (
                <tr key={kural.id}>
                  <td className="kural-cell">
                    <div style={{ fontWeight: 600 }}>{kural.line1}</div>
                    <div style={{ color: 'var(--color-text-muted)' }}>{kural.line2}</div>
                  </td>
                  <td style={{ fontSize: 13, maxWidth: 280 }}>
                    {kural.meaning || kural.porul || <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>—</span>}
                  </td>
                  <td>
                    <span className={`pill ${kural.isActive ? 'success' : 'neutral'}`}>
                      {kural.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary" onClick={() => startEdit(kural)}>Edit</button>
                      <button className="btn btn-secondary" onClick={() => onToggleStatus(kural)}>
                        {kural.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button className="btn btn-secondary" onClick={() => onDelete(kural)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {kurals.length === 0 && (
                <tr>
                  <td colSpan={4}>No Thirukkural entries yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminThirukkural;
