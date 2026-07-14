export class SlidingWindowRateLimiter {
  constructor({ limit, windowMs }) { this.limit = limit; this.windowMs = windowMs; this.entries = new Map(); }
  consume(key, timestamp = Date.now()) {
    const cutoff = timestamp - this.windowMs; const attempts = (this.entries.get(key) || []).filter((time) => time > cutoff);
    if (attempts.length >= this.limit) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((attempts[0] + this.windowMs - timestamp) / 1000)) };
    attempts.push(timestamp); this.entries.set(key, attempts); if (this.entries.size > 10000) this.cleanup(timestamp); return { allowed: true, remaining: this.limit - attempts.length };
  }
  cleanup(timestamp = Date.now()) { const cutoff = timestamp - this.windowMs; for (const [key, attempts] of this.entries) { const active = attempts.filter((time) => time > cutoff); if (active.length) this.entries.set(key, active); else this.entries.delete(key); } }
}

export class WebhookDeduplicator {
  constructor(store, ttlMs = 7 * 24 * 60 * 60_000) { this.store = store; this.ttlMs = ttlMs; }
  claim(id, timestamp = Date.now()) {
    const cutoff = timestamp - this.ttlMs; const entries = this.store.read().filter((entry) => entry.timestamp > cutoff);
    if (entries.some((entry) => entry.id === id)) return false;
    entries.push({ id, timestamp }); this.store.write(entries.slice(-20000)); return true;
  }
  release(id) { this.store.write(this.store.read().filter((entry) => entry.id !== id)); }
}
