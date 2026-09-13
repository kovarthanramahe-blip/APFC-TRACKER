import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { useThemeEffect } from './lib/useTheme';
// Eagerly load the Supabase client (rather than only via the lazy Settings
// chunk) so its built-in OAuth hash detection runs on every page load,
// including the redirect landing on "/" straight after Google sign-in.
import './lib/supabase';
import { useCloudSync } from './lib/useCloudSync';
import { useNativeAuthBridge } from './lib/nativeAuth';
import { RewardCelebration } from './components/RewardCelebration';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Syllabus = lazy(() => import('./pages/Syllabus'));
const QuestionBank = lazy(() => import('./pages/QuestionBank'));
const PYQTest = lazy(() => import('./pages/PYQTest'));
const MockTests = lazy(() => import('./pages/MockTests'));
const MockTestRunner = lazy(() => import('./pages/MockTestRunner'));
const MockTestResult = lazy(() => import('./pages/MockTestResult'));
const Notes = lazy(() => import('./pages/Notes'));
const Pomodoro = lazy(() => import('./pages/Pomodoro'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));

function RouteFallback() {
  return (
    <div className="space-y-4">
      <div className="h-40 rounded-2xl animate-shimmer" />
      <div className="h-24 rounded-2xl animate-shimmer" />
      <div className="h-24 rounded-2xl animate-shimmer" />
    </div>
  );
}

export default function App() {
  useThemeEffect();
  useNativeAuthBridge();
  useCloudSync();

  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/syllabus" element={<Syllabus />} />
          <Route path="/pyq" element={<QuestionBank />} />
          <Route path="/pyq-test" element={<PYQTest />} />
          <Route path="/mock-tests" element={<MockTests />} />
          <Route path="/mock-tests/run/:blueprintId" element={<MockTestRunner />} />
          <Route path="/mock-tests/result/:attemptId" element={<MockTestResult />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/pomodoro" element={<Pomodoro />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Suspense>
      <RewardCelebration />
    </AppShell>
  );
}
