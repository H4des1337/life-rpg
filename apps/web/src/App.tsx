import { Navigate, Route, Routes } from 'react-router-dom';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { Layout } from './components/Layout';
import { ActivityComposer } from './components/ActivityComposer';
import { Onboarding } from './pages/Onboarding';
import { CharacterPage } from './pages/Character';
import { SkillsPage } from './pages/Skills';
import { QuestsPage } from './pages/Quests';
import { InventoryPage } from './pages/Inventory';
import { AnalyticsPage } from './pages/Analytics';
import { JournalPage } from './pages/Journal';
import { SettingsPage } from './pages/Settings';

export default function App() {
  return (
    <AppProvider>
      <AppFrame />
    </AppProvider>
  );
}

function AppFrame() {
  const { data, loading, error, refresh } = useApp();

  if (loading && !data) return <Splash />;

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="panel w-full max-w-lg p-6 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-blood/30 bg-blood/[0.08] text-[#e0a0a0]">
            <AlertTriangle size={20} />
          </span>
          <h1 className="mt-4 text-2xl text-ink-100">The local server is out of reach</h1>
          <p className="mt-2 text-sm leading-6 text-ink-400">
            {error ?? 'LIFE RPG could not load its local data.'}
          </p>
          <p className="mt-4 rounded-md border border-white/[0.06] bg-ink-950/60 px-3 py-2 text-left font-mono text-[11px] leading-5 text-ink-500">
            Start the app with <span className="text-gold-400">npm run dev</span> (development) or{' '}
            <span className="text-gold-400">npm start</span> (production), then retry.
          </p>
          <button type="button" className="btn-primary mx-auto mt-5" onClick={() => void refresh().catch(() => undefined)}>
            <RotateCcw size={15} /> Retry connection
          </button>
        </div>
      </div>
    );
  }

  if (!data.hasProfile) {
    return (
      <>
        <Onboarding />
        <ActivityComposer />
      </>
    );
  }

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<CharacterPage />} />
          <Route path="skills" element={<SkillsPage />} />
          <Route path="quests" element={<QuestsPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <ActivityComposer />
    </>
  );
}

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <span className="relative flex h-12 w-12 animate-float-idle rotate-45 items-center justify-center rounded-lg border border-gold-500/50 bg-gold-500/10">
        <span className="h-2.5 w-2.5 -rotate-45 rounded-full bg-gold-400 shadow-[0_0_18px_#e3c27a]" />
      </span>
      <div className="text-center">
        <p className="font-display text-2xl tracking-wide text-ink-100">LIFE RPG</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-ink-500">Opening your chronicle</p>
      </div>
      <div className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full w-1/2 animate-shimmer rounded-full bg-gradient-to-r from-transparent via-gold-500 to-transparent" />
      </div>
    </div>
  );
}
