export type ManifestScope = { kind: 'pre' } | { kind: 'generation'; ref: string };

export interface DeletionReceipt {
  ticketId: string;
  deletedGeneration: string;
  resultExpiresAt: string;
}

export interface RootData {
  currentGeneration: string | null;
  routeEpoch: number;
  generations: { generation: string; ref: string }[];
  deletion?: DeletionReceipt | null | undefined;
}

export interface ManifestEntry {
  ready: string | null;
  pending: string | null;
}

export interface ManifestData {
  entries: Record<string, ManifestEntry>;
}

export interface JournalPort {
  readRoot(): Promise<RootData | null>;
  updateRoot(mutate: (current: RootData | null) => RootData): Promise<RootData>;
  readManifest(scope: ManifestScope): Promise<ManifestData | null>;
  initArea(scope: ManifestScope): Promise<void>;
  getRecord(scope: ManifestScope, name: string): Promise<unknown | null>;
  putRecord(scope: ManifestScope, name: string, data: unknown): Promise<void>;
  removeRecord(scope: ManifestScope, name: string): Promise<void>;
  repair(scope: ManifestScope): Promise<void>;
  clearArea(scope: ManifestScope): Promise<void>;
  seal(scope: ManifestScope): void;
  purgeGeneration(
    scope: ManifestScope & { kind: 'generation' },
    deletedGeneration: string,
  ): Promise<{ routeEpoch: number }>;
  recordDeletion(receipt: DeletionReceipt, routeEpoch: number): Promise<void>;
}
