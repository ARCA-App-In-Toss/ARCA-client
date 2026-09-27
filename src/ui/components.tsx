import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef } from 'react';

// Native-HTML CMP baselines (02 §9). External pixel UI adoption replaces the visuals per CMP in
// step 3 without changing these semantics.

/** CMP-001 PixelAppShell + CMP-003 PixelCanvas. */
export function PixelAppShell({ children }: { children: ReactNode }) {
  return (
    <div className="arca-shell">
      <main className="arca-shell__content">{children}</main>
    </div>
  );
}

/** CMP-002 ScreenTitle: the single h1; receives programmatic focus after a route change (04 IX-018). */
export function ScreenTitle({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className="arca-screen-title">
      {children}
    </h1>
  );
}

/** CMP-004 ScenePanel. */
export function ScenePanel({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <section className="arca-scene-panel" aria-label={label}>
      {children}
    </section>
  );
}

/** CMP-006 InsetPanel (dark, plain). */
export function InsetPanel({ children }: { children: ReactNode }) {
  return <div className="arca-inset-panel">{children}</div>;
}

/** CMP-021 PixelPlaceholder: decorative outline only; state is announced elsewhere. */
export function PixelPlaceholder() {
  return (
    <div className="arca-placeholder" aria-hidden="true">
      <div className="arca-placeholder__bar" />
      <div className="arca-placeholder__bar" />
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface PixelButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant;
  /** Keeps size and label, exposes aria-busy, blocks duplicate activation, stays focusable. */
  loading?: boolean;
}

/** CMP-007 PixelButton. */
export function PixelButton({ variant = 'secondary', loading = false, onClick, className, ...rest }: PixelButtonProps) {
  return (
    <button
      {...rest}
      type="button"
      className={['arca-button', `arca-button--${variant}`, className].filter(Boolean).join(' ')}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={(event) => {
        if (loading) return;
        onClick?.(event);
      }}
    />
  );
}

/** CMP-020 InlineStatus: one polite live source for the region (02 §12.4). */
export function InlineStatus({ message, tone = 'neutral' }: { message: string | null; tone?: 'neutral' | 'danger' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={tone === 'danger' ? 'arca-inline-status arca-inline-status--danger' : 'arca-inline-status'}
    >
      {message}
    </div>
  );
}

/** CMP-022 StatePanel: title/description/at most one recovery action live in the children. */
export function StatePanel({ children }: { children: ReactNode }) {
  return (
    <InsetPanel>
      <div className="arca-state-panel">{children}</div>
    </InsetPanel>
  );
}
