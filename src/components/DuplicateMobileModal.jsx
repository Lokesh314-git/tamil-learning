import React, { useMemo, useState } from 'react';
import Modal from './ui/Modal';
import { Smartphone, AlertTriangle, CheckCircle, Users } from 'lucide-react';

const DuplicateMobileModal = ({ open, onClose, students = [], onSelectStudent }) => {
  const [filterType, setFilterType] = useState('duplicates'); // 'duplicates' | 'missing_mobile' | 'missing_dob'

  // Analyze active students
  const auditData = useMemo(() => {
    const active = students.filter((s) => s.role === 'student' && s.status !== 'deleted' && s.isDeleted !== true);
    const mobileMap = new Map();
    const missingMobiles = [];
    const missingDobs = [];

    active.forEach((s) => {
      const raw = s.mobileNumber || s.phone || '';
      const digits = String(raw).replace(/\D/g, '');
      const clean = digits.length > 10 && digits.startsWith('91') ? digits.slice(2, 12) : digits.slice(-10);

      // DOB check
      if (!s.dob || String(s.dob).trim() === '') {
        missingDobs.push(s);
      }

      // Mobile check
      if (!digits || clean.length !== 10) {
        missingMobiles.push(s);
      } else {
        const existing = mobileMap.get(clean) || [];
        existing.push(s);
        mobileMap.set(clean, existing);
      }
    });

    const duplicates = [];
    for (const [mobileNumber, list] of mobileMap.entries()) {
      if (list.length > 1) {
        duplicates.push({ mobileNumber, count: list.length, students: list });
      }
    }

    return {
      totalActive: active.length,
      duplicates,
      missingMobiles,
      missingDobs,
      cleanCount: active.length - (duplicates.reduce((acc, d) => acc + d.count, 0) + missingMobiles.length)
    };
  }, [students]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Student Mobile & Credential Audit"
      subtitle="Verify registered mobile numbers and dates of birth for student portal authentication."
      icon={Smartphone}
      iconVariant="primary"
      footer={(
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        <div
          onClick={() => setFilterType('duplicates')}
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            border: filterType === 'duplicates' ? '2px solid var(--color-danger, #ef4444)' : '1px solid var(--color-border)',
            background: filterType === 'duplicates' ? '#fef2f2' : 'var(--color-bg-card)'
          }}
        >
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Duplicate Numbers</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: auditData.duplicates.length > 0 ? '#ef4444' : '#10b981', marginTop: 2 }}>
            {auditData.duplicates.length}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>
            {auditData.duplicates.reduce((acc, d) => acc + d.count, 0)} accounts affected
          </div>
        </div>

        <div
          onClick={() => setFilterType('missing_mobile')}
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            border: filterType === 'missing_mobile' ? '2px solid var(--color-warning, #f59e0b)' : '1px solid var(--color-border)',
            background: filterType === 'missing_mobile' ? '#fffbeb' : 'var(--color-bg-card)'
          }}
        >
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Missing Mobile</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: auditData.missingMobiles.length > 0 ? '#f59e0b' : '#10b981', marginTop: 2 }}>
            {auditData.missingMobiles.length}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Cannot sign in</div>
        </div>

        <div
          onClick={() => setFilterType('missing_dob')}
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            border: filterType === 'missing_dob' ? '2px solid var(--color-warning, #f59e0b)' : '1px solid var(--color-border)',
            background: filterType === 'missing_dob' ? '#fffbeb' : 'var(--color-bg-card)'
          }}
        >
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' }}>Missing DOB</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: auditData.missingDobs.length > 0 ? '#f59e0b' : '#10b981', marginTop: 2 }}>
            {auditData.missingDobs.length}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Requires DOB update</div>
        </div>
      </div>

      {filterType === 'duplicates' && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={15} style={{ color: '#ef4444' }} />
            Students Sharing the Same Mobile Number ({auditData.duplicates.length} groups)
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            To prevent account hijacking and ambiguity, students sharing a duplicate phone number cannot authenticate until each account is given a unique registered mobile number.
          </p>

          {auditData.duplicates.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#10b981', background: '#ecfdf5', borderRadius: 8 }}>
              <CheckCircle size={24} style={{ margin: '0 auto 6px' }} />
              <div style={{ fontWeight: 600 }}>Zero Duplicate Mobile Numbers Found</div>
              <div style={{ fontSize: 12, color: '#047857' }}>All active student records have unique mobile numbers.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto' }}>
              {auditData.duplicates.map((group) => (
                <div key={group.mobileNumber} style={{ border: '1px solid #fee2e2', borderRadius: 8, padding: 10, background: '#fff' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#b91c1c', marginBottom: 6 }}>
                    📱 Mobile Number: {group.mobileNumber} ({group.count} Students)
                  </div>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                        <th style={{ padding: '4px 8px' }}>Student Name</th>
                        <th style={{ padding: '4px 8px' }}>SIF ID</th>
                        <th style={{ padding: '4px 8px' }}>Class / Dept</th>
                        <th style={{ padding: '4px 8px' }}>Date of Birth</th>
                        <th style={{ padding: '4px 8px' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.students.map((st) => (
                        <tr key={st.id || st.uid} style={{ borderTop: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 500 }}>{st.name}</td>
                          <td style={{ padding: '6px 8px', color: '#6b7280' }}>{st.sifNumber || '-'}</td>
                          <td style={{ padding: '6px 8px' }}>{st.departmentName || st.class || '-'} ({st.year || '-'})</td>
                          <td style={{ padding: '6px 8px' }}>{st.dob || '-'}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '2px 8px', fontSize: 11 }}
                              onClick={() => {
                                onClose();
                                if (typeof onSelectStudent === 'function') onSelectStudent(st);
                              }}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {filterType === 'missing_mobile' && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={15} style={{ color: '#f59e0b' }} />
            Students Missing 10-Digit Mobile Numbers ({auditData.missingMobiles.length})
          </div>
          {auditData.missingMobiles.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#10b981', background: '#ecfdf5', borderRadius: 8 }}>
              <CheckCircle size={24} style={{ margin: '0 auto 6px' }} />
              <div style={{ fontWeight: 600 }}>All Active Students Have Valid Mobile Numbers</div>
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                    <th style={{ padding: '6px 8px' }}>Student Name</th>
                    <th style={{ padding: '6px 8px' }}>SIF ID</th>
                    <th style={{ padding: '6px 8px' }}>Department</th>
                    <th style={{ padding: '6px 8px' }}>Current Stored Value</th>
                    <th style={{ padding: '6px 8px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {auditData.missingMobiles.map((st) => (
                    <tr key={st.id || st.uid} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 500 }}>{st.name}</td>
                      <td style={{ padding: '6px 8px', color: '#6b7280' }}>{st.sifNumber || '-'}</td>
                      <td style={{ padding: '6px 8px' }}>{st.departmentName || st.class || '-'} ({st.year || '-'})</td>
                      <td style={{ padding: '6px 8px', color: '#ef4444' }}>{st.mobileNumber || st.phone || '(empty)'}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '2px 8px', fontSize: 11 }}
                          onClick={() => {
                            onClose();
                            if (typeof onSelectStudent === 'function') onSelectStudent(st);
                          }}
                        >
                          Add Mobile
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {filterType === 'missing_dob' && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={15} style={{ color: '#f59e0b' }} />
            Students Missing Date of Birth ({auditData.missingDobs.length})
          </div>
          {auditData.missingDobs.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#10b981', background: '#ecfdf5', borderRadius: 8 }}>
              <CheckCircle size={24} style={{ margin: '0 auto 6px' }} />
              <div style={{ fontWeight: 600 }}>All Active Students Have Date of Birth Registered</div>
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                    <th style={{ padding: '6px 8px' }}>Student Name</th>
                    <th style={{ padding: '6px 8px' }}>SIF ID</th>
                    <th style={{ padding: '6px 8px' }}>Mobile Number</th>
                    <th style={{ padding: '6px 8px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {auditData.missingDobs.map((st) => (
                    <tr key={st.id || st.uid} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 500 }}>{st.name}</td>
                      <td style={{ padding: '6px 8px', color: '#6b7280' }}>{st.sifNumber || '-'}</td>
                      <td style={{ padding: '6px 8px' }}>{st.mobileNumber || st.phone || '-'}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '2px 8px', fontSize: 11 }}
                          onClick={() => {
                            onClose();
                            if (typeof onSelectStudent === 'function') onSelectStudent(st);
                          }}
                        >
                          Add DOB
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default DuplicateMobileModal;

