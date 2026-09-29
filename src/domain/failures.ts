export class TransportFailure extends Error {
  override readonly name = 'TransportFailure';
  readonly reason: 'network' | 'timeout' | 'aborted' | 'not-configured';
  constructor(reason: TransportFailure['reason']) {
    super(`transport:${reason}`);
    this.reason = reason;
  }
}

export class ProtocolFailure extends Error {
  override readonly name = 'ProtocolFailure';
  readonly reason: 'status' | 'envelope' | 'schema' | 'json';
  constructor(reason: ProtocolFailure['reason']) {
    super(`protocol:${reason}`);
    this.reason = reason;
  }
}

export type DomainErrorCategory = 'VALIDATION' | 'AUTH' | 'CONFLICT' | 'RATE_LIMIT' | 'MAINTENANCE';

export class DomainFailure extends Error {
  override readonly name = 'DomainFailure';
  readonly code: string;
  readonly category: DomainErrorCategory;
  readonly requestId: string;
  readonly recoveryAllowed: boolean;
  constructor(code: string, category: DomainErrorCategory, requestId: string, recoveryAllowed: boolean) {
    super(`domain:${code}`);
    this.code = code;
    this.category = category;
    this.requestId = requestId;
    this.recoveryAllowed = recoveryAllowed;
  }
}

export class LocalPersistenceFailure extends Error {
  override readonly name = 'LocalPersistenceFailure';
  readonly reason: 'write' | 'read-back' | 'corrupt' | 'conflict' | 'unreadable' | 'sealed';
  constructor(reason: LocalPersistenceFailure['reason']) {
    super(`local:${reason}`);
    this.reason = reason;
  }
}

export type ArcaFailure = TransportFailure | ProtocolFailure | DomainFailure | LocalPersistenceFailure;

export function isArcaFailure(error: unknown): error is ArcaFailure {
  return (
    error instanceof TransportFailure ||
    error instanceof ProtocolFailure ||
    error instanceof DomainFailure ||
    error instanceof LocalPersistenceFailure
  );
}
