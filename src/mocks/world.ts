// Synthetic/non-user mock server state (07 §2, §3). Only server state is shared between devices;
// session tokens here are opaque synthetic strings.

export const MOCK_API_BASE = 'https://arca.mock.invalid';

export const SYNTHETIC_KEYS = {
  registered: 'synthetic-anon-key-registered',
  unregistered: 'synthetic-anon-key-unregistered',
} as const;

export type MockOp = 'OP-001' | 'OP-005';

/** One scripted fault, consumed once per matching request (07 §6). */
export type MockFault =
  | { kind: 'network' }
  | { kind: 'error'; status: number; body: unknown }
  | { kind: 'malformed' }
  | { kind: 'delay'; ms: number }
  /** Hold the response until the test releases it, then optionally apply another fault. */
  | { kind: 'hold'; release: Promise<void>; after?: MockFault };

interface Passenger {
  passengerCode: string;
  nickname: string | null;
  revision: string;
  dataGeneration: string;
}

interface SessionRecord {
  anonymousKey: string;
  revoked: boolean;
}

export interface MockWorld {
  passengers: Map<string, Passenger>;
  sessions: Map<string, SessionRecord>;
  today: { dateKst: string; answered: boolean };
  faults: Map<MockOp, MockFault[]>;
  requests: { op: MockOp; bearer: string | null }[];
  issueToken(anonymousKey: string): string;
  /** Revoke every token for the key, as a server-side session expiry would. */
  revokeSessions(anonymousKey: string): void;
  takeFault(op: MockOp): MockFault | undefined;
  addFault(op: MockOp, ...faults: MockFault[]): void;
}

export type ServerBase = 'server.prePassenger' | 'server.activeUnanswered';

export function createMockWorld(base: ServerBase): MockWorld {
  const passengers = new Map<string, Passenger>();
  if (base === 'server.activeUnanswered') {
    passengers.set(SYNTHETIC_KEYS.registered, {
      passengerCode: 'SYN-0001',
      nickname: null,
      revision: 'p-r1',
      dataGeneration: 'gen-synthetic-1',
    });
  }
  const sessions = new Map<string, SessionRecord>();
  const faults = new Map<MockOp, MockFault[]>();
  let tokenSeq = 0;

  return {
    passengers,
    sessions,
    today: { dateKst: '2026-09-27', answered: false },
    faults,
    requests: [],
    issueToken(anonymousKey) {
      tokenSeq += 1;
      const token = `synthetic-token-${tokenSeq}`;
      sessions.set(token, { anonymousKey, revoked: false });
      return token;
    },
    revokeSessions(anonymousKey) {
      for (const record of sessions.values()) if (record.anonymousKey === anonymousKey) record.revoked = true;
    },
    takeFault(op) {
      return faults.get(op)?.shift();
    },
    addFault(op, ...added) {
      faults.set(op, [...(faults.get(op) ?? []), ...added]);
    },
  };
}
