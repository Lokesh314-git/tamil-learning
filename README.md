# Tamil Learning Web App (React + Firebase)

## Quick start
1) Install deps  
```bash
npm install
```
2) Put your Firebase web config in `src/firebase.js` (already scaffolded).  
3) Start dev server  
```bash
npm run dev
```
4) Build for hosting  
```bash
npm run build
```

## Firebase setup
- Enable **Email/Password** in Authentication.
- Create at least one admin user from Firebase console. No public admin signup exists.
- Create Firestore in production or test mode. Import `firestore.rules` after adjusting the admin rule if you add custom claims.

## Collections
- `users`: uid, name, email, role (`admin|student`), year, createdAt
- `units`: year, unitNumber, title, pdfLink, createdAt
- `tests`: year, title, unitNumber, questions[{questionText, options[4], correctAnswer}], createdAt
- `results`: studentId, studentName, email, year, testId, testTitle, answers, score, total, submittedAt
- `notes`: studentId, title, content, createdAt, updatedAt

## Security rules
See `firestore.rules` for a starting point; deploy with:
```bash
firebase deploy --only firestore:rules
```

## Dummy data
You can seed a unit and test quickly via Firebase console:
```
units:
  year: "1st Year"
  unitNumber: 1
  title: "Tamil Basics"
  pdfLink: "https://drive.google.com/..."

tests:
  year: "1st Year"
  title: "Basics Quiz"
  unitNumber: 1
  questions: [
    { questionText: "Tamil letter for 'a'?", options:["அ","ஆ","இ","ஈ"], correctAnswer:0 }
  ]
```

## Hosting
After `npm run build`, run `firebase init hosting` and deploy with `firebase deploy --only hosting`.
