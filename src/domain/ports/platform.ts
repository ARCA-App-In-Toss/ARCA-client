export type AnonymousKeyResult =
  | { kind: 'ok'; key: string }
  | { kind: 'unavailable'; reason: 'unsupported' | 'error' | 'empty' | 'timeout' };

export interface IdentityPort {
  getAnonymousKey(): Promise<AnonymousKeyResult>;
}

export interface KeyValueStoragePort {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clearItems(): Promise<void>;
}

export interface ClockPort {
  now(): number;
}

export interface NetworkPort {
  isOffline(): Promise<boolean>;
  onReconnect(listener: () => void): () => void;
}

export type ClipboardResult = { kind: 'copied' } | { kind: 'failed' };

export interface ClipboardPort {
  writeText(text: string): Promise<ClipboardResult>;
}

export type ExternalOpenResult = { kind: 'opened' } | { kind: 'unavailable' };

export interface ExternalNavigationPort {
  openSupport(): Promise<ExternalOpenResult>;
  openPolicy(url: string): Promise<ExternalOpenResult>;
}

export interface HapticPort {
  memorySaved(): Promise<void>;
}

export interface LifecyclePort {
  onVisibilityChange(listener: (visible: boolean) => void): () => void;
}

export interface PlatformPort {
  identity: IdentityPort;
  storage: KeyValueStoragePort;
  clock: ClockPort;
  network: NetworkPort;
  clipboard: ClipboardPort;
  external: ExternalNavigationPort;
  haptic: HapticPort;
  lifecycle: LifecyclePort;
}
