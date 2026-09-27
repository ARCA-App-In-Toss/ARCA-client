import { z } from 'zod';
import type { ClockPort, KeyValueStoragePort } from '../../platform/ports.ts';
import { LocalPersistenceFailure } from '../failures.ts';
import { canonicalJson, checksumOf } from './codec.ts';

// StorageJournal (06 §8.1–8.2). SDK Storage gives no enumeration, transaction or atomic replace, so
// root and every manifest use fixed A/B keys, a monotonic sequence and a checksum, and every
// metadata read-modify-write runs through one queue.

const SCHEMA_VERSION = 1;
const PREFIX = 'arca:local:v1';
type Slot = 'a' | 'b';
const SLOTS: readonly Slot[] = ['a', 'b'];

export type ManifestScope = { kind: 'pre' } | { kind: 'generation'; ref: string };

export interface RootData {
  /** Server dataGeneration currently owning the device area, or null (PRE / none). */
  currentGeneration: string | null;
  /** Local history fence, bumped on generation change (06 §5.5). */
  routeEpoch: number;
  /** Known generation areas and their local key refs; kept until cleanup is confirmed. */
  generations: { generation: string; ref: string }[];
}

export interface ManifestEntry {
  ready: string | null;
  pending: string | null;
}

export interface ManifestData {
  entries: Record<string, ManifestEntry>;
}

const zRootData = z.object({
  currentGeneration: z.string().min(1).nullable(),
  routeEpoch: z.int().nonnegative(),
  generations: z.array(z.object({ generation: z.string().min(1), ref: z.string().min(1) })),
});

const zManifestData = z.object({
  entries: z.record(z.string(), z.object({ ready: z.string().nullable(), pending: z.string().nullable() })),
});

const zMetaEnvelope = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  recordKind: z.enum(['root', 'manifest']),
  owner: z.string(),
  writeId: z.string().min(1),
  writtenAt: z.number(),
  sequence: z.int().positive(),
  data: z.unknown(),
  checksum: z.string(),
});

const zRecordEnvelope = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  recordKind: z.literal('record'),
  owner: z.string(),
  writeId: z.string().min(1),
  writtenAt: z.number(),
  data: z.unknown(),
});

type MetaEnvelope<T> = Omit<z.output<typeof zMetaEnvelope>, 'data'> & { data: T };

export const storageKeys = {
  root: (slot: Slot) => `${PREFIX}:root:${slot}`,
  manifest: (scope: ManifestScope, slot: Slot) =>
    scope.kind === 'pre' ? `${PREFIX}:pre:manifest:${slot}` : `${PREFIX}:g:${scope.ref}:manifest:${slot}`,
  record: (recordRef: string) => `${PREFIX}:r:${recordRef}`,
};

function ownerOf(scope: ManifestScope | 'root'): string {
  if (scope === 'root') return 'root';
  return scope.kind === 'pre' ? 'pre' : `g:${scope.ref}`;
}

let refSeq = 0;
function newRef(): string {
  refSeq += 1;
  return globalThis.crypto?.randomUUID?.() ?? `ref-${refSeq}-${Math.random().toString(36).slice(2)}`;
}

interface SlotRead<T> {
  slot: Slot;
  state: 'absent' | 'invalid' | 'valid';
  envelope?: MetaEnvelope<T>;
  raw?: string;
}

interface MetaRead<T> {
  latest: SlotRead<T> | null;
  slots: Record<Slot, SlotRead<T>>;
}

export class StorageJournal {
  private readonly storage: KeyValueStoragePort;
  private readonly clock: ClockPort;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(storage: KeyValueStoragePort, clock: ClockPort) {
    this.storage = storage;
    this.clock = clock;
  }

  /** Serialize metadata work (06 §8.2). A failed task does not poison later ones. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  // ---- root ----------------------------------------------------------------------------------

  /** Null when both copies are absent (no restorable local list). Throws on corruption/conflict. */
  readRoot(): Promise<RootData | null> {
    return this.enqueue(async () => (await this.readMeta('root', zRootData)).latest?.envelope?.data ?? null);
  }

  updateRoot(mutate: (current: RootData | null) => RootData): Promise<RootData> {
    return this.enqueue(() => this.writeMeta('root', zRootData, mutate));
  }

  // ---- manifests and records -----------------------------------------------------------------

  /** Null only when both copies are absent. A known area must have been created with `initArea`. */
  readManifest(scope: ManifestScope): Promise<ManifestData | null> {
    return this.enqueue(async () => (await this.readMeta(scope, zManifestData)).latest?.envelope?.data ?? null);
  }

  /** Creates two valid empty copies for a new area; no-op if the area already has a valid copy. */
  initArea(scope: ManifestScope): Promise<void> {
    return this.enqueue(async () => {
      await this.writeMeta(scope, zManifestData, (current) => current ?? { entries: {} });
    });
  }

