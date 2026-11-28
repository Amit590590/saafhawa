// @ts-check
'use strict';

/**
 * Tiny in-memory TTL cache with a size cap and in-flight request coalescing:
 * concurrent callers for the same key share one upstream request.
 */
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 500;

/** @template V */
class TTLCache {
  /**
   * @param {object} [opts]
   * @param {number} [opts.ttlMs] time to live per entry
   * @param {number} [opts.maxEntries] size cap; the oldest entry is evicted first
   * @param {() => number} [opts.now] clock (injectable for tests)
   */
  constructor({ ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    /** @type {Map<string, {value: V, expires: number}>} */
    this.store = new Map();
    /** @type {Map<string, Promise<V>>} */
    this.inflight = new Map();
  }

  /**
   * @param {string} key
   * @returns {V | undefined} the live value, or undefined when missing/expired
   */
  get(key) {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  /**
   * @param {string} key
   * @param {V} value
   * @returns {void}
   */
  set(key, value) {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expires: this.now() + this.ttlMs });
    while (this.store.size > this.maxEntries) {
      const oldest = /** @type {string} */ (this.store.keys().next().value);
      this.store.delete(oldest);
    }
  }

  /**
   * Return the cached value or load it once; concurrent callers share one in-flight load.
   * Failed loads are not cached.
   * @param {string} key
   * @param {() => Promise<V>} loader
   * @returns {Promise<V>}
   */
  async getOrLoad(key, loader) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const pending = this.inflight.get(key);
    if (pending) return pending;
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

  /** @returns {number} number of stored entries (including not-yet-purged expired ones) */
  get size() {
    return this.store.size;
  }
}

module.exports = { TTLCache };
