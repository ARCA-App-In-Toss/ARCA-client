import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { type IconName, MemoryFragment, PixelIcon } from './pixel.tsx';

export function PixelAppShell({
  children,
  tabs,
  backdrop,
  className,
}: {
  children: ReactNode;
  tabs?: ReactNode;
  backdrop?: ReactNode;
  className?: string;
}) {
  return (
    <div className={['arca-shell', className].filter(Boolean).join(' ')}>
      {backdrop}
      <main className={tabs ? 'arca-shell__content arca-shell__content--with-tabs' : 'arca-shell__content'}>
        {children}
      </main>
      {tabs}
    </div>
  );
}

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

export function ScenePanel({
  children,
  labelledBy,
  art = false,
}: {
  children: ReactNode;
  labelledBy?: string | undefined;
  art?: boolean;
}) {
  return (
    <section
      className={['arca-scene-panel', 'arca-plain', art ? 'arca-scene-panel--art' : null].filter(Boolean).join(' ')}
      aria-labelledby={labelledBy}
    >
      {children}
    </section>
  );
}

export function CapsuleDisplay({ labelledBy, children }: { labelledBy?: string | undefined; children: ReactNode }) {
  return (
    <section className="arca-capsule-display arca-px" aria-labelledby={labelledBy}>
      {children}
    </section>
  );
}

export function InsetPanel({ children }: { children: ReactNode }) {
  return <div className="arca-inset-panel arca-plain-small">{children}</div>;
}

export function PixelPlaceholder() {
  return (
    <div className="arca-placeholder" aria-hidden="true">
      <div className="arca-placeholder__bar" />
      <div className="arca-placeholder__bar" />
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-text' | 'ghost' | 'row';

export interface PixelButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: IconName;
  ref?: Ref<HTMLButtonElement>;
}

export function PixelButton({
  variant = 'secondary',
  loading = false,
  icon,
  onClick,
  className,
  children,
  ...rest
}: PixelButtonProps) {
  const framed = variant !== 'ghost' && variant !== 'danger-text';
  return (
    <button
      {...rest}
      type="button"
      className={['arca-button', `arca-button--${variant}`, framed ? 'arca-px' : null, className]
        .filter(Boolean)
        .join(' ')}
      aria-busy={loading || undefined}
      aria-disabled={loading || rest['aria-disabled'] || undefined}
      onClick={(event) => {
        if (loading) return;
        onClick?.(event);
      }}
    >
      {icon ? <PixelIcon name={icon} /> : null}
      {variant === 'row' ? <span>{children}</span> : children}
      {variant === 'row' ? <PixelIcon name="chevron-right" /> : null}
    </button>
  );
}

export function PixelCheckboxRow({
  id,
  label,
  badge,
  accessibleName,
  link,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  badge: string;
  accessibleName: string;
  link?: { text: string; accessibleName: string; onOpen: () => void };
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="arca-checkbox-row">
      <input
        id={id}
        type="checkbox"
        className="arca-checkbox arca-px"
        aria-label={accessibleName}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {link ? (
        <span className="arca-checkbox-row__label">
          <label htmlFor={id}>
            <span className="arca-checkbox-row__badge">{badge}</span>
          </label>
          <button type="button" className="arca-inline-link" aria-label={link.accessibleName} onClick={link.onOpen}>
            {link.text}
          </button>
          <label htmlFor={id}>{label}</label>
        </span>
      ) : (
        <label htmlFor={id} className="arca-checkbox-row__label">
          <span className="arca-checkbox-row__badge">{badge}</span>
          {label}
        </label>
      )}
    </div>
  );
}

export function InlineStatus({
  message,
  tone = 'neutral',
  live = true,
  quiet = false,
}: {
  message: string | null;
  tone?: 'neutral' | 'danger';
  live?: boolean;
  quiet?: boolean;
}) {
  const className = [
    'arca-inline-status',
    tone === 'danger' && 'arca-inline-status--danger',
    quiet && 'arca-inline-status--quiet',
  ]
    .filter(Boolean)
    .join(' ');
  if (!live) return message ? <p className={className}>{message}</p> : null;
  return (
    <div role="status" aria-live="polite" className={className}>
      {message}
    </div>
  );
}

export function StatePanel({ children, centered = false }: { children: ReactNode; centered?: boolean }) {
  return (
    <InsetPanel>
      <div className={centered ? 'arca-state-panel arca-state-panel--centered' : 'arca-state-panel'}>{children}</div>
    </InsetPanel>
  );
}

export function RecordPanel({
  children,
  labelledBy,
  hero = false,
}: {
  children: ReactNode;
  labelledBy?: string | undefined;
  hero?: boolean;
}) {
  return (
    <section
      className={hero ? 'arca-record-panel arca-record-panel--hero arca-plain' : 'arca-record-panel arca-plain'}
      aria-labelledby={labelledBy}
    >
      {children}
    </section>
  );
}

export function MemoryCount({ label, value }: { label: string; value: string }) {
  return (
    <p className="arca-memory-count">
      <MemoryFragment cell={2} />
      <span className="arca-visually-hidden">{label}</span>
      <span aria-hidden="true">{value}</span>
    </p>
  );
}

export function PrivacyNote({ id, lead, detail }: { id: string; lead: string; detail: string }) {
  return (
    <p className="arca-privacy arca-privacy--centered" id={id}>
      <span className="arca-privacy__line">
        <PixelIcon name="lock" />
        {lead}
      </span>{' '}
      <span className="arca-privacy__line">{detail}</span>
    </p>
  );
}

export function RollingCount({ from, to }: { from: string; to: string }) {
  const width = Math.max(from.length, to.length);
  const before = from.padStart(width, ' ');
  const after = to.padStart(width, ' ');
  return (
    <span className="arca-rolling-count">
      {Array.from(after, (digit, place) =>
        digit === before[place] ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: 자리 위치가 곧 식별자다.
          <span key={place}>{digit}</span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: 자리 위치가 곧 식별자다.
          <span key={place} className="arca-rolling-count__reel">
            <span>{before[place]}</span>
            <span>{digit}</span>
          </span>
        ),
      )}
    </span>
  );
}