  /** Reads the ready record for `name`, validating owner and schema. */
  getRecord(scope: ManifestScope, name: string): Promise<unknown | null> {
    return this.enqueue(async () => {
      const manifest = (await this.readMeta(scope, zManifestData)).latest?.envelope?.data;
      const ref = manifest?.entries[name]?.ready;
      if (!ref) return null;
      const record = await this.readRecord(scope, ref);
      if (!record) throw new LocalPersistenceFailure('corrupt');
      return record;
    });
  }

  /**
   * pending manifest → record → ready manifest, each confirmed by exact read-back (06 §8.2 1–3).
   * Resolves only after the ready pointer is confirmed; any failure leaves the previous ready intact.
   */
  putRecord(scope: ManifestScope, name: string, data: unknown): Promise<void> {
    return this.enqueue(async () => {
      const recordRef = newRef();
      await this.writeMeta(scope, zManifestData, (current) => {
        const entries = { ...(current?.entries ?? {}) };
        entries[name] = { ready: entries[name]?.ready ?? null, pending: recordRef };
        return { entries };
      });

      const envelope: z.output<typeof zRecordEnvelope> = {
        schemaVersion: SCHEMA_VERSION,
        recordKind: 'record',
        owner: ownerOf(scope),
        writeId: newRef(),
        writtenAt: this.clock.now(),
        data,
      };
      await this.writeExact(storageKeys.record(recordRef), JSON.stringify(envelope));

      await this.writeMeta(scope, zManifestData, (current) => {
        const entries = { ...(current?.entries ?? {}) };
        const entry = entries[name];
        // Promote only our own pending; a newer pending from a later task wins.
        if (entry?.pending === recordRef) entries[name] = { ready: recordRef, pending: null };
        return { entries };
      });
    });
  }

  /** Excludes `name` from both valid copies, then removes its records (06 §8.2 deletion). */
  removeRecord(scope: ManifestScope, name: string): Promise<void> {
    return this.enqueue(async () => {
      const exclude = (current: ManifestData | null): ManifestData => {
        const entries = { ...(current?.entries ?? {}) };
        delete entries[name];
        return { entries };
      };
      await this.writeMeta(scope, zManifestData, exclude);
      await this.writeMeta(scope, zManifestData, exclude);
    });
  }

  /** Startup repair: promote valid pending records, drop missing/corrupt pending (06 §8.2). */
  repair(scope: ManifestScope): Promise<void> {
    return this.enqueue(async () => {
      const manifest = (await this.readMeta(scope, zManifestData)).latest?.envelope?.data;
      if (!manifest) return;
      const pendingNames = Object.entries(manifest.entries).filter(([, e]) => e.pending);
      if (pendingNames.length === 0) return;
      const validity = new Map<string, boolean>();
      for (const [, entry] of pendingNames) {
        if (entry.pending) validity.set(entry.pending, (await this.readRecord(scope, entry.pending)) !== null);
      }
      await this.writeMeta(scope, zManifestData, (current) => {
        const entries = { ...(current?.entries ?? {}) };
        for (const [name, entry] of Object.entries(entries)) {
          if (!entry.pending) continue;
          entries[name] = validity.get(entry.pending)
            ? { ready: entry.pending, pending: null }
            : { ready: entry.ready, pending: null };
        }
        return { entries };
      });
    });
  }

  /**
   * Removes a whole generation area: its referenced records and both manifest copies. Orphans
   * that no copy references cannot be enumerated and are not claimed (06 §8.2).
   */
  clearArea(scope: ManifestScope): Promise<void> {
    return this.enqueue(async () => {
      const refs = new Set<string>();
      for (const slot of SLOTS) {
        const read = await this.readSlot(scope, slot, zManifestData);
        for (const entry of Object.values(read.envelope?.data.entries ?? {})) {
          if (entry.ready) refs.add(entry.ready);
          if (entry.pending) refs.add(entry.pending);
        }
      }
      for (const ref of refs) await this.removeExact(storageKeys.record(ref));
      for (const slot of SLOTS) await this.removeExact(storageKeys.manifest(scope, slot));
    });
  }

  // ---- internals -------------------------------------------------------------------------------

  private keyFor(scope: ManifestScope | 'root', slot: Slot): string {
    return scope === 'root' ? storageKeys.root(slot) : storageKeys.manifest(scope, slot);
  }

  private async readSlot<T>(scope: ManifestScope | 'root', slot: Slot, schema: z.ZodType<T>): Promise<SlotRead<T>> {
    let raw: string | null;
    try {
      raw = await this.storage.getItem(this.keyFor(scope, slot));
    } catch {
      throw new LocalPersistenceFailure('unreadable');
    }
    if (raw === null) return { slot, state: 'absent' };
    try {
      const envelope = zMetaEnvelope.parse(JSON.parse(raw));
      const { checksum, ...rest } = envelope;
      const expectedKind = scope === 'root' ? 'root' : 'manifest';
      if (envelope.recordKind !== expectedKind || envelope.owner !== ownerOf(scope)) {
        return { slot, state: 'invalid', raw };
      }
      if (checksumOf(canonicalJson(rest)) !== checksum) return { slot, state: 'invalid', raw };
      const data = schema.parse(envelope.data);
      return { slot, state: 'valid', envelope: { ...envelope, data }, raw };
    } catch {
      return { slot, state: 'invalid', raw };
    }
  }

