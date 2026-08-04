import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isRateLimited } from "./rateLimit.js";

describe("isRateLimited", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first 10 actions in a window", () => {
    const signer = "0xSigner1";
    for (let i = 0; i < 10; i++) {
      expect(isRateLimited(signer)).toBe(false);
    }
  });

  it("blocks the 11th action within the same window", () => {
    const signer = "0xSigner2";
    for (let i = 0; i < 10; i++) {
      isRateLimited(signer);
    }
    expect(isRateLimited(signer)).toBe(true);
  });

  it("is case-insensitive on the signer address", () => {
    const upper = "0xABCDEF";
    for (let i = 0; i < 10; i++) {
      isRateLimited(upper);
    }
    expect(isRateLimited(upper.toLowerCase())).toBe(true);
  });

  it("resets once the window has fully elapsed", () => {
    const signer = "0xSigner3";
    for (let i = 0; i < 10; i++) {
      isRateLimited(signer);
    }
    vi.advanceTimersByTime(60_001);
    expect(isRateLimited(signer)).toBe(false);
  });
});
