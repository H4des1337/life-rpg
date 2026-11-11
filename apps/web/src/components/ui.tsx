import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

export function Button({
  children,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md';
}) {
  return (
    <button
      type={type}
      className={clsx(
        variant === 'primary' && 'btn-primary',
        variant === 'ghost' && 'btn-ghost',
        variant === 'danger' && 'btn-danger',
        variant === 'outline' && 'btn-outline',
        size === 'sm' && 'px-2.5 py-1 text-xs',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-ink-400 transition hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-ink-100',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] leading-4 text-ink-500">{hint}</span> : null}
    </label>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => panelRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8">
      <button
        type="button"
        aria-label="Close dialog"
        className="fixed inset-0 cursor-default"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={clsx(
          'relative my-auto w-full animate-fade-up rounded-lg border border-white/[0.08] bg-ink-900 shadow-2xl outline-none',
          wide ? 'max-w-4xl' : 'max-w-lg',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
          <div>
            <h2 className="font-display text-xl text-ink-100">{title}</h2>
            {description ? <p className="mt-1 text-xs leading-5 text-ink-400">{description}</p> : null}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="max-h-[72vh] overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Panel({
  children,
  className,
  as: Tag = 'section',
  id,
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
  id?: string;
}) {
  return <Tag id={id} className={clsx('panel', className)}>{children}</Tag>;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h1 className="text-3xl text-ink-100 sm:text-[2rem]">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionHeading({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-lg text-ink-100">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Progress({
  value,
  color = '#cfa960',
  className,
  height = 6,
}: {
  value: number;
  color?: string;
  className?: string;
  height?: number;
}) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      className={clsx('w-full overflow-hidden rounded-full bg-white/[0.06]', className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}aa, ${color})`,
          boxShadow: pct > 0 ? `0 0 12px ${color}44` : undefined,
        }}
      />
    </div>
  );
}

export function Badge({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode;
  tone?: 'default' | 'gold' | 'jade' | 'danger' | 'muted';
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider',
        tone === 'default' && 'border-white/[0.08] bg-white/[0.03] text-ink-300',
        tone === 'gold' && 'border-gold-500/25 bg-gold-500/[0.08] text-gold-400',
        tone === 'jade' && 'border-jade/25 bg-jade/[0.08] text-jade',
        tone === 'danger' && 'border-blood/30 bg-blood/[0.08] text-[#e0a0a0]',
        tone === 'muted' && 'border-white/[0.05] bg-transparent text-ink-500',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="panel px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">{label}</span>
        {icon ? <span style={{ color: accent }} className="text-gold-500/80">{icon}</span> : null}
      </div>
      <div className="mt-1.5 font-display text-2xl text-ink-100">{value}</div>
      {hint ? <p className="mt-0.5 text-[11px] text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon ? (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.02] text-ink-400">
          {icon}
        </div>
      ) : null}
      <h3 className="font-display text-lg text-ink-200">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm leading-6 text-ink-400">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-400">
      <Loader2 className="animate-spin" size={16} />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-md bg-white/[0.05]', className)} />;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ id: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-wrap gap-1 border-b border-white/[0.06]', className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={clsx(
            'relative -mb-px border-b px-3 py-2 text-sm transition',
            value === tab.id
              ? 'border-gold-500 text-ink-100'
              : 'border-transparent text-ink-400 hover:text-ink-200',
          )}
        >
          {tab.label}
          {tab.count !== undefined ? <span className="ml-1.5 text-[10px] text-ink-500">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Rating({
  value,
  onChange,
  label,
  hint,
  max = 5,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  hint?: string;
  max?: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="label mb-0">{label}</span>
        <span className="text-[11px] text-ink-500">{value} / {max}</span>
      </div>
      <div className="mt-2 flex gap-1">
        {Array.from({ length: max }, (_, index) => index + 1).map((step) => (
          <button
            key={step}
            type="button"
            aria-label={`${label}: ${step}`}
            aria-pressed={step <= value}
            onClick={() => onChange(step)}
            className={clsx(
              'h-7 flex-1 rounded-sm border transition',
              step <= value
                ? 'border-gold-500/40 bg-gold-500/20'
                : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06]',
            )}
          />
        ))}
      </div>
      {hint ? <p className="mt-1 text-[11px] text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function GoldRule() {
  return (
    <div className="flex items-center gap-2" aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-r from-gold-500/40 to-transparent" />
      <span className="h-1 w-1 rotate-45 border border-gold-500/60" />
      <span className="h-px flex-1 bg-gradient-to-l from-gold-500/40 to-transparent" />
    </div>
  );
}
