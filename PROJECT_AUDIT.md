# PROJECT AUDIT: Tamil Learning – Academic Management & Student Portal

**Audit Date:** November 2026  
**Auditor:** Senior Full-Stack Software Architect, React Developer, Firebase Security Engineer, MongoDB Engineer, UI/UX Designer & QA Automation Engineer  
**Project:** Tamil Learning – Academic Management & Student Portal  
**Platform Stack:** React 18, Vite 5, Firebase Auth, Cloud Firestore, Firebase Cloud Functions (v2), MongoDB Atlas & GridFS, Vite PWA, Lucide React  

---

## 1. Executive Summary

A comprehensive architectural, security, database, and UI/UX audit was conducted across the entire Tamil Learning codebase. The existing application possesses rich academic management features (student management, units, study materials, online assessments, attendance, assignments, announcements, notes, feedback, and reports), but suffered from critical security vulnerabilities—specifically unrestricted Firestore rules (`allow read, write: if true;`), client-side simulated student authentication with fake LocalStorage tokens, client-side assessment evaluation and score submission, lack of Firebase Custom Auth Token issuance, incomplete scheduled notification delivery, missing client FCM service worker registration, and monolithic bundle size without route code splitting.

This audit details each identified problem, affected files, severity level, recommended correction, and verification procedure.

---

## 2. Audit Findings by Category

### Category A: Authentication, Authorization & Route Protection

#### AUDIT-AUTH-01: Insecure Client-Side Student Authentication & Fake Tokens
- **Severity:** CRITICAL
- **Affected Files:** `src/services/studentMongoApi.js`, `src/context/AuthContext.jsx`, `src/pages/auth/StudentLogin.jsx`, `functions/index.js`
- **Description:** 
  Student login was performed completely on the browser by querying the `users` collection directly (`firestoreWhere('role', '==', 'student')`) and scanning documents on the client for matching DOB and SIF/mobile numbers. Upon match, the client stored a simulated session with `token: 'local_token_' + uid` in `localStorage`. Firebase Auth was never authenticated (`auth.currentUser` remained `null`). Because `request.auth` was null, Firestore security rules could not enforce authenticated user access, forcing all Firestore rules to remain public.
- **Recommended Correction:**
  1. Implement a secure Firebase Cloud Function / backend endpoint (`studentLogin`) that takes `{ identifier, dob }` with rate-limiting.
  2. Verify credentials server-side using the Firebase Admin SDK against Firestore/MongoDB records.
  3. Ensure a Firebase Auth user account exists for the student UID.
  4. Issue a legitimate Firebase Custom Auth Token via `admin.auth().createCustomToken(studentUid, { role: 'student' })`.
  5. In `AuthContext.jsx`, authenticate the student using Firebase Auth `signInWithCustomToken(auth, customToken)`.
  6. Let Firebase Auth manage browser persistence and session restoration securely.
- **Testing Procedure:**
  Sign in with valid SIF + DOB; verify `auth.currentUser` is populated, custom token is exchanged, and `onAuthStateChanged` restores the session on page refresh. Attempt invalid credentials and verify generic error response without database enumeration.

---

#### AUDIT-AUTH-02: Missing Role Export in AuthContext Breaking Badge Listeners
- **Severity:** HIGH
- **Affected Files:** `src/context/AuthContext.jsx`, `src/context/NotificationBadgeContext.jsx`
- **Description:**
  `NotificationBadgeContext.jsx` attempts to destructure `const { user, profile, role } = useAuth()`. However, `AuthContext.jsx` never included `role` in its exported `value` object. This caused `role` to be `undefined`, causing `role !== 'admin'` checks to fail or evaluate incorrectly, disrupting admin badge listeners and real-time toast popups.
- **Recommended Correction:**
  Export `role: profile?.role || (user?.email ? 'admin' : (user ? 'student' : null))` directly in `AuthContext` value and ensure both profile and token claims are respected.
- **Testing Procedure:**
  Log in as admin; verify `role === 'admin'` in `useAuth()` and verify admin badge counts and notification listeners attach properly.

---

#### AUDIT-AUTH-03: Client-Side Admin Auto-Creation in AdminDashboard
- **Severity:** HIGH
- **Affected Files:** `src/pages/admin/AdminDashboard.jsx`
- **Description:**
  `AdminDashboard.jsx` executed an `initAdminDoc` routine that checked if `users/{currentUser.uid}` existed, and if not, attempted to create it with `role: 'admin'`. If an unprivileged user ever navigated to `/admin/dashboard`, it could trigger client-side admin self-promotion if rules were permissive.
