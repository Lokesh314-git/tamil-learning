# Tamil Learning Web App (React + Firebase)

## 🌐 Live Demo

**Live URL:** https://tamil-learning.onrender.com/

👉 **[Open Tamil Learning Web App](https://tamil-learning.onrender.com/)**

The application is deployed and available online through Render.

---

## Quick start

1. Install dependencies

```bash
npm install
```

2. Put your Firebase web config in `src/firebase.js` (already scaffolded).

3. Start the development server

```bash
npm run dev
```

4. Build for hosting

```bash
npm run build
```

---

## Firebase setup

* Enable **Email/Password** in Authentication.
* Create at least one admin user from Firebase console. No public admin signup exists.
* Create Firestore in production or test mode.
* Import `firestore.rules` after adjusting the admin rule if you add custom claims.

---

## Collections

* `users`: uid, name, email, role (`admin|student`), year, createdAt
* `units`: year, unitNumber, title, pdfLink, createdAt
* `tests`: year, title, unitNumber, questions[{questionText, options[4], correctAnswer}], createdAt
* `results`: studentId, studentName, email, year, testId, testTitle, answers, score, total, submittedAt
* `notes`: studentId, title, content, createdAt, updatedAt

---

## Security rules

See `firestore.rules` for a starting point.

Deploy with:

```bash
firebase deploy --only firestore:rules
```

---

## Dummy data

You can seed a unit and test quickly via Firebase console:

```text
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
    {
      questionText: "Tamil letter for 'a'?",
      options: ["அ","ஆ","இ","ஈ"],
      correctAnswer: 0
    }
  ]
```

---

## Hosting

The project is currently deployed on **Render**:

**Live Application:** https://tamil-learning.onrender.com/

For local production testing:

```bash
npm run build
```

If you want to deploy using Firebase Hosting instead, run:

```bash
firebase init hosting
firebase deploy --only hosting
```

---

## Tech Stack

* **Frontend:** React
* **Backend / Database:** Firebase
* **Authentication:** Firebase Authentication
* **Database:** Cloud Firestore
* **Deployment:** Render
* **Build Tool:** Vite
