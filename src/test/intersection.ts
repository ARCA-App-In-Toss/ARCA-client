const live = new Set<FakeIntersectionObserver>();

class FakeIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin: string;
  readonly thresholds = [0];
  readonly scrollMargin = '0px';
  private readonly targets = new Set<Element>();
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
    this.callback = callback;
    this.rootMargin = options.rootMargin ?? '0px';
    live.add(this);
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
    live.delete(this);
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  reveal(): void {
    const entries = [...this.targets].map(
      (target) => ({ target, isIntersecting: true, intersectionRatio: 1 }) as IntersectionObserverEntry,
    );
    if (entries.length > 0) this.callback(entries, this);
  }
}

export function installIntersectionObserver(): void {
  globalThis.IntersectionObserver = FakeIntersectionObserver;
}

export function resetIntersectionObservers(): void {
  live.clear();
}

export function revealObservedTargets(): void {
  for (const observer of [...live]) observer.reveal();
}
