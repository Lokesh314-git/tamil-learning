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
import Button from '../../components/ui/Button';
import PdfViewerModal from '../../components/PdfViewerModal';
import {
  Download,
  FileText,
  Search,
  HardDrive,
  Clock,
  Layers,
  Eye,
  CheckCircle,
  FolderDown,
  Sparkles
} from 'lucide-react';

const StudentDownloads = () => {
  const { year } = useParams();
  const { profile } = useAuth();

  const [materials, setMaterials] = useState([]);
  const [units, setUnits] = useState([]);
  const [mongoDownloads, setMongoDownloads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingFile, setViewingFile] = useState(null);

  useEffect(() => {
    setLoading(true);
    let ready = 0;
    const check = () => {
      ready++;
      if (ready >= 3) setLoading(false);
    };

    const unsubMat = onSnapshot(query(collection(db, 'study_materials')), (snap) => {
      setMaterials(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    }, () => check());

    const unsubUnit = onSnapshot(query(collection(db, 'units')), (snap) => {
      setUnits(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    }, () => check());

    const unsubDown = onSnapshot(query(collection(db, 'downloads')), (snap) => {
      setMongoDownloads(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      check();
    }, () => check());

    return () => {
      unsubMat();
      unsubUnit();
      unsubDown();
    };
  }, []);

  // Consolidate all downloadable files
  const allFiles = useMemo(() => {
    const list = [];

    // 1. Study Materials
    materials.forEach((m) => {
      if (m.fileUrl || m.downloadUrl || m.fileLink) {
        list.push({
          id: m.id,
          title: m.title || 'Study Document',
          type: m.category || 'Study Material',
          subject: m.subject || 'Tamil',
          year: m.year || 'All Years',
          unit: m.unitNumber ? `Unit ${m.unitNumber}` : (m.unit || 'General'),
          fileName: m.fileName || `${m.title || 'document'}.pdf`,
          fileSize: m.fileSize || 512000,
          downloadUrl: m.downloadUrl || m.fileUrl || m.fileLink,
          fileId: m.fileId || m.id,
          departmentId: m.departmentId
        });
      }
    });

    // 2. Unit Documents
    units.forEach((u) => {
      if (u.fileUrl || u.downloadUrl || u.pdfUrl) {
        list.push({
          id: u.id,
          title: u.title || `Unit ${u.unitNumber || 1} Notes`,
          type: 'Unit Resource',
          subject: u.subject || 'Tamil Literature',
          year: u.year || 'All Years',
          unit: `Unit ${u.unitNumber || 1}`,
          fileName: u.fileName || `${u.title || 'unit-notes'}.pdf`,
          fileSize: u.fileSize || 768000,
          downloadUrl: u.downloadUrl || u.fileUrl || u.pdfUrl,
          fileId: u.fileId || u.id,
          departmentId: u.departmentId
        });
      }
    });

    // 3. Direct Mongo Downloads
    mongoDownloads.forEach((d) => {
      list.push({
        id: d.id,
        title: d.title || d.fileName || 'Archive Document',
        type: d.category || 'Question Paper / Reference',
        subject: d.subject || 'Tamil',
        year: d.year || 'All Years',
        unit: d.unit ? `Unit ${d.unit}` : 'General',
        fileName: d.fileName || `${d.title || 'file'}.pdf`,
        fileSize: d.fileSize || 450000,
        downloadUrl: d.downloadUrl || d.fileUrl,
        fileId: d.fileId || d.id,
        departmentId: d.departmentId
      });
    });

    return list;
  }, [materials, units, mongoDownloads]);

  const filteredFiles = useMemo(() => {
    return allFiles.filter((f) => {
      const yearMatch = !f.year || f.year === 'All' || f.year === 'All Years' || f.year === year;
      const deptMatch = !f.departmentId || f.departmentId === 'all' || f.departmentId === profile?.departmentId;
      const queryMatch = !searchQuery.trim() ||
        f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.unit.toLowerCase().includes(searchQuery.toLowerCase());

      return yearMatch && deptMatch && queryMatch;
    });
  }, [allFiles, year, profile?.departmentId, searchQuery]);

  const handleDownload = (file) => {
    setViewingFile(file);
  };

  return (
    <div className="student-page grid" style={{ gap: 16 }}>
      <StudentPageHeader
        title="Downloads Center"
        subtitle={`${year} / PDF Documents, Syllabi & Question Papers (MongoDB Storage)`}
      />

      {/* Search & Storage Stat */}
      <div className="grid grid-3" style={{ gap: 14 }}>
        <StudentContentCard style={{ gridColumn: 'span 2' }}>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              className="input"
              placeholder="Search PDF documents, textbooks, question banks by keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 38, width: '100%' }}
            />
          </div>
        </StudentContentCard>

        <StudentContentCard style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px' }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(59, 130, 246, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
            <HardDrive size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Available Files</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>{filteredFiles.length} Documents</div>
          </div>
        </StudentContentCard>
      </div>

      {/* Files Grid */}
      {loading ? (
        <Loader />
      ) : filteredFiles.length > 0 ? (
        <div className="grid grid-2" style={{ gap: 16 }}>
          {filteredFiles.map((file) => (
            <StudentContentCard key={file.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className="badge badge-primary" style={{ fontSize: 11 }}>{file.unit}</span>
                    <span className="badge badge-secondary" style={{ fontSize: 11 }}>{file.type}</span>
                    <span className="badge" style={{ fontSize: 11, background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>PDF</span>
                  </div>
                </div>

                <h3 style={{ margin: '10px 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
                  {file.title}
                </h3>

                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <span>Subject: <strong>{file.subject}</strong></span>
                  <span>Size: <strong>{typeof file.fileSize === 'number' ? `${(file.fileSize / 1024).toFixed(0)} KB` : file.fileSize}</strong></span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 8, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                <Button
                  onClick={() => handleDownload(file)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Eye size={16} /> Open Document
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleDownload(file)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  title="Direct Download"
                >
                  <Download size={16} /> Download
                </Button>
              </div>
            </StudentContentCard>
          ))}
        </div>
      ) : (
        <EmptyState
          message="No downloadable study materials or PDFs available for this filter."
          icon={<FolderDown size={36} />}
        />
      )}

      {/* In-App PDF Viewer Modal */}
      <PdfViewerModal
        isOpen={!!viewingFile}
        onClose={() => setViewingFile(null)}
        material={viewingFile}
      />
    </div>
  );
};

export default StudentDownloads;
