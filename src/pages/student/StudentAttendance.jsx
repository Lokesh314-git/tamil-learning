import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, onSnapshot, query, where } from '../../services/studentMongoApi';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import StudentPageHeader from '../../components/studentui/StudentPageHeader';
import StudentContentCard from '../../components/studentui/StudentContentCard';
import StudentStatCard from '../../components/studentui/StudentStatCard';
import EmptyState from '../../components/EmptyState';
import Loader from '../../components/Loader';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  XCircle,
  Clock,
  Award,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  BarChart2,
  ShieldCheck,
  BookOpen
} from 'lucide-react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const StudentAttendance = () => {
  const { year } = useParams();
  const { profile, user } = useAuth();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const qAtt = query(collection(db, 'attendance'), where('studentId', '==', user.uid));
    const unsub = onSnapshot(qAtt, (snap) => {
      setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.warn('Attendance listener error:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user?.uid]);

  // Overall Statistics
  const stats = useMemo(() => {
    let present = 0;
    let absent = 0;
    let od = 0;
    let leave = 0;

    records.forEach((r) => {
      const st = (r.status || 'present').toLowerCase();
      if (st === 'present') present++;
      else if (st === 'absent') absent++;
      else if (st === 'od' || st === 'on duty') od++;
      else if (st === 'leave') leave++;
    });

    const total = records.length;
    // If no individual records yet, fallback to profile attendance percentage
    const profileStats = profile?.attendanceStats || profile?.attendance || {};
    const fallbackTotal = Number(profileStats.totalDays) || 0;
    const percentage = total > 0
      ? Math.round(((present + od) / total) * 100)
      : (profile?.attendancePercentage != null ? Number(profile.attendancePercentage) : 0);

    return {
      total: total || fallbackTotal,
      present: total > 0 ? present : Number(profileStats.presentDays) || 0,
      absent: total > 0 ? absent : Number(profileStats.absentDays) || 0,
      od: total > 0 ? od : Number(profileStats.odDays) || 0,
      leave: total > 0 ? leave : Number(profileStats.leaveDays) || 0,
      percentage
    };
  }, [records, profile?.attendancePercentage]);

  // Calendar Day Generation
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const recordMapByDate = {};
    records.forEach((r) => {
      if (r.date) recordMapByDate[r.date] = r;
    });

    const days = [];
    // Padding for days before month start
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ dayNumber: null });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      const rec = recordMapByDate[dateStr];
      days.push({
        dayNumber: day,
        dateStr,
        status: rec ? rec.status.toLowerCase() : null,
        remarks: rec?.remarks || ''
      });
    }

    return days;
  }, [currentYear, currentMonth, records]);

  // Subject breakdown is derived from the live attendance records.
  const subjectStats = useMemo(() => {
    const groups = records.reduce((acc, record) => {
      if (!record.subject) return acc;
      const subject = String(record.subject);
      acc[subject] ||= { subject, total: 0, present: 0 };
      acc[subject].total += 1;
      if (['present', 'od', 'on duty'].includes(String(record.status || '').toLowerCase())) acc[subject].present += 1;
      return acc;
    }, {});
    return Object.values(groups).map((item) => ({ ...item, percentage: Math.round(item.present / item.total * 100) }));
  }, [records]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  return (
    <div className="student-page grid" style={{ gap: 16 }}>
      <StudentPageHeader
        title="Attendance Management"
        subtitle={`${year} / ${profile?.departmentName || 'Department'} • Daily Roster & Eligibility Analytics`}
      />

      {/* Low Attendance Warning or Success Alert */}
      {stats.total === 0 ? (
        <div className="alert info">No attendance records have been published for your account yet.</div>
      ) : stats.percentage < 75 ? (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef4444',
          borderRadius: 12,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          color: '#b91c1c'
        }}>
          <AlertTriangle size={24} />
          <div>
            <strong>Attendance Warning: {stats.percentage}%</strong>
            <div style={{ fontSize: 13, marginTop: 2 }}>
              Your current attendance is below the mandatory 75% threshold required for semester university examinations. Please contact your department coordinator.
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          background: 'rgba(34, 197, 94, 0.08)',
          border: '1px solid #22c55e',
          borderRadius: 12,
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          color: '#15803d'
        }}>
          <ShieldCheck size={22} />
          <div style={{ fontSize: 13 }}>
            <strong>Good Standing ({stats.percentage}%):</strong> You satisfy the minimum 75% attendance criteria and are eligible for all internal assessments and end-semester examinations.
          </div>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-4" style={{ gap: 14 }}>
        <StudentStatCard
          icon={<CheckCircle2 size={20} />}
          title="Present Days"
          value={stats.present}
          subtitle={`Out of ${stats.total} total days`}
          tone="accent"
        />
        <StudentStatCard
          icon={<XCircle size={20} />}
          title="Absent Days"
          value={stats.absent}
          subtitle="Unexcused absences"
          tone={stats.absent > 5 ? "danger" : "neutral"}
        />
        <StudentStatCard
          icon={<Award size={20} />}
          title="On Duty (OD)"
          value={stats.od}
          subtitle="Authorized department duties"
          tone="primary"
        />
        <StudentStatCard
          icon={<TrendingUp size={20} />}
          title="Overall Attendance"
          value={`${stats.percentage}%`}
          subtitle="Target: ≥ 75%"
          tone={stats.percentage >= 75 ? "primary" : "danger"}
        />
      </div>

      {/* 2 Column Layout: Interactive Calendar + Subject-wise Breakdown */}
      <div className="grid grid-2" style={{ gap: 16 }}>
        {/* Interactive Calendar Card */}
        <StudentContentCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              {MONTH_NAMES[currentMonth]} {currentYear} Calendar
            </h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="button secondary" onClick={handlePrevMonth} style={{ padding: 6 }}>
                <ChevronLeft size={16} />
              </button>
              <button className="button secondary" onClick={handleNextMonth} style={{ padding: 6 }}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Days of week header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontWeight: 600, fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
          </div>

          {/* Days Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {calendarDays.map((d, idx) => {
              if (!d.dayNumber) {
                return <div key={idx} style={{ height: 38 }} />;
              }

              let bg = 'var(--color-bg-secondary)';
              let color = 'var(--color-text)';
              let border = '1px solid var(--color-border)';

              if (d.status === 'present') {
                bg = 'rgba(34, 197, 94, 0.15)';
                color = 'var(--color-success)';
                border = '1px solid var(--color-success)';
              } else if (d.status === 'absent') {
                bg = 'rgba(239, 68, 68, 0.15)';
                color = 'var(--color-danger)';
                border = '1px solid var(--color-danger)';
              } else if (d.status === 'od') {
                bg = 'rgba(59, 130, 246, 0.15)';
                color = 'var(--color-primary)';
                border = '1px solid var(--color-primary)';
              } else if (d.status === 'leave') {
                bg = 'rgba(234, 179, 8, 0.15)';
                color = 'var(--color-warning)';
                border = '1px solid var(--color-warning)';
              }

              return (
                <div
                  key={idx}
                  title={d.status ? `${d.dateStr}: ${d.status.toUpperCase()}` : d.dateStr}
                  style={{
                    height: 38,
                    borderRadius: 8,
                    background: bg,
                    color,
                    border,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 700
                  }}
                >
                  {d.dayNumber}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 16, fontSize: 11, color: 'var(--color-text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-success)' }} /> Present
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-danger)' }} /> Absent
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-primary)' }} /> On Duty
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--color-warning)' }} /> Leave
            </span>
          </div>
        </StudentContentCard>

        {/* Subject-Wise Attendance Breakdown */}
        <StudentContentCard>
          <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>
            Subject-wise Attendance Roster
          </h3>

          <div className="grid" style={{ gap: 12 }}>
            {subjectStats.length === 0 ? <p>No subject-wise attendance has been recorded.</p> : subjectStats.map((sub, idx) => (
              <div key={idx} style={{ padding: '12px', borderRadius: 8, background: 'var(--color-bg-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{sub.subject}</span>
                  <span style={{ fontWeight: 800, fontSize: 13, color: sub.percentage >= 75 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {sub.percentage}%
                  </span>
                </div>

                {/* Progress bar */}
                <div style={{ height: 6, width: '100%', background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ height: '100%', width: `${sub.percentage}%`, background: sub.percentage >= 75 ? 'var(--color-success)' : 'var(--color-danger)', borderRadius: 3 }} />
                </div>

                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Attended: {sub.present} / {sub.total} sessions</span>
                  <span>Absents: {sub.total - sub.present}</span>
                </div>
              </div>
            ))}
          </div>
        </StudentContentCard>
      </div>
    </div>
  );
};

export default StudentAttendance;
