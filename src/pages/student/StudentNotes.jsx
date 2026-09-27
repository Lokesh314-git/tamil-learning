import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where, serverTimestamp } from '../../services/studentMongoApi';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import StudentPageHeader from '../../components/studentui/StudentPageHeader';
import StudentContentCard from '../../components/studentui/StudentContentCard';
import EmptyState from '../../components/EmptyState';
import Loader from '../../components/Loader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import {
  StickyNote,
  Search,
  Plus,
  Trash2,
  Edit2,
  Pin,
  Tag,
  Clock,
  Sparkles,
  Save,
  X
} from 'lucide-react';

const COLORS = [
  { id: 'yellow', bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  { id: 'blue', bg: '#e0f2fe', border: '#0ea5e9', text: '#0369a1' },
  { id: 'green', bg: '#dcfce7', border: '#22c55e', text: '#15803d' },
  { id: 'purple', bg: '#f3e8ff', border: '#a855f7', text: '#7e22ce' },
  { id: 'rose', bg: '#ffe4e6', border: '#f43f5e', text: '#be123c' }
];

const StudentNotes = () => {
  const { year } = useParams();
  const { user, profile } = useAuth();

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('all');

  // Editor State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [subject, setSubject] = useState('General');
  const [selectedColor, setSelectedColor] = useState('yellow');
  const [editingId, setEditingId] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'notes'),
      where('studentId', '==', user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const timeA = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : 0;
        const timeB = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
      setNotes(list);
      setLoading(false);
    }, (err) => {
      console.warn('Student notes listener error:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user?.uid]);

  const uniqueSubjects = useMemo(() => {
    const s = new Set();
    notes.forEach((n) => {
      if (n.subject) s.add(n.subject.trim());
    });
    return Array.from(s);
  }, [notes]);

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      const subMatch = selectedSubject === 'all' || n.subject === selectedSubject;
      const queryMatch = !searchQuery.trim() ||
        (n.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (n.content || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (n.subject || '').toLowerCase().includes(searchQuery.toLowerCase());
      return subMatch && queryMatch;
    });
  }, [notes, selectedSubject, searchQuery]);

  const handleSaveNote = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      if (editingId) {
        await updateDoc(doc(db, 'notes', editingId), {
          title: title.trim(),
          content: content.trim(),
          subject: subject.trim() || 'General',
          color: selectedColor,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'notes'), {
          studentId: user.uid,
          studentName: profile?.name || 'Student',
          year: year || profile?.year || '1st Year',
          departmentId: profile?.departmentId || '',
          departmentName: profile?.departmentName || '',
          title: title.trim(),
          content: content.trim(),
          subject: subject.trim() || 'General',
          color: selectedColor,
          isPinned: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      resetForm();
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  };

  const handleEditNote = (n) => {
    setEditingId(n.id);
    setTitle(n.title || '');
    setContent(n.content || '');
    setSubject(n.subject || 'General');
    setSelectedColor(n.color || 'yellow');
    setIsFormOpen(true);
  };

  const handleTogglePin = async (n) => {
    try {
      await updateDoc(doc(db, 'notes', n.id), {
        isPinned: !n.isPinned,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  };

  const handleDeleteNote = async (id) => {
    if (window.confirm('Are you sure you want to delete this study note?')) {
      await deleteDoc(doc(db, 'notes', id));
    }
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setSubject('General');
    setSelectedColor('yellow');
    setEditingId(null);
    setIsFormOpen(false);
  };

  return (
    <div className="student-page grid" style={{ gap: 16 }}>
      <StudentPageHeader
        title="Personal Study Notes"
        subtitle={`${year} / Quick Memory Aids, Topic Summaries & Revisions`}
      />

      {/* Action Header */}
      <StudentContentCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flex: '1 1 300px', position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              className="input"
              placeholder="Search personal notes by keywords or topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 38, width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="input"
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              style={{ minWidth: 140 }}
            >
              <option value="all">All Subjects</option>
              {uniqueSubjects.map((sub) => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>

            <Button onClick={() => { resetForm(); setIsFormOpen(!isFormOpen); }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {isFormOpen ? <X size={16} /> : <Plus size={16} />}
              <span>{isFormOpen ? 'Close Editor' : 'Create New Note'}</span>
            </Button>
          </div>
        </div>
      </StudentContentCard>

      {/* Note Editor Drawer / Card */}
      {isFormOpen && (
        <StudentContentCard style={{ border: '2px solid var(--color-primary)' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 700 }}>
            {editingId ? 'Edit Study Note' : 'Create New Study Note'}
          </h3>

          <form onSubmit={handleSaveNote} className="grid" style={{ gap: 12 }}>
            <div className="grid grid-2" style={{ gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Note Title</label>
                <Input
                  placeholder="e.g., தொல்காப்பியம் - எழுத்து & சொல் விதிகள்"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Subject / Category</label>
                <Input
                  placeholder="e.g., Tamil Grammar, Poetry, Unit 2"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Color Tag</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedColor(c.id)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      background: c.bg,
                      border: selectedColor === c.id ? `3px solid ${c.border}` : '1px solid #cbd5e1',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Content / Notes</label>
              <textarea
                className="input"
                rows={6}
                placeholder="Write your study summary, definitions, or revision pointers..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <Button type="button" variant="secondary" onClick={resetForm}>Cancel</Button>
              <Button type="submit" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Save size={16} /> {editingId ? 'Update Note' : 'Save Note'}
              </Button>
            </div>
          </form>
        </StudentContentCard>
      )}

      {/* Notes Grid */}
      {loading ? (
        <Loader />
      ) : filteredNotes.length > 0 ? (
        <div className="grid grid-3" style={{ gap: 16 }}>
          {filteredNotes.map((n) => {
            const colorObj = COLORS.find((c) => c.id === n.color) || COLORS[0];
            const dateStr = n.updatedAt?.toDate ? n.updatedAt.toDate().toLocaleDateString() : 'Recent';

            return (
              <div
                key={n.id}
                style={{
                  background: colorObj.bg,
                  border: `1px solid ${colorObj.border}`,
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: 180,
                  position: 'relative',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: colorObj.text, textTransform: 'uppercase', background: 'rgba(255,255,255,0.6)', padding: '2px 8px', borderRadius: 4 }}>
                      {n.subject || 'General'}
                    </span>
                    <button
                      onClick={() => handleTogglePin(n)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: n.isPinned ? '#1e3a8a' : '#64748b' }}
                      title={n.isPinned ? 'Unpin note' : 'Pin note to top'}
                    >
                      <Pin size={16} style={{ fill: n.isPinned ? '#1e3a8a' : 'none' }} />
                    </button>
                  </div>

                  <h4 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                    {n.title}
                  </h4>

                  <p style={{ fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5, margin: 0 }}>
                    {n.content}
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    {dateStr}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => handleEditNote(n)}
                      style={{ background: 'rgba(255,255,255,0.7)', border: 'none', padding: 4, borderRadius: 4, cursor: 'pointer' }}
                      title="Edit Note"
                    >
                      <Edit2 size={14} color="#0f172a" />
                    </button>
                    <button
                      onClick={() => handleDeleteNote(n.id)}
                      style={{ background: 'rgba(255,255,255,0.7)', border: 'none', padding: 4, borderRadius: 4, cursor: 'pointer' }}
                      title="Delete Note"
                    >
                      <Trash2 size={14} color="#ef4444" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          message="No study notes yet. Click 'Create New Note' above to organize your thoughts."
          icon={<StickyNote size={36} />}
        />
      )}
    </div>
  );
};

export default StudentNotes;
