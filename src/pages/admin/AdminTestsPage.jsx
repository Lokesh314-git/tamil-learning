import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  where
} from 'firebase/firestore';
import { db } from '../../firebase';
import { YEARS } from '../../utils/departments';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';
import TestFormModal from '../../components/TestFormModal';
import TestViewModal from '../../components/TestViewModal';
import TestNotificationModal from '../../components/TestNotificationModal';
import TestAnalyticsModal from '../../components/TestAnalyticsModal';
import { dispatchTestNotification, NOTIFICATION_TYPES } from '../../utils/testNotificationService';
import {
  ClipboardList,
  Plus,
  Bell,
  BarChart3,
  Eye,
  Edit,
  Trash2,
  Clock,
  HelpCircle,
  Award,
  Layers,
  Search
} from 'lucide-react';

const TEST_TYPES = [
  { id: 'all', label: 'All Assessments' },
  { id: 'quiz', label: 'Quiz Tests' },
  { id: 'unit_test', label: 'Unit Tests' },
  { id: 'mock_test', label: 'Mock & Semester Exams' },
];

const AdminTestsPage = () => {
  const [tests, setTests] = useState([]);
  const [results, setResults] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedType, setSelectedType] = useState('all');
  const [selectedYear, setSelectedYear] = useState('All');
  const [selectedUnit, setSelectedUnit] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [testFormModal, setTestFormModal] = useState(null);
  const [viewTestModal, setViewTestModal] = useState(null);
  const [notifyTestModal, setNotifyTestModal] = useState(null);
  const [analyticsModal, setAnalyticsModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    let ready = 0;
    const check = () => {
      ready++;
      if (ready >= 4) setLoading(false);
    };

    // 1. Listen to tests
    const unsubTests = onSnapshot(query(collection(db, 'tests')), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
      setTests(list);
      check();
    });

    // 2. Listen to results
    const unsubResults = onSnapshot(query(collection(db, 'results')), (snap) => {
      setResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    });

    // 3. Listen to departments
    const unsubDepts = onSnapshot(query(collection(db, 'departments')), (snap) => {
      setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    });

    // 4. Listen to students
    const unsubStudents = onSnapshot(query(collection(db, 'users'), where('role', '==', 'student')), (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    });

    return () => {
      unsubTests();
      unsubResults();
      unsubDepts();
      unsubStudents();
    };
  }, []);

  const filteredTests = useMemo(() => {
    return tests.filter((t) => {
      const typeMatch = selectedType === 'all' || (t.testType || 'quiz') === selectedType;
      const yearMatch = selectedYear === 'All' || t.year === selectedYear;
      const unitMatch = selectedUnit === 'All' || String(t.unitNumber) === selectedUnit;
      const searchMatch = !searchQuery.trim() ||
        (t.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.subject || '').toLowerCase().includes(searchQuery.toLowerCase());

      return typeMatch && yearMatch && unitMatch && searchMatch;
    });
  }, [tests, selectedType, selectedYear, selectedUnit, searchQuery]);

  const attemptsByTestId = useMemo(() => {
    const map = {};
    results.forEach((r) => {
      const key = r.testId || r.testTitle;
      if (key) map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [results]);

  const handleSaveTest = async (data) => {
    try {
      const selectedDept = departments.find((d) => d.id === data.departmentId);
      const departmentName = data.departmentId === 'all' ? 'All Classes' : (selectedDept?.name || 'General');

      let savedId = testFormModal?.id;

      if (testFormModal?.id) {
        await updateDoc(doc(db, 'tests', testFormModal.id), {
          ...data,
          departmentName,
          updatedAt: serverTimestamp(),
        });
        setMessage('Assessment updated successfully.');
      } else {
        const ref = await addDoc(collection(db, 'tests'), {
          ...data,
          departmentName,
          testType: data.testType || 'quiz',
          passMark: Number(data.passMark) || 40,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        savedId = ref.id;
        setMessage('New Assessment created successfully.');
      }

      if (data.notifyStudents) {
        try {
          await dispatchTestNotification({
            type: testFormModal?.id ? NOTIFICATION_TYPES.TEST_UPDATED : NOTIFICATION_TYPES.NEW_TEST,
            testId: savedId,
            testTitle: data.title,
            subject: data.subject || departmentName,
            testDate: data.testDate,
            testTime: data.testTime,
            duration: data.duration,
            description: data.description,
            targetType: data.targetType || 'all',
            targetYear: data.year || 'all',
            targetDepartmentId: data.departmentId || 'all',
            targetDepartmentName: departmentName,
            targetSection: data.targetSection || 'all',
          });
        } catch (notifErr) {
          console.warn('Failed to dispatch auto test notification:', notifErr);
        }
      }

      setTestFormModal(null);
    } catch (err) {
      setError(err.message || 'Failed to save test.');
    }
  };

  const handleDeleteTest = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, 'tests', deleteTarget.id));
      setMessage('Assessment deleted successfully.');
    } catch (err) {
      setError(err.message || 'Failed to delete test.');
    } finally {
      setDeleteTarget(null);
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="grid fade-in" style={{ gap: 20 }}>
      {/* Header Banner */}
      <div className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="pill info" style={{ marginBottom: 6 }}>Evaluations & Assessments</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Online Test Management</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-light)', fontSize: 13 }}>
            Create Quizzes, Unit Tests, and Mock Exams with 5 question formats, automated grading, score analytics, and push notifications.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setTestFormModal({})} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} />
          <span>Create Test</span>
        </button>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      {/* Test Type Filter Tabs */}
      <div className="tab-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {TEST_TYPES.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${selectedType === t.id ? 'active' : ''}`}
            onClick={() => setSelectedType(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="card" style={{ padding: '14px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            className="input"
            style={{ paddingLeft: 36 }}
            placeholder="Search test by title or subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className="input"
          style={{ width: 'auto', minWidth: 130 }}
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
        >
          <option value="All">All Years</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <select
          className="input"
          style={{ width: 'auto', minWidth: 120 }}
          value={selectedUnit}
          onChange={(e) => setSelectedUnit(e.target.value)}
        >
          <option value="All">All Units</option>
          <option value="1">Unit 1</option>
          <option value="2">Unit 2</option>
          <option value="3">Unit 3</option>
          <option value="4">Unit 4</option>
          <option value="5">Unit 5</option>
        </select>
      </div>

      {/* Tests Grid */}
      <div className="grid grid-3" style={{ gap: 16 }}>
        {filteredTests.map((t) => {
          const count = attemptsByTestId[t.id] || attemptsByTestId[t.title] || 0;
          const qCount = t.questions?.length || 0;

          return (
            <div
              key={t.id}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderTop: '4px solid var(--color-primary)',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="pill info" style={{ fontSize: 11 }}>Unit {t.unitNumber || 1} • {t.year || 'All Years'}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className="btn-icon"
                      onClick={() => setTestFormModal({ ...t })}
                      title="Edit Test"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-light)' }}
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => setDeleteTarget(t)}
                      title="Delete Test"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <h3 style={{ margin: '10px 0 4px', fontSize: 17, fontWeight: 700 }}>{t.title}</h3>
                <div style={{ fontSize: 12, color: 'var(--color-primary)', fontWeight: 600, marginBottom: 8 }}>
                  {t.subject || t.departmentName || 'Tamil'}
                </div>

                <div className="grid grid-2" style={{ gap: 8, background: '#f8fafc', padding: '8px 10px', borderRadius: 8, marginBottom: 10, fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748b' }}>
                    <HelpCircle size={14} />
                    <span>{qCount} Questions</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748b' }}>
                    <Clock size={14} />
                    <span>{t.duration || 30} mins</span>
                  </div>
                </div>

                {t.description && (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-light)', lineHeight: 1.4 }}>
                    {t.description}
                  </p>
                )}
              </div>

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => setAnalyticsModal(t)}
                >
                  <BarChart3 size={13} />
                  <span>Rank & Stats ({count})</span>
                </button>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                    onClick={() => setNotifyTestModal({ ...t, year: t.year || 'all' })}
                    title="Send Push Notification to Students"
                  >
                    <Bell size={13} color="var(--color-primary)" />
                    <span>Alert</span>
                  </button>

                  <button
                    className="btn btn-primary"
                    style={{ padding: '5px 10px', fontSize: 12 }}
                    onClick={() => setViewTestModal(t)}
                  >
                    View
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredTests.length === 0 && (
        <EmptyState message="No tests found matching criteria. Click 'Create Test' to add a new assessment." />
      )}

      {/* Test Creation & Edit Modal */}
      <TestFormModal
        open={Boolean(testFormModal)}
        initial={testFormModal && testFormModal.id ? testFormModal : null}
        year={selectedYear !== 'All' ? selectedYear : '1st Year'}
        departments={departments}
        selectedDepartmentId="all"
        onClose={() => setTestFormModal(null)}
        onSave={handleSaveTest}
      />

      {/* View Test Questions Modal */}
      <TestViewModal
        open={Boolean(viewTestModal)}
        test={viewTestModal}
        onClose={() => setViewTestModal(null)}
      />

      {/* Push Alert Dispatch Modal */}
      <TestNotificationModal
        open={Boolean(notifyTestModal)}
        test={notifyTestModal}
        departments={departments}
        currentYear={notifyTestModal?.year || '1st Year'}
        onClose={() => setNotifyTestModal(null)}
      />

      {/* Analytics & Rank List Modal */}
      <TestAnalyticsModal
        open={Boolean(analyticsModal)}
        test={analyticsModal}
        results={results}
        students={students}
        onClose={() => setAnalyticsModal(null)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteTest}
        text={`Are you sure you want to delete test "${deleteTarget?.title}"?`}
      />
    </div>
  );
};

export default AdminTestsPage;
