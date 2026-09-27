import { describe, expect, test } from 'vitest';
import { createFakeStorage, type FakeStorage } from '../../mocks/platform.ts';
import { LocalPersistenceFailure } from '../failures.ts';
import { canonicalJson, checksumOf } from './codec.ts';
import { type ManifestScope, StorageJournal, storageKeys } from './journal.ts';

const clock = { now: () => 1_000 };
const area: ManifestScope = { kind: 'generation', ref: 'area-1' };
const isManifest = (key: string) => key.includes(':manifest:');
const isRecord = (key: string) => key.includes(':r:');

function journalOn(storage: FakeStorage) {
  return new StorageJournal(storage, clock);
}

/** Flip one character inside the stored JSON so the checksum no longer matches. */
function damage(storage: FakeStorage, key: string) {
  const raw = storage.data.get(key);
  if (!raw) throw new Error(`missing ${key}`);
  storage.data.set(key, raw.replace(/"writtenAt":\d+/, '"writtenAt":999999'));
}

/** Recompute the checksum so an intentionally edited envelope is individually valid. */
function resign(envelope: Record<string, unknown>): string {
  const { checksum: _unused, ...rest } = envelope;
  return JSON.stringify({ ...rest, checksum: checksumOf(canonicalJson(rest)) });
}

function sequenceOf(storage: FakeStorage, key: string): number {
  return (JSON.parse(storage.data.get(key) ?? '{}') as { sequence?: number }).sequence ?? 0;
}

function latestSlotKey(storage: FakeStorage, keyFor: (slot: 'a' | 'b') => string) {
  return sequenceOf(storage, keyFor('a')) > sequenceOf(storage, keyFor('b')) ? keyFor('a') : keyFor('b');
}

describe('root A/B copies', () => {
  test('both absent reads as no local list', async () => {
    await expect(journalOn(createFakeStorage()).readRoot()).resolves.toBeNull();
  });

  test('initialization writes two valid copies and later writes alternate', async () => {
    const storage = createFakeStorage();
    const journal = journalOn(storage);
    await journal.updateRoot(() => ({ currentGeneration: 'g1', routeEpoch: 0, generations: [] }));
    expect(storage.data.has(storageKeys.root('a'))).toBe(true);
    expect(storage.data.has(storageKeys.root('b'))).toBe(true);

    await journal.updateRoot((r) => ({ ...(r ?? { generations: [], currentGeneration: null }), routeEpoch: 1 }));
    await expect(journal.readRoot()).resolves.toMatchObject({ routeEpoch: 1 });
  });

  test('MS-STORAGE-001 damaged higher copy falls back to the lower valid copy', async () => {
    const storage = createFakeStorage();
    const journal = journalOn(storage);
    await journal.updateRoot(() => ({ currentGeneration: 'g1', routeEpoch: 0, generations: [] }));
    await journal.updateRoot((r) => ({ ...(r as NonNullable<typeof r>), routeEpoch: 7 }));
    damage(storage, latestSlotKey(storage, storageKeys.root));

    const root = await journalOn(storage).readRoot();
    expect(root?.routeEpoch).toBe(0);
  });

  test('MS-STORAGE-002 both copies damaged is a LocalPersistenceFailure, not an empty list', async () => {
    const storage = createFakeStorage();
    await journalOn(storage).updateRoot(() => ({ currentGeneration: 'g1', routeEpoch: 0, generations: [] }));
    damage(storage, storageKeys.root('a'));
    damage(storage, storageKeys.root('b'));
    await expect(journalOn(storage).readRoot()).rejects.toMatchObject({ reason: 'corrupt' });
  });

  test('MS-STORAGE-002 same sequence with different values is a conflict', async () => {
    const storage = createFakeStorage();
    const journal = journalOn(storage);
    await journal.updateRoot(() => ({ currentGeneration: 'g1', routeEpoch: 0, generations: [] }));
    await journal.updateRoot((r) => ({ ...(r as NonNullable<typeof r>), routeEpoch: 3 }));
    const a = JSON.parse(storage.data.get(storageKeys.root('a')) ?? '{}') as Record<string, unknown>;
    const b = JSON.parse(storage.data.get(storageKeys.root('b')) ?? '{}') as Record<string, unknown>;
    // Re-sign copy b with copy a's sequence so both are individually valid.
    storage.data.set(storageKeys.root('b'), resign({ ...b, sequence: a.sequence }));
    await expect(journalOn(storage).readRoot()).rejects.toMatchObject({ reason: 'conflict' });
  });

  test('a failed write reports failure and keeps the previous copy', async () => {
    const storage = createFakeStorage();
    const journal = journalOn(storage);
    await journal.updateRoot(() => ({ currentGeneration: 'g1', routeEpoch: 0, generations: [] }));
    storage.failNextWrite((key) => key.includes(':root:'));
    await expect(
      journal.updateRoot((r) => ({ ...(r as NonNullable<typeof r>), routeEpoch: 5 })),
    ).rejects.toBeInstanceOf(LocalPersistenceFailure);
    await expect(journal.readRoot()).resolves.toMatchObject({ routeEpoch: 0 });
  });

  test('read-back mismatch is not reported as saved', async () => {
    const storage = createFakeStorage();
    const journal = journalOn(storage);
    storage.corruptNextWrite(
      (key) => key.includes(':root:'),
      (value) => `${value} `,
    );
    await expect(
      journal.updateRoot(() => ({ currentGeneration: null, routeEpoch: 0, generations: [] })),
    ).rejects.toMatchObject({ reason: 'read-back' });
  });
});

