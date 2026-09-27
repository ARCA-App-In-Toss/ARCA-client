import type { AnonymousKeyResult, KeyValueStoragePort, PlatformPort } from '../platform/ports.ts';

/** Per-device string storage fake with optional failure injection (07 §7). */
export interface FakeStorage extends KeyValueStoragePort {
  readonly data: Map<string, string>;
  /** Next write to a matching key is rejected (once). */
  failNextWrite(match: (key: string) => boolean): void;
  /** Next write to a matching key silently stores `mutate(value)` instead (read-back mismatch). */
  corruptNextWrite(match: (key: string) => boolean, mutate: (value: string) => string): void;
  /** Every write waits for the returned release function (slow Storage). */
  holdWrites(): () => void;
  readonly writeCount: number;
}

export function createFakeStorage(initial?: Map<string, string>): FakeStorage {
  const data = new Map(initial);
  const writeFailures: ((key: string) => boolean)[] = [];
  const writeCorruptions: { match: (key: string) => boolean; mutate: (value: string) => string }[] = [];
  let gate: Promise<void> | null = null;
  let writeCount = 0;
  return {
    data,
    get writeCount() {
      return writeCount;
    },
    holdWrites() {
      let release!: () => void;
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        gate = null;
        release();
      };
    },
    async getItem(key) {
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      writeCount += 1;
      if (gate) await gate;
      const failIndex = writeFailures.findIndex((match) => match(key));
      if (failIndex >= 0) {
        writeFailures.splice(failIndex, 1);
        throw new Error('synthetic storage write failure');
      }
      const corruptIndex = writeCorruptions.findIndex(({ match }) => match(key));
      if (corruptIndex >= 0) {
        const [corruption] = writeCorruptions.splice(corruptIndex, 1);
        data.set(key, corruption ? corruption.mutate(value) : value);
        return;
      }
      data.set(key, value);
    },
    async removeItem(key) {
      data.delete(key);
    },
    failNextWrite(match) {
      writeFailures.push(match);
    },
    corruptNextWrite(match, mutate) {
      writeCorruptions.push({ match, mutate });
    },
  };
}

export interface FakePlatformOptions {
  anonymousKey?: AnonymousKeyResult | (() => AnonymousKeyResult);
  storage?: FakeStorage;
  offline?: boolean;
  now?: () => number;
}

export interface FakePlatform extends PlatformPort {
  storage: FakeStorage;
  clipboardWrites: string[];
  hapticCount: number;
  setAnonymousKey(result: AnonymousKeyResult): void;
  setOffline(offline: boolean): void;
  setClipboardFails(fails: boolean): void;
}

export function createFakePlatform(options: FakePlatformOptions = {}): FakePlatform {
  let keyResult = options.anonymousKey ?? { kind: 'ok', key: 'synthetic-anon-key-registered' };
  let offline = options.offline ?? false;
  let clipboardFails = false;
  const clipboardWrites: string[] = [];
  const storage = options.storage ?? createFakeStorage();
  const platform: FakePlatform = {
    hapticCount: 0,
    storage,
    clipboardWrites,
    identity: {
      async getAnonymousKey() {
        return typeof keyResult === 'function' ? keyResult() : keyResult;
      },
    },
    clock: { now: options.now ?? (() => Date.now()) },
    network: { isOffline: async () => offline },
    clipboard: {
      async writeText(text) {
        if (clipboardFails) return { kind: 'failed' };
        clipboardWrites.push(text);
        return { kind: 'copied' };
      },
    },
    external: { openSupport: async () => ({ kind: 'unavailable' }) },
    haptic: {
      async memorySaved() {
        platform.hapticCount += 1;
      },
    },
    setAnonymousKey(result) {
      keyResult = result;
    },
    setOffline(value) {
      offline = value;
    },
    setClipboardFails(fails) {
      clipboardFails = fails;
    },
  };
  return platform;
}
