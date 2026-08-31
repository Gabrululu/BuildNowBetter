import { afterEach, describe, expect, it, vi } from "vitest";

import { createReplayGuard } from "./replayGuard.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("createReplayGuard", () => {
  it("claims a nonce once per wallet", () => {
    const guard = createReplayGuard();

    expect(guard.claim("0xabc", "1")).toBe(true);
    expect(guard.claim("0xabc", "1")).toBe(false);
  });

  it("scopes nonces per wallet, so two attendees can pick the same one", () => {
    const guard = createReplayGuard();

    expect(guard.claim("0xabc", "7")).toBe(true);
    expect(guard.claim("0xdef", "7")).toBe(true);
  });

  it("treats wallet addresses case-insensitively", () => {
    const guard = createReplayGuard();

    expect(guard.claim("0xAbC", "1")).toBe(true);
    expect(guard.claim("0xabc", "1")).toBe(false);
  });

  it("forgets entries once they outlive the signature deadline window", () => {
    vi.useFakeTimers();
    const ttlMs = 60_000;
    const guard = createReplayGuard(ttlMs);

    expect(guard.claim("0xabc", "1")).toBe(true);
    expect(guard.size).toBe(1);

    // Bounded memory is the point: the guard is a gas optimisation, and by the time an entry is
    // pruned the signature's own deadline has long since made it unusable anyway.
    vi.advanceTimersByTime(ttlMs + 1);
    expect(guard.claim("0xdef", "2")).toBe(true);
    expect(guard.size).toBe(1);
  });

  it("keeps entries that are still inside the window", () => {
    vi.useFakeTimers();
    const guard = createReplayGuard(60_000);

    guard.claim("0xabc", "1");
    vi.advanceTimersByTime(30_000);

    expect(guard.claim("0xabc", "1")).toBe(false);
    expect(guard.size).toBe(1);
  });
});
