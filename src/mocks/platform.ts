import type { AnonymousKeyResult, KeyValueStoragePort, PlatformPort } from '../domain/ports/platform.ts';

export interface FakeStorage extends KeyValueStoragePort {
  readonly data: Map<string, string>;
  failNextWrite(match: (key: string) => boolean): void;
  corruptNextWrite(match: (key: string) => boolean, mutate: (value: string) => string): void;
  holdWrites(): () => void;
  readonly writeCount: number;
  readonly clearCount: number;
  failNextRemovals(count: number): void;
}

export function createFakeStorage(initial?: Map<string, string>): FakeStorage {
  const data = new Map(initial);
  const writeFailures: ((key: string) => boolean)[] = [];
  const writeCorruptions: { match: (key: string) => boolean; mutate: (value: string) => string }[] = [];
  let gate: Promise<void> | null = null;
  let writeCount = 0;
  let removalFailures = 0;
  let clearCount = 0;
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
      if (removalFailures > 0) {
        removalFailures -= 1;
        throw new Error('synthetic storage remove failure');
      }
      data.delete(key);
    },
    async clearItems() {
      if (removalFailures > 0) {
        removalFailures -= 1;
        throw new Error('synthetic storage clear failure');
      }
      clearCount += 1;
      data.clear();
    },
    get clearCount() {
      return clearCount;
    },
    failNextRemovals(count) {
      removalFailures += count;
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
  openedPolicies: string[];
  hapticCount: number;
  setAnonymousKey(result: AnonymousKeyResult): void;
  setOffline(offline: boolean): void;
  setClipboardFails(fails: boolean): void;
  setExternalFails(fails: boolean): void;
  setVisible(visible: boolean): void;
}

export function createFakePlatform(options: FakePlatformOptions = {}): FakePlatform {
  let keyResult = options.anonymousKey ?? { kind: 'ok', key: 'synthetic-anon-key-registered' };
  let offline = options.offline ?? false;
  let clipboardFails = false;
  let externalFails = false;
  const clipboardWrites: string[] = [];
  const openedPolicies: string[] = [];
  const visibilityListeners = new Set<(visible: boolean) => void>();
  const reconnectListeners = new Set<() => void>();
  const storage = options.storage ?? createFakeStorage();
  const platform: FakePlatform = {
    hapticCount: 0,
    storage,
    clipboardWrites,
    openedPolicies,
    identity: {
      async getAnonymousKey() {
        return typeof keyResult === 'function' ? keyResult() : keyResult;
      },
    },
    clock: { now: options.now ?? (() => Date.now()) },
    network: {
      isOffline: async () => offline,
      onReconnect(listener) {
        reconnectListeners.add(listener);
        return () => reconnectListeners.delete(listener);
      },
    },
    clipboard: {
      async writeText(text) {
        if (clipboardFails) return { kind: 'failed' };
        clipboardWrites.push(text);
        return { kind: 'copied' };
      },
    },
    external: {
      openSupport: async () => ({ kind: 'unavailable' }),
      async openPolicy(url) {
        if (externalFails) return { kind: 'unavailable' };
        openedPolicies.push(url);
        return { kind: 'opened' };
      },
    },
    haptic: {
      async memorySaved() {
        platform.hapticCount += 1;
      },
    },
    setAnonymousKey(result) {
      keyResult = result;
    },
    setOffline(value) {
      const reconnected = offline && !value;
      offline = value;
      if (reconnected) for (const listener of reconnectListeners) listener();
    },
    setClipboardFails(fails) {
      clipboardFails = fails;
    },
    setExternalFails(fails) {
      externalFails = fails;
    },
    lifecycle: {
      onVisibilityChange(listener) {
        visibilityListeners.add(listener);
        return () => visibilityListeners.delete(listener);
      },
    },
    setVisible(visible) {
      for (const listener of visibilityListeners) listener(visible);
    },
  };
  return platform;
}
