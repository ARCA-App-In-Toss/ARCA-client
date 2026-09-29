import { DomainFailure } from '../failures.ts';
import type { AnswerPage, ArchiveItem, Excerpt } from '../models.ts';
import type { ArcaApi } from '../ports/api.ts';
import type { SessionController } from '../session/sessionController.ts';

export type ChainPhase = 'loading' | 'error' | 'ready';
export type MoreState = 'idle' | 'loading' | 'failed' | 'cursorInvalid';

export interface ArchiveView {
  phase: ChainPhase;
  firstError: unknown;
  items: readonly ArchiveItem[];
  hasMore: boolean;
  more: MoreState;
  loadedExtra: boolean;
  candidateReady: boolean;
  refreshFailed: boolean;
  added: { count: number; seq: number } | null;
  replacedSeq: number;
}

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
  token: number;
  refreshing: boolean;
  refreshDue: boolean;
}

export interface ArchiveChainsDeps {
  session: SessionController;
  api: ArcaApi;
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
    if (seen.has(item.answerId)) continue;
    seen.add(item.answerId);
    out.push(item);
  }
  return out;
}

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

  reset(): void {
    this.chain = null;
    this.chainKey = null;
    this.deletedNotice = false;
    this.publish();
  }

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
      if (chain.refreshDue) void this.refresh(options.atTop);
      return anchor;
    }
    void this.refresh(options.atTop);
    return null;
  }

  retryFirst(): void {
    const chain = this.current(true);
    if (chain && chain.phase !== 'ready') void this.loadFirst(chain);
  }

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
      chain.candidate = page;
    }
    this.publish();
  }

  applyCandidate(options: { focus: boolean }): boolean {
    const chain = this.current(false);
    if (!chain?.candidate) return false;
    this.replace(chain, chain.candidate, options.focus);
    this.publish();
    return true;
  }

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
      const invalid = error instanceof DomainFailure && error.code === 'CURSOR_INVALID';
      chain.more = invalid ? 'cursorInvalid' : 'failed';
      if (invalid) chain.candidate = null;
    }
    this.publish();
  }

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
