/**
 * Tracks which chain logs have already been folded into state.
 *
 * The same log legitimately arrives more than once: the boot replay's block range overlaps the
 * live watcher's first poll, and a polling transport re-delivers logs across a reorg. RelayState's
 * counters (`recordEndorsement`, `recordBadge`, `recordBuilderEndorsement`) are plain increments
 * with no guard of their own, so every duplicate would silently inflate somebody's score.
 *
 * A log's identity is (transactionHash, logIndex) — unique per chain event.
 */
export function createLogDeduper() {
  const seen = new Set<string>();

  return {
    /** True the first time this log is offered, false on every repeat. */
    firstTimeSeeing(transactionHash: string | null, logIndex: number | null): boolean {
      // Pending logs carry no position yet. They never reach us under a polling transport, and
      // dropping them would be worse than double-counting one.
      if (transactionHash === null || logIndex === null) return true;

      const key = `${transactionHash}:${logIndex}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },

    get size(): number {
      return seen.size;
    },
  };
}

export type LogDeduper = ReturnType<typeof createLogDeduper>;
