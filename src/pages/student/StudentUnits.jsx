import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  FileText,
  Video,
  ListTodo,
  ClipboardList,
  CheckCircle2,
  Download,
  Eye,
  Play,
  Layers,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Award,
  Check
} from 'lucide-react';

const UNIT_TABS = [
  { id: 1, label: 'Unit 1', title: 'Unit 1: சங்க இலக்கியம் / Fundamentals' },
  { id: 2, label: 'Unit 2', title: 'Unit 2: நீதி இலக்கியம் / Grammar & Ethics' },
  { id: 3, label: 'Unit 3', title: 'Unit 3: காப்பிய இலக்கியம் / Epics' },
  { id: 4, label: 'Unit 4', title: 'Unit 4: பக்தி & சிற்றிலக்கியம் / Devotional' },
  { id: 5, label: 'Unit 5', title: 'Unit 5: நவீன இலக்கியம் / Modern Tamil' }
];

const StudentUnits = () => {
  const { year } = useParams();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const base = `/student/year/${encodeURIComponent(year || profile?.year || '1st Year')}`;

  const [activeUnit, setActiveUnit] = useState(1);
  const [activeSubTab, setActiveSubTab] = useState('notes'); // 'notes' | 'videos' | 'tasks' | 'tests'
  const [viewingDoc, setViewingDoc] = useState(null);
  const [units, setUnits] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [tests, setTests] = useState([]);
  const [results, setResults] = useState([]);
  const [taskSubmissions, setTaskSubmissions] = useState({});
  const [completedUnits, setCompletedUnits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    studentMongoApi.getPreferences().then((preferences) => {
      if (active) setCompletedUnits(Array.isArray(preferences.completedUnits) ? preferences.completedUnits : []);
    }).catch((error) => console.warn('Could not load unit progress:', error));
    return () => { active = false; };
  }, [user?.uid]);

  useEffect(() => {
    if (!year || !profile?.departmentId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let ready = 0;
    const check = () => {
      ready++;
      if (ready >= 5) setLoading(false);
    };

    const studentYear = year || profile?.year || '1st Year';

    // 1. Units
    const qUnits = query(collection(db, 'units'), where('year', '==', year));
    const unsubUnits = onSnapshot(qUnits, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        if (!data.departmentId || data.departmentId === 'all' || data.departmentId === profile.departmentId) {
          list.push({ id: d.id, ...data });
        }
      });
      setUnits(list);
      check();
    }, () => check());

    // 2. Study Materials
    const qMaterials = query(collection(db, 'study_materials'));
    const unsubMaterials = onSnapshot(qMaterials, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        const yearOk = !data.year || data.year === 'All' || data.year === 'All Years' || data.year === year;
        const deptOk = !data.departmentId || data.departmentId === 'all' || data.departmentId === profile.departmentId;
        if (yearOk && deptOk) list.push({ id: d.id, ...data });
      });
      setMaterials(list);
      check();
    }, () => check());

    // 3. Tasks
    const qTasks = query(collection(db, 'tasks'), where('year', '==', year));
    const unsubTasks = onSnapshot(qTasks, (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data();
        if (!data.departmentId || data.departmentId === 'all' || data.departmentId === profile.departmentId) {
          list.push({ id: d.id, ...data });
        }
      });
      setTasks(list);
      check();
    }, () => check());

    // 4. Tests (filtered strictly by student's year)
    const unsubTests = onSnapshot(collection(db, 'tests'), (snap) => {
      const list = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        const testYear = data.year || 'All Years';
        const yearOk =
          testYear === 'All Years' ||
          testYear === 'All' ||
          testYear === 'all' ||
          testYear.toLowerCase() === studentYear.toLowerCase() ||
          (profile?.year && testYear.toLowerCase() === profile.year.toLowerCase());

        const deptOk =
          !data.departmentId ||
          data.departmentId === 'all' ||
          data.departmentId === profile.departmentId;

        if (yearOk && deptOk) {
          list.push({ id: d.id, ...data });
        }
      });
      setTests(list);
      check();
    }, () => check());

    // 5. Results
    const qResults = query(collection(db, 'results'), where('studentId', '==', user.uid));
    const unsubResults = onSnapshot(qResults, (snap) => {
      setResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    }, () => check());

    // 6. Submissions
    const qSubs = query(collection(db, 'task_submissions'), where('studentId', '==', user.uid));
    const unsubSubs = onSnapshot(qSubs, (snap) => {
      const byTaskId = {};
      snap.forEach((d) => {
        const data = d.data();
        if (data.taskId) byTaskId[data.taskId] = { id: d.id, ...data };
      });
      setTaskSubmissions(byTaskId);
    });

    return () => {
      unsubUnits();
      unsubMaterials();
      unsubTasks();
      unsubTests();
      unsubResults();
      unsubSubs();
    };
  }, [year, profile?.departmentId, profile?.year, user?.uid]);

  // Current Unit Data
  const currentUnitRecord = useMemo(() => {
    return units.find((u) => Number(u.unitNumber) === activeUnit || u.unit === `unit${activeUnit}`);
  }, [units, activeUnit]);

  // Materials for active unit
  const unitMaterials = useMemo(() => {
    return materials.filter((m) => {
      const uNum = m.unitNumber || (m.unit ? Number(m.unit.replace(/\D/g, '')) : 0);
      return uNum === activeUnit;
    });
  }, [materials, activeUnit]);

  // Tasks for active unit
  const unitTasks = useMemo(() => {
    return tasks.filter((t) => {
      const uNum = t.unitNumber || (t.unit ? Number(t.unit.replace(/\D/g, '')) : 0);
      return uNum === activeUnit || !t.unitNumber; // Include general tasks if none specified
    });
  }, [tasks, activeUnit]);

  // Tests for active unit
  const unitTests = useMemo(() => {
    return tests.filter((t) => {
      const uNum = t.unitNumber || (t.unit ? Number(t.unit.replace(/\D/g, '')) : 0);
      return uNum === activeUnit || !t.unitNumber;
    });
  }, [tests, activeUnit]);

  const toggleUnitCompletion = (unitNum) => {
    setCompletedUnits((prev) => {
      const next = prev.includes(unitNum) ? prev.filter((u) => u !== unitNum) : [...prev, unitNum];
      studentMongoApi.updatePreferences({ completedUnits: next }).catch((err) => console.warn('Failed to save unit progress:', err));
      return next;
    });
  };

  const isCurrentCompleted = completedUnits.includes(activeUnit);
  const activeTabMeta = UNIT_TABS.find((u) => u.id === activeUnit) || UNIT_TABS[0];

  return (
    <div className="student-page grid" style={{ gap: 16 }}>
      <StudentPageHeader
        title="Units (1 to 5) Curriculum"
        subtitle={`${year || profile?.year || 'Your Year'} / ${profile?.departmentName || 'Department'} • Structured Syllabus & Modules`}
      />

      {/* Unit Selection Tabs */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {UNIT_TABS.map((tab) => {
          const isSelected = activeUnit === tab.id;
          const isDone = completedUnits.includes(tab.id);
          return (
            <button
              key={tab.id}
              onClick={() => setActiveUnit(tab.id)}
              className={`button ${isSelected ? 'primary' : 'secondary'}`}
              style={{
                flex: '1 1 0',
                minWidth: 120,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderRadius: 12,
                border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                fontWeight: isSelected ? 700 : 500,
                transition: 'all 0.15s ease'
              }}
            >
              {isDone ? <CheckCircle2 size={16} color={isSelected ? '#fff' : 'var(--color-success)'} /> : <BookOpen size={16} />}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Unit Header Banner */}
      <StudentContentCard style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
        color: '#fff',
        borderRadius: 14,
        padding: '20px 24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.2)', color: '#fff', fontSize: 11, marginBottom: 6, display: 'inline-block' }}>
              Unit {activeUnit} of 5
            </span>
            <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: '#fff' }}>
              {currentUnitRecord?.title || activeTabMeta.title}
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255, 255, 255, 0.85)', maxWidth: 650, lineHeight: 1.5 }}>
              {currentUnitRecord?.description || `Explore detailed notes, lecture materials, assessments, and tasks designated for Unit ${activeUnit}.`}
            </p>
          </div>

          <button
            onClick={() => toggleUnitCompletion(activeUnit)}
            className="button"
            style={{
              background: isCurrentCompleted ? '#10b981' : 'rgba(255, 255, 255, 0.2)',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: 8,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            {isCurrentCompleted ? <CheckCircle2 size={16} /> : <Check size={16} />}
            <span>{isCurrentCompleted ? 'Unit Completed' : 'Mark as Completed'}</span>
          </button>
        </div>
      </StudentContentCard>

      {/* Sub-navigation Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
        <button
          className={`button ${activeSubTab === 'notes' ? 'primary' : 'secondary'}`}
          onClick={() => setActiveSubTab('notes')}
          style={{ fontSize: 13, padding: '8px 14px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <FileText size={15} /> Notes & PDFs ({unitMaterials.length + (currentUnitRecord?.fileId || currentUnitRecord?.fileName || currentUnitRecord?.fileUrl ? 1 : 0)})
        </button>
        <button
          className={`button ${activeSubTab === 'videos' ? 'primary' : 'secondary'}`}
          onClick={() => setActiveSubTab('videos')}
          style={{ fontSize: 13, padding: '8px 14px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Video size={15} /> Video Lectures
        </button>
        <button
          className={`button ${activeSubTab === 'tasks' ? 'primary' : 'secondary'}`}
          onClick={() => setActiveSubTab('tasks')}
          style={{ fontSize: 13, padding: '8px 14px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <ListTodo size={15} /> Assignments ({unitTasks.length})
        </button>
        <button
          className={`button ${activeSubTab === 'tests' ? 'primary' : 'secondary'}`}
          onClick={() => setActiveSubTab('tests')}
          style={{ fontSize: 13, padding: '8px 14px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <ClipboardList size={15} /> Tests ({unitTests.length})
        </button>
      </div>

      {/* Sub-tab 1: Notes & PDFs */}
      {activeSubTab === 'notes' && (
        <div className="grid grid-2" style={{ gap: 14 }}>
          {(currentUnitRecord?.fileId || currentUnitRecord?.fileName || currentUnitRecord?.fileUrl) && (
            <StudentContentCard style={{ borderLeft: '4px solid var(--color-primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span className="badge badge-primary">Primary Unit Syllabus</span>
              </div>
              <h3 style={{ margin: '8px 0 6px', fontSize: 16 }}>{currentUnitRecord.title || `Unit ${activeUnit} Official Notes`}</h3>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
                Comprehensive syllabus text and reference materials stored in MongoDB.
              </p>
              <Button onClick={() => setViewingDoc({ title: currentUnitRecord.title || `Unit ${activeUnit} Official Notes`, fileUrl: currentUnitRecord.fileUrl, fileName: currentUnitRecord.fileName || `Unit_${activeUnit}_Notes.pdf`, fileId: currentUnitRecord.fileId || currentUnitRecord.gridFsFileId || currentUnitRecord.id })}>
                <Eye size={15} style={{ marginRight: 6 }} /> Open Unit Notes
              </Button>
            </StudentContentCard>
          )}

          {unitMaterials.map((m) => (
            <StudentContentCard key={m.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span className="badge badge-secondary">{m.category || 'Study Material'}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{m.subject || 'Tamil'}</span>
              </div>
              <h3 style={{ margin: '8px 0 6px', fontSize: 16 }}>{m.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
                {m.description || m.fileName || 'Reference PDF document.'}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={() => setViewingDoc(m)}>
                  <Eye size={15} style={{ marginRight: 6 }} /> View PDF
                </Button>
                <Button variant="secondary" onClick={() => setViewingDoc(m)}>
                  <Download size={15} />
                </Button>
              </div>
            </StudentContentCard>
          ))}

          {!currentUnitRecord?.fileId && !currentUnitRecord?.fileName && !currentUnitRecord?.fileUrl && unitMaterials.length === 0 && (
            <div style={{ gridColumn: 'span 2' }}>
              <EmptyState message={`No PDF notes uploaded yet for Unit ${activeUnit}. Check back soon.`} icon={<FileText size={32} />} />
            </div>
          )}
        </div>
      )}

      {/* Sub-tab 2: Video Lectures */}
      {activeSubTab === 'videos' && (
        <div>
          {currentUnitRecord?.videoUrl ? (
            <StudentContentCard>
              <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>{currentUnitRecord.title} - Video Lecture</h3>
              <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: 8, background: '#000' }}>
                <iframe
                  src={currentUnitRecord.videoUrl.replace('watch?v=', 'embed/')}
                  title="Unit Video"
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </StudentContentCard>
          ) : (
            <EmptyState message={`No video lectures linked yet for Unit ${activeUnit}.`} icon={<Video size={32} />} />
          )}
        </div>
      )}

      {/* Sub-tab 3: Assignments */}
      {activeSubTab === 'tasks' && (
        <div className="grid grid-2" style={{ gap: 14 }}>
          {unitTasks.map((t) => {
            const isSubmitted = !!taskSubmissions[t.id];
            return (
              <StudentContentCard key={t.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="badge badge-secondary">{t.subject || 'Tamil'}</span>
                  <span className={`badge ${isSubmitted ? 'badge-primary' : 'badge-warning'}`}>
                    {isSubmitted ? 'Submitted' : 'Pending'}
                  </span>
                </div>
                <h3 style={{ margin: '8px 0 6px', fontSize: 16 }}>{t.title}</h3>
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>{t.description}</p>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
                  Due: <strong>{t.dueDate || 'No deadline'}</strong>
                </div>
                <Button onClick={() => navigate(`${base}/tasks`)}>
                  Go to Assignments <ArrowRight size={14} style={{ marginLeft: 4 }} />
                </Button>
              </StudentContentCard>
            );
          })}
          {unitTasks.length === 0 && (
            <div style={{ gridColumn: 'span 2' }}>
              <EmptyState message={`No assignments assigned for Unit ${activeUnit}.`} icon={<ListTodo size={32} />} />
            </div>
          )}
        </div>
      )}

      {/* Sub-tab 4: Tests */}
      {activeSubTab === 'tests' && (
        <div className="grid grid-2" style={{ gap: 14 }}>
          {unitTests.map((t) => {
            const attempt = results.find((r) => r.testId === t.id);
            return (
              <StudentContentCard key={t.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="badge badge-secondary">{t.testType || 'Online Assessment'}</span>
                  {attempt && <span className="badge badge-primary">Score: {attempt.score}/{attempt.total || 100}</span>}
                </div>
                <h3 style={{ margin: '8px 0 6px', fontSize: 16 }}>{t.title}</h3>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
                  Duration: {t.durationMinutes || 20} mins • Questions: {t.questions?.length || 10}
                </div>
                <Button onClick={() => navigate(`${base}/tests`)}>
                  {attempt ? 'Retake or Review Test' : 'Start Test Now'} <ArrowRight size={14} style={{ marginLeft: 4 }} />
                </Button>
              </StudentContentCard>
            );
          })}
          {unitTests.length === 0 && (
            <div style={{ gridColumn: 'span 2' }}>
              <EmptyState message={`No tests created for Unit ${activeUnit} yet.`} icon={<ClipboardList size={32} />} />
            </div>
          )}
        </div>
      )}

      {/* In-App PDF Viewer Modal */}
      <PdfViewerModal
        isOpen={!!viewingDoc}
        onClose={() => setViewingDoc(null)}
        material={viewingDoc}
      />
    </div>
  );
};

export default StudentUnits;
