import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { openOrDownloadFile } from '../../utils/fileUpload';
import StudentPageHeader from '../../components/studentui/StudentPageHeader';
import StudentContentCard from '../../components/studentui/StudentContentCard';
import EmptyState from '../../components/EmptyState';
import Loader from '../../components/Loader';
import {
  Bell,
  Search,
  Calendar,
  AlertTriangle,
  Pin,
  FileText,
  Download,
  Eye,
  Megaphone,
  CheckCircle,
  Tag,
  Clock
} from 'lucide-react';

const NOTICE_CATEGORIES = [
  { id: 'all', label: 'All Notices' },
  { id: 'academic', label: 'Academic' },
  { id: 'examination', label: 'Examinations' },
  { id: 'events', label: 'Events' },
  { id: 'holidays', label: 'Holidays' },
  { id: 'circulars', label: 'Circulars' }
];

const StudentNotices = () => {
  const { year } = useParams();
  const { profile } = useAuth();

  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'announcements'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        // Pin priority first
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;

        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.postedAt ? new Date(a.postedAt).getTime() : 0);
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.postedAt ? new Date(b.postedAt).getTime() : 0);
        return timeB - timeA;
      });
      setNotices(list);
      setLoading(false);
    }, (err) => {
      console.warn('Notices listener err:', err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const filteredNotices = useMemo(() => {
    return notices.filter((n) => {
      // Year filter
      const yearMatch = !n.year || n.year === 'All' || n.year === year;

      // Department filter
      const deptMatch = !n.departmentId || n.departmentId === 'all' || n.departmentId === profile?.departmentId;

      // Category filter
      const catMatch = selectedCategory === 'all' || (n.category || 'general').toLowerCase() === selectedCategory.toLowerCase();

      // Search query
      const queryMatch = !searchQuery.trim() ||
        (n.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (n.content || n.message || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (n.category || '').toLowerCase().includes(searchQuery.toLowerCase());

      return yearMatch && deptMatch && catMatch && queryMatch;
    });
  }, [notices, year, profile?.departmentId, selectedCategory, searchQuery]);

  return (
    <div className="student-page grid" style={{ gap: 16 }}>
      <StudentPageHeader
        title="Notice Board"
        subtitle={`${year} / Official Circulars & Announcements`}
      />

      {/* Filter and Search Bar */}
      <StudentContentCard>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 10, flex: '1 1 300px', position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              className="input"
              placeholder="Search circulars and notices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 38, width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {NOTICE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`button ${selectedCategory === cat.id ? 'primary' : 'secondary'}`}
                style={{ fontSize: 13, padding: '6px 12px', borderRadius: 20 }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </StudentContentCard>

      {/* Notices List */}
      {loading ? (
        <Loader />
      ) : filteredNotices.length > 0 ? (
        <div className="grid" style={{ gap: 14 }}>
          {filteredNotices.map((n) => {
            const isUrgent = n.priority === 'urgent' || n.isUrgent;
            const dateStr = n.createdAt?.toDate ? n.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : (n.postedAt || 'Recent');

            return (
              <StudentContentCard
                key={n.id}
                style={{
                  borderLeft: isUrgent ? '4px solid var(--color-danger)' : (n.isPinned ? '4px solid var(--color-primary)' : '1px solid var(--color-border)'),
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {n.isPinned && (
                      <span className="badge badge-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Pin size={12} /> Pinned
                      </span>
                    )}
                    {isUrgent && (
                      <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                        <AlertTriangle size={12} /> Urgent Notice
                      </span>
                    )}
                    <span className="badge badge-secondary" style={{ textTransform: 'capitalize' }}>
                      {n.category || 'General'}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={13} /> {dateStr}
                    </span>
                  </div>

                  {n.departmentName && n.departmentName !== 'all' && (
                    <span className="badge" style={{ fontSize: 11, background: 'rgba(59, 130, 246, 0.08)', color: 'var(--color-primary)' }}>
                      {n.departmentName}
                    </span>
                  )}
                </div>

                <h3 style={{ margin: '12px 0 8px', fontSize: 17, fontWeight: 700, color: 'var(--color-text)' }}>
                  {n.title}
                </h3>

                <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-line', margin: '0 0 12px' }}>
                  {n.content || n.message || n.description}
                </p>

                {/* Attachment if present */}
                {(n.fileUrl || n.attachmentUrl || n.fileLink) && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-primary)', fontWeight: 500 }}>
                      <FileText size={16} />
                      <span>{n.fileName || 'Attached Circular / Document.pdf'}</span>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() => openOrDownloadFile(n.fileUrl || n.attachmentUrl || n.fileLink, n.fileName || `${n.title}.pdf`, n.fileId || n.id)}
                      style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <Eye size={13} /> View Attachment
                    </button>
                  </div>
                )}
              </StudentContentCard>
            );
          })}
        </div>
      ) : (
        <EmptyState
          message="No announcements or circulars found for your department."
          icon={<Megaphone size={36} />}
        />
      )}
    </div>
  );
};

export default StudentNotices;
