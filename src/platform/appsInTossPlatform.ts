import {
  Device,
  generateHapticFeedback,
  getNetworkStatus,
  Storage,
  setClipboardText,
  User,
} from '@apps-in-toss/web-framework';
import type { AnonymousKeyResult, ClipboardResult, PlatformPort } from './ports.ts';

// Outside the Toss WebView the bridge may never settle; bound the wait so F00 can reach F90.
const IDENTITY_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TIMEOUT), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
const TIMEOUT = Symbol('timeout');

async function getAnonymousKey(): Promise<AnonymousKeyResult> {
  try {
    if (!User.getAnonymousKey.isSupported()) return { kind: 'unavailable', reason: 'unsupported' };
    const result = await withTimeout(User.getAnonymousKey(), IDENTITY_TIMEOUT_MS);
    if (result === TIMEOUT) return { kind: 'unavailable', reason: 'timeout' };
    if (result.type !== 'HASH' || result.hash.length === 0) return { kind: 'unavailable', reason: 'empty' };
    return { kind: 'ok', key: result.hash };
  } catch {
    return { kind: 'unavailable', reason: 'error' };
  }
}

async function writeClipboard(text: string): Promise<ClipboardResult> {
  try {
    await setClipboardText(text);
    return { kind: 'copied' };
  } catch {
    // Standard API fallback, still inside the originating gesture (06 §2.3).
    try {
      await navigator.clipboard.writeText(text);
      return { kind: 'copied' };
    } catch {
      return { kind: 'failed' };
    }
  }
}

export function createAppsInTossPlatform(): PlatformPort {
  return {
    identity: { getAnonymousKey },
    storage: {
      getItem: (key) => Storage.getItem(key),
      setItem: (key, value) => Storage.setItem(key, value),
      removeItem: (key) => Storage.removeItem(key),
      clearItems: () => Storage.clearItems(),
    },
    clock: { now: () => Date.now() },
    // The SDK's visibility event is for transparent service webs only; the WebView's standard
    // visibilitychange is the fallback until real-device evidence says otherwise (06 §2.3).
    lifecycle: {
      onVisibilityChange(listener) {
        if (typeof document === 'undefined') return () => undefined;
        const handler = () => listener(document.visibilityState === 'visible');
        document.addEventListener('visibilitychange', handler);
        return () => document.removeEventListener('visibilitychange', handler);
      },
    },
    network: {
      async isOffline() {
        try {
          return (await getNetworkStatus()) === 'OFFLINE';
        } catch {
          return typeof navigator !== 'undefined' && navigator.onLine === false;
        }
      },
    },
    clipboard: { writeText: writeClipboard },
    // The customer-center capability and URL are not confirmed yet (06 §14); report unavailability honestly.
    external: {
      openSupport: async () => ({ kind: 'unavailable' }),
      async openPolicy(url) {
        try {
          await Device.openURL(url);
          return { kind: 'opened' };
        } catch {
          return { kind: 'unavailable' };
        }
      },
    },
    haptic: {
      async memorySaved() {
        try {
          await generateHapticFeedback({ type: 'softMedium' });
        } catch {
          // Unsupported or failed haptics never block the result.
        }
      },
    },
  };
}