- **Recommended Correction:**
  Remove client-side self-elevation. Admin account creation and role assignment must be strictly restricted to server-side Admin SDK or verified root admin management.
- **Testing Procedure:**
  Verify that non-admin authenticated users cannot create or modify their own `users` document or grant themselves the `admin` role.

---

### Category B: Cloud Firestore Security Rules

#### AUDIT-SEC-01: Public Read/Write on All Collections & Catch-All Rule
- **Severity:** CRITICAL
- **Affected Files:** `firestore.rules`
- **Description:**
  The existing `firestore.rules` file contained `allow read, write: if true;` for every single collection (`users`, `departments`, `classes`, `units`, `study_materials`, `downloads`, `tests`, `results`, `tasks`, `task_submissions`, `announcements`, `notifications`, `attendance`, `notes`, `feedback`, `documents`, `mongo_file_chunks`, etc.) as well as a catch-all `match /{document=**} { allow read, write: if true; }`.
  Any anonymous internet user could wipe or manipulate the entire database using client SDKs without any credentials.
- **Recommended Correction:**
  Completely rewrite `firestore.rules`:
  1. Remove the catch-all `match /{document=**}` wildcard.
  2. Implement helper functions: `signedIn()`, `isAdmin()`, `isOwner(uid)`.
  3. `users/{userId}`: Admin full access; students can read own profile; students can only update permitted personal fields (`address`, `parentName`, `parentMobile`, `emergencyContact`, `bloodGroup`, `photoUrl`, `phone`, `profileUpdatedAt`).
  4. Academic curriculum (`departments`, `classes`, `units`, `study_materials`, `downloads`, `thirukkurals`, `settings`): Public/student read when signed in; write ONLY by admin.
  5. Assessments (`tests`): Read/write admin only. (`publishedTests`): Read by signedIn; write by admin.
  6. Results (`results`): Read by admin or student owner (`resource.data.studentId == request.auth.uid`); create by admin or student owner; update/delete by admin only.
  7. Tasks & Submissions (`tasks`, `task_submissions`): Tasks read by signedIn, write by admin. Submissions read by admin or student owner; create/update by student owner without altering grades.
  8. Personal data (`attendance`, `notes`, `student_preferences`): Read/write strictly scoped to owner (`studentId == request.auth.uid`) and admin.
  9. System & Sync collections (`mongo_file_chunks`, `mongo_sync_queue`, `logs`, `auditLogs`): Admin only.
- **Testing Procedure:**
  Test unauthenticated reads/writes (must fail). Test student accessing another student's results/notes/attendance (must fail). Test student modifying admin collections (must fail). Test admin managing records (must succeed).

---

### Category C: Assessment Data Security & Question Leakage

#### AUDIT-SEC-02: Client-Side Test Evaluation and Plaintext Correct Answer Exposure
- **Severity:** HIGH
- **Affected Files:** `src/pages/student/StudentTests.jsx`, `src/services/studentMongoApi.js`, `functions/index.js`
- **Description:**
  `StudentTests.jsx` was listening to `collection(db, 'tests')`, which contained full questions along with `correctAnswer` indices. A student could inspect browser state/network traffic to view all answers before taking the test. Furthermore, upon submitting, the client calculated its own score (`breakdown`, `score`, `percentage`) and wrote it directly to Firestore via `firestoreSetDoc(resultDocRef, resultData)`. A student could submit an arbitrary score of 100% without answering questions.
- **Recommended Correction:**
  1. Ensure students read questions from `publishedTests` (which strips `correctAnswer` and `explanation`).
  2. Provide a secure backend assessment evaluation endpoint / callable function (`submitTest`) that accepts `{ testId, answers, timeTakenMinutes }`, retrieves the official test questions and answers on the server, calculates the verified score, writes the result to `results/{studentId}_{testId}`, and returns the verified breakdown.
  3. Allow students to view their verified breakdown and review their completed assessments safely.
- **Testing Procedure:**
  Verify that `publishedTests` contains no `correctAnswer` keys. Submit test answers and verify score is strictly calculated and recorded by server logic.

---

### Category D: Student Data Privacy & Information Leakage

