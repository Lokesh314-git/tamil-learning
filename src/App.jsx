import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Routes, Route, Navigate } from 'react-router-dom';
import LoginSelection from './pages/auth/LoginSelection';
import StudentLogin from './pages/auth/StudentLogin';
import StudentSignup from './pages/auth/StudentSignup';
import AdminLogin from './pages/auth/AdminLogin';
import ProtectedRoute from './components/ProtectedRoute';
import PublicRoute from './components/PublicRoute';
import StudentAutoRedirect from './components/StudentAutoRedirect';
import AdminLayout from './components/AdminLayout';
import StudentLayout from './components/StudentLayout';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import StudentsPage from './pages/admin/StudentsPage';
import AdminClassesPage from './pages/admin/AdminClassesPage';
import AdminStudyMaterialsPage from './pages/admin/AdminStudyMaterialsPage';
import AdminUnitsPage from './pages/admin/AdminUnitsPage';
import AdminTestsPage from './pages/admin/AdminTestsPage';
import AdminAssignmentsPage from './pages/admin/AdminAssignmentsPage';
import AdminAnnouncementsPage from './pages/admin/AdminAnnouncementsPage';
import AdminNotificationsPage from './pages/admin/AdminNotificationsPage';
import AdminFeedbackPage from './pages/admin/AdminFeedbackPage';
import AdminDownloadsPage from './pages/admin/AdminDownloadsPage';
import AdminStudentNotesPage from './pages/admin/AdminStudentNotesPage';
import AdminAttendancePage from './pages/admin/AdminAttendancePage';
import AdminLanguagePage from './pages/admin/AdminLanguagePage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import AdminYear from './pages/admin/AdminYear';
import AdminReports from './pages/admin/AdminReports';
import AdminProfile from './pages/admin/AdminProfile';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminStudentDetail from './pages/admin/AdminStudentDetail';
import AdminThirukkural from './pages/admin/AdminThirukkural';

// Student Portal Pages
import StudentDashboard from './pages/student/StudentDashboard';
import StudentStudyMaterials from './pages/student/StudentStudyMaterials';
import StudentUnits from './pages/student/StudentUnits';
import StudentTests from './pages/student/StudentTests';
import StudentTasks from './pages/student/StudentTasks';
import StudentAttendance from './pages/student/StudentAttendance';
import StudentReports from './pages/student/StudentReports';
import StudentNotices from './pages/student/StudentNotices';
import StudentNotifications from './pages/student/StudentNotifications';
import StudentDownloads from './pages/student/StudentDownloads';
import StudentNotes from './pages/student/StudentNotes';
import StudentFeedback from './pages/student/StudentFeedback';
import StudentProfile from './pages/student/StudentProfile';

const App = () => {
  return (
    <>
      <Helmet>
        <title>Tamil Learning Platform | Academic Management & Student Portal</title>
        <meta name="description" content="Tamil Learning Platform - Web-based Academic Management System & Student Portal." />
        <link rel="canonical" href="https://tamillearning2024-sys.github.io/Tamil/" />
      </Helmet>
      <Routes>
        <Route path="/" element={<Navigate to="/auth" replace />} />
        
        {/* Public Authentication Routes */}
        <Route element={<PublicRoute />}>
          <Route path="/auth" element={<LoginSelection />} />
          <Route path="/auth/student-login" element={<StudentLogin />} />
          <Route path="/auth/student-signup" element={<StudentSignup />} />
          <Route path="/auth/admin-login" element={<AdminLogin />} />
        </Route>

        {/* Protected Admin Routes */}
        <Route element={<ProtectedRoute role="admin" />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            
            {/* Academic Core */}
            <Route path="students" element={<StudentsPage />} />
            <Route path="classes" element={<AdminClassesPage />} />
            <Route path="departments" element={<AdminClassesPage />} />
            <Route path="study-materials" element={<AdminStudyMaterialsPage />} />
            <Route path="units" element={<AdminUnitsPage />} />
            <Route path="tests" element={<AdminTestsPage />} />
            <Route path="assignments" element={<AdminAssignmentsPage />} />
            <Route path="tasks" element={<AdminAssignmentsPage />} />
            <Route path="announcements" element={<AdminAnnouncementsPage />} />
            <Route path="notifications" element={<AdminNotificationsPage />} />
            <Route path="feedback" element={<AdminFeedbackPage />} />
            <Route path="attendance" element={<AdminAttendancePage />} />
            <Route path="downloads" element={<AdminDownloadsPage />} />
            <Route path="notes" element={<AdminStudentNotesPage />} />
            
            {/* Year specific views */}
            <Route path="year/:yearId/dashboard" element={<AdminYear />} />
            <Route path="year/:yearId/units" element={<AdminUnitsPage />} />
            <Route path="year/:yearId/tests" element={<AdminTestsPage />} />
            <Route path="year/:yearId/reports" element={<AdminReports />} />
            <Route path="year/:yearId/students" element={<StudentsPage />} />
            
            {/* System Settings & Utilities */}
            <Route path="thirukkural" element={<AdminThirukkural />} />
            <Route path="language" element={<AdminLanguagePage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="student/:studentId" element={<AdminStudentDetail />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="profile" element={<AdminProfile />} />
          </Route>
        </Route>

        {/* Protected Student Portal Routes */}
        <Route element={<ProtectedRoute role="student" />}>
          <Route path="/student" element={<StudentLayout />}>
            <Route index element={<StudentAutoRedirect />} />
            <Route path="dashboard" element={<StudentAutoRedirect />} />
            <Route path="year/:year/dashboard" element={<StudentDashboard />} />
            <Route path="year/:year/materials" element={<StudentStudyMaterials />} />
            <Route path="year/:year/units" element={<StudentUnits />} />
            <Route path="year/:year/tests" element={<StudentTests />} />
            <Route path="year/:year/tasks" element={<StudentTasks />} />
            <Route path="year/:year/assignments" element={<StudentTasks />} />
            <Route path="year/:year/attendance" element={<StudentAttendance />} />
            <Route path="year/:year/reports" element={<StudentReports />} />
            <Route path="year/:year/notices" element={<StudentNotices />} />
            <Route path="year/:year/notifications" element={<StudentNotifications />} />
            <Route path="year/:year/downloads" element={<StudentDownloads />} />
            <Route path="year/:year/notes" element={<StudentNotes />} />
            <Route path="year/:year/feedback" element={<StudentFeedback />} />
            <Route path="profile" element={<StudentProfile />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    </>
  );
};

export default App;
