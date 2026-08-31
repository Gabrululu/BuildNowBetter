/**
 * Off-chain first line against replayed requests.
 *
 * The contracts are what actually make replay impossible — `RelaySigned` records every consumed
 * (wallet, nonce) on-chain and reverts on reuse. But a reverting transaction still costs the hot
 * wallet gas, and draining that wallet is exactly the denial-of-service the replay enabled. Doing
 * the check here first turns a replayed request into a free rejection.
 *
 * Deliberately in-memory and TTL-bounded: this is a gas optimisation, not the security boundary.
 * After a relay restart this map is empty and the chain is still the thing saying no.
 */
export function createReplayGuard(ttlMs = 20 * 60_000) {
  /** key → first-seen timestamp, in insertion (therefore chronological) order. */
  const seen = new Map<string, number>();

  function prune(now: number): void {
    for (const [key, seenAt] of seen) {
      // Insertion order is chronological, so the first live entry ends the sweep.
      if (now - seenAt <= ttlMs) break;
      seen.delete(key);
    }
  }

  return {
    /** True if this (wallet, nonce) is fresh; false if it has already been submitted. */
    claim(wallet: string, nonce: string): boolean {
      const now = Date.now();
      prune(now);

      const key = `${wallet.toLowerCase()}:${nonce}`;
      if (seen.has(key)) return false;
      seen.set(key, now);
      return true;
    },

    get size(): number {
      return seen.size;
    },
  };
}

export type ReplayGuard = ReturnType<typeof createReplayGuard>;
