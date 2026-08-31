import { describe, expect, it } from "vitest";

import { createLogDeduper } from "./logDeduper.js";
import { RelayState } from "./state.js";

const TX = "0xaaa";

describe("createLogDeduper", () => {
  it("accepts a log once and rejects the repeat", () => {
    const deduper = createLogDeduper();

    expect(deduper.firstTimeSeeing(TX, 0)).toBe(true);
    expect(deduper.firstTimeSeeing(TX, 0)).toBe(false);
    expect(deduper.firstTimeSeeing(TX, 0)).toBe(false);
    expect(deduper.size).toBe(1);
  });

  it("treats different log indexes in one transaction as distinct events", () => {
    const deduper = createLogDeduper();

    expect(deduper.firstTimeSeeing(TX, 0)).toBe(true);
    expect(deduper.firstTimeSeeing(TX, 1)).toBe(true);
    expect(deduper.size).toBe(2);
  });

  it("treats the same log index in different transactions as distinct events", () => {
    const deduper = createLogDeduper();

    expect(deduper.firstTimeSeeing("0xaaa", 3)).toBe(true);
    expect(deduper.firstTimeSeeing("0xbbb", 3)).toBe(true);
  });

  it("lets positionless (pending) logs through rather than dropping them", () => {
    const deduper = createLogDeduper();

    expect(deduper.firstTimeSeeing(null, null)).toBe(true);
    expect(deduper.firstTimeSeeing(null, null)).toBe(true);
    expect(deduper.size).toBe(0);
  });

  it("keeps a redelivered endorsement from inflating a score", () => {
    // The failure this guards: recordEndorsement is an unguarded increment, so a reorg or an
    // overlap between boot replay and the live watcher used to add the same endorsement twice.
    const state = new RelayState();
    state.registerIdentity("1", "0xwallet1", "Ada", 1_000);
    state.registerIdentity("2", "0xwallet2", "Grace", 1_000);

    const deduper = createLogDeduper();
    for (let delivery = 0; delivery < 3; delivery += 1) {
      if (deduper.firstTimeSeeing(TX, 7)) {
        state.recordEndorsement("1", "2", 2_000);
      }
    }

    const grace = state.getSnapshot().leaderboard.find((entry) => entry.identityId === "2");
    expect(grace?.score).toBe(1);
    expect(state.getSnapshot().edges).toHaveLength(1);
  });
});
