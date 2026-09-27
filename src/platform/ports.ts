// Apps in Toss capabilities as seen by the app (06 §2.3, §3.2). Screens never import the SDK;
// identity and persistence have no substitute implementation.

export type AnonymousKeyResult =
  | { kind: 'ok'; key: string }
  | { kind: 'unavailable'; reason: 'unsupported' | 'error' | 'empty' | 'timeout' };

export interface IdentityPort {
  getAnonymousKey(): Promise<AnonymousKeyResult>;
}

/** String key/value persistence. No enumeration, transaction or atomic replace is assumed (06 §8.2). */
export interface KeyValueStoragePort {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface ClockPort {
  /** Device wall clock in epoch ms. Advisory only; never used for KST date decisions. */
  now(): number;
}

export interface NetworkPort {
  /** Advisory hint for copy selection; never a save/start gate. */
  isOffline(): Promise<boolean>;
}

export type ClipboardResult = { kind: 'copied' } | { kind: 'failed' };

export interface ClipboardPort {
  /** Must be called inside the user gesture that requested the copy. */
  writeText(text: string): Promise<ClipboardResult>;
}

export type ExternalOpenResult = { kind: 'opened' } | { kind: 'unavailable' };

export interface ExternalNavigationPort {
  openSupport(): Promise<ExternalOpenResult>;
  /** Opens a server-provided https policy document outside the app; F02 stays mounted (03 §4.3). */
  openPolicy(url: string): Promise<ExternalOpenResult>;
}

export interface HapticPort {
  /** First-save feedback; failure or no support is a silent no-op (06 §2.3). */
  memorySaved(): Promise<void>;
}

export interface PlatformPort {
  identity: IdentityPort;
  storage: KeyValueStoragePort;
  clock: ClockPort;
  network: NetworkPort;
  clipboard: ClipboardPort;
  external: ExternalNavigationPort;
  haptic: HapticPort;
}
