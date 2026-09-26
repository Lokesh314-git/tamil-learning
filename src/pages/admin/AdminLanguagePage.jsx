import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import Loader from '../../components/Loader';
import { Languages, Globe, Save, CheckCircle2 } from 'lucide-react';

const AdminLanguagePage = () => {
  const [defaultLanguage, setDefaultLanguage] = useState('en');
  const [announcementLang, setAnnouncementLang] = useState('both');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'localization'));
        if (snap.exists()) {
          const data = snap.data();
          setDefaultLanguage(data.defaultLanguage || 'en');
          setAnnouncementLang(data.announcementLanguage || 'both');
        }
      } catch (err) {
        console.warn('Localization config error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      await setDoc(doc(db, 'settings', 'localization'), {
        defaultLanguage,
        announcementLanguage: announcementLang,
        supportedLanguages: ['en', 'ta'],
        updatedAt: serverTimestamp(),
      }, { merge: true });

      setMessage('Language settings saved successfully.');
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
          <div className="pill info" style={{ marginBottom: 6 }}>Localization & Translations</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Multi-Language Management</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-light)', fontSize: 13 }}>
            Configure default interface languages and broadcast preferences for English and Tamil (தமிழ்).
          </p>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="card" style={{ maxWidth: 640, padding: 22 }}>
        <form onSubmit={handleSave} className="grid" style={{ gap: 16 }}>
          <div>
            <label className="form-label" style={{ fontWeight: 700, fontSize: 14 }}>Default App Language</label>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-text-light)' }}>
              Language presented to first-time students on launch.
            </p>
            <select className="input" value={defaultLanguage} onChange={(e) => setDefaultLanguage(e.target.value)}>
              <option value="en">English (Default)</option>
              <option value="ta">Tamil (தமிழ்)</option>
            </select>
          </div>

          <div>
            <label className="form-label" style={{ fontWeight: 700, fontSize: 14 }}>Announcement Broadcast Language</label>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-text-light)' }}>
              Preferred language for digital notice board and push alerts.
            </p>
            <select className="input" value={announcementLang} onChange={(e) => setAnnouncementLang(e.target.value)}>
              <option value="both">Bilingual (English + Tamil)</option>
              <option value="en">English Only</option>
              <option value="ta">Tamil (தமிழ்) Only</option>
            </select>
          </div>

          <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }}>
            <strong>Supported Language Packs:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
              <li><strong>English (EN)</strong>: Complete administrative and student dashboard interface.</li>
              <li><strong>Tamil (தமிழ் - TA)</strong>: Native Tamil translations for lessons, Thirukkural, quizzes, and alerts.</li>
            </ul>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Save size={16} />
              <span>{saving ? 'Saving...' : 'Save Language Preferences'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminLanguagePage;
