// Only explicitly selected resources enter this memory cache. Account changes
// discard both values and pending requests; private lesson content stays off disk.
export class CacheCancelledError extends Error {
  constructor() {
    super("学习数据上下文已改变");
    this.name = "CacheCancelledError";
  }
}

export class RequestCache {
  constructor({ now = Date.now, limit = 80 } = {}) {
    this.now = now;
    this.limit = limit;
    this.scope = null;
    this.generation = 0;
    this.entries = new Map();
    this.pending = new Map();
  }

  setScope(scope) {
    if (scope === this.scope) return;
    this.clear();
    this.scope = scope;
  }

  clear() {
    this.generation++;
    this.entries.clear();
    this.pending.clear();
  }

  invalidate(prefixes) {
    for (const key of new Set([
      ...this.entries.keys(),
      ...this.pending.keys(),
    ])) {
      if (!prefixes.some((prefix) => key.startsWith(prefix))) continue;
      this.entries.delete(key);
      this.pending.delete(key);
    }
  }

  peek(key) {
    if (!this.scope) return undefined;
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= this.now()) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.data;
  }

  set(key, data, ttl, deadline = Infinity) {
    if (!this.scope) return;
    const expiresAt = Math.min(this.now() + ttl, deadline);
    if (expiresAt <= this.now()) return;
    this.entries.delete(key);
    this.entries.set(key, { data, expiresAt });
    while (this.entries.size > this.limit)
      this.entries.delete(this.entries.keys().next().value);
  }

  capExpiry(prefix, deadline) {
    for (const [key, entry] of this.entries) {
      if (key.startsWith(prefix))
        entry.expiresAt = Math.min(entry.expiresAt, deadline);
    }
  }

  async read(key, load, { ttl, force = false, deadline = Infinity } = {}) {
    if (!this.scope) return load();
    if (!force) {
      const value = this.peek(key);
      if (value !== undefined) return value;
      if (this.pending.has(key)) return this.pending.get(key);
    }
    const generation = this.generation;
    const promise = Promise.resolve()
      .then(load)
      .then((data) => {
        if (generation !== this.generation || this.pending.get(key) !== promise)
          throw new CacheCancelledError();
        this.set(
          key,
          data,
          ttl,
          typeof deadline === "function" ? deadline() : deadline,
        );
        return data;
      })
      .finally(() => {
        if (this.pending.get(key) === promise) this.pending.delete(key);
      });
    this.pending.set(key, promise);
    return promise;
  }
}
