import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Download,
  ExternalLink,
  FileText,
  AlertCircle,
  Eye,
  Layers,
  Sparkles,
  BookOpen,
  FileCheck2,
  FileSpreadsheet,
  Presentation,
  Archive,
  Image as ImageIcon,
  CheckCircle2,
  HardDrive
} from 'lucide-react';
import Button from './ui/Button';
import { mongoService } from '../services/mongoService';

/**
 * Universal In-App Document & Study Material Viewer Modal
 * Supports:
 *  - Native browser PDF rendering via Blob iframe
 *  - Native Image rendering for image study materials
 *  - Rich Document Hub for Word (.docx, .doc), PowerPoint (.pptx), Excel (.xlsx), ZIP archives
 *  - Direct streaming from MongoDB GridFS
 */
const PdfViewerModal = ({ isOpen, onClose, material, title, fileUrl, fileName, fileId }) => {
  const [loadError, setLoadError] = useState(false);
  const [blobUrl, setBlobUrl] = useState('');
  const [loading, setLoading] = useState(true);

  const docTitle = title || material?.title || material?.fileName || fileName || 'Study Material Document';
  const docFileName = fileName || material?.fileName || `${docTitle}.pdf`;
  const rawUrl = fileUrl || material?.downloadUrl || material?.fileUrl || material?.fileLink || '';
  const docFileId = fileId || material?.fileId || material?.gridFsFileId || material?.id || '';

  const fileType = useMemo(() => {
    const name = (docFileName || '').toLowerCase();
    if (name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp') || name.endsWith('.gif') || name.endsWith('.svg')) return 'image';
    if (name.endsWith('.docx') || name.endsWith('.doc')) return 'word';
    if (name.endsWith('.pptx') || name.endsWith('.ppt')) return 'powerpoint';
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) return 'excel';
    if (name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.7z')) return 'archive';
    return 'generic';
  }, [docFileName]);

  useEffect(() => {
    if (!isOpen) {
      if (blobUrl && blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrl);
      }
      setBlobUrl('');
      setLoadError(false);
      setLoading(true);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setLoadError(false);

    const loadDocument = async () => {
      try {
        const res = await mongoService.fetchFileBlob(docFileId, rawUrl);
        if (isMounted) {
          if (res?.blobUrl) {
            setBlobUrl(res.blobUrl);
          } else {
            setLoadError(true);
          }
          setLoading(false);
        }
      } catch (err) {
        console.warn('[PdfViewerModal] Fetch blob notice:', err);
        if (isMounted) {
          if (rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))) {
            setBlobUrl(rawUrl);
          } else {
            setLoadError(true);
          }
          setLoading(false);
        }
      }
    };

    loadDocument();

    return () => {
      isMounted = false;
    };
  }, [isOpen, rawUrl, docFileId]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (blobUrl) {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = docFileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (rawUrl) {
      window.open(rawUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleOpenExternal = () => {
    if (blobUrl) {
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
    } else if (rawUrl) {
      window.open(rawUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg-card, #ffffff)',
          gap: 14
        }}>
          <HardDrive size={36} color="var(--color-primary)" className="spin" />
          <div style={{ fontSize: 14, color: 'var(--color-text)', fontWeight: 600 }}>
            Streaming Document from MongoDB Storage...
          </div>
        </div>
      );
    }

    if (blobUrl && !loadError) {
      // 1. PDF Preview
      if (fileType === 'pdf') {
        return (
          <iframe
            src={blobUrl}
            title={docTitle}
            style={{ width: '100%', height: '100%', border: 0 }}
            onError={() => setLoadError(true)}
          />
        );
      }

      // 2. Image Preview
      if (fileType === 'image') {
        return (
          <div style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: '#0f172a'
          }}>
            <img
              src={blobUrl}
              alt={docTitle}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: 8,
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
              }}
            />
          </div>
        );
      }
    }

    // 3. Dedicated Resource Hub for Word (.docx), PowerPoint, Excel, ZIP, etc.
    const typeMeta = {
      word: {
        label: 'Microsoft Word Document (.docx)',
        icon: FileText,
        color: '#2563eb',
        bg: '#eff6ff',
        desc: 'This document is formatted as a Microsoft Word file (.docx) stored in MongoDB GridFS. Download to open in MS Word, Google Docs, or LibreOffice.'
      },
      powerpoint: {
        label: 'PowerPoint Presentation (.pptx)',
        icon: Presentation,
        color: '#ea580c',
        bg: '#fff7ed',
        desc: 'This presentation is stored in MongoDB GridFS. Download to view slides in Microsoft PowerPoint or Google Slides.'
      },
      excel: {
        label: 'Spreadsheet Document (.xlsx / .csv)',
        icon: FileSpreadsheet,
        color: '#16a34a',
        bg: '#f0fdf4',
        desc: 'This spreadsheet is stored in MongoDB GridFS. Download to open in Microsoft Excel or Google Sheets.'
      },
      archive: {
        label: 'Compressed Archive (.zip)',
        icon: Archive,
        color: '#ca8a04',
        bg: '#fefce8',
        desc: 'This archive contains multiple learning assets. Download and extract on your device.'
      },
      generic: {
        label: 'Document Resource',
        icon: BookOpen,
        color: '#4f46e5',
        bg: '#eef2ff',
        desc: 'This document is securely stored in MongoDB GridFS. Download to access full contents.'
      }
    }[fileType] || {
      label: 'Document Resource',
      icon: BookOpen,
      color: '#4f46e5',
      bg: '#eef2ff',
      desc: 'This document is securely stored in MongoDB GridFS. Download to access full contents.'
    };

    const MetaIcon = typeMeta.icon;

    return (
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        background: 'var(--color-bg-card, #ffffff)',
        textAlign: 'center',
        overflowY: 'auto'
      }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          background: typeMeta.bg,
          color: typeMeta.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
          boxShadow: '0 8px 16px -4px rgba(0, 0, 0, 0.08)'
        }}>
          <MetaIcon size={38} />
        </div>

        <span className="badge" style={{
          background: typeMeta.bg,
          color: typeMeta.color,
          border: `1px solid ${typeMeta.color}30`,
          fontSize: 12,
          fontWeight: 700,
          marginBottom: 10,
          padding: '4px 12px'
        }}>
          {typeMeta.label}
        </span>

        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: 'var(--color-text)', maxWidth: 600 }}>
          {docTitle}
        </h3>

        <p style={{ maxWidth: 520, color: 'var(--color-text-muted)', fontSize: 13, margin: '0 0 20px', lineHeight: 1.5 }}>
          {typeMeta.desc}
        </p>

        {/* Metadata Specs Box */}
        <div style={{
          padding: '14px 20px',
          borderRadius: 12,
          background: 'var(--color-bg-secondary, #f8fafc)',
          border: '1px solid var(--color-border)',
          marginBottom: 24,
          textAlign: 'left',
          width: '100%',
          maxWidth: 460,
          fontSize: 13
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>File Name:</span>
            <span style={{ fontWeight: 600, color: 'var(--color-text)', wordBreak: 'break-all', textAlign: 'right' }}>{docFileName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Storage Engine:</span>
            <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>MongoDB GridFS</span>
          </div>
          {material?.fileSize && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'var(--color-text-muted)' }}>File Size:</span>
              <span style={{ fontWeight: 600 }}>
                {typeof material.fileSize === 'number' ? `${(material.fileSize / 1024).toFixed(0)} KB` : material.fileSize}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Security:</span>
            <span style={{ fontWeight: 600, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle2 size={14} /> Direct Binary Stream
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button
            onClick={handleDownload}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 700
            }}
          >
            <Download size={18} /> Download Document
          </Button>
          <Button
            variant="secondary"
            onClick={handleOpenExternal}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontSize: 14 }}
          >
            <ExternalLink size={16} /> Open in Browser
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      padding: '16px'
    }}>
      <div style={{
        background: 'var(--color-bg-card, #ffffff)',
        borderRadius: 16,
        width: '100%',
        maxWidth: 1000,
        height: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        border: '1px solid var(--color-border)'
      }}>
        {/* Modal Topbar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 20px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg-secondary, #f8fafc)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(59, 130, 246, 0.1)',
              color: 'var(--color-primary, #2563eb)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <FileText size={20} />
            </div>
            <div style={{ overflow: 'hidden' }}>
              <h3 style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--color-text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {docTitle}
              </h3>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', gap: 8 }}>
                <span>{material?.subject || 'Tamil'}</span>
                <span>•</span>
                <span>{material?.unitNumber ? `Unit ${material.unitNumber}` : (material?.unit || 'Study Material')}</span>
                <span>•</span>
                <span>{docFileName}</span>
              </div>
            </div>
          </div>

          {/* Header Action Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Button
              variant="secondary"
              onClick={handleDownload}
              style={{ padding: '6px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
              title="Download File"
            >
              <Download size={15} /> Download
            </Button>
            <Button
              variant="secondary"
              onClick={handleOpenExternal}
              style={{ padding: '6px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
              title="Open in New Tab"
            >
              <ExternalLink size={15} /> Open Tab
            </Button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 6,
                borderRadius: 8,
                color: 'var(--color-text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Close Viewer"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Modal Main Content */}
        <div style={{ flex: 1, position: 'relative', background: '#525659', overflow: 'hidden' }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default PdfViewerModal;
