'use strict';

/**
 * Tiny in-memory TTL cache with a size cap and in-flight request coalescing:
 * concurrent callers for the same key share one upstream request.
 */
class TTLCache {
  constructor({ ttlMs = 10 * 60 * 1000, maxEntries = 500, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    this.store = new Map();
    this.inflight = new Map();
  }

  get(key) {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key, value) {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expires: this.now() + this.ttlMs });
    while (this.store.size > this.maxEntries) {
      this.store.delete(this.store.keys().next().value); // evict oldest
    }
  }

  async getOrLoad(key, loader) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    if (this.inflight.has(key)) return this.inflight.get(key);
    const p = (async () => {
      try {
        const value = await loader();
        this.set(key, value);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  get size() {
    return this.store.size;
  }
}

module.exports = { TTLCache };
