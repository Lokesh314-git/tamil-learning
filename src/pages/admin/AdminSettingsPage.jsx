import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import Loader from '../../components/Loader';
import { Settings, Save, HardDrive, Database, ShieldCheck, CheckCircle2 } from 'lucide-react';

const AdminSettingsPage = () => {
  const [academicYear, setAcademicYear] = useState('2024 - 2025');
  const [currentSemester, setCurrentSemester] = useState('Odd Semester (I, III, V)');
  const [mongoStorageEnabled, setMongoStorageEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'academic'));
        if (snap.exists()) {
          const data = snap.data();
          setAcademicYear(data.academicYear || '2024 - 2025');
          setCurrentSemester(data.currentSemester || 'Odd Semester (I, III, V)');
          setMongoStorageEnabled(data.mongoStorageEnabled !== false);
        }
      } catch (err) {
        console.warn('Academic settings fetch err:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      await setDoc(doc(db, 'settings', 'academic'), {
        academicYear,
        currentSemester,
        mongoStorageEnabled,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      setMessage('System & Academic settings saved successfully.');
    } catch (err) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="grid fade-in" style={{ gap: 20 }}>
      {/* Header Banner */}
      <div className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="pill info" style={{ marginBottom: 6 }}>System Configuration</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Academic & Platform Settings</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-light)', fontSize: 13 }}>
            Configure current academic cycle, semester terms, and storage backend settings.
          </p>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="card" style={{ maxWidth: 680, padding: 22 }}>
        <form onSubmit={handleSaveSettings} className="grid" style={{ gap: 16 }}>
          <div className="grid grid-2" style={{ gap: 12 }}>
            <div>
              <label className="form-label" style={{ fontWeight: 700, fontSize: 13 }}>Active Academic Year</label>
              <input
                className="input"
                placeholder="e.g. 2024 - 2025"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 700, fontSize: 13 }}>Current Term / Semester</label>
              <select className="input" value={currentSemester} onChange={(e) => setCurrentSemester(e.target.value)}>
                <option value="Odd Semester (I, III, V)">Odd Semester (I, III, V)</option>
                <option value="Even Semester (II, IV, VI)">Even Semester (II, IV, VI)</option>
                <option value="Annual System">Annual Term</option>
              </select>
            </div>
          </div>

          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Backend & Storage Engine</h4>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={mongoStorageEnabled}
                onChange={(e) => setMongoStorageEnabled(e.target.checked)}
              />
              <span>Enable MongoDB Document & PDF Storage Integration</span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Save size={16} />
              <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* MongoDB Atlas Cluster Status Card */}
      <div className="card" style={{ maxWidth: 680, padding: 22, border: '1px solid #10b98133', background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Database size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#065f46' }}>MongoDB Atlas Cloud Database</h3>
                <span className="pill success" style={{ fontSize: 11, padding: '2px 8px' }}>Active & Connected</span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: '#047857' }}>
                Cluster: <strong>cluster0.qfdmujt.mongodb.net</strong> • DB: <strong>tamil_learning</strong>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: 12, padding: '8px 14px', background: '#047857', borderColor: '#047857' }}
              onClick={async () => {
                setSaving(true);
                setError('');
                setMessage('');
                try {
                  const { mongoService } = await import('../../services/mongoService');
                  const res = await mongoService.migrateAllFirestoreFilesToGridFS();
                  setMessage(`Migration Complete! Successfully migrated ${res.totalMigrated || 0} documents/files into MongoDB GridFS.`);
                } catch (err) {
                  setError('Migration error: ' + err.message);
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
            >
              <Database size={14} />
              <span>{saving ? 'Migrating...' : 'Migrate Files to MongoDB GridFS'}</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '8px 14px', borderColor: '#10b981', color: '#065f46' }}
              onClick={async () => {
                setSaving(true);
                setError('');
                setMessage('');
                try {
                  const { mongoService } = await import('../../services/mongoService');
                  const res = await mongoService.performFullMongoSync();
                  setMessage(`MongoDB Atlas Synchronized! Successfully updated ${res.totalDocumentsSynced} records across collections.`);
                } catch (err) {
                  setError('MongoDB sync error: ' + err.message);
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
            >
              <CheckCircle2 size={14} style={{ color: '#10b981' }} />
              <span>{saving ? 'Syncing...' : 'Sync Firestore to MongoDB Atlas'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-3" style={{ gap: 10, fontSize: 12 }}>
          <div style={{ background: '#fff', padding: 10, borderRadius: 8, border: '1px solid #d1fae5' }}>
            <div style={{ color: '#6b7280', fontSize: 11 }}>Cluster Host</div>
            <div style={{ fontWeight: 700, color: '#111827', marginTop: 2, wordBreak: 'break-all' }}>cluster0.qfdmujt.mongodb.net</div>
          </div>
          <div style={{ background: '#fff', padding: 10, borderRadius: 8, border: '1px solid #d1fae5' }}>
            <div style={{ color: '#6b7280', fontSize: 11 }}>Target Database</div>
            <div style={{ fontWeight: 700, color: '#111827', marginTop: 2 }}>tamil_learning</div>
          </div>
          <div style={{ background: '#fff', padding: 10, borderRadius: 8, border: '1px solid #d1fae5' }}>
            <div style={{ color: '#6b7280', fontSize: 11 }}>App Client</div>
            <div style={{ fontWeight: 700, color: '#111827', marginTop: 2 }}>Cluster0 (Web Platform)</div>
          </div>
        </div>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#6b7280' }}>
          <span>Collections: <code>students</code>, <code>study_materials</code>, <code>units</code>, <code>quizzes</code>, <code>announcements</code>, <code>downloads</code></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10b981', fontWeight: 600 }}>
            <ShieldCheck size={14} /> TLS / SSL Secured
          </span>
        </div>
      </div>
    </div>
  );
};

export default AdminSettingsPage;
