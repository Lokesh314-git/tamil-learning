import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, onSnapshot, query, where } from '../../services/studentMongoApi';
import { studentMongoApi } from '../../services/studentMongoApi';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { openOrDownloadFile } from '../../utils/fileUpload';
import StudentPageHeader from '../../components/studentui/StudentPageHeader';
import StudentContentCard from '../../components/studentui/StudentContentCard';
import EmptyState from '../../components/EmptyState';
import Loader from '../../components/Loader';
import Button from '../../components/ui/Button';
import PdfViewerModal from '../../components/PdfViewerModal';
import {
  BookOpen,
  Search,
  Filter,
  Download,
  Eye,
  Bookmark,
  BookmarkCheck,
  FileText,
  Calendar,
  Layers,
  Sparkles,
  Clock,
  FolderOpen
} from 'lucide-react';

const CATEGORIES = [
  { id: 'all', label: 'All Resources' },
  { id: 'notes', label: 'PDF Notes' },
  { id: 'question_bank', label: 'Question Banks' },
  { id: 'prev_question', label: 'Previous Question Papers' },
  { id: 'assignment', label: 'Assignments' },
  { id: 'reference', label: 'Reference Materials' },
  { id: 'lecture', label: 'Lecture Materials' }
];

const StudentStudyMaterials = () => {
  const { year } = useParams();
  const { profile, user } = useAuth();

  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedUnit, setSelectedUnit] = useState('all');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [viewingMaterial, setViewingMaterial] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  useEffect(() => {
    let active = true;
    studentMongoApi.getPreferences().then((preferences) => {
      if (active) setBookmarks(Array.isArray(preferences.bookmarkedMaterialIds) ? preferences.bookmarkedMaterialIds : []);
    }).catch((error) => console.warn('Could not load material bookmarks:', error));
    return () => { active = false; };
  }, [user?.uid]);

  useEffect(() => {
    if (!year || !profile?.departmentId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, 'study_materials'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0);
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0);
        return timeB - timeA;
      });
      setMaterials(list);
      setLoading(false);
    }, (err) => {
      console.warn('Study materials listener err:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [year, profile?.departmentId]);

  // Unique subjects for filter dropdown
  const availableSubjects = useMemo(() => {
    const subs = new Set();
    materials.forEach((m) => {
      if (m.subject) subs.add(m.subject.trim());
    });
    return Array.from(subs);
  }, [materials]);

  // Filtered materials
  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      // Year match
      const yearMatch = !m.year || m.year === 'All' || m.year === year;

      // Department match
      const deptMatch = !m.departmentId || m.departmentId === 'all' || m.departmentId === profile?.departmentId;

      // Category match
      const catMatch = selectedCategory === 'all' || (m.category || 'notes') === selectedCategory;

      // Unit match
      const unitVal = m.unitNumber ? `unit${m.unitNumber}` : (m.unit || '');
      const unitMatch = selectedUnit === 'all' || unitVal.toLowerCase() === selectedUnit.toLowerCase();

      // Subject match
      const subMatch = selectedSubject === 'all' || m.subject === selectedSubject;

      // Search query match
      const queryMatch = !searchQuery.trim() ||
        (m.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.subject || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.fileName || '').toLowerCase().includes(searchQuery.toLowerCase());

      // Bookmark filter
      const bookmarkMatch = !showBookmarksOnly || bookmarks.includes(m.id);

      return yearMatch && deptMatch && catMatch && unitMatch && subMatch && queryMatch && bookmarkMatch;
    });
  }, [materials, year, profile?.departmentId, selectedCategory, selectedUnit, selectedSubject, searchQuery, showBookmarksOnly, bookmarks]);

  const toggleBookmark = (id) => {
    setBookmarks((prev) => {
      const next = prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id];
      studentMongoApi.updatePreferences({ bookmarkedMaterialIds: next }).catch((err) => console.warn('Failed to save bookmark:', err));
      return next;
    });
  };

  const handleOpenMaterial = (m) => {
    setViewingMaterial(m);
  };

  return (
    <div className="student-page grid" style={{ gap: 16 }}>
      <StudentPageHeader
        title="Study Materials Hub"
        subtitle={`${year} / ${profile?.departmentName || 'Department'} • Academic Resources`}
      />

      {/* Filter and Search Bar */}
      <StudentContentCard>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 10, flex: '1 1 300px', position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              className="input"
              placeholder="Search by topic, subject, keyword, or document name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 38, width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Subject filter */}
            <select
              className="input"
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              style={{ minWidth: 150 }}
            >
              <option value="all">All Subjects</option>
              {availableSubjects.map((sub) => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>

            {/* Unit filter */}
            <select
              className="input"
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              style={{ minWidth: 130 }}
            >
              <option value="all">All Units</option>
              <option value="unit1">Unit 1</option>
              <option value="unit2">Unit 2</option>
              <option value="unit3">Unit 3</option>
              <option value="unit4">Unit 4</option>
              <option value="unit5">Unit 5</option>
            </select>

            {/* Bookmark button */}
            <button
              className={`button ${showBookmarksOnly ? 'primary' : 'secondary'}`}
              onClick={() => setShowBookmarksOnly(!showBookmarksOnly)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {showBookmarksOnly ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
              <span>{showBookmarksOnly ? 'Bookmarked' : 'Bookmarks'}</span>
            </button>
          </div>
        </div>

        {/* Category Pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
          {CATEGORIES.map((cat) => (
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
      </StudentContentCard>

      {/* Materials List */}
      {loading ? (
        <Loader />
      ) : filteredMaterials.length > 0 ? (
        <div className="grid grid-2" style={{ gap: 16 }}>
          {filteredMaterials.map((m) => {
            const isBookmarked = bookmarks.includes(m.id);
            const unitText = m.unitNumber ? `Unit ${m.unitNumber}` : (m.unit ? m.unit.toUpperCase() : 'General');
            const catObj = CATEGORIES.find((c) => c.id === m.category) || { label: m.category || 'Notes' };

            return (
              <StudentContentCard key={m.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span className="badge badge-primary" style={{ fontSize: 11, fontWeight: 600 }}>
                        {unitText}
                      </span>
                      <span className="badge badge-secondary" style={{ fontSize: 11 }}>
                        {catObj.label}
                      </span>
                      {m.subject && (
                        <span className="badge" style={{ fontSize: 11, background: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-primary)' }}>
                          {m.subject}
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => toggleBookmark(m.id)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: isBookmarked ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
                      title={isBookmarked ? 'Remove Bookmark' : 'Bookmark this material'}
                    >
                      {isBookmarked ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
                    </button>
                  </div>

                  <h3 style={{ margin: '10px 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
                    {m.title}
                  </h3>

                  {m.description && (
                    <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
                      {m.description}
                    </p>
                  )}

                  <div style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'var(--color-bg-secondary, #f8fafc)',
                    border: '1px solid var(--color-border)',
                    fontSize: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--color-text)' }}>
                      <FileText size={14} color="var(--color-primary)" />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.fileName || `${m.title}.pdf`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-muted)', fontSize: 11, flexWrap: 'wrap', gap: 4 }}>
                      <span>Size: {m.fileSize ? `${Math.round(Number(m.fileSize) / 1024)} KB` : 'Direct Blob'}</span>
                      {m.uploadedAt && <span>Date: {new Date(m.uploadedAt).toLocaleDateString()}</span>}
                      <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Stored in MongoDB</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 12, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                  <Button
                    onClick={() => handleOpenMaterial(m)}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <Eye size={16} /> Open PDF
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleOpenMaterial(m)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    title="Download PDF directly from MongoDB"
                  >
                    <Download size={16} /> Download
                  </Button>
                </div>
              </StudentContentCard>
            );
          })}
        </div>
      ) : (
        <EmptyState
          message={showBookmarksOnly ? "You haven't bookmarked any study materials yet." : "No study materials match your selected filters."}
          icon={<BookOpen size={36} />}
        />
      )}

      {/* In-App PDF Viewer Modal */}
      <PdfViewerModal
        isOpen={!!viewingMaterial}
        onClose={() => setViewingMaterial(null)}
        material={viewingMaterial}
      />
    </div>
  );
};

export default StudentStudyMaterials;
