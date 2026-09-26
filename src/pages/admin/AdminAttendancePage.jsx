import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  serverTimestamp,
  where
} from 'firebase/firestore';
import { db } from '../../firebase';
import { YEARS } from '../../utils/departments';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';
import PageHeader from '../../components/ui/PageHeader';
import {
  UserCheck,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  Save,
  Download,
  Filter,
  CheckCheck,
  AlertCircle,
  Search,
  Sparkles,
  Award
} from 'lucide-react';
import { mongoService } from '../../services/mongoService';

const STATUS_CONFIG = {
  present: { label: 'Present', color: 'var(--color-success)', bg: 'rgba(34, 197, 94, 0.12)', icon: CheckCircle2 },
  absent: { label: 'Absent', color: 'var(--color-danger)', bg: 'rgba(239, 68, 68, 0.12)', icon: XCircle },
  od: { label: 'On Duty (OD)', color: 'var(--color-primary)', bg: 'rgba(30, 58, 138, 0.12)', icon: Award },
  leave: { label: 'Leave', color: 'var(--color-warning)', bg: 'rgba(234, 179, 8, 0.12)', icon: Clock },
};

const AdminAttendancePage = () => {
  const [students, setStudents] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Attendance Filters
  const [selectedYear, setSelectedYear] = useState(YEARS[0]);
  const [selectedDeptId, setSelectedDeptId] = useState('all');
  const [selectedSection, setSelectedSection] = useState('all');
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [searchQuery, setSearchQuery] = useState('');

  // Daily Roster State: { [studentId]: { status: 'present'|'absent'|'od'|'leave', remarks: '' } }
  const [attendanceMap, setAttendanceMap] = useState({});

  useEffect(() => {
    setLoading(true);
    let ready = 0;
    const check = () => {
      ready++;
      if (ready >= 2) setLoading(false);
    };

    // 1. Fetch Students
    const unsubStudents = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'student')),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setStudents(list);
        check();
      },
      (err) => {
        console.warn('Students listener error:', err);
        check();
      }
    );

    // 2. Fetch Departments
    const unsubDepts = onSnapshot(
      query(collection(db, 'departments')),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setDepartments(list);
        check();
      },
      (err) => {
        console.warn('Departments listener error:', err);
        check();
      }
    );

    return () => {
      unsubStudents();
      unsubDepts();
    };
  }, []);

  // Filter students based on year, department, section, and search
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const yearMatch = selectedYear === 'All' || s.year === selectedYear;
      const deptMatch = selectedDeptId === 'all' || s.departmentId === selectedDeptId;
      const secMatch = selectedSection === 'all' || (s.section || 'A').toUpperCase() === selectedSection.toUpperCase();
      const searchMatch = !searchQuery.trim() ||
        (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.rollNo || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.sifNo || '').toLowerCase().includes(searchQuery.toLowerCase());

      const activeMatch = s.isDeleted !== true && !['deleted', 'blocked', 'rejected', 'pending'].includes(s.status);
      return activeMatch && yearMatch && deptMatch && secMatch && searchMatch;
    });
  }, [students, selectedYear, selectedDeptId, selectedSection, searchQuery]);

  // Load attendance records for the selected date and filters
  useEffect(() => {
    if (!selectedDate) return undefined;
    const unsub = onSnapshot(
      query(collection(db, 'attendance'), where('date', '==', selectedDate)),
      (snap) => {
        const newMap = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.studentId) {
            newMap[data.studentId] = {
              status: data.status || 'present',
              remarks: data.remarks || '',
            };
          }
          if (data.records && typeof data.records === 'object') {
            Object.assign(newMap, data.records);
          }
        });

        // Initialize default 'present' for any unrecorded students
        filteredStudents.forEach((st) => {
          if (!newMap[st.id]) {
            newMap[st.id] = { status: 'present', remarks: '' };
          }
        });

        setAttendanceMap(newMap);
      },
      (err) => console.warn('Error loading daily attendance:', err)
    );
    return () => unsub();
  }, [selectedDate, selectedDeptId, selectedSection, filteredStudents]);

  // Status updates
  const setStudentStatus = (studentId, status) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        status,
      },
    }));
  };

  const markAllStatus = (status) => {
    const updated = { ...attendanceMap };
    filteredStudents.forEach((st) => {
      updated[st.id] = {
        ...(updated[st.id] || {}),
        status,
      };
    });
    setAttendanceMap(updated);
  };

  // KPI Calculations
  const stats = useMemo(() => {
    const total = filteredStudents.length;
    let present = 0;
    let absent = 0;
    let od = 0;
    let leave = 0;

    filteredStudents.forEach((st) => {
      const rec = attendanceMap[st.id];
      const status = rec?.status || 'present';
      if (status === 'present') present++;
      else if (status === 'absent') absent++;
      else if (status === 'od') od++;
      else if (status === 'leave') leave++;
    });

    const percentage = total > 0 ? Math.round(((present + od) / total) * 100) : 100;

    return { total, present, absent, od, leave, percentage };
  }, [filteredStudents, attendanceMap]);

  // Save Attendance to Firestore and MongoDB
  const handleSaveAttendance = async () => {
    if (filteredStudents.length === 0) {
      setError('No students available in the current filter selection to save attendance.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const selectedDeptObj = departments.find((d) => d.id === selectedDeptId);
      const departmentName = selectedDeptId === 'all' ? 'All Departments' : (selectedDeptObj?.name || 'Tamil');

      // Save summary daily roster
      const rosterDocId = `${selectedDate}_${selectedYear}_${selectedDeptId}_${selectedSection}`;
      await setDoc(doc(db, 'attendance', rosterDocId), {
        date: selectedDate,
        year: selectedYear,
        departmentId: selectedDeptId,
        departmentName,
        section: selectedSection,
        totalStudents: filteredStudents.length,
        presentCount: stats.present,
        absentCount: stats.absent,
        odCount: stats.od,
        leaveCount: stats.leave,
        percentage: stats.percentage,
        records: attendanceMap,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Mirror individual student records for real-time student portal sync and update each student's profile
      await Promise.all(filteredStudents.map(async (st) => {
        const rec = attendanceMap[st.id] || { status: 'present', remarks: '' };
        const rawStatus = (rec.status || 'present').toString();
        // Capitalize for consistent display (Present / Absent / OD / Leave)
        const capitalizedStatus = rawStatus.toLowerCase() === 'present'
          ? 'Present'
          : rawStatus.toLowerCase() === 'absent'
            ? 'Absent'
            : rawStatus.toLowerCase() === 'od'
              ? 'OD'
              : rawStatus.toLowerCase() === 'leave'
                ? 'Leave'
                : 'Present';

        const individualDocId = `${st.id}_${selectedDate}`;
        const attPayload = {
          studentId: st.id,
          studentName: st.name || '',
          rollNo: st.rollNo || st.rollNumber || '',
          sifNo: st.sifNo || st.sifNumber || '',
          date: selectedDate,
          status: capitalizedStatus,
          remarks: rec.remarks || '',
          year: selectedYear,
          departmentId: st.departmentId || selectedDeptId,
          departmentName: st.departmentName || departmentName,
          section: st.section || selectedSection,
          updatedAt: serverTimestamp(),
        };

        await setDoc(doc(db, 'attendance', individualDocId), attPayload, { merge: true });

        // Calculate student's cumulative attendance statistics
        let studentTotal = 0;
        let studentPresent = 0;
        let studentAbsent = 0;
        let studentOD = 0;
        let studentLeave = 0;

        try {
          const qStudentHistory = query(collection(db, 'attendance'), where('studentId', '==', st.id));
          const historySnap = await getDocs(qStudentHistory);
          historySnap.forEach((snapDoc) => {
            const hData = snapDoc.data();
            const s = (hData.status || '').toLowerCase();
            studentTotal++;
            if (s === 'present') studentPresent++;
            else if (s === 'absent') studentAbsent++;
            else if (s === 'od' || s === 'onduty') studentOD++;
            else if (s === 'leave') studentLeave++;
          });
        } catch (_) {
          // Fallback if query fails
        }

        if (studentTotal === 0) {
          studentTotal = 1;
          if (capitalizedStatus === 'Present') studentPresent = 1;
          else if (capitalizedStatus === 'Absent') studentAbsent = 1;
          else if (capitalizedStatus === 'OD') studentOD = 1;
          else if (capitalizedStatus === 'Leave') studentLeave = 1;
        }

        const effectivePresent = studentPresent + studentOD;
        const studentPct = studentTotal > 0 ? Math.round((effectivePresent / studentTotal) * 100) : 100;

        const profileAttendanceData = {
          totalDays: studentTotal,
          presentDays: studentPresent,
          absentDays: studentAbsent,
          odDays: studentOD,
          leaveDays: studentLeave,
          percentage: studentPct,
          lastDate: selectedDate,
          lastStatus: capitalizedStatus,
          lastRemarks: rec.remarks || '',
          lastUpdated: new Date().toISOString(),
        };

        // Update student profile document in users collection
        await setDoc(doc(db, 'users', st.id), {
          attendance: profileAttendanceData,
          attendanceStats: profileAttendanceData,
          attendancePercentage: studentPct,
          lastAttendanceDate: selectedDate,
          lastAttendanceStatus: capitalizedStatus,
          updatedAt: serverTimestamp(),
        }, { merge: true });

        // Mirror student profile update to MongoDB
        mongoService.mirrorDocumentToMongo('users', st.id, {
          attendance: profileAttendanceData,
          attendancePercentage: studentPct,
          lastAttendanceDate: selectedDate,
          lastAttendanceStatus: capitalizedStatus,
        });

        // Mirror individual attendance record to MongoDB
        mongoService.mirrorDocumentToMongo('attendance', individualDocId, attPayload);
      }));

      // Sync roster to MongoDB Atlas
      mongoService.mirrorDocumentToMongo('attendance', rosterDocId, {
        date: selectedDate,
        year: selectedYear,
        stats,
      });

      setMessage(`Attendance for ${selectedDate} saved successfully and all student profiles updated (${stats.percentage}% present).`);
    } catch (err) {
      console.error('Save attendance error:', err);
      setError(err.message || 'Failed to save attendance records.');
    } finally {
      setSaving(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredStudents.length === 0) return;
    const headers = ['Roll No', 'SIF No', 'Student Name', 'Class / Department', 'Year', 'Section', 'Date', 'Status'];
    const rows = filteredStudents.map((st) => {
      const rec = attendanceMap[st.id] || { status: 'present' };
      return [
        `"${st.rollNo || ''}"`,
        `"${st.sifNo || ''}"`,
        `"${st.name || ''}"`,
        `"${st.departmentName || ''}"`,
        `"${st.year || selectedYear}"`,
        `"${st.section || selectedSection}"`,
        `"${selectedDate}"`,
        `"${(rec.status || 'present').toUpperCase()}"`
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Attendance_${selectedDate}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <Loader />;

  return (
    <div className="grid fade-in" style={{ gap: 20 }}>
      {/* Header Banner */}
      <div className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="pill info" style={{ marginBottom: 6 }}>Academic Management</div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Student Attendance Management</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-light)', fontSize: 13 }}>
            Mark daily attendance, track absent & OD records, generate reports, and sync live with student portal.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportCSV}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Download size={16} /> Export CSV
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSaveAttendance}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Save size={16} /> {saving ? 'Saving Records...' : 'Save & Sync Attendance'}
          </button>
        </div>
      </div>

      {message && (
        <div className="alert success" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={16} />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="alert error" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-4" style={{ gap: 16 }}>
        <div className="stat-card stat-blue">
          <div className="stat-head">
            <span className="stat-title">Total Enrolled</span>
            <div className="stat-icon blue"><Users size={16} /></div>
          </div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-meta">Roster for selected class</div>
        </div>

        <div className="stat-card stat-green">
          <div className="stat-head">
            <span className="stat-title">Present Today</span>
            <div className="stat-icon green"><CheckCircle2 size={16} /></div>
          </div>
          <div className="stat-value" style={{ color: 'var(--color-success)' }}>{stats.present}</div>
          <div className="stat-meta">{stats.percentage}% Attendance Rate</div>
        </div>

        <div className="stat-card" style={{ borderTop: '3px solid var(--color-danger)' }}>
          <div className="stat-head">
            <span className="stat-title">Absent</span>
            <div className="stat-icon" style={{ background: 'var(--color-danger-light)', color: 'var(--color-danger)' }}>
              <XCircle size={16} />
            </div>
          </div>
          <div className="stat-value" style={{ color: 'var(--color-danger)' }}>{stats.absent}</div>
          <div className="stat-meta">Students absent on {selectedDate}</div>
        </div>

        <div className="stat-card stat-purple">
          <div className="stat-head">
            <span className="stat-title">On Duty / Leave</span>
            <div className="stat-icon purple"><Award size={16} /></div>
          </div>
          <div className="stat-value" style={{ color: '#7c3aed' }}>{stats.od + stats.leave}</div>
          <div className="stat-meta">{stats.od} OD • {stats.leave} Authorized Leave</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          {/* Date Picker */}
          <div>
            <label className="form-label" style={{ fontSize: 11 }}>Attendance Date</label>
            <input
              type="date"
              className="input"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          {/* Academic Year */}
          <div>
            <label className="form-label" style={{ fontSize: 11 }}>Academic Year</label>
            <select
              className="input"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Department */}
          <div>
            <label className="form-label" style={{ fontSize: 11 }}>Department / Class</label>
            <select
              className="input"
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
            >
              <option value="all">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.year})</option>
              ))}
            </select>
          </div>

          {/* Section */}
          <div>
            <label className="form-label" style={{ fontSize: 11 }}>Section</label>
            <select
              className="input"
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
            >
              <option value="all">All Sections</option>
              <option value="A">Section A</option>
              <option value="B">Section B</option>
              <option value="C">Section C</option>
              <option value="D">Section D</option>
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="form-label" style={{ fontSize: 11 }}>Search Student</label>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
              <input
                className="input"
                style={{ paddingLeft: 32 }}
                placeholder="Name, Roll No, SIF..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Quick Batch Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: 12, flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Showing <strong>{filteredStudents.length}</strong> students for <strong>{selectedDate}</strong>
          </span>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => markAllStatus('present')}
              style={{ color: 'var(--color-success)', borderColor: 'rgba(34, 197, 94, 0.4)' }}
            >
              <CheckCheck size={14} /> Mark All Present
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => markAllStatus('absent')}
              style={{ color: 'var(--color-danger)', borderColor: 'rgba(239, 68, 68, 0.4)' }}
            >
              <XCircle size={14} /> Mark All Absent
            </button>
          </div>
        </div>
      </div>

      {/* Attendance Roster Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filteredStudents.length === 0 ? (
          <div style={{ padding: 40 }}>
            <EmptyState message="No students found matching the selected class and section." />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  <th>Student Info</th>
                  <th>Roll / SIF No</th>
                  <th>Class & Section</th>
                  <th style={{ textAlign: 'center' }}>Attendance Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((st, idx) => {
                  const record = attendanceMap[st.id] || { status: 'present' };
                  const currentStatus = record.status || 'present';

                  return (
                    <tr key={st.id}>
                      <td style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{idx + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: '50%',
                              background: 'var(--color-primary-light)',
                              color: 'var(--color-primary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: 13,
                              flexShrink: 0
                            }}
                          >
                            {(st.name || 'S').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--color-text)' }}>{st.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>{st.email || st.mobileNumber || '-'}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge neutral" style={{ fontWeight: 600 }}>
                          {st.sifNo || st.rollNo || '-'}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{st.departmentName || 'Tamil'}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-light)' }}>
                          {st.year || selectedYear} • Section {st.section || 'A'}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                            const isSelected = currentStatus === key;
                            const IconComponent = cfg.icon;

                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setStudentStatus(st.id, key)}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: 8,
                                  border: isSelected ? `2px solid ${cfg.color}` : '1px solid var(--color-border)',
                                  background: isSelected ? cfg.bg : 'var(--color-card)',
                                  color: isSelected ? cfg.color : 'var(--color-text-muted)',
                                  fontWeight: isSelected ? 800 : 500,
                                  fontSize: 12,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <IconComponent size={14} />
                                <span>{cfg.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAttendancePage;
