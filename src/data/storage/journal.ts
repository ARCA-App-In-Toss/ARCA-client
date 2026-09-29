import { z } from 'zod';
import { LocalPersistenceFailure } from '../../domain/failures.ts';
import type { ClockPort, KeyValueStoragePort } from '../../domain/ports/platform.ts';
import type {
  DeletionReceipt,
  JournalPort,
  ManifestData,
  ManifestScope,
  RootData,
} from '../../domain/ports/storage.ts';
import { canonicalJson, checksumOf } from './codec.ts';

const SCHEMA_VERSION = 1;
const PREFIX = 'arca:local:v1';
type Slot = 'a' | 'b';
const SLOTS: readonly Slot[] = ['a', 'b'];

const zRootData = z.object({
  currentGeneration: z.string().min(1).nullable(),
  routeEpoch: z.int().nonnegative(),
  generations: z.array(z.object({ generation: z.string().min(1), ref: z.string().min(1) })),
  deletion: z
    .object({
      ticketId: z.string().min(1),
      deletedGeneration: z.string().min(1),
      resultExpiresAt: z.string().min(1),
    })
    .nullable()
    .optional(),
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

export class StorageJournal implements JournalPort {
  private readonly storage: KeyValueStoragePort;
  private readonly clock: ClockPort;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly sealed = new Set<string>();

  constructor(storage: KeyValueStoragePort, clock: ClockPort) {
    this.storage = storage;
    this.clock = clock;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  readRoot(): Promise<RootData | null> {
    return this.enqueue(async () => (await this.readMeta('root', zRootData)).latest?.envelope?.data ?? null);
  }

  updateRoot(mutate: (current: RootData | null) => RootData): Promise<RootData> {
    return this.enqueue(() => this.writeMeta('root', zRootData, mutate));
  }

  readManifest(scope: ManifestScope): Promise<ManifestData | null> {
    return this.enqueue(async () => (await this.readMeta(scope, zManifestData)).latest?.envelope?.data ?? null);
  }

  initArea(scope: ManifestScope): Promise<void> {
    return this.enqueue(async () => {
      await this.writeMeta(scope, zManifestData, (current) => current ?? { entries: {} });
    });
  }

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
      this.assertOpen(scope);
      await this.writeExact(storageKeys.record(recordRef), JSON.stringify(envelope));

      await this.writeMeta(scope, zManifestData, (current) => {
        const entries = { ...(current?.entries ?? {}) };
        const entry = entries[name];
        if (entry?.pending === recordRef) entries[name] = { ready: recordRef, pending: null };
        return { entries };
      });
    });
  }

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

  clearArea(scope: ManifestScope): Promise<void> {
    return this.enqueue(() => this.clearAreaNow(scope));
  }

  private async clearAreaNow(scope: ManifestScope): Promise<void> {
    {
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
    }
  }

  seal(scope: ManifestScope): void {
    this.sealed.add(ownerOf(scope));
  }

  purgeGeneration(
    scope: ManifestScope & { kind: 'generation' },
    deletedGeneration: string,
  ): Promise<{ routeEpoch: number }> {
    this.seal(scope);
    return this.enqueue(async () => {
      let root: RootData | null;
      try {
        root = (await this.readMeta('root', zRootData)).latest?.envelope?.data ?? null;
      } catch {
        await this.clearAll();
        return { routeEpoch: 0 };
      }
      const others = (root?.generations ?? []).filter((g) => g.ref !== scope.ref && g.generation !== deletedGeneration);
      const current = root?.currentGeneration ?? null;
      if (others.length === 0 && (current === null || current === deletedGeneration)) {
        await this.clearAll();
        return { routeEpoch: (root?.routeEpoch ?? 0) + 1 };
      }
      await this.clearAreaNow(scope);
      const drop = (data: RootData | null): RootData => ({
        ...(data ?? { currentGeneration: null, routeEpoch: 0, generations: [] }),
        currentGeneration: data?.currentGeneration === deletedGeneration ? null : (data?.currentGeneration ?? null),
        generations: (data?.generations ?? []).filter((g) => g.ref !== scope.ref),
      });
      const written = await this.writeMeta('root', zRootData, drop);
      await this.writeMeta('root', zRootData, drop);
      return { routeEpoch: written.routeEpoch };
    });
  }

  recordDeletion(receipt: DeletionReceipt, routeEpoch: number): Promise<void> {
    return this.enqueue(async () => {
      const put = (data: RootData | null): RootData => ({
        currentGeneration: data?.currentGeneration ?? null,
        generations: data?.generations ?? [],
        routeEpoch: Math.max(routeEpoch, data?.routeEpoch ?? 0),
        deletion: receipt,
      });
      const first = await this.readMeta('root', zRootData);
      await this.writeMeta('root', zRootData, put);
      if (first.latest) await this.writeMeta('root', zRootData, put);
    });
  }

  private async clearAll(): Promise<void> {
    try {
      await this.storage.clearItems();
    } catch {
      throw new LocalPersistenceFailure('write');
    }
  }

  private assertOpen(scope: ManifestScope): void {
    if (this.sealed.has(ownerOf(scope))) throw new LocalPersistenceFailure('sealed');
  }

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
    if (scope !== 'root') this.assertOpen(scope);
    const read = await this.readMeta(scope, schema);
    const current = read.latest?.envelope ?? null;
    const data = schema.parse(mutate(current?.data ?? null));
    const sequence = (current?.sequence ?? 0) + 1;
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
      const second = { ...body, writeId: newRef(), sequence: sequence + 1 };
      const secondEnvelope = { ...second, checksum: checksumOf(canonicalJson(second)) };
      await this.writeExact(this.keyFor(scope, target === 'a' ? 'b' : 'a'), JSON.stringify(secondEnvelope));
    } else if (scope !== 'root' && overwritten) {
      await this.collectUnreferenced(overwritten as unknown as ManifestData, [
        current.data as unknown as ManifestData,
        data as unknown as ManifestData,
      ]);
    }
    return data;
  }

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
