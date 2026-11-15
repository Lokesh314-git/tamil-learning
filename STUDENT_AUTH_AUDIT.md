# Student Authentication System Audit

**Project:** Tamil Learning – Academic Management & Student Portal  
**Target Environment:** Production (`https://tamil-learning.onrender.com`)  
**Firebase Project:** `tamil-learning-9f609` (Region: `us-central1`)  
**Date:** November 2026  
**Status:** Audit Completed & Architecture Hardened  

---

## 1. Executive Summary

This audit evaluates the transition of the student authentication system from legacy methods (SIF Number & MongoDB login dependencies) to a clean, production-grade **Firebase-Native Architecture**:
- **Authentication Credentials:** Registered Mobile Number (10 digits) + Date of Birth (`YYYY-MM-DD`). No OTP required.
- **Database of Record:** Firebase Firestore collection `users/{studentId}` is the single source of truth for student identity, status, and verification.
- **Backend Verification:** Firebase Cloud Functions v2 `onCall` (`studentLogin`), deployed to `us-central1`.
- **Session Authority:** Firebase Authentication (`signInWithCustomToken`). Students enter the portal solely with a verified Firebase Auth session. Fake local session tokens or localStorage auth bypasses are strictly eliminated.
- **MongoDB Decoupling:** MongoDB has been completely removed from the authentication pathway. MongoDB remains utilized exclusively for file attachments, GridFS buckets, and study materials.

---

## 2. Identified Vulnerabilities & Remediation Summary

| Area | Prior Implementation Issue | Remediation & Current Architecture |
|---|---|---|
| **Data Source for Auth** | MongoDB fallback lookups occurred in `functions/index.js` and `/login` in `studentMongoApi`. | Completely removed all MongoDB lookups from student authentication. Firestore `users` collection is now the exclusive source of truth. |
| **HTTP Login Endpoint** | `POST /login` on `studentMongoApi` was authenticating students against MongoDB directly. | Deprecated and disabled `POST /login` with HTTP 410 Gone. The frontend uses the Firebase Callable Function `studentLogin` exclusively. |
| **Client Session Bypass** | Failed callable invocations fell back to client-side Firestore reads and stored fake tokens (`session_${studentId}`) in `localStorage`. | Completely eliminated client-side fallback auth and fake session tokens. Authentication strictly enforces `signInWithCustomToken(auth, customToken)`. |
| **Firestore Security Rules** | `match /users/{userId}` had `allow read: if true;`, allowing unauthenticated public reads of student profiles. | Restricted to `allow read: if isAdmin() || isOwner(userId);`. Backend Cloud Function uses Firebase Admin SDK to look up student records securely. |
| **Automatic Mongo Migration** | `StudentsPage.jsx` had a `useEffect` triggering `migrateStudentProfilesToMongo` on mount. | Completely removed the automatic migration hook. |
| **Duplicate Mobile Handling** | Potential account collisions when multiple students shared a phone number. | Enforced duplicate mobile check: rejects login with `failed-precondition` when multiple active students share a phone, directing the user to their administrator. |

---

## 3. End-to-End Authentication Architecture

### 3.1 Authentication Workflow

```
[Student Device]
       │
       ▼  (1) Enters Mobile (10 digits) + Date of Birth (YYYY-MM-DD)
[StudentLogin Component]
       │
       ▼  (2) Calls studentAuthService.loginStudent()
[studentAuthService]
       │
       ▼  (3) httpsCallable(functions, 'studentLogin')
[Cloud Function: studentLogin (us-central1)]
       │
       ├─► Validates mobile length & format (10 digits)
       ├─► Validates DOB format and verifies not in the future
       ├─► Evaluates rate-limit (10 attempts / 15 mins per IP + phone)
       ├─► Queries Firestore: users.where('role', '==', 'student').where('mobileNumber' / 'phone', '==', cleanMobile)
       ├─► Checks for duplicate active accounts -> throws failed-precondition if > 1
       ├─► Checks active account status -> throws permission-denied if blocked/inactive/deleted
       ├─► Verifies stored DOB matches input DOB -> throws unauthenticated if mismatch
       ├─► Verifies / creates Firebase Auth account for studentUid
       ├─► Sets Custom Claims: { role: 'student', year, departmentId }
       └─► Issues Firebase Custom Auth Token
       │
       ▼  (4) Returns { success: true, customToken, student }
[AuthContext.jsx]
       │
       ▼  (5) signInWithCustomToken(auth, customToken)
[Firebase Authentication]
       │
       ▼  (6) Firebase Auth Session Confirmed (auth.currentUser.uid == studentUid)
[Firestore users/{studentUid}]
       │  (Permitted under: allow read: if isOwner(userId);)
       ▼
[Student Dashboard Loaded]
```

---

## 4. Error Message Standards

The system adheres to precise non-technical user feedback to prevent credential enumeration and ensure high usability:

1. **Credentials Mismatch / Record Not Found:**
   - Standard Message: `"Invalid mobile number or date of birth."`
2. **Authentication Service Network Error / Cloud Function Unavailable:**
   - Standard Message: `"Unable to connect to the authentication service. Please try again shortly."`
3. **Inactive or Blocked Account:**
   - Standard Message: `"Student account is inactive or blocked. Please contact your department admin."`
4. **Duplicate Mobile Numbers:**
   - Standard Message: `"Multiple student accounts are associated with this mobile number. Please contact your college administrator for correction."`
5. **Rate Limit Exceeded:**
   - Standard Message: `"Too many sign-in attempts. Please try again in 15 minutes."`

---

## 5. Security & Isolation Matrix

- **Backend Secret Protection:** Student passwords and tokens are never exposed. Custom tokens expire in 1 hour; Firebase Auth manages refresh tokens automatically.
- **Admin Accounts:** Root and faculty administrators authenticate via email and password using `signInWithEmailAndPassword()`. No student auth bypass or Mongo auth fallback affects administrative accounts.
- **Database Segregation:** Firestore manages all relational academic entities (students, attendances, marks, announcements, notes). MongoDB remains solely for document file storage (PDFs, study resources, GridFS streams).
- **Audit Tooling:** Built-in mobile audit modal on the Admin Students portal enables administrators to find and resolve duplicate phone numbers or missing dates of birth.
