import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import {
  Backpack,
  ChartLine,
  LockKeyhole,
  Menu,
  NotebookPen,
  Plus,
  Settings as SettingsIcon,
  Swords,
  Trees,
  UserRound,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Badge, Progress } from './ui';
import { formatNumber } from '../lib/format';

const NAV: Array<{
  to: string;
  label: string;
  icon: typeof UserRound;
  end?: boolean;
  countKey?: 'questsActive' | 'journal' | 'inventory';
}> = [
  { to: '/', label: 'Character', icon: UserRound, end: true },
  { to: '/skills', label: 'Skill Trees', icon: Trees, countKey: undefined },
  { to: '/quests', label: 'Quests', icon: Swords, countKey: 'questsActive' },
  { to: '/inventory', label: 'Inventory', icon: Backpack, countKey: 'inventory' },
  { to: '/analytics', label: 'Analytics', icon: ChartLine },
  { to: '/journal', label: 'Journal', icon: NotebookPen, countKey: 'journal' },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Layout() {
  const { data, openComposer } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        openComposer();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openComposer]);

  const profile = data?.profile;
  const counts = data?.counts;

  return (
    <div className="min-h-screen lg:pl-[248px]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-white/[0.06] bg-ink-950/85 backdrop-blur-xl lg:flex">
        <SidebarContent profile={profile} counts={counts} onNavigate={() => setMobileOpen(false)} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-[270px] animate-fade-up flex-col border-r border-white/[0.08] bg-ink-950">
            <SidebarContent profile={profile} counts={counts} onNavigate={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-ink-950/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/[0.08] text-ink-300"
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <div>
            <p className="eyebrow">LIFE RPG</p>
            <p className="truncate text-sm text-ink-100">{profile?.name ?? 'Adventurer'}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => openComposer()}
          className="btn-primary px-3 py-2 text-xs"
        >
          <Plus size={14} /> Log
        </button>
      </header>

      <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.05] pt-4 text-[11px] text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <LockKeyhole size={12} className="text-jade/70" />
            Local-only. Your journal, files and progression never leave this machine.
          </span>
          <span className="font-mono text-ink-600">127.0.0.1 · v1.0.0</span>
        </footer>
      </main>
    </div>
  );
}

function SidebarContent({
  profile,
  counts,
  onNavigate,
  onClose,
}: {
  profile: { name: string; progression: { level: number; totalLifetimeXp: number; progressFraction: number; xpToNextLevel: number; title: string } } | null | undefined;
  counts: { questsActive: number; journal: number; inventory: number; achievementsUnlocked: number } | null | undefined;
  onNavigate: () => void;
  onClose?: () => void;
}) {
  const { openComposer } = useApp();
  return (
    <>
      <div className="flex items-center justify-between px-5 pb-4 pt-5">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-8 w-8 rotate-45 items-center justify-center rounded-[6px] border border-gold-500/50 bg-gold-500/10">
            <span className="h-2 w-2 -rotate-45 rounded-full bg-gold-400 shadow-[0_0_12px_#e3c27a]" />
          </span>
          <div>
            <p className="font-display text-xl leading-none tracking-wide text-ink-100">LIFE RPG</p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.28em] text-ink-500">Personal legend</p>
          </div>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Close navigation" className="text-ink-400 hover:text-ink-100">
            <X size={18} />
          </button>
        ) : null}
      </div>

      <div className="px-4">
        <button
          type="button"
          onClick={() => {
            openComposer();
            onNavigate();
          }}
          className="btn-primary w-full justify-between"
        >
          <span className="inline-flex items-center gap-2">
            <Plus size={16} /> Log activity
          </span>
          <kbd className="rounded border border-ink-950/25 px-1.5 py-0.5 font-mono text-[10px] text-ink-950/70">N</kbd>
        </button>
      </div>

      <nav className="mt-5 flex-1 space-y-1 overflow-y-auto px-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const count = item.countKey && counts ? counts[item.countKey] : undefined;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition',
                  isActive
                    ? 'border border-gold-500/20 bg-gold-500/[0.08] text-ink-100'
                    : 'border border-transparent text-ink-400 hover:bg-white/[0.03] hover:text-ink-200',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} className={isActive ? 'text-gold-400' : 'text-ink-500 group-hover:text-ink-300'} />
                  <span className="flex-1">{item.label}</span>
                  {count ? <span className="font-mono text-[10px] text-ink-500">{count}</span> : null}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-white/[0.06] p-4">
        {profile ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink-100">{profile.name}</p>
                <p className="text-[10px] text-ink-500">{profile.progression.title}</p>
              </div>
              <Badge tone="gold">Lv {profile.progression.level}</Badge>
            </div>
            <Progress value={profile.progression.progressFraction * 100} height={4} />
            <div className="flex items-center justify-between text-[10px] text-ink-500">
              <span>{formatNumber(profile.progression.totalLifetimeXp)} lifetime XP</span>
              <span>{formatNumber(profile.progression.xpToNextLevel)} to next</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge tone="muted">{counts?.achievementsUnlocked ?? 0} trophies</Badge>
              <Badge tone="muted">Local</Badge>
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-500">No character yet.</p>
        )}
      </div>
    </>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="animate-fade-up">{children}</div>;
}