#### AUDIT-PRIV-01: Unfiltered Institution-Wide Queries in Student Feedback & Notifications
- **Severity:** HIGH
- **Affected Files:** `src/pages/student/StudentFeedback.jsx`, `src/pages/student/StudentNotifications.jsx`
- **Description:**
  `StudentFeedback.jsx` listened to `collection(db, 'feedback')` without query filtering, fetching all feedback and student queries across all departments, then filtering in memory. Similarly, `StudentNotifications.jsx` fetched all notification documents. Under secure Firestore rules, an unfiltered collection listener on private records will be rejected by the rules engine.
- **Recommended Correction:**
  1. Update `StudentFeedback.jsx` to query with `where('studentId', '==', user.uid)` so only the logged-in student's feedback is requested from Firestore.
  2. In `StudentNotifications.jsx`, query notifications targeted to the student's year, department, or individual student ID.
- **Testing Procedure:**
  Verify query in `StudentFeedback.jsx` only requests the current student's records and passes strict Firestore security rule evaluation.

---

### Category E: Notification Architecture & FCM Delivery

#### AUDIT-NOTIF-01: Scheduled Notifications Not Delivered (Missing Cloud Scheduler)
- **Severity:** HIGH
- **Affected Files:** `functions/index.js`, `src/utils/testNotificationService.js`, `src/pages/admin/AdminNotificationsPage.jsx`
- **Description:**
  In `functions/index.js`, `onTestNotificationCreated` specifically checked `if (data.isScheduled && data.scheduledFor) ... return;` to skip immediate push for future notifications. However, no cron schedule or queue existed to process them when the scheduled time arrived. Any scheduled notification remained permanently undelivered.
- **Recommended Correction:**
  1. Add a scheduled Cloud Function (`deliverScheduledNotifications`) running periodically (e.g., every 5 minutes via Cloud Scheduler) that queries `notifications` where `status == 'scheduled' && scheduledFor <= now()`, broadcasts FCM to topics, and updates `status = 'sent'`.
  2. Add a callable function (`triggerScheduledNotificationCheck`) for admin manual trigger or fallback execution.
- **Testing Procedure:**
  Schedule a notification for 1 minute in the future; trigger the scheduler and verify delivery status transitions to `'sent'`.

---

#### AUDIT-NOTIF-02: Missing Client-Side FCM Service Worker & Device Registration
- **Severity:** HIGH
- **Affected Files:** `src/firebase.js`, `public/firebase-messaging-sw.js`, `src/services/notificationService.js`
- **Description:**
  While backend Cloud Functions sent push notifications to FCM topics (`all_students`, `year_...`, `dept_...`), the web frontend lacked FCM client setup: `getMessaging` was not initialized, device tokens were never requested or stored, and `public/firebase-messaging-sw.js` did not exist. Students never received native push notifications.
- **Recommended Correction:**
  1. Create `public/firebase-messaging-sw.js` with Firebase Messaging service worker configuration.
  2. Implement client FCM token registration in `src/services/fcmService.js` that requests notification permissions, retrieves the FCM token via `getToken(messaging, { vapidKey })`, and saves it under the user's profile in Firestore.
  3. Clean up tokens on logout.
- **Testing Procedure:**
  Grant notification permission in browser; verify token is registered and background messages are handled by the service worker.

---

#### AUDIT-NOTIF-03: Artificial Promise.race Timeout in Admin Notifications
- **Severity:** MEDIUM
- **Affected Files:** `src/pages/admin/AdminNotificationsPage.jsx`
- **Description:**
  `AdminNotificationsPage.jsx` wrapped the Firestore `addDoc` in `Promise.race([addDoc(...), new Promise(resolve => setTimeout(resolve, 2500))])`, displaying "Notification dispatched successfully!" even if the write was still pending or failed.
- **Recommended Correction:**
  Await the actual `addDoc` promise directly and only report success once Firestore confirms the operation.
- **Testing Procedure:**
  Send a broadcast notification and verify success alert displays only upon successful document creation.

---

### Category F: File Management & Memory Leaks

#### AUDIT-FILE-01: Object URL Memory Leak in Blob Handling
- **Severity:** MEDIUM
- **Affected Files:** `src/utils/fileUpload.js`, `src/services/mongoService.js`
- **Description:**
  `openOrDownloadFile` generated Blob URLs via `URL.createObjectURL(blob)` for file downloads and previews, but did not consistently revoke them via `URL.revokeObjectURL(url)`. When students opened multiple PDF study materials or unit notes, browser memory accumulated.
