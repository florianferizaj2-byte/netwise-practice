// Framework-independent so races, expiry and persistence can be tested without a device.
export type CacheStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
export type CachePolicy = {
  freshMs: number;
  retainMs: number;
  persist?: boolean;
};
export type QuerySnapshot<T> = {
  data?: T;
  error?: Error;
  fetching: boolean;
  updatedAt: number;
  invalidated?: boolean;
};
const EMPTY: QuerySnapshot<never> = { fetching: false, updatedAt: 0 };
const STORAGE_KEY = 'kaojiang-study-cache-v1';
const MAX_DISK_BYTES = 1536 * 1024;
const MAX_DISK_ENTRIES = 24;
const MAX_MEMORY_ENTRIES = 80;

export class CacheCancelledError extends Error {
  constructor() {
    super('数据上下文已改变');
    this.name = 'CacheCancelledError';
  }
}

export class ResourceCache {
  private scope: string | null = null;
  private generation = 0;
  private entries = new Map<string, QuerySnapshot<unknown>>();
  private flights = new Map<
    string,
    { controller: AbortController; promise: Promise<unknown> }
  >();
  private listeners = new Map<string, Set<(invalidated: boolean) => void>>();
  private storageQueue: Promise<unknown> = Promise.resolve();
  private ready: Promise<unknown> = Promise.resolve();
  private saveTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private storage: CacheStorage,
    private policy: (key: string) => CachePolicy,
    private persistData: (key: string, data: unknown) => unknown | undefined,
    private now: () => number = Date.now,
  ) {}

  private queueStorage<T>(task: () => Promise<T>): Promise<T> {
    const next = this.storageQueue.then(task, task);
    this.storageQueue = next.catch(() => undefined);
    return next;
  }

  async setScope(scope: string | null) {
    if (scope === this.scope) {
      await this.ready;
      return;
    }
    this.resetMemory();
    this.scope = scope;
    const generation = this.generation;
    this.ready = this.queueStorage(async () => {
      if (generation !== this.generation) return;
      if (!scope) {
        await this.storage.removeItem(STORAGE_KEY);
        return;
      }
      try {
        const raw = await this.storage.getItem(STORAGE_KEY);
        if (generation !== this.generation || !raw) return;
        if (raw.length * 3 > MAX_DISK_BYTES) throw new Error('Cache too large');
        const saved = JSON.parse(raw);
        if (
          saved.version !== 1 ||
          saved.scope !== scope ||
          !Array.isArray(saved.entries)
        ) {
          throw new Error('Cache scope or version changed');
        }
        for (const item of saved.entries.slice(0, MAX_DISK_ENTRIES)) {
          if (!Array.isArray(item) || item.length !== 2) continue;
          const [key, value] = item;
          if (typeof key !== 'string' || !this.policy(key).persist || !value)
            continue;
          const age = this.now() - value.updatedAt;
          if (
            !Number.isFinite(age) ||
            age < 0 ||
            age > this.policy(key).retainMs
          )
            continue;
          const data = this.persistData(key, value.data);
          if (data === undefined) continue;
          this.entries.set(key, {
            data,
            fetching: false,
            updatedAt: value.updatedAt,
            invalidated: !!value.invalidated,
          });
          this.emit(key);
        }
      } catch {
        if (generation === this.generation)
          await this.storage.removeItem(STORAGE_KEY);
      }
    }).catch(() => undefined); // Disk failures never prevent online learning.
    await this.ready;
    if (generation === this.generation && scope)
      this.listeners.forEach((_, key) => this.emit(key, true));
  }

  private resetMemory() {
    this.generation += 1;
    clearTimeout(this.saveTimer);
    this.flights.forEach(({ controller }) => controller.abort());
    this.flights.clear();
    this.entries.clear();
    this.listeners.forEach((_, key) => this.emit(key));
  }

  async clear() {
    this.resetMemory();
    this.ready = this.queueStorage(() =>
      this.storage.removeItem(STORAGE_KEY),
    ).catch(() => undefined);
    await this.ready;
    this.listeners.forEach((_, key) => this.emit(key, true));
  }

  snapshot<T>(key: string): QuerySnapshot<T> {
    return (this.entries.get(key) ?? EMPTY) as QuerySnapshot<T>;
  }

  subscribe(key: string, listener: (invalidated: boolean) => void) {
    const listeners = this.listeners.get(key) ?? new Set();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(key);
    };
  }

  private emit(key: string, invalidated = false) {
    this.listeners.get(key)?.forEach((listener) => listener(invalidated));
  }

  invalidate(prefixes: string[]) {
    const keys = new Set([...this.entries.keys(), ...this.flights.keys()]);
    for (const key of keys) {
      if (!prefixes.some((prefix) => key.startsWith(prefix))) continue;
      this.flights.get(key)?.controller.abort();
      this.flights.delete(key);
      const previous = this.snapshot(key);
      this.entries.set(key, {
        ...previous,
        fetching: false,
        invalidated: true,
      });
      this.emit(key, true);
    }
    this.scheduleSave();
  }

  async read<T>(
    key: string,
    loader: (signal: AbortSignal) => Promise<T>,
    force = false,
  ): Promise<T> {
    const generation = this.generation;
    await this.ready;
    if (generation !== this.generation || !this.scope)
      throw new CacheCancelledError();
    const previous = this.snapshot<T>(key);
    const age = this.now() - previous.updatedAt;
    const policy = this.policy(key);
    const retained =
      previous.data !== undefined && age >= 0 && age < policy.retainMs;
    if (!force && retained && !previous.invalidated && age < policy.freshMs)
      return previous.data!;
    const flight = this.flights.get(key);
    let pending = flight?.promise as Promise<T> | undefined;
    if (!pending) {
      const controller = new AbortController();
      this.entries.set(key, {
        ...previous,
        data: retained ? previous.data : undefined,
        error: undefined,
        fetching: true,
      });
      const current = () =>
        generation === this.generation &&
        this.flights.get(key)?.controller === controller;
      pending = Promise.resolve()
        .then(() => {
          if (!current()) throw new CacheCancelledError();
          return loader(controller.signal);
        })
        .then((data) => {
          if (!current()) throw new CacheCancelledError();
          this.entries.delete(key);
          this.entries.set(key, {
            data,
            fetching: false,
            updatedAt: this.now(),
          });
          this.trimMemory();
          this.scheduleSave();
          return data;
        })
        .catch((cause: unknown) => {
          if (!current()) throw new CacheCancelledError();
          this.entries.set(key, {
            ...this.snapshot(key),
            fetching: false,
            error: cause instanceof Error ? cause : new Error('加载失败'),
          });
          this.trimMemory();
          throw cause;
        })
        .finally(() => {
          if (current()) {
            this.flights.delete(key);
            this.emit(key);
          }
        });
      this.flights.set(key, { controller, promise: pending });
      this.emit(key);
    }
    if (!force && retained) {
      void pending.catch(() => undefined);
      return previous.data!;
    }
    return pending;
  }

  private trimMemory() {
    for (const key of this.entries.keys()) {
      if (this.entries.size <= MAX_MEMORY_ENTRIES) break;
      if (!this.listeners.has(key) && !this.flights.has(key))
        this.entries.delete(key);
    }
  }

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      void this.flush();
    }, 400);
  }

  async flush() {
    clearTimeout(this.saveTimer);
    const generation = this.generation;
    await this.queueStorage(async () => {
      if (generation !== this.generation || !this.scope) return;
      const entries: Array<
        [string, { data: unknown; updatedAt: number; invalidated?: boolean }]
      > = [];
      let bytes = 512 + this.scope.length * 3;
      for (const [key, value] of [...this.entries].sort(
        (a, b) => b[1].updatedAt - a[1].updatedAt,
      )) {
        const policy = this.policy(key);
        if (
          !policy.persist ||
          value.data === undefined ||
          this.now() - value.updatedAt >= policy.retainMs
        )
          continue;
        const data = this.persistData(key, value.data);
        if (data === undefined) continue;
        const entry: (typeof entries)[number] = [
          key,
          { data, updatedAt: value.updatedAt, invalidated: value.invalidated },
        ];
        const size = JSON.stringify(entry).length * 3; // Safe upper bound for UTF-8, including Chinese.
        if (size > 300 * 1024 || bytes + size > MAX_DISK_BYTES) continue;
        entries.push(entry);
        bytes += size + 3;
        if (entries.length === MAX_DISK_ENTRIES) break;
      }
      await this.storage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, scope: this.scope, entries }),
      );
    }).catch(() => undefined);
  }
}
