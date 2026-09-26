import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, onSnapshot, query, where, doc, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Clock, 
  Percent, 
  Calendar, 
  Search, 
  Check, 
  X as CloseIcon, 
  Filter 
} from 'lucide-react';
import { db, auth } from '../../firebase';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Loader from '../../components/Loader';
import EmptyState from '../../components/EmptyState';

const YEARS = ['1st Year', '2nd Year', '3rd Year'];
const PERIODS = ['Period 1', 'Period 2', 'Period 3', 'Period 4', 'Period 5', 'Period 6', 'Period 7', 'Period 8'];

const AdminAttendance = () => {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterYear, setFilterYear] = useState('All');
  const [filterPeriod, setFilterPeriod] = useState(PERIODS[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Mark Attendance Modal State
  const [isMarkOpen, setIsMarkOpen] = useState(false);
  const [markDate, setMarkDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [markYear, setMarkYear] = useState(YEARS[0]);
  const [markPeriod, setMarkPeriod] = useState(PERIODS[0]);
  const [markStudents, setMarkStudents] = useState([]);
  const [markStatus, setMarkStatus] = useState({}); // { studentId: 'Present' | 'Absent' | 'Late' }

  useEffect(() => {
    setLoading(true);
    const unsubs = [];
    let initialCount = 0;
    const checkInitial = () => {
      initialCount++;
      if (initialCount >= 2) setLoading(false);
    };

    // 1. Students listener
    const qStudents = query(collection(db, 'users'), where('role', '==', 'student'));
    unsubs.push(onSnapshot(qStudents, (studentSnap) => {
      const sList = [];
      studentSnap.forEach((d) => {
        const data = d.data();
        const isDeleted = data.isDeleted === true || data.status === 'deleted';
        const isApproved = data.isApproved === true || data.approved === true;
        if (!isDeleted && isApproved) {
          sList.push({ id: d.id, ...data });
        }
      });
      setStudents(sList);
      checkInitial();
    }, (err) => {
      console.warn('Attendance students listener error:', err);
      checkInitial();
    }));

    // 2. Attendance listener for date and period
    const qAtt = query(collection(db, 'attendance'), where('date', '==', date), where('period', '==', filterPeriod));
    unsubs.push(onSnapshot(qAtt, (attSnap) => {
      const aList = [];
      attSnap.forEach((d) => aList.push({ id: d.id, ...d.data() }));
      setAttendance(aList);
      checkInitial();
    }, (err) => {
      console.warn('Attendance records listener error:', err);
      checkInitial();
    }));

    return () => unsubs.forEach((u) => u());
  }, [date, filterPeriod]);

  const fetchData = () => {};

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const handleStatusChange = async (studentId, newStatus, studentData) => {
    try {
      const docId = `${studentId}_${date}_${filterPeriod}`;
      const attRef = doc(db, 'attendance', docId);
      
      const payload = {
        studentId,
        studentName: studentData.name || '',
        registerNumber: studentData.registerNumber || '',
        year: studentData.year || '',
        date,
        period: filterPeriod,
        status: newStatus,
        markedBy: auth.currentUser?.uid || 'admin',
        updatedAt: serverTimestamp()
      };

      const existing = attendance.find(a => a.studentId === studentId);
      if (!existing) {
        payload.createdAt = serverTimestamp();
      }

      await setDoc(attRef, payload, { merge: true });
      
      setAttendance(prev => {
        const filtered = prev.filter(a => a.studentId !== studentId);
        return [...filtered, { id: docId, ...payload, createdAt: existing ? existing.createdAt : new Date() }];
      });
      showMessage('success', 'Status updated successfully.');
    } catch (error) {
      console.error('Error updating status:', error);
      showMessage('error', 'Failed to update status.');
    }
  };

  const openMarkModal = () => {
    setMarkDate(date);
    setMarkYear(YEARS[0]);
    setMarkPeriod(filterPeriod);
    setIsMarkOpen(true);
    prepareMarkStudents(YEARS[0], date, filterPeriod);
  };

  const prepareMarkStudents = async (year, selectedDate, selectedPeriod) => {
    const yearStudents = students.filter(s => s.year === year);
    setMarkStudents(yearStudents);
    
    try {
      const attSnap = await getDocs(query(collection(db, 'attendance'), where('date', '==', selectedDate), where('year', '==', year), where('period', '==', selectedPeriod)));
      const existingStatus = {};
      attSnap.forEach(d => {
        existingStatus[d.data().studentId] = d.data().status;
      });
      setMarkStatus(existingStatus);
    } catch (err) {
      console.error('Error fetching existing attendance for modal:', err);
    }
  };

  const handleMarkYearChange = (e) => {
    const y = e.target.value;
    setMarkYear(y);
    prepareMarkStudents(y, markDate, markPeriod);
  };

  const handleMarkDateChange = (e) => {
    const d = e.target.value;
    setMarkDate(d);
    prepareMarkStudents(markYear, d, markPeriod);
  };

  const handleMarkPeriodChange = (e) => {
    const p = e.target.value;
    setMarkPeriod(p);
    prepareMarkStudents(markYear, markDate, p);
  };

  const markAllPresent = () => {
    const newStatus = {};
    markStudents.forEach(s => {
      newStatus[s.id] = 'Present';
    });
    setMarkStatus(newStatus);
  };

  const resetMark = () => {
    setMarkStatus({});
  };

  const saveMarkAttendance = async () => {
    if (!markDate || !markYear) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      
      markStudents.forEach(student => {
        const status = markStatus[student.id];
        if (status) {
          const docId = `${student.id}_${markDate}_${markPeriod}`;
          const attRef = doc(db, 'attendance', docId);
          const attData = {
            studentId: student.id,
            studentName: student.name || '',
            registerNumber: student.registerNumber || student.rollNo || '',
            rollNo: student.rollNo || student.registerNumber || '',
            sifNo: student.sifNo || student.sifNumber || '',
            year: student.year || '',
            date: markDate,
            period: markPeriod,
            status: status,
            markedBy: auth.currentUser?.uid || 'admin',
            updatedAt: serverTimestamp(),
          };
          batch.set(attRef, attData, { merge: true });

          // Also update user profile document
          const userRef = doc(db, 'users', student.id);
          batch.set(userRef, {
            lastAttendanceDate: markDate,
            lastAttendanceStatus: status,
            updatedAt: serverTimestamp(),
          }, { merge: true });

          // Mirror to MongoDB Atlas
          mongoService.mirrorDocumentToMongo('attendance', docId, attData);
          mongoService.mirrorDocumentToMongo('users', student.id, {
            lastAttendanceDate: markDate,
            lastAttendanceStatus: status,
          });
        }
      });

      await batch.commit();
      setIsMarkOpen(false);
      showMessage('success', 'Attendance saved and student profiles updated successfully.');
      if (markDate === date && markPeriod === filterPeriod) {
        fetchData();
      }
    } catch (err) {
      console.error('Error saving attendance:', err);
      showMessage('error', 'Failed to save attendance.');
    } finally {
      setSaving(false);
    }
  };

  // Filtered Data for Table
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchYear = filterYear === 'All' || s.year === filterYear;
      const matchSearch = (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (s.registerNumber || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchStatus = true;
      if (filterStatus !== 'All') {
        const att = attendance.find(a => a.studentId === s.id);
        const currentStatus = att ? att.status : 'Not Marked';
        if (filterStatus === 'Not Marked') {
          matchStatus = !att;
        } else {
          matchStatus = currentStatus === filterStatus;
        }
      }

      return matchYear && matchSearch && matchStatus;
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [students, attendance, filterYear, searchQuery, filterStatus]);

  // Summary calculations - Deduplicated and clamped
  const summary = useMemo(() => {
    const yearStudents = filterYear === 'All' ? students : students.filter(s => s.year === filterYear);
    const total = yearStudents.length;
    const yearStudentIds = new Set(yearStudents.map(s => s.id));
    
    // Map status per unique student for current date and period
    const statusMap = {};
    attendance.forEach(a => {
      if (yearStudentIds.has(a.studentId)) {
        statusMap[a.studentId] = a.status;
      }
    });

    const present = Object.values(statusMap).filter(st => st === 'Present').length;
    const absent = Object.values(statusMap).filter(st => st === 'Absent').length;
    const late = Object.values(statusMap).filter(st => st === 'Late').length;
    const marked = Object.keys(statusMap).length;

    let percentage = 0;
    if (total > 0) {
      percentage = Math.min(100, Math.max(0, Math.round((present / total) * 100)));
    }

    return { total, present, absent, late, marked, percentage };
  }, [students, attendance, filterYear]);

  return (
    <div className="page-container fade-in">
      <PageHeader 
        eyebrow="Admin / Attendance"
        title="Attendance Management" 
        subtitle="Track, filter, and record period-wise student attendance"
        action={
          <button className="btn btn-primary" onClick={openMarkModal} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={15} /> Mark Attendance
          </button>
        }
      />

      {message.text && (
        <div className={`toast-notification ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Filters Section */}
      <div className="card attendance-filter-card mb-4">
        <div className="attendance-filter-grid">
          <div className="attendance-field">
            <label className="attendance-label">Date</label>
            <input 
              type="date" 
              className="input" 
              value={date} 
              onChange={(e) => setDate(e.target.value)} 
            />
          </div>
          <div className="attendance-field">
            <label className="attendance-label">Year</label>
            <select className="input" value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
              <option value="All">All Years</option>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="attendance-field">
            <label className="attendance-label">Period</label>
            <select className="input" value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)}>
              {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="attendance-field search-field">
            <label className="attendance-label">Search Student</label>
            <div className="attendance-search-wrap">
              <Search size={14} className="search-icon" />
              <input 
                type="text" 
                className="input" 
                placeholder="Name or Register No..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="attendance-field">
            <label className="attendance-label">Status</label>
            <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="All">All Statuses</option>
              <option value="Present">Present</option>
              <option value="Absent">Absent</option>
              <option value="Late">Late</option>
              <option value="Not Marked">Not Marked</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-5 mb-4">
        <div className="stat-card stat-purple">
          <div className="stat-head">
            <span className="stat-title">Total Students</span>
            <div className="stat-icon purple">
              <Users size={16} />
            </div>
          </div>
          <div className="stat-value">{summary.total}</div>
          <div className="stat-meta">{filterYear === 'All' ? 'All years enrolled' : filterYear}</div>
        </div>

        <div className="stat-card stat-green">
          <div className="stat-head">
            <span className="stat-title">Present</span>
            <div className="stat-icon green">
              <UserCheck size={16} />
            </div>
          </div>
          <div className="stat-value" style={{ color: '#16a34a' }}>{summary.present}</div>
          <div className="stat-meta">In attendance</div>
        </div>

        <div className="stat-card stat-orange" style={{ borderTopColor: '#ef4444' }}>
          <div className="stat-head">
            <span className="stat-title">Absent</span>
            <div className="stat-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
              <UserX size={16} />
            </div>
          </div>
          <div className="stat-value" style={{ color: '#dc2626' }}>{summary.absent}</div>
          <div className="stat-meta">Marked absent</div>
        </div>

        <div className="stat-card stat-orange">
          <div className="stat-head">
            <span className="stat-title">Late</span>
            <div className="stat-icon orange">
              <Clock size={16} />
            </div>
          </div>
          <div className="stat-value" style={{ color: '#d97706' }}>{summary.late}</div>
          <div className="stat-meta">Tardy entries</div>
        </div>

        <div className="stat-card stat-blue">
          <div className="stat-head">
            <span className="stat-title">Attendance Rate</span>
            <div className="stat-icon blue">
              <Percent size={16} />
            </div>
          </div>
          <div className="stat-value" style={{ color: summary.marked === 0 ? '#94a3b8' : '#2563eb' }}>
            {summary.marked === 0 ? 'Not Marked' : `${summary.percentage}%`}
          </div>
          <div className="progress-track" style={{ height: 6 }}>
            <div className="progress-bar" style={{ width: `${summary.marked === 0 ? 0 : summary.percentage}%` }} />
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="card">
        {loading ? (
          <Loader />
        ) : filteredStudents.length === 0 ? (
          <EmptyState message="No students found matching the criteria." />
        ) : (
          <div className="table-responsive">
            <table className="table attendance-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Register No</th>
                  <th>Year</th>
                  <th>Period</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map(student => {
                  const att = attendance.find(a => a.studentId === student.id);
                  const status = att ? att.status : null;
                  
                  return (
                    <tr key={student.id}>
                      <td>
                        <div style={{ fontWeight: '600' }}>{student.name || '-'}</div>
                      </td>
                      <td style={{ fontFamily: 'monospace', color: '#2563eb', fontWeight: 600 }}>
                        {student.registerNumber || '-'}
                      </td>
                      <td>{student.year || '-'}</td>
                      <td>{filterPeriod}</td>
                      <td>{date}</td>
                      <td>
                        {status === 'Present' && <span className="pill success">Present</span>}
                        {status === 'Absent' && <span className="pill danger">Absent</span>}
                        {status === 'Late' && <span className="pill warning">Late</span>}
                        {!status && <span className="pill neutral">Not Marked</span>}
                      </td>
                      <td>
                        <div className="attendance-action-group">
                          <button 
                            className={`att-btn present ${status === 'Present' ? 'active' : ''}`}
                            onClick={() => handleStatusChange(student.id, 'Present', student)}
                          >
                            Present
                          </button>
                          <button 
                            className={`att-btn absent ${status === 'Absent' ? 'active' : ''}`}
                            onClick={() => handleStatusChange(student.id, 'Absent', student)}
                          >
                            Absent
                          </button>
                          <button 
                            className={`att-btn late ${status === 'Late' ? 'active' : ''}`}
                            onClick={() => handleStatusChange(student.id, 'Late', student)}
                          >
                            Late
                          </button>
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

      {/* Mark Attendance Modal */}
      {isMarkOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '800px', width: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h2 style={{margin: 0}}>Mark Attendance</h2>
              <button className="modal-close" onClick={() => setIsMarkOpen(false)} style={{background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer'}}>&times;</button>
            </div>
            
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1, padding: '1rem' }}>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Date</label>
                  <input type="date" className="form-control" value={markDate} onChange={handleMarkDateChange} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Year</label>
                  <select className="form-control" value={markYear} onChange={handleMarkYearChange}>
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Period</label>
                  <select className="form-control" value={markPeriod} onChange={handleMarkPeriodChange}>
                    {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
                <div style={{ fontWeight: '500' }}>Students: {markStudents.length}</div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-secondary btn-sm" onClick={resetMark} style={{padding: '0.25rem 0.5rem'}}>Reset</button>
                  <button className="btn btn-primary btn-sm" onClick={markAllPresent} style={{padding: '0.25rem 0.5rem'}}>Mark All Present</button>
                </div>
              </div>

              {markStudents.length === 0 ? (
                <EmptyState message={`No active students found for ${markYear}.`} />
              ) : (
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Reg No</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {markStudents.map(student => (
                        <tr key={student.id}>
                          <td>{student.name || '-'}</td>
                          <td>{student.registerNumber || '-'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button 
                                className={`btn btn-sm`}
                                style={{ padding: '0.25rem 0.5rem', backgroundColor: markStatus[student.id] === 'Present' ? '#10b981' : 'transparent', color: markStatus[student.id] === 'Present' ? '#fff' : '#10b981', border: '1px solid #10b981', borderRadius: '4px', cursor: 'pointer' }}
                                onClick={() => setMarkStatus(prev => ({ ...prev, [student.id]: 'Present' }))}
                              >
                                Present
                              </button>
                              <button 
                                className={`btn btn-sm`}
                                style={{ padding: '0.25rem 0.5rem', backgroundColor: markStatus[student.id] === 'Absent' ? '#ef4444' : 'transparent', color: markStatus[student.id] === 'Absent' ? '#fff' : '#ef4444', border: '1px solid #ef4444', borderRadius: '4px', cursor: 'pointer' }}
                                onClick={() => setMarkStatus(prev => ({ ...prev, [student.id]: 'Absent' }))}
                              >
                                Absent
                              </button>
                              <button 
                                className={`btn btn-sm`}
                                style={{ padding: '0.25rem 0.5rem', backgroundColor: markStatus[student.id] === 'Late' ? '#f59e0b' : 'transparent', color: markStatus[student.id] === 'Late' ? '#fff' : '#f59e0b', border: '1px solid #f59e0b', borderRadius: '4px', cursor: 'pointer' }}
                                onClick={() => setMarkStatus(prev => ({ ...prev, [student.id]: 'Late' }))}
                              >
                                Late
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ padding: '1rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setIsMarkOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveMarkAttendance} disabled={saving || markStudents.length === 0}>
                {saving ? 'Saving...' : 'Save Attendance'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAttendance;