  private async readMeta<T>(scope: ManifestScope | 'root', schema: z.ZodType<T>): Promise<MetaRead<T>> {
    const a = await this.readSlot(scope, 'a', schema);
    const b = await this.readSlot(scope, 'b', schema);
    const slots = { a, b };
    const valid = [a, b].filter((s) => s.state === 'valid');
    if (valid.length === 0) {
      // Both copies corrupt, or one corrupt and one missing: never pretend an empty list (06 §8.1).
      if (a.state === 'invalid' || b.state === 'invalid') throw new LocalPersistenceFailure('corrupt');
      return { latest: null, slots };
    }
    if (valid.length === 2 && a.envelope && b.envelope && a.envelope.sequence === b.envelope.sequence) {
      if (a.raw !== b.raw) throw new LocalPersistenceFailure('conflict');
    }
    const latest = valid.reduce((x, y) => ((y.envelope?.sequence ?? 0) > (x.envelope?.sequence ?? 0) ? y : x));
    return { latest, slots };
  }

  private async writeMeta<T>(
    scope: ManifestScope | 'root',
    schema: z.ZodType<T>,
    mutate: (current: T | null) => T,
  ): Promise<T> {
    const read = await this.readMeta(scope, schema);
    const current = read.latest?.envelope ?? null;
    const data = schema.parse(mutate(current?.data ?? null));
    const sequence = (current?.sequence ?? 0) + 1;
    // Always write the slot that does not hold the latest valid copy.
    const target: Slot = read.latest?.slot === 'a' ? 'b' : 'a';
    const overwritten = read.slots[target].envelope?.data;

    const body = {
      schemaVersion: SCHEMA_VERSION,
      recordKind: scope === 'root' ? ('root' as const) : ('manifest' as const),
      owner: ownerOf(scope),
      writeId: newRef(),
      writtenAt: this.clock.now(),
      sequence,
      data,
    };
    const envelope = { ...body, checksum: checksumOf(canonicalJson(body)) };
    await this.writeExact(this.keyFor(scope, target), JSON.stringify(envelope));

    if (!current) {
      // Initialization secures two valid copies (06 §8.2 3).
      const second = { ...body, writeId: newRef(), sequence: sequence + 1 };
      const secondEnvelope = { ...second, checksum: checksumOf(canonicalJson(second)) };
      await this.writeExact(this.keyFor(scope, target === 'a' ? 'b' : 'a'), JSON.stringify(secondEnvelope));
    } else if (scope !== 'root' && overwritten) {
      // Only manifests reach here; root has no record refs.
      await this.collectUnreferenced(overwritten as unknown as ManifestData, [
        current.data as unknown as ManifestData,
        data as unknown as ManifestData,
      ]);
    }
    return data;
  }

  /** Remove records referenced only by the overwritten copy (06 §8.2 4). */
  private async collectUnreferenced(previous: ManifestData, live: ManifestData[]) {
    const liveRefs = new Set<string>();
    for (const manifest of live) {
      for (const entry of Object.values(manifest.entries)) {
        if (entry.ready) liveRefs.add(entry.ready);
        if (entry.pending) liveRefs.add(entry.pending);
      }
    }
    for (const entry of Object.values(previous.entries)) {
      for (const ref of [entry.ready, entry.pending]) {
        if (ref && !liveRefs.has(ref)) await this.removeExact(storageKeys.record(ref));
      }
    }
  }

  private async readRecord(scope: ManifestScope, ref: string): Promise<unknown | null> {
    let raw: string | null;
    try {
      raw = await this.storage.getItem(storageKeys.record(ref));
    } catch {
      throw new LocalPersistenceFailure('unreadable');
    }
    if (raw === null) return null;
    try {
      const envelope = zRecordEnvelope.parse(JSON.parse(raw));
      return envelope.owner === ownerOf(scope) ? envelope.data : null;
    } catch {
      return null;
    }
  }

  private async writeExact(key: string, value: string): Promise<void> {
    try {
      await this.storage.setItem(key, value);
    } catch {
      throw new LocalPersistenceFailure('write');
    }
    let back: string | null;
    try {
      back = await this.storage.getItem(key);
    } catch {
      throw new LocalPersistenceFailure('read-back');
    }
    if (back !== value) throw new LocalPersistenceFailure('read-back');
  }

  private async removeExact(key: string): Promise<void> {
    try {
      await this.storage.removeItem(key);
    } catch {
      throw new LocalPersistenceFailure('write');
    }
  }
}
