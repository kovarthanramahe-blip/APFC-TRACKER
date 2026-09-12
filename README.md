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
- **Settings** — light/dark/system theme, install-as-app instructions, Google sign-in with cloud sync, and local JSON export/import/reset for your data.

## Tech Stack

React 19 + TypeScript + Vite, Tailwind CSS v4, Framer Motion, Zustand (persisted to `localStorage`), React Router, Recharts, and `vite-plugin-pwa` for offline support and installability. Capacitor wraps the app for Android.

All data lives **locally in the browser** by default (`localStorage`) and keeps working fully offline. Signing in with Google (Settings → Account) additionally syncs it to a Supabase `user_data` table scoped by row-level security, so progress carries across devices — see `.env.example` for the two `VITE_SUPABASE_*` variables this needs. Use **Settings → Export backup** as a manual fallback either way.

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

### Building a native Android app

The Android project already exists at `android/` ([Capacitor](https://capacitorjs.com/), app id `com.apfctracker.app`). This repo doesn't ship a built APK — you build it locally with Android Studio, which manages its own SDK:

```bash
npm run android:sync   # builds the web app and copies it + native deps into android/
npm run android:open   # opens the android/ project in Android Studio
```

From Android Studio: **Run ▶** to install a debug build on an emulator/device, or **Build → Generate Signed Bundle / APK** for a release build to sideload or publish. Re-run `npm run android:sync` after any web app change so the native project picks it up.

Source icon/splash images live in `assets/`; regenerate the native assets after changing them with `npx @capacitor/assets generate --android`.

**Note on Google Sign-In:** the current implementation opens the OAuth flow in-page (`window.location`), which works on the web but Google blocks OAuth inside an embedded Android WebView. Cloud sync's Google sign-in will need a follow-up using `@capacitor/browser` (system browser) + a custom URL scheme deep link back into the app before it works in the native app; the web version is unaffected.

## Content note

Questions in the Question Bank are practice items written to match the UPSC EPFO APFC syllabus and pattern — they are **not** verbatim reproductions of official past papers. Add real previous-year questions you come across via the Notes section.