describe('records: pending → record → ready', () => {
  test('put then get returns the confirmed record', async () => {
    const journal = journalOn(createFakeStorage());
    await journal.initArea(area);
    await journal.putRecord(area, 'draft:x', { text: 'synthetic' });
    await expect(journal.getRecord(area, 'draft:x')).resolves.toEqual({ text: 'synthetic' });
  });

  test('MS-STORAGE-003 crash after pending manifest (record missing) drops only the pending', async () => {
    const storage = createFakeStorage();
    const journal = journalOn(storage);
    await journal.initArea(area);
    await journal.putRecord(area, 'draft:x', { v: 1 });
    storage.failNextWrite(isRecord);
    await expect(journal.putRecord(area, 'draft:x', { v: 2 })).rejects.toBeInstanceOf(LocalPersistenceFailure);

    const restarted = journalOn(storage);
    await restarted.repair(area);
    const manifest = await restarted.readManifest(area);
    expect(manifest?.entries['draft:x']?.pending).toBeNull();
    await expect(restarted.getRecord(area, 'draft:x')).resolves.toEqual({ v: 1 });
  });

  test('MS-STORAGE-003 crash after record read-back promotes the valid pending on restart', async () => {
    const storage = createFakeStorage();
    const journal = journalOn(storage);
    await journal.initArea(area);
    await journal.putRecord(area, 'draft:x', { v: 1 });
    let manifestWrites = 0;
    storage.failNextWrite((key) => isManifest(key) && ++manifestWrites === 2);
    await expect(journal.putRecord(area, 'draft:x', { v: 2 })).rejects.toBeInstanceOf(LocalPersistenceFailure);

    const restarted = journalOn(storage);
    await expect(restarted.getRecord(area, 'draft:x')).resolves.toEqual({ v: 1 });
    await restarted.repair(area);
    await expect(restarted.getRecord(area, 'draft:x')).resolves.toEqual({ v: 2 });
  });

  test('MS-STORAGE-003 a pending that points at a corrupt record is dropped, ready kept', async () => {
    const storage = createFakeStorage();
    const journal = journalOn(storage);
    await journal.initArea(area);
    await journal.putRecord(area, 'draft:x', { v: 1 });
    let manifestWrites = 0;
    storage.failNextWrite((key) => isManifest(key) && ++manifestWrites === 2);
    await expect(journal.putRecord(area, 'draft:x', { v: 2 })).rejects.toBeInstanceOf(LocalPersistenceFailure);
    const pendingRef = (await journal.readManifest(area))?.entries['draft:x']?.pending;
    storage.data.set(storageKeys.record(pendingRef ?? ''), '{"truncated":');

    const restarted = journalOn(storage);
    await restarted.repair(area);
    expect((await restarted.readManifest(area))?.entries['draft:x']?.pending).toBeNull();
    await expect(restarted.getRecord(area, 'draft:x')).resolves.toEqual({ v: 1 });
  });

  test('MS-STORAGE-004 concurrent metadata updates keep every ref', async () => {
    const journal = journalOn(createFakeStorage());
    await journal.initArea(area);
    await Promise.all([
      journal.putRecord(area, 'draft:a', { v: 'a' }),
      journal.putRecord(area, 'cmd:b', { v: 'b' }),
      journal.putRecord(area, 'draft:c', { v: 'c' }),
    ]);
    const manifest = await journal.readManifest(area);
    expect(Object.keys(manifest?.entries ?? {}).sort()).toEqual(['cmd:b', 'draft:a', 'draft:c']);
  });

  test('replaced records are removed once no valid copy references them', async () => {
    const storage = createFakeStorage();
    const journal = journalOn(storage);
    await journal.initArea(area);
    for (let v = 1; v <= 4; v += 1) await journal.putRecord(area, 'draft:x', { v });
    const recordKeys = [...storage.data.keys()].filter(isRecord);
    expect(recordKeys.length).toBeLessThanOrEqual(2);
    await expect(journal.getRecord(area, 'draft:x')).resolves.toEqual({ v: 4 });
  });

  test('remove excludes the entry from both copies and deletes its record', async () => {
    const storage = createFakeStorage();
    const journal = journalOn(storage);
    await journal.initArea(area);
    await journal.putRecord(area, 'draft:x', { v: 1 });
    await journal.removeRecord(area, 'draft:x');
    expect([...storage.data.keys()].filter(isRecord)).toEqual([]);
    for (const slot of ['a', 'b'] as const) {
      expect(storage.data.get(storageKeys.manifest(area, slot))).not.toContain('draft:x');
    }
  });

  test('a record from another area is never read through this area', async () => {
    const storage = createFakeStorage();
    const journal = journalOn(storage);
    const other: ManifestScope = { kind: 'generation', ref: 'area-2' };
    await journal.initArea(area);
    await journal.putRecord(area, 'draft:x', { v: 1 });
    const foreignRef = (await journal.readManifest(area))?.entries['draft:x']?.ready;
    await journal.initArea(other);
    await journal.putRecord(other, 'draft:y', { v: 2 });

    // Re-sign other's latest manifest so it validly points at area-1's record.
    const key = latestSlotKey(storage, (slot) => storageKeys.manifest(other, slot));
    const envelope = JSON.parse(storage.data.get(key) ?? '{}') as Record<string, unknown>;
    storage.data.set(
      key,
      resign({ ...envelope, data: { entries: { 'draft:y': { ready: foreignRef, pending: null } } } }),
    );

    await expect(journalOn(storage).getRecord(other, 'draft:y')).rejects.toMatchObject({ reason: 'corrupt' });
  });

  test('clearArea removes referenced records and both manifest copies', async () => {
    const storage = createFakeStorage();
    const journal = journalOn(storage);
    await journal.initArea(area);
    await journal.putRecord(area, 'draft:x', { v: 1 });
    await journal.clearArea(area);
    expect([...storage.data.keys()]).toEqual([]);
  });
});
