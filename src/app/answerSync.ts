import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../data/query/keys.ts';
import type { ArchiveChains } from '../domain/archive/archiveChains.ts';
import { EDIT_EXCERPT_PROFILE, type SyncEvent, TRANSPORT_MAX_MS } from '../domain/commands/answerWriteCoordinator.ts';
import type { AnswerDetail, Excerpt } from '../domain/models.ts';
import type { ArcaApi } from '../domain/ports/api.ts';
import type { SessionController } from '../domain/session/sessionController.ts';

export interface AnswerSyncDeps {
  session: SessionController;
  api: ArcaApi;
  queryClient: QueryClient;
  archive: ArchiveChains;
  currentOwner: () => { ownerScope: string; generation: string | null } | null;
  forgetAnswer: (answerId: string) => void;
}

export function createAnswerSync(deps: AnswerSyncDeps): (event: SyncEvent) => Promise<void> {
  const { session, api, queryClient, archive } = deps;

  return async (event) => {
    const owner = deps.currentOwner();
    if (!owner?.generation) return;
    const { ownerScope, generation } = owner;
    const stillCurrent = () => {
      const now = deps.currentOwner();
      return now?.ownerScope === ownerScope && now.generation === generation;
    };
    const detailKey = queryKeys.answer(ownerScope, generation, event.answerId);
    const rereadToday = () =>
      queryClient.invalidateQueries({ queryKey: [...queryKeys.owner(ownerScope), generation, 'today'] });

    if (event.kind === 'updated') {
      const cached = queryClient.getQueryData<AnswerDetail>(detailKey);
      if (cached && cached.revision === event.baseRevision && event.content !== null) {
        queryClient.setQueryData<AnswerDetail>(detailKey, {
          ...cached,
          content: event.content,
          revision: event.revision,
          isEdited: true,
        });
      }
      let excerpt: Excerpt | null = null;
      const ticketId = event.ticketId;
      if (ticketId) {
        const current = await session
          .run('ACTIVE', (auth) => api.getAnswerWriteResult(auth, ticketId, EDIT_EXCERPT_PROFILE, TRANSPORT_MAX_MS))
          .catch(() => null);
        if (
          current?.state === 'SUCCEEDED' &&
          current.presentation.state === 'AVAILABLE' &&
          current.presentation.excerpt.state === 'AVAILABLE' &&
          current.presentation.excerpt.value.sourceRevision === event.revision
        ) {
          excerpt = current.presentation.excerpt.value;
        }
      }
      if (!stillCurrent()) return;
      archive.patchRow(event.answerId, event.baseRevision, { revision: event.revision, excerpt });
      void queryClient.invalidateQueries({ queryKey: detailKey });
      await rereadToday();
      return;
    }

    if (event.kind === 'deleted') {
      queryClient.removeQueries({ queryKey: detailKey });
      archive.removeRow(event.answerId);
      deps.forgetAnswer(event.answerId);
      await rereadToday();
      return;
    }

    archive.invalidate();
    await queryClient.invalidateQueries({ queryKey: detailKey });
  };
}
