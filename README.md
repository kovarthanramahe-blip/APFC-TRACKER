# APFC Tracker

A complete, installable web + Android (PWA) preparation companion for the **UPSC EPFO Assistant Provident Fund Commissioner (APFC)** Recruitment Test — target exam date **20 December 2026**.

## Features

- **Dashboard** — live countdown to exam day, streak tracking, subject-wise progress at a glance, and recent mock test results.
- **Syllabus Tracker** — the full official UPSC EPFO APFC syllabus (13 subjects, 130+ topics) broken into a checklist with per-subject progress bars.
- **Question Bank (PYQ-style)** — 130+ practice questions written to match the exam pattern, filterable by subject and difficulty, with explanations and a "star to revise later" list.
- **Mock Tests** — a full-length simulation, quick/speed rounds, and 13 subject-wise tests, all timed with the official **1/3rd negative marking** scheme, a question navigator, and a detailed results/review screen with subject-wise breakdown charts.
- **Notes** — quick subject-tagged notes for formulas, mnemonics and revision points.
- **Pomodoro Timer** — a 25/5/15 focus-break cycle timer with subject tagging and a session log.
- **Analytics** — charts for daily focus time, mock test score trend, and syllabus coverage by subject.
- **Settings** — light/dark/system theme, install-as-app instructions, and local JSON export/import/reset for your data.

## Tech Stack

React 19 + TypeScript + Vite, Tailwind CSS v4, Framer Motion, Zustand (persisted to `localStorage`), React Router, Recharts, and `vite-plugin-pwa` for offline support and installability.

All data is stored **locally in the browser** — there is no backend. Use **Settings → Export backup** regularly to avoid losing progress, especially before clearing browser data.

## Getting Started

```bash
npm install
npm run dev       # start the dev server
npm run build     # production build (also generates the PWA service worker)
npm run preview   # preview the production build
```

## Installing as an app

This is a Progressive Web App:

- **Android (Chrome):** menu (⋮) → "Install app" / "Add to Home screen".
- **iOS (Safari):** Share → "Add to Home Screen".
- **Desktop (Chrome/Edge):** click the install icon in the address bar.

### Building a native Android APK (optional)

For a store-distributable APK/AAB, wrap this PWA with [Capacitor](https://capacitorjs.com/):

```bash
npm install @capacitor/core @capacitor/android
npx cap init "APFC Tracker" "com.apfctracker.app"
npm run build
npx cap add android
npx cap copy android
npx cap open android   # opens Android Studio to build/sign the APK
```

## Content note

Questions in the Question Bank are practice items written to match the UPSC EPFO APFC syllabus and pattern — they are **not** verbatim reproductions of official past papers. Add real previous-year questions you come across via the Notes section.
