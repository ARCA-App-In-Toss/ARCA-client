import type { ArcaApi } from '../data/api/arcaApi.ts';
import type { AnswerPage, ArchiveItem, Excerpt } from '../data/api/models.ts';
import { DomainFailure } from '../data/failures.ts';
import type { SessionController } from '../domain/session/sessionController.ts';

// F20 page chain (06 §6.3, 04 IX-023·IX-042). One chain per owner/generation, memory only. Month
// sections are derived from the rows at render time; nothing here is persisted or put in history.

export type ChainPhase = 'loading' | 'error' | 'ready';
export type MoreState = 'idle' | 'loading' | 'failed' | 'cursorInvalid';

export interface ArchiveView {
  phase: ChainPhase;
  /** The last first-page error, for offline/general wording only. */
  firstError: unknown;
  items: readonly ArchiveItem[];
  hasMore: boolean;
  more: MoreState;
  /** An extra page was loaded at least once: only then the end of the list is announced. */
  loadedExtra: boolean;
  /** A newer first page is held and waits for the user (IX-042). */
  candidateReady: boolean;
  /** Background first-page refresh failed while rows stay shown (CPY-F20-022). */
  refreshFailed: boolean;
  /** Rows added by the last successful "기록 더 보기", with a sequence for a single announcement. */
  added: { count: number; seq: number } | null;
  /** Bumped when the chain was replaced by a user-applied candidate, for focus. */
  replacedSeq: number;
}

/** Scroll anchor of the row that opened F21; memory only (06 §5.6, §6.3). */
export interface ArchiveAnchor {
  answerId: string;
  viewportOffset: number;
  routeEpoch: number;
}

interface Chain {
  phase: ChainPhase;
  firstError: unknown;
  items: ArchiveItem[];
  nextCursor: string | null;
  pagesLoaded: number;
  more: MoreState;
  candidate: AnswerPage | null;
  refreshFailed: boolean;
  added: { count: number; seq: number } | null;
  replacedSeq: number;
  anchor: ArchiveAnchor | null;
  /** Any structural change bumps it; late page responses for an older token are dropped. */
  token: number;
  refreshing: boolean;
  /** A mutation settled: the next entry re-reads the first page even when restoring the anchor. */
  refreshDue: boolean;
}

export interface ArchiveChainsDeps {
  session: SessionController;
  api: ArcaApi;
  /** The confirmed owner/generation, or null when no ACTIVE area is ready. */
  scope: () => { ownerScope: string; generation: string } | null;
}

const EMPTY_VIEW: ArchiveView = {
  phase: 'loading',
  firstError: null,
  items: [],
  hasMore: false,
  more: 'idle',
  loadedExtra: false,
  candidateReady: false,
  refreshFailed: false,
  added: null,
  replacedSeq: 0,
};

function dedupe(items: readonly ArchiveItem[]): ArchiveItem[] {
  const seen = new Set<string>();
  const out: ArchiveItem[] = [];
  for (const item of items) {
    // Defensive only: server order is never rewritten (06 §6.3).
    if (seen.has(item.answerId)) continue;
    seen.add(item.answerId);
    out.push(item);
  }
  return out;
}

/** Same identity, revision and order as the rows already shown for that page (D-TECH-048). */
function samePage(page: AnswerPage, items: readonly ArchiveItem[]): boolean {
  if (page.items.length > items.length) return false;
  return page.items.every((item, i) => items[i]?.answerId === item.answerId && items[i]?.revision === item.revision);
}

export class ArchiveChains {
  private readonly deps: ArchiveChainsDeps;
  private chain: Chain | null = null;
  private chainKey: string | null = null;
  private view: ArchiveView = EMPTY_VIEW;
  private readonly listeners = new Set<() => void>();
  private seq = 0;
  private deletedNotice = false;

