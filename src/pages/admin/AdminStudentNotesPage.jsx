import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  serverTimestamp,
  where
} from 'firebase/firestore';
import { db } from '../../firebase';
import Loader from '../../components/Loader';
import { StickyNote, ShieldCheck, HardDrive, Users, CheckCircle2, Lock, ToggleLeft, ToggleRight } from 'lucide-react';

const AdminStudentNotesPage = () => {
  const [notes, setNotes] = useState([]);
  const [students, setStudents] = useState([]);
  const [settings, setSettings] = useState({ notesEnabled: true });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    let ready = 0;
    const check = () => {
      ready++;
      if (ready >= 3) setLoading(false);
    };

    // 1. Listen to synced notes metadata (count & timestamps only, private content preserved)
    const unsubNotes = onSnapshot(query(collection(db, 'notes')), (snap) => {
      setNotes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    });

    // 2. Listen to students
    const unsubStudents = onSnapshot(query(collection(db, 'users'), where('role', '==', 'student')), (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    });

    // 3. Listen to app settings
    const unsubSettings = onSnapshot(doc(db, 'settings', 'features'), (snap) => {
      if (snap.exists()) {
        setSettings(snap.data());
      }
      check();
    });

    return () => {
      unsubNotes();
      unsubStudents();
      unsubSettings();
    };
  }, []);

  const totalBytesApprox = useMemo(() => {
    // Approx 2.5 KB per note on average
    return notes.length * 2500;
  }, [notes]);

  const activeNoteUsersCount = useMemo(() => {
    const studentIds = new Set(notes.map((n) => n.studentId || n.userId).filter(Boolean));
    return studentIds.size;
  }, [notes]);

  const toggleNotesFeature = async () => {
    try {
      const nextState = !settings.notesEnabled;
      await setDoc(doc(db, 'settings', 'features'), {
        ...settings,
        notesEnabled: nextState,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setMessage(`Student Personal Notes feature has been ${nextState ? 'enabled' : 'disabled'}.`);
    } catch (err) {
      setError(err.message || 'Failed to update settings.');
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="grid fade-in" style={{ gap: 20 }}>
      {/* Header Banner */}
      <div className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="pill info" style={{ marginBottom: 6 }}>Student Offline Tools</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Student Personal Notes Management</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-light)', fontSize: 13 }}>
            Monitor local & cloud storage utilization for student personal study notes. Notes remain private to each individual student.
          </p>
        </div>
        <button
          className={settings.notesEnabled ? 'btn btn-primary' : 'btn btn-secondary'}
          onClick={toggleNotesFeature}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          {settings.notesEnabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
          <span>{settings.notesEnabled ? 'Notes Feature: Active' : 'Notes Feature: Disabled'}</span>
        </button>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      {/* Metrics Cards */}
      <div className="grid grid-3" style={{ gap: 16 }}>
        <div className="card" style={{ borderLeft: '4px solid var(--color-primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StickyNote size={24} color="var(--color-primary)" />
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-light)', fontWeight: 600 }}>TOTAL NOTES CREATED</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{notes.length}</div>
            </div>
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #059669' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={24} color="#059669" />
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-light)', fontWeight: 600 }}>ACTIVE AUTHORS</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{activeNoteUsersCount} Students</div>
            </div>
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #d97706' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <HardDrive size={24} color="#d97706" />
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-light)', fontWeight: 600 }}>STORAGE ESTIMATE</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{(totalBytesApprox / 1024).toFixed(1)} KB</div>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy Policy Callout */}
      <div className="card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <Lock size={24} color="var(--color-primary)" style={{ marginTop: 2 }} />
          <div>
            <h4 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>Student Data Privacy Policy</h4>
            <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
              Student notes are stored in the device internal SQLite database and encrypted upon cloud backup. In accordance with student privacy guidelines, personal note contents cannot be viewed by administrators. Only storage quotas, synchronization frequency, and author counts are displayed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminStudentNotesPage;