- **Recommended Correction:**
  Add automatic revocation after a safe timeout (e.g., 60 seconds) or immediately after download link trigger.
- **Testing Procedure:**
  Download and open multiple documents; verify blob URLs are scheduled for disposal.

---

### Category G: UI/UX & Responsive Layouts

#### AUDIT-UI-01: Mobile Navigation Drawer Lacking Scroll Lock and Escape Key Handler
- **Severity:** MEDIUM
- **Affected Files:** `src/components/StudentLayout.jsx`, `src/components/AdminLayout.jsx`
- **Description:**
  When opening the mobile drawer in `StudentLayout`, background body scrolling remained active, allowing the page underneath to scroll. Additionally, pressing the `Escape` key did not close the open mobile navigation drawer.
- **Recommended Correction:**
  1. Add body scroll lock (`document.body.style.overflow = 'hidden'`) when drawer is open on mobile in `StudentLayout.jsx`.
  2. Add `keydown` event listener for the `Escape` key to close the drawer smoothly on both Admin and Student layouts.
- **Testing Procedure:**
  Open drawer on mobile viewport (375px); verify body cannot scroll underneath and pressing Escape closes the drawer.

---

### Category H: Build & Performance Optimization

#### AUDIT-PERF-01: Monolithic Bundle Size & Lack of Route Code Splitting
- **Severity:** MEDIUM
- **Affected Files:** `src/App.jsx`, `vite.config.js`
- **Description:**
  All 30+ admin and student pages were statically imported in `App.jsx`, generating a single 1.74 MB JavaScript bundle (`index-DkByHjih.js`), triggering Rollup's chunk size warning (>500 kB) and causing slow initial page loads on mobile networks.
- **Recommended Correction:**
  Implement React `lazy()` and `Suspense` with `Loader` fallback for all admin and student route components.
  Configure Rollup manual chunking in `vite.config.js` (vendor chunks for `react`, `firebase`, `lucide-react`, `xlsx`).
- **Testing Procedure:**
  Run `npm run build` and verify main bundle is significantly smaller with clean chunking under 500 kB.

---

#### AUDIT-BUILD-01: Missing ESLint Configuration
- **Severity:** LOW
- **Affected Files:** `.eslintrc.cjs`
- **Description:**
  `npm run lint` failed with code 1 because ESLint could not find a configuration file in the project directory.
- **Recommended Correction:**
  Create `.eslintrc.cjs` with appropriate rules for React 18, Vite, and ES modules.
- **Testing Procedure:**
  Run `npm run lint` and verify it runs cleanly without missing config errors.

---

## 3. Audit Summary Table

| Issue ID | Area | Severity | Status |
|---|---|---|---|
| AUDIT-AUTH-01 | Secure Student Authentication via Custom Token | CRITICAL | In Progress |
| AUDIT-SEC-01 | Firestore Security Rules Redesign | CRITICAL | In Progress |
| AUDIT-SEC-02 | Server-Side Assessment Evaluation | HIGH | In Progress |
| AUDIT-PRIV-01 | Student Feedback & Notification Data Isolation | HIGH | In Progress |
| AUDIT-NOTIF-01 | Scheduled Notification Cloud Scheduler | HIGH | In Progress |
| AUDIT-NOTIF-02 | Client FCM Service Worker & Token Registration | HIGH | In Progress |
| AUDIT-AUTH-02 | Role Export in AuthContext | HIGH | In Progress |
| AUDIT-AUTH-03 | Admin Self-Promotion in AdminDashboard | HIGH | In Progress |
| AUDIT-FILE-01 | Blob URL Memory Leak Cleanup | MEDIUM | In Progress |
| AUDIT-NOTIF-03 | Admin Notification Async Accuracy | MEDIUM | In Progress |
| AUDIT-UI-01 | Mobile Navigation Scroll Lock & Escape Key | MEDIUM | In Progress |
| AUDIT-PERF-01 | Route Lazy Loading & Bundle Code Splitting | MEDIUM | In Progress |
| AUDIT-BUILD-01 | ESLint Configuration Setup | LOW | In Progress |

---

*This document serves as the formal record for Phase 1 of the production hardening audit. Implementation of all identified corrections proceeds immediately across subsequent phases.*