  constructor(deps: ArchiveChainsDeps) {
    this.deps = deps;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getView = (): ArchiveView => this.view;

  /** Owner/generation change or discard: the chain, candidate and anchor go (06 §5.6, §6.3). */
  reset(): void {
    this.chain = null;
    this.chainKey = null;
    this.deletedNotice = false;
    this.publish();
  }

  /**
   * F20 root entry. The first entry loads the first page. A later entry refreshes the first page in
   * the background, except right after F21 when the kept chain and anchor are restored instead.
   * Returns the anchor to restore, if any.
   */
  enter(options: { routeEpoch: number; atTop: () => boolean }): ArchiveAnchor | null {
    const chain = this.current(true);
    if (!chain) return null;
    const anchor = chain.anchor;
    chain.anchor = null;
    if (chain.phase === 'error') {
      void this.loadFirst(chain);
      return null;
    }
    if (chain.phase === 'loading') return null;
    if (anchor && anchor.routeEpoch === options.routeEpoch) {
      // Anchor first; a due re-read after an edit/delete then follows and, when deep, is only held (06 §6.3–6.4).
      if (chain.refreshDue) void this.refresh(options.atTop);
      return anchor;
    }
    void this.refresh(options.atTop);
    return null;
  }

  /** F20 initial-error retry (CPY-F20-020 on the StatePanel). */
  retryFirst(): void {
    const chain = this.current(true);
    if (chain && chain.phase !== 'ready') void this.loadFirst(chain);
  }

  /** Background first-page refresh; a changed page is applied only at the top, otherwise held. */
  async refresh(atTop: () => boolean): Promise<void> {
    const chain = this.current(false);
    if (chain?.phase !== 'ready' || chain.refreshing) return;
    chain.refreshing = true;
    const token = chain.token;
    let page: AnswerPage;
    try {
      page = await this.fetchPage(null);
    } catch {
      chain.refreshing = false;
      if (!this.alive(chain, token)) return;
      // Candidate absent: hide the notice; the rows stay and nothing about new records is guessed.
      chain.candidate = null;
      chain.refreshFailed = true;
      this.publish();
      return;
    }
    chain.refreshing = false;
    if (!this.alive(chain, token)) return;
    chain.refreshFailed = false;
    chain.refreshDue = false;
    if (samePage(page, chain.items) && (page.nextCursor !== null || page.items.length === chain.items.length)) {
      chain.candidate = null;
    } else if (atTop()) {
      this.replace(chain, page, false);
    } else {
      // A newer candidate replaces the older one; the reading position is kept (IX-042).
      chain.candidate = page;
    }
    this.publish();
  }

  /** IX-042 `최신 기록 보기`, or the user came back to the top on their own (focus stays). */
  applyCandidate(options: { focus: boolean }): boolean {
    const chain = this.current(false);
    if (!chain?.candidate) return false;
    this.replace(chain, chain.candidate, options.focus);
    this.publish();
    return true;
  }

  /** Cursor rejected: the kept chain stays and a fresh first page replaces it on request. */
  async reloadFirst(): Promise<void> {
    const chain = this.current(false);
    if (!chain) return;
    chain.token += 1;
    const token = chain.token;
    chain.more = 'loading';
    this.publish();
    try {
      const page = await this.fetchPage(null);
      if (!this.alive(chain, token)) return;
      this.replace(chain, page, true);
    } catch {
      if (!this.alive(chain, token)) return;
      chain.more = 'cursorInvalid';
    }
    this.publish();
  }

  /** IX-023 `기록 더 보기`: appended after the kept rows; focus and rows stay. */
  async loadMore(): Promise<void> {
    const chain = this.current(false);
    if (chain?.phase !== 'ready' || !chain.nextCursor || chain.more === 'loading') return;
    const token = chain.token;
    const cursor = chain.nextCursor;
    chain.more = 'loading';
    this.publish();
    try {
      const page = await this.fetchPage(cursor);
      if (!this.alive(chain, token)) return;
      const before = chain.items.length;
      chain.items = dedupe([...chain.items, ...page.items]);
      chain.nextCursor = page.nextCursor;
      chain.pagesLoaded += 1;
      chain.more = 'idle';
      this.seq += 1;
      chain.added = { count: chain.items.length - before, seq: this.seq };
    } catch (error) {
      if (!this.alive(chain, token)) return;
      // A rejected cursor is never replaced by a guessed one; a held candidate is stale too (06 §6.3).
      const invalid = error instanceof DomainFailure && error.code === 'CURSOR_INVALID';
      chain.more = invalid ? 'cursorInvalid' : 'failed';
      if (invalid) chain.candidate = null;
    }
    this.publish();
  }

  /** F23 success: F20 announces the deletion once on its next entry (CPY-F23-009). */
  noteDeleted(): void {
    this.deletedNotice = true;
  }

  takeDeletedNotice(): boolean {
    const noted = this.deletedNotice;
    this.deletedNotice = false;
    return noted;
  }

  saveAnchor(anchor: ArchiveAnchor): void {
    const chain = this.current(false);
    if (chain) chain.anchor = anchor;
  }

  /**
   * Edit success: only a loaded row whose revision is still the base revision is patched; the
   * held candidate is dropped and the first page is re-read later (06 §6.3, §6.4).
   */
  patchRow(answerId: string, baseRevision: string, next: { revision: string; excerpt: Excerpt | null }): void {
    const chain = this.current(false);
    if (!chain) return;
    chain.items = chain.items.map((item) =>
      item.answerId === answerId && item.revision === baseRevision
        ? {
            ...item,
            revision: next.revision,
            excerpt:
              next.excerpt && next.excerpt.sourceRevision === next.revision
                ? { state: 'AVAILABLE', value: next.excerpt }
                : { state: 'UNAVAILABLE', retryable: true },
          }
        : item,
    );
    this.invalidateCandidate(chain);
    this.publish();
  }

  /** Delete success: the row goes (empty month headings follow at render); the anchor moves to a neighbour. */
  removeRow(answerId: string): void {
    const chain = this.current(false);
    if (!chain) return;
    const index = chain.items.findIndex((item) => item.answerId === answerId);
    if (index >= 0) {
      chain.items = chain.items.filter((item) => item.answerId !== answerId);
      if (chain.anchor?.answerId === answerId) {
        const neighbour = chain.items[index] ?? chain.items[index - 1];
        chain.anchor = neighbour ? { ...chain.anchor, answerId: neighbour.answerId } : null;
      }
    }
    this.invalidateCandidate(chain);
    this.publish();
  }

  /** A mutation made any held candidate stale (06 §6.3). */
  invalidate(): void {
    const chain = this.current(false);
    if (!chain) return;
    this.invalidateCandidate(chain);
    this.publish();
  }

  private invalidateCandidate(chain: Chain): void {
    chain.candidate = null;
    chain.refreshDue = true;
  }

  private replace(chain: Chain, page: AnswerPage, focus: boolean): void {
    chain.token += 1;
    chain.items = dedupe(page.items);
    chain.nextCursor = page.nextCursor;
    chain.pagesLoaded = 1;
    chain.more = 'idle';
    chain.candidate = null;
    chain.added = null;
    chain.refreshFailed = false;
    chain.anchor = null;
    if (focus) {
      this.seq += 1;
      chain.replacedSeq = this.seq;
    }
  }

  private async loadFirst(chain: Chain): Promise<void> {
    chain.token += 1;
    const token = chain.token;
    chain.phase = 'loading';
    this.publish();
    try {
      const page = await this.fetchPage(null);
      if (!this.alive(chain, token)) return;
      chain.items = dedupe(page.items);
      chain.nextCursor = page.nextCursor;
      chain.pagesLoaded = 1;
      chain.phase = 'ready';
      chain.firstError = null;
    } catch (error) {
      if (!this.alive(chain, token)) return;
      chain.phase = 'error';
      chain.firstError = error;
    }
    this.publish();
  }

  private fetchPage(cursor: string | null): Promise<AnswerPage> {
    return this.deps.session.run('ACTIVE', (auth) => this.deps.api.listAnswers(auth, cursor, 'STANDARD'));
  }

  private alive(chain: Chain, token: number): boolean {
    return this.chain === chain && chain.token === token;
  }

  private current(create: boolean): Chain | null {
    const scope = this.deps.scope();
    if (!scope) return null;
    const key = `${scope.ownerScope}/${scope.generation}`;
    if (this.chainKey !== key) {
      this.chain = null;
      this.chainKey = key;
    }
    if (!this.chain && create) {
      this.chain = {
        phase: 'loading',
        firstError: null,
        items: [],
        nextCursor: null,
        pagesLoaded: 0,
        more: 'idle',
        candidate: null,
        refreshFailed: false,
        added: null,
        replacedSeq: 0,
        anchor: null,
        token: 0,
        refreshing: false,
        refreshDue: false,
      };
      void this.loadFirst(this.chain);
    }
    return this.chain;
  }

  private publish(): void {
    const chain = this.chain;
    this.view = chain
      ? {
          phase: chain.phase,
          firstError: chain.firstError,
          items: chain.items,
          hasMore: chain.nextCursor !== null,
          more: chain.more,
          loadedExtra: chain.pagesLoaded > 1,
          candidateReady: chain.candidate !== null,
          refreshFailed: chain.refreshFailed,
          added: chain.added,
          replacedSeq: chain.replacedSeq,
        }
      : EMPTY_VIEW;
    for (const listener of this.listeners) listener();
  }
}
