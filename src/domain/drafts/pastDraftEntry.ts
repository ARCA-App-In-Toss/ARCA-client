import type { DraftContext, DraftIdentity } from './draftRepository.ts';

export type HandoffKeep = 'kept' | 'failed' | 'unsettled';

export interface PastDraftEntry {
  identity: DraftIdentity;
  handoff: { text: string; keep: HandoffKeep; context: DraftContext | null } | null;
}
