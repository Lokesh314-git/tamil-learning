import React from 'react';
import { formatDisplayDob } from '../utils/studentImport';

const statusTone = (status) => {
  if (status === 'deleted') return 'pill neutral';
  if (status === 'pending') return 'pill warning';
  return 'pill success';
};

const StudentTable = ({
  students,
  selectedIds = [],
  onToggleSelect,
  onToggleSelectAll,
  onView,
  onEdit,
  onResetPassword,
  onApprove,
  onDelete,
  onRestore,
  onPermanentDelete,
}) => {
  const allSelected = students.length > 0 && selectedIds.length === students.length;

  return (
    <div className="card" style={{ marginTop: 12, overflow: 'hidden' }}>
      <div className="table-scroll">
        <table className="table students-table">
          <thead>
            <tr>
              <th style={{ width: 40, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onToggleSelectAll?.(e.target.checked)}
                />
              </th>
              <th>Roll No</th>
              <th>SIF No</th>
              <th>Name</th>
              <th>DOB</th>
              <th>Mobile</th>
              <th>Year</th>
              <th>Class</th>
              <th>Sec</th>
              <th>Status</th>
              <th style={{ width: 280 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const uid = s.uid || s.id;
              const isDeleted = s.isDeleted === true || s.status === 'deleted';
              const isApproved = s.isApproved === true || s.approved === true;
              const status = isDeleted ? 'deleted' : (s.status || (isApproved ? 'active' : 'pending'));
              const roll = s.rollNumber || s.registerNumber || '-';
              const sif = s.sifNumber || '-';
              const dobDisplay = formatDisplayDob(s.dob);
              const mobile = s.mobileNumber || s.phone || '-';
              const className = s.class || s.departmentName || '-';
              const sec = s.section || '-';

              return (
                <tr key={uid}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(uid)}
                      onChange={() => onToggleSelect?.(uid)}
                    />
                  </td>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{roll}</td>
                  <td style={{ fontWeight: 600, color: '#2563eb', fontFamily: 'monospace' }}>{sif}</td>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td>{dobDisplay}</td>
                  <td>{mobile}</td>
                  <td>{s.year}</td>
                  <td>{className}</td>
                  <td><span className="pill info" style={{ padding: '2px 7px', fontSize: 11 }}>{sec}</span></td>
                  <td><span className={statusTone(status)}>{status}</span></td>
                  <td className="student-actions-cell">

                    {isDeleted ? (
                      <>
                        <button className="btn btn-primary" onClick={() => onRestore?.(s)}>Restore</button>
                        <button
                          className="btn btn-secondary"
                          style={{ background: '#b91c1c', color: '#fff', border: 'none' }}
                          onClick={() => onPermanentDelete?.(s)}
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn btn-primary"
                          style={{ background: 'linear-gradient(120deg,#6366f1,#8b5cf6)', border: 'none' }}
                          onClick={() => onEdit?.(s)}
                        >
                          Edit
                        </button>
                        {!isApproved && (
                          <button className="btn btn-primary" onClick={() => onApprove?.(s)}>Approve</button>
                        )}
                        <button
                          className="btn btn-secondary"
                          style={{ background: '#ef4444', color: '#fff', border: 'none' }}
                          onClick={() => onDelete?.(s)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {!students.length && (
              <tr><td colSpan={11} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No students found. Use "Import Excel" to add students.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StudentTable;
