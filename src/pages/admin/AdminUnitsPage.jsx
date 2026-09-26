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
import UnitFormModal from '../../components/UnitFormModal';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';
import { mongoService } from '../../services/mongoService';
import { openOrDownloadFile } from '../../utils/fileUpload';
import { Layers, Plus, BookOpen, FileText, CheckCircle2, Video, HelpCircle, Eye, Trash2, Edit } from 'lucide-react';

const UNIT_NUMBERS = [1, 2, 3, 4, 5];

const AdminUnitsPage = () => {
  const [units, setUnits] = useState([]);
  const [tests, setTests] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [studyMaterials, setStudyMaterials] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(YEARS[0]);
  const [selectedDeptId, setSelectedDeptId] = useState('all');
  const [unitModal, setUnitModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    let ready = 0;
    const check = () => {
      ready++;
      if (ready >= 5) setLoading(false);
    };

    // 1. Listen to units
    const unsubUnits = onSnapshot(query(collection(db, 'units')), (snap) => {
      setUnits(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    });

    // 2. Listen to tests
    const unsubTests = onSnapshot(query(collection(db, 'tests')), (snap) => {
      setTests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    });

    // 3. Listen to tasks
    const unsubTasks = onSnapshot(query(collection(db, 'tasks')), (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    });

    // 4. Listen to study materials
    const unsubMaterials = onSnapshot(query(collection(db, 'study_materials')), (snap) => {
      setStudyMaterials(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    });

    // 5. Listen to departments
    const unsubDepts = onSnapshot(query(collection(db, 'departments')), (snap) => {
      setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    });

    return () => {
      unsubUnits();
      unsubTests();
      unsubTasks();
      unsubMaterials();
      unsubDepts();
    };
  }, []);

  const filteredDepartments = useMemo(() => {
    return departments.filter((d) => d.year === selectedYear);
  }, [departments, selectedYear]);

  const unitsForYear = useMemo(() => {
    return units.filter((u) => {
      const yearMatch = u.year === selectedYear;
      const deptMatch = selectedDeptId === 'all' || !u.departmentId || u.departmentId === 'all' || u.departmentId === selectedDeptId;
      return yearMatch && deptMatch;
    });
  }, [units, selectedYear, selectedDeptId]);

  const handleSaveUnit = async (data) => {
    const unitNum = Number(data.unitNumber);
    const existing = unitsForYear.find((u) => Number(u.unitNumber) === unitNum);

    const targetDeptId = data.departmentId || selectedDeptId;
    const targetDeptName = targetDeptId === 'all'
      ? 'All Departments'
      : (departments.find((d) => d.id === targetDeptId)?.name || 'General');

    const unitPayload = {
      unitNumber: unitNum,
      title: data.title || '',
      fileId: data.fileId || data.gridFsFileId || '',
      gridFsFileId: data.gridFsFileId || data.fileId || '',
      pdfLink: data.fileId || data.pdfLink || '',
      fileName: data.fileName || '',
      fileSize: Number(data.fileSize) || 0,
      departmentId: targetDeptId || 'all',
      departmentName: targetDeptName || 'General',
      year: selectedYear || '1st Year',
      storageProvider: 'MongoDB GridFS',
    };

    const cleanUnitPayload = Object.fromEntries(
      Object.entries(unitPayload).filter(([_, v]) => v !== undefined)
    );

    if (existing?.id || unitModal?.id) {
      const idToUpdate = unitModal?.id || existing?.id;
      await updateDoc(doc(db, 'units', idToUpdate), {
        ...cleanUnitPayload,
        updatedAt: serverTimestamp(),
      });
      await mongoService.mirrorDocumentToMongo('units', idToUpdate, cleanUnitPayload);
      if (data.pdfLink) {
        await mongoService.storeUploadedDocumentInMongo({
          fileId: `unit_${idToUpdate}`,
          title: `Unit ${unitNum}: ${data.title}`,
          fileName: data.fileName || `Unit_${unitNum}_Material.pdf`,
          downloadUrl: data.pdfLink,
          category: 'curriculum_unit_pdf',
          unitNumber: unitNum,
          year: selectedYear,
          departmentId: targetDeptId,
          departmentName: targetDeptName,
          description: `Official Curriculum syllabus and unit study notes for Unit ${unitNum}.`,
        });
      }
      setMessage(`Unit ${unitNum} updated and stored in MongoDB successfully.`);
    } else {
      const docRef = await addDoc(collection(db, 'units'), {
        ...cleanUnitPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await mongoService.mirrorDocumentToMongo('units', docRef.id, cleanUnitPayload);
      if (data.pdfLink) {
        await mongoService.storeUploadedDocumentInMongo({
          fileId: `unit_${docRef.id}`,
          title: `Unit ${unitNum}: ${data.title}`,
          fileName: data.fileName || `Unit_${unitNum}_Material.pdf`,
          downloadUrl: data.pdfLink,
          category: 'curriculum_unit_pdf',
          unitNumber: unitNum,
          year: selectedYear,
          departmentId: targetDeptId,
          departmentName: targetDeptName,
          description: `Official Curriculum syllabus and unit study notes for Unit ${unitNum}.`,
        });
      }
      setMessage(`Unit ${unitNum} created and stored in MongoDB successfully.`);
    }
    setUnitModal(null);
  };

  const handleDeleteUnit = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, 'units', deleteTarget.id));
      setMessage('Unit removed successfully.');
    } catch (err) {
      setError(err.message || 'Failed to remove unit.');
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
          <div className="pill info" style={{ marginBottom: 6 }}>Curriculum Architecture</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Unit Management (1 to 5)</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-light)', fontSize: 13 }}>
            Manage the 5 core curriculum units for each academic year. Each unit houses notes, PDFs, videos, assignments, and test assessments.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setUnitModal({ unitNumber: 1, title: '' })}>
          <Plus size={16} />
          <span>Add / Configure Unit</span>
        </button>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      {/* Filter Controls */}
      <div className="card" style={{ padding: '14px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {YEARS.map((y) => (
            <button
              key={y}
              className={`chip ${selectedYear === y ? 'active' : ''}`}
              onClick={() => setSelectedYear(y)}
            >
              {y}
            </button>
          ))}
        </div>

        <select
          className="input"
          style={{ width: 'auto', minWidth: 180, marginLeft: 'auto' }}
          value={selectedDeptId}
          onChange={(e) => setSelectedDeptId(e.target.value)}
        >
          <option value="all">All Departments / Classes</option>
          {filteredDepartments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {/* 5 Units Grid */}
      <div className="grid" style={{ gap: 16 }}>
        {UNIT_NUMBERS.map((unitNum) => {
          const u = unitsForYear.find((x) => Number(x.unitNumber) === unitNum);
          const unitTests = tests.filter((t) => t.year === selectedYear && Number(t.unitNumber) === unitNum);
          const unitMaterials = studyMaterials.filter((m) => m.year === selectedYear && (Number(m.unit) === unitNum || Number(m.unitNumber) === unitNum));
          const unitTasks = tasks.filter((t) => t.year === selectedYear && t.title?.toLowerCase().includes(`unit ${unitNum}`));

          return (
            <div
              key={unitNum}
              className="card"
              style={{
                borderLeft: `5px solid ${u ? 'var(--color-primary)' : '#cbd5e1'}`,
                display: 'flex',
                justifyContent: 'space-between',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="pill info" style={{ fontWeight: 800 }}>Unit {unitNum}</span>
                    <span style={{ fontSize: 13, color: 'var(--color-text-light)' }}>{selectedYear}</span>
                  </div>
                  <h3 style={{ margin: '8px 0 4px', fontSize: 18, fontWeight: 800 }}>
                    {u ? u.title : `Unit ${unitNum} - Not Configured`}
                  </h3>
                  {u?.fileName && (
                    <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <FileText size={13} />
                      <span>Material: {u.fileName}</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => setUnitModal(u || { unitNumber: unitNum, title: '' })}
                    style={{ fontSize: 12, padding: '6px 14px' }}
                  >
                    {u ? 'Edit Unit' : 'Configure Unit'}
                  </button>
                  {u?.pdfLink && (
                    <button
                      type="button"
                      onClick={() => openOrDownloadFile(u.pdfLink, u.fileName || `Unit_${unitNum}_Syllabus.pdf`, u.fileId || u.id)}
                      className="btn btn-secondary"
                      style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Eye size={14} />
                      <span>View PDF</span>
                    </button>
                  )}
                  {u && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => setDeleteTarget(u)}
                      style={{ fontSize: 12, padding: '6px 10px', color: '#ef4444' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Unit Contents Matrix */}
              <div className="grid grid-3" style={{ gap: 10, background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BookOpen size={16} color="var(--color-primary)" />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-light)', fontWeight: 600 }}>STUDY MATERIALS</div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{unitMaterials.length + (u?.pdfLink ? 1 : 0)} Documents</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <HelpCircle size={16} color="#059669" />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-light)', fontWeight: 600 }}>TESTS & QUIZZES</div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{unitTests.length} Assessments</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={16} color="#d97706" />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-light)', fontWeight: 600 }}>ASSIGNMENTS</div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{unitTasks.length} Active Tasks</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Unit Form Modal */}
      <UnitFormModal
        open={Boolean(unitModal)}
        initial={unitModal}
        year={selectedYear}
        departments={filteredDepartments}
        selectedDepartmentId={selectedDeptId}
        onClose={() => setUnitModal(null)}
        onSave={handleSaveUnit}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteUnit}
        text={`Are you sure you want to remove Unit ${deleteTarget?.unitNumber}?`}
      />
    </div>
  );
};

export default AdminUnitsPage;
