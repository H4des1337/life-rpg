import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../api';
import type { Bootstrap } from '../types';
import { Button, Modal } from '../components/ui';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Overrides the default warning line shown above the action buttons. */
  note?: string;
}

interface AppContextValue {
  data: Bootstrap | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  notify: (tone: ToastTone, title: string, message?: string) => void;
  toasts: Toast[];
  dismissToast: (id: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  composer: { open: boolean; questId: string | null };
  openComposer: (questId?: string) => void;
  closeComposer: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const [composer, setComposer] = useState<{ open: boolean; questId: string | null }>({
    open: false,
    questId: null,
  });
  const confirmResolver = useRef<((value: boolean) => void) | null>(null);
  const timers = useRef<number[]>([]);
  const bootstrapped = useRef(false);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (tone: ToastTone, title: string, message?: string) => {
      const toast: Toast = { id: makeId(), tone, title, message };
      setToasts((current) => [...current.slice(-3), toast]);
      const timer = window.setTimeout(() => dismissToast(toast.id), tone === 'error' ? 9000 : 5500);
      timers.current.push(timer);
    },
    [dismissToast],
  );

  const refresh = useCallback(async () => {
    try {
      const next = await api.get<Bootstrap>('/bootstrap');
      setData(next);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to reach the local server.');
      throw cause;
    }
  }, []);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    refresh()
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    return () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    };
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      confirmResolver.current?.(false);
      confirmResolver.current = resolve;
      setConfirmState(options);
    });
  }, []);

  const settleConfirm = useCallback((value: boolean) => {
    confirmResolver.current?.(value);
    confirmResolver.current = null;
    setConfirmState(null);
  }, []);

  const openComposer = useCallback((questId?: string) => {
    setComposer({ open: true, questId: questId ?? null });
  }, []);

  const closeComposer = useCallback(() => {
    setComposer({ open: false, questId: null });
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      data,
      loading,
      error,
      refresh,
      notify,
      toasts,
      dismissToast,
      confirm,
      composer,
      openComposer,
      closeComposer,
    }),
    [data, loading, error, refresh, notify, toasts, dismissToast, confirm, composer, openComposer, closeComposer],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <Modal
        open={Boolean(confirmState)}
        onClose={() => settleConfirm(false)}
        title={confirmState?.title ?? 'Confirm'}
        description={confirmState?.message}
        footer={
          <>
            <Button onClick={() => settleConfirm(false)}>{confirmState?.cancelLabel ?? 'Cancel'}</Button>
            <Button
              variant={confirmState?.danger ? 'danger' : 'primary'}
              onClick={() => settleConfirm(true)}
            >
              {confirmState?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3 text-sm leading-6 text-ink-300">
          <AlertTriangle className={confirmState?.danger ? 'mt-0.5 text-blood' : 'mt-0.5 text-gold-500'} size={18} />
          <p>
            {confirmState?.note ??
              (confirmState?.danger
                ? 'This action cannot be undone from the interface. A backup is recommended first.'
                : 'Review the details before continuing.')}
          </p>
        </div>
      </Modal>
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider.');
  return context;
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = toast.tone === 'success' ? CheckCircle2 : toast.tone === 'error' ? XCircle : Info;
        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex animate-fade-up items-start gap-3 rounded-md border px-3.5 py-3 shadow-2xl backdrop-blur ${
              toast.tone === 'success'
                ? 'border-jade/30 bg-[#0f1a17]/95'
                : toast.tone === 'error'
                  ? 'border-blood/35 bg-[#1a1010]/95'
                  : 'border-white/[0.1] bg-ink-900/95'
            }`}
          >
            <Icon
              size={16}
              className={
                toast.tone === 'success' ? 'mt-0.5 text-jade' : toast.tone === 'error' ? 'mt-0.5 text-[#e0a0a0]' : 'mt-0.5 text-gold-400'
              }
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-100">{toast.title}</p>
              {toast.message ? <p className="mt-0.5 text-xs leading-5 text-ink-400">{toast.message}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="text-ink-500 transition hover:text-ink-200"
              aria-label="Dismiss notification"
            >
              <XCircle size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
