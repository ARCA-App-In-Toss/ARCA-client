import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';

// Native-HTML CMP baselines (02 §9). External pixel UI adoption replaces the visuals per CMP in
// step 3 without changing these semantics.

/** CMP-001 PixelAppShell + CMP-003 PixelCanvas. */
export function PixelAppShell({ children, tabs }: { children: ReactNode; tabs?: ReactNode }) {
  return (
    <div className="arca-shell">
      <main className={tabs ? 'arca-shell__content arca-shell__content--with-tabs' : 'arca-shell__content'}>
        {children}
      </main>
      {tabs}
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
export function ScenePanel({ children, labelledBy }: { children: ReactNode; labelledBy?: string | undefined }) {
  return (
    <section className="arca-scene-panel" aria-labelledby={labelledBy}>
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
  ref?: Ref<HTMLButtonElement>;
}

/** CMP-007 PixelButton. */
export function PixelButton({ variant = 'secondary', loading = false, onClick, className, ...rest }: PixelButtonProps) {
  return (
    <button
      {...rest}
      type="button"
      className={['arca-button', `arca-button--${variant}`, className].filter(Boolean).join(' ')}
      aria-busy={loading || undefined}
      aria-disabled={loading || rest['aria-disabled'] || undefined}
      onClick={(event) => {
        if (loading) return;
        onClick?.(event);
      }}
    />
  );
}

/**
 * CMP-012 PixelCheckboxRow: a native checkbox whose visible label toggles it. `accessibleName` carries
 * the required state in the name (04 CPY-F02-015/016); the document link is a separate control.
 */
export function PixelCheckboxRow({
  id,
  label,
  badge,
  accessibleName,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  badge: string;
  accessibleName: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="arca-checkbox-row">
      <input
        id={id}
        type="checkbox"
        className="arca-checkbox"
        aria-label={accessibleName}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id} className="arca-checkbox-row__label">
        <span className="arca-checkbox-row__badge">{badge}</span> {label}
      </label>
    </div>
  );
}

/**
 * CMP-020 InlineStatus. `live` (default) makes it the screen's single polite source (02 §12.4); a
 * screen with several visible statuses renders them with `live={false}` and announces through one.
 */
export function InlineStatus({
  message,
  tone = 'neutral',
  live = true,
}: {
  message: string | null;
  tone?: 'neutral' | 'danger';
  live?: boolean;
}) {
  const className = tone === 'danger' ? 'arca-inline-status arca-inline-status--danger' : 'arca-inline-status';
  if (!live) return message ? <p className={className}>{message}</p> : null;
  return (
    <div role="status" aria-live="polite" className={className}>
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

/** CMP-005 RecordPanel: ink surface for the user's own words. */
export function RecordPanel({ children, labelledBy }: { children: ReactNode; labelledBy?: string | undefined }) {
  return (
    <section className="arca-record-panel" aria-labelledby={labelledBy}>
      {children}
    </section>
  );
}

/** CMP-016 MemoryCount: readable full name, never a progress role; unknown counts are not shown as 0. */
export function MemoryCount({ text }: { text: string }) {
  return <p className="arca-memory-count">{text}</p>;
}

/** CMP-008 PixelIconButton: 44×44 target with a required accessible name; the glyph is decorative. */
export function PixelIconButton({
  label,
  glyph,
  onClick,
  buttonRef,
}: {
  label: string;
  glyph: string;
  onClick: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button ref={buttonRef} type="button" className="arca-icon-button" aria-label={label} onClick={onClick}>
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}

/**
 * CMP-009 PixelField + CMP-011 PixelTextarea. A native textarea keeps value, IME, selection and ref
 * semantics (06 §10.6): no maxLength, trimming or truncation. It grows with its content inside the page.
 */
export function PixelTextareaField({
  id,
  label,
  describedBy,
  invalid,
  value,
  textareaRef,
  ...rest
}: {
  id: string;
  label: string;
  describedBy: string;
  invalid: boolean;
  value: string;
  /** Lets the screen move focus to the text (e.g. copy failure, 04 IX-040). */
  textareaRef?: { current: HTMLTextAreaElement | null };
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'value' | 'aria-describedby' | 'aria-invalid'>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (textareaRef) textareaRef.current = ref.current;
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: height must follow every value change.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);
  return (
    <div className="arca-field">
      <label className="arca-label" htmlFor={id}>
        {label}
      </label>
      <textarea
        {...rest}
        ref={ref}
        id={id}
        value={value}
        className="arca-textarea"
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
      />
    </div>
  );
}

/**
 * CMP-009 PixelField + CMP-010 PixelTextField: a native single-line input with no maxLength, trimming
 * or truncation; IME, selection and paste stay native (04 IX-001, 06 §10.6).
 */
export function PixelTextField({
  id,
  label,
  describedBy,
  invalid,
  value,
  ...rest
}: {
  id: string;
  label: ReactNode;
  describedBy: string;
  invalid: boolean;
  value: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'type' | 'aria-describedby' | 'aria-invalid'>) {
  return (
    <div className="arca-field">
      <label className="arca-label" htmlFor={id}>
        {label}
      </label>
      <input
        {...rest}
        id={id}
        type="text"
        value={value}
        className="arca-text-input"
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
      />
    </div>
  );
}

/** CMP-025 RootFloatingTabs: F10/F20 only; current tab exposed as aria-current, not colour alone. */
export function RootFloatingTabs({
  current,
  tabs,
}: {
  current: 'today' | 'archive';
  tabs: { id: 'today' | 'archive'; label: string; onSelect: () => void }[];
}) {
  return (
    <nav className="arca-root-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="arca-root-tab"
          aria-current={tab.id === current ? 'page' : undefined}
          onClick={tab.id === current ? undefined : tab.onSelect}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

/** CMP-015 MemoryRow: one full-width hit area; excerpt → question part → date (03 §6.1). */
export function MemoryRow({ onSelect, children }: { onSelect: () => void; children: ReactNode }) {
  return (
    <button type="button" className="arca-memory-row" onClick={onSelect}>
      {children}
    </button>
  );
}
