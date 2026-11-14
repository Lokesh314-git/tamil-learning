import React, { Suspense, lazy } from 'react';
import { Helmet } from 'react-helmet-async';
import { Routes, Route, Navigate } from 'react-router-dom';
import Loader from './components/Loader';
import ProtectedRoute from './components/ProtectedRoute';
import PublicRoute from './components/PublicRoute';
import StudentAutoRedirect from './components/StudentAutoRedirect';
import AdminLayout from './components/AdminLayout';
import StudentLayout from './components/StudentLayout';

// Public Authentication Pages (Code-split)
const LoginSelection = lazy(() => import('./pages/auth/LoginSelection'));
const StudentLogin = lazy(() => import('./pages/auth/StudentLogin'));
const AdminLogin = lazy(() => import('./pages/auth/AdminLogin'));

// Admin Pages (Code-split)
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const StudentsPage = lazy(() => import('./pages/admin/StudentsPage'));
const AdminClassesPage = lazy(() => import('./pages/admin/AdminClassesPage'));
const AdminStudyMaterialsPage = lazy(() => import('./pages/admin/AdminStudyMaterialsPage'));
const AdminUnitsPage = lazy(() => import('./pages/admin/AdminUnitsPage'));
const AdminTestsPage = lazy(() => import('./pages/admin/AdminTestsPage'));
const AdminAssignmentsPage = lazy(() => import('./pages/admin/AdminAssignmentsPage'));
const AdminAnnouncementsPage = lazy(() => import('./pages/admin/AdminAnnouncementsPage'));
const AdminNotificationsPage = lazy(() => import('./pages/admin/AdminNotificationsPage'));
const AdminFeedbackPage = lazy(() => import('./pages/admin/AdminFeedbackPage'));
const AdminDownloadsPage = lazy(() => import('./pages/admin/AdminDownloadsPage'));
const AdminStudentNotesPage = lazy(() => import('./pages/admin/AdminStudentNotesPage'));
const AdminAttendancePage = lazy(() => import('./pages/admin/AdminAttendancePage'));
const AdminLanguagePage = lazy(() => import('./pages/admin/AdminLanguagePage'));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'));
const AdminYear = lazy(() => import('./pages/admin/AdminYear'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminProfile = lazy(() => import('./pages/admin/AdminProfile'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminStudentDetail = lazy(() => import('./pages/admin/AdminStudentDetail'));
const AdminThirukkural = lazy(() => import('./pages/admin/AdminThirukkural'));

// Student Portal Pages (Code-split)
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'));
const StudentStudyMaterials = lazy(() => import('./pages/student/StudentStudyMaterials'));
const StudentUnits = lazy(() => import('./pages/student/StudentUnits'));
const StudentTests = lazy(() => import('./pages/student/StudentTests'));
const StudentTasks = lazy(() => import('./pages/student/StudentTasks'));
const StudentAttendance = lazy(() => import('./pages/student/StudentAttendance'));
const StudentReports = lazy(() => import('./pages/student/StudentReports'));
const StudentNotices = lazy(() => import('./pages/student/StudentNotices'));
const StudentNotifications = lazy(() => import('./pages/student/StudentNotifications'));
const StudentDownloads = lazy(() => import('./pages/student/StudentDownloads'));
const StudentNotes = lazy(() => import('./pages/student/StudentNotes'));
const StudentFeedback = lazy(() => import('./pages/student/StudentFeedback'));
const StudentProfile = lazy(() => import('./pages/student/StudentProfile'));

const App = () => {
  return (
    <>
      <Helmet>
        <title>Tamil Learning Platform | Academic Management & Student Portal</title>
        <meta name="description" content="Tamil Learning Platform - Web-based Academic Management System & Student Portal." />
        <link rel="canonical" href="https://tamillearning2024-sys.github.io/Tamil/" />
      </Helmet>
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/auth" replace />} />
          
          {/* Public Authentication Routes */}
          <Route element={<PublicRoute />}>
            <Route path="/auth" element={<LoginSelection />} />
            <Route path="/auth/student-login" element={<StudentLogin />} />
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
      </Suspense>
    </>
  );
};

export default App;
