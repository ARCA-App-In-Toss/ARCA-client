import { expect, type Page } from '@playwright/test';
import { MOCK_API_BASE, SYNTHETIC_KEYS } from '../../src/mocks/world.ts';

export const CANARY = {
  answer: '카나리 답변 PRV7Q3 한 정거장',
  nickname: '카나리PRV닉',
} as const;

const PATTERNS: Record<string, string[]> = {
  answer: [CANARY.answer, 'PRV7Q3'],
  nickname: [CANARY.nickname, 'PRV닉'],
  anonymousKey: [SYNTHETIC_KEYS.registered, SYNTHETIC_KEYS.unregistered, 'synthetic-anon-key'],
  token: ['synthetic-token-'],
};

const INTERNAL_ID_PATTERNS = ['synthetic-answer-', 'synthetic-ticket-', 'synthetic-deletion-'];

interface SinkEntry {
  sink: string;
  value: string;
}

interface PageSnapshot {
  href: string;
  historyState: string;
  title: string;
  referrer: string;
  cookie: string;
  localStorage: string[];
  sessionStorage: string[];
  indexedDb: string[];
  sinkLog: [string, string][];
}

type SinkWindow = Window & { __arcaSinkLog?: [string, string][] };

function installRecorder() {
  const log: [string, string][] = [];
  (window as SinkWindow).__arcaSinkLog = log;
  const record = (sink: string, value: unknown) => {
    try {
      log.push([sink, typeof value === 'string' ? value : JSON.stringify(value ?? null)]);
    } catch {
      log.push([sink, String(value)]);
    }
  };
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    history[method] = function (this: History, state: unknown, unused: string, url?: string | URL | null) {
      record('history.state', state);
      if (url != null) record('history.url', String(url));
      return original.call(this, state, unused, url);
    };
  }
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
    record(this === window.sessionStorage ? 'sessionStorage' : 'localStorage', `${key}=${value}`);
    return setItem.call(this, key, value);
  };
  const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
  if (cookie?.set && cookie.get) {
    const { get, set } = cookie;
    Object.defineProperty(Document.prototype, 'cookie', {
      configurable: true,
      get() {
        return get.call(this);
      },
      set(value: string) {
        record('cookie', value);
        set.call(this, value);
      },
    });
  }
  if (typeof navigator.sendBeacon === 'function') {
    const sendBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      record('beacon', `${String(url)} ${typeof data === 'string' ? data : ''}`);
      return sendBeacon(url, data);
    };
  }
  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(() => record('document.title', document.title)).observe(document.head, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
}

async function readSnapshot(page: Page): Promise<PageSnapshot> {
  return page.evaluate(async () => {
    const dump = (storage: Storage) => {
      const entries: string[] = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i) ?? '';
        entries.push(`${key}=${storage.getItem(key) ?? ''}`);
      }
      return entries;
    };
    let indexedDb: string[] = [];
    try {
      const databases = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
      indexedDb = databases.map((database) => database.name ?? '');
    } catch {
      indexedDb = [];
    }
    return {
      href: location.href,
      historyState: JSON.stringify(history.state ?? null),
      title: document.title,
      referrer: document.referrer,
      cookie: document.cookie,
      localStorage: dump(window.localStorage),
      sessionStorage: dump(window.sessionStorage),
      indexedDb,
      sinkLog: (window as Window & { __arcaSinkLog?: [string, string][] }).__arcaSinkLog ?? [],
    };
  });
}

const isMockApi = (url: string) => url.startsWith(MOCK_API_BASE);

export async function watchSinks(page: Page) {
  const entries: SinkEntry[] = [];
  const push = (sink: string, value: string) => entries.push({ sink, value });
  await page.addInitScript(installRecorder);
  page.on('console', (message) => push(`console.${message.type()}`, message.text()));
  page.on('pageerror', (error) => push('pageerror', `${error.message}\n${error.stack ?? ''}`));
  page.on('framenavigated', (frame) => push('navigation.url', frame.url()));
  page.on('request', (request) => {
    const url = request.url();
    push('request.url', url);
    const referer = request.headers().referer;
    if (referer) push('request.referer', referer);
    if (!isMockApi(url)) push('request.body.non-api', request.postData() ?? '');
  });

  const checkpoint = async () => {
    const snapshot = await readSnapshot(page);
    push('location.href', snapshot.href);
    push('history.state', snapshot.historyState);
    push('document.title', snapshot.title);
    push('document.referrer', snapshot.referrer);
    push('document.cookie', snapshot.cookie);
    for (const entry of snapshot.localStorage) push('localStorage', entry);
    for (const entry of snapshot.sessionStorage) push('sessionStorage', entry);
    for (const name of snapshot.indexedDb) push('indexedDB', name);
    for (const [sink, value] of snapshot.sinkLog) push(`recorded.${sink}`, value);
  };

  const assertClean = async () => {
    await checkpoint();
    const leaks = new Set<string>();
    for (const { sink, value } of entries) {
      for (const [role, patterns] of Object.entries(PATTERNS)) {
        if (patterns.some((pattern) => value.includes(pattern))) leaks.add(`${sink} ← ${role}`);
      }
      if (sink !== 'request.url' && INTERNAL_ID_PATTERNS.some((pattern) => value.includes(pattern))) {
        leaks.add(`${sink} ← internalId`);
      }
    }
    expect([...leaks]).toEqual([]);
  };

  return { checkpoint, assertClean };
}