export function PixelIconButton({
  label,
  icon,
  onClick,
  buttonRef,
}: {
  label: string;
  icon: IconName;
  onClick: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button ref={buttonRef} type="button" className="arca-icon-button" aria-label={label} onClick={onClick}>
      <PixelIcon name={icon} />
    </button>
  );
}

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
  textareaRef?: { current: HTMLTextAreaElement | null };
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'value' | 'aria-describedby' | 'aria-invalid'>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (textareaRef) textareaRef.current = ref.current;
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: 높이는 value가 바뀔 때마다 다시 맞춰야 한다.
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
        className="arca-textarea arca-px"
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
      />
    </div>
  );
}

export function PixelTextField({
  id,
  label,
  describedBy,
  invalid,
  value,
  inputRef,
  ...rest
}: {
  id: string;
  label: ReactNode;
  describedBy: string;
  invalid: boolean;
  value: string;
  inputRef?: Ref<HTMLInputElement>;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'type' | 'aria-describedby' | 'aria-invalid'>) {
  return (
    <div className="arca-field">
      <label className="arca-label" htmlFor={id}>
        {label}
      </label>
      <input
        {...rest}
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        className="arca-text-input arca-px"
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
      />
    </div>
  );
}

export type RootTabId = 'today' | 'archive' | 'settings';

const tabIcons: Record<RootTabId, IconName> = { today: 'today', archive: 'archive', settings: 'settings' };

let mountedRootTabs = 0;

export function RootFloatingTabs({
  current,
  tabs,
}: {
  current: RootTabId;
  tabs: { id: RootTabId; label: string; onSelect: () => void }[];
}) {
  const [entering] = useState(() => mountedRootTabs === 0);
  useEffect(() => {
    mountedRootTabs += 1;
    return () => {
      mountedRootTabs -= 1;
    };
  }, []);
  return (
    <nav className={entering ? 'arca-root-tabs arca-root-tabs--entering arca-px' : 'arca-root-tabs arca-px'}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="arca-root-tab arca-px"
          aria-current={tab.id === current ? 'page' : undefined}
          onClick={tab.id === current ? undefined : tab.onSelect}
        >
          <PixelIcon name={tabIcons[tab.id]} />
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function MemoryRow({ onSelect, children }: { onSelect: () => void; children: ReactNode }) {
  return (
    <button type="button" className="arca-memory-row" onClick={onSelect}>
      {children}
    </button>
  );
}
