# Student Login & Authentication Test Report

**Project:** Tamil Learning – Academic Management & Student Portal  
**Test Suite:** `tests/studentAuthScenarios.test.js` & `tests/studentImport.test.js`  
**Execution Engine:** Node.js v20+ Native Test Runner (`node --test`)  
**Status:** 25/25 Tests Passing (100% Pass Rate)  
**Execution Date:** November 2026  

---

## 1. Test Suite Summary

All unit tests and end-to-end authentication scenarios were executed against the Firestore-only architecture. No MongoDB dependencies were involved in student authentication verification.

```
✔ 1. Correct mobile number + correct DOB (4.34ms)
✔ 2. Correct mobile number + incorrect DOB (0.24ms)
✔ 3. Incorrect mobile number + correct DOB (0.14ms)
✔ 4. Missing mobile number (0.28ms)
✔ 5. Missing DOB (0.23ms)
✔ 6. Invalid mobile number (< 10 digits or alphanumeric) (0.15ms)
✔ 7. Future DOB rejection (0.16ms)
✔ 8. Duplicate mobile numbers (multiple active students with same mobile) (0.18ms)
✔ 9. Student with missing DOB in database (0.14ms)
✔ 10. Blocked student rejection (0.28ms)
✔ 11. Deleted student rejection (0.16ms)
✔ 12. Unauthorized user / non-student (0.19ms)
✔ 13. Authenticated session requires genuine Firebase Auth custom token (0.16ms)
✔ 14. Admin login remains unaffected (0.09ms)
✔ 15. Firebase Function unavailable error handling (0.10ms)
✔ 16. Network interruption handling (navigator.onLine is false) (0.18ms)
✔ 1. Import a valid four-column Excel file (39.63ms)
✔ 2. Import a file without a SIF Number column (9.04ms)
✔ 3. Import a file with missing required columns (e.g. missing Mobile Number) (7.35ms)
✔ 4. Import duplicate roll numbers within the file (3.41ms)
✔ 5. Import invalid mobile numbers (< 10 digits or alphanumeric) (3.29ms)
✔ 6. Import invalid dates and future dates (4.96ms)
✔ 7. Import a file containing empty rows (empty rows must be ignored) (4.41ms)
✔ 8. Verify that existing student records with SIF remain intact (0.28ms)
✔ 9. Verify student login compatibility with mobile and DOB (0.25ms)

Total Tests: 25 | Passing: 25 | Failing: 0 | Skipped: 0
```

---

## 2. Detailed Authentication Scenarios

| Test ID | Scenario Description | Input Tested | Expected Outcome | Actual Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **AUTH-01** | Valid credentials | Mobile: `9876543210`<br>DOB: `2004-05-15` | Returns `{ success: true, customToken }` | Custom token issued with role `student` | **PASS** |
| **AUTH-02** | Correct mobile, wrong DOB | Mobile: `9876543210`<br>DOB: `2004-05-16` | Throws `unauthenticated`<br>`"Invalid mobile number or date of birth."` | Exact error returned; rate-limited | **PASS** |
| **AUTH-03** | Incorrect mobile, correct DOB | Mobile: `9876543290`<br>DOB: `2004-05-15` | Throws `unauthenticated`<br>`"Invalid mobile number or date of birth."` | Exact error returned; non-revealing | **PASS** |
| **AUTH-04** | Missing mobile number | Mobile: `""`<br>DOB: `2004-05-15` | Throws `invalid-argument`<br>`"Please enter a valid 10-digit registered mobile number."` | Validated client & server-side | **PASS** |
| **AUTH-05** | Missing DOB | Mobile: `9876543210`<br>DOB: `""` | Throws `invalid-argument`<br>`"Please enter a valid Date of Birth."` | Validated client & server-side | **PASS** |
| **AUTH-06** | Invalid mobile format | Mobile: `98765` or `98765ABCDE` | Throws `invalid-argument` | Non-10-digit formats rejected immediately | **PASS** |
| **AUTH-07** | Future date of birth | DOB: `2099-01-01` | Throws `invalid-argument`<br>`"Date of Birth cannot be in the future."` | Validated against current UTC date | **PASS** |
| **AUTH-08** | Duplicate mobile collision | Mobile: `9876543299` (shared by 2 students) | Throws `failed-precondition`<br>`"Multiple student accounts are associated with this mobile number..."` | Blocks ambiguous login; alerts admin | **PASS** |
| **AUTH-09** | Student with missing DOB in DB | Mobile: `9876543212`<br>DOB: `2004-01-01` | Throws `unauthenticated`<br>`"Invalid mobile number or date of birth."` | Protected against uninitialized records | **PASS** |
| **AUTH-10** | Blocked student | Status: `blocked` | Throws `permission-denied`<br>`"Student account is inactive or blocked..."` | Account access denied | **PASS** |
| **AUTH-11** | Deleted student | `isDeleted: true` | Throws `unauthenticated` | Filtered from candidate pool | **PASS** |
| **AUTH-12** | Non-student account | Admin credentials through student login | Throws `unauthenticated` | Non-student roles rejected | **PASS** |
| **AUTH-13** | Session token verification | Successful authentication | Requires genuine Firebase Auth custom token | No fake localStorage sessions | **PASS** |
| **AUTH-14** | Admin login isolation | Email: `admin@tamillearning.edu` | Uses `signInWithEmailAndPassword` | Admin login unaffected | **PASS** |
| **AUTH-15** | Function unavailable | Service down / 503 / 404 | Displays `"Unable to connect to the authentication service. Please try again shortly."` | Clean fallback message displayed | **PASS** |
| **AUTH-16** | Network offline | `navigator.onLine === false` | Displays `"Unable to connect to the authentication service. Please try again shortly."` | Friendly offline guidance | **PASS** |

---

## 3. Four-Column Excel Import Tests

| Test ID | Scenario Description | Outcome | Status |
| :---: | :--- | :--- | :---: |
| **IMP-01** | Valid four-column Excel import | All students successfully imported with required fields | **PASS** |
| **IMP-02** | File without SIF Number column | Accepted without error (SIF is no longer required in template) | **PASS** |
| **IMP-03** | Missing required columns | Validation fails with clear row-level message | **PASS** |
| **IMP-04** | Duplicate roll numbers | Duplicate records flagged and rejected | **PASS** |
| **IMP-05** | Invalid mobile numbers | Validates 10-digit format | **PASS** |
| **IMP-06** | Invalid dates / future dates | Date formats standardized to `YYYY-MM-DD`; future dates rejected | **PASS** |
| **IMP-07** | Empty rows in file | Empty rows automatically skipped | **PASS** |
| **IMP-08** | Legacy SIF preservation | Existing records retain their SIF numbers internally | **PASS** |
| **IMP-09** | Login compatibility | Imported students can immediately log in with Mobile + DOB | **PASS** |

---

## 4. Cloud Function Deployment Instructions

To deploy the updated `studentLogin` Cloud Function to Firebase project `tamil-learning-9f609`:

```bash
# Ensure login to the correct Firebase account
npx firebase-tools login

# Deploy the studentLogin function exclusively
npx firebase-tools deploy --only functions:studentLogin --project tamil-learning-9f609

# Optional: Deploy updated Firestore security rules
npx firebase-tools deploy --only firestore:rules --project tamil-learning-9f609
```
