import { describe, expect, it } from "vitest";

import { badgeTypeFromIndex, computeNodeWeight } from "./badgeWeights.js";

describe("badgeTypeFromIndex", () => {
  it("maps enum indices to their Solidity-matching badge type", () => {
    expect(badgeTypeFromIndex(0)).toBe("Attendance");
    expect(badgeTypeFromIndex(2)).toBe("CompletedChallenge");
  });

  it("throws on an index with no matching BadgeType", () => {
    expect(() => badgeTypeFromIndex(99)).toThrow("Unknown BadgeType index: 99");
  });
});

describe("computeNodeWeight", () => {
  it("sums badge weights plus one point per endorsement", () => {
    const weight = computeNodeWeight({
      badges: ["Attendance", "HelpedPeer"],
      endorsementsReceived: 3,
    });
    expect(weight).toBe(1 + 2 + 3);
  });

  it("is zero for an identity with no badges and no endorsements", () => {
    expect(computeNodeWeight({ badges: [], endorsementsReceived: 0 })).toBe(0);
  });
});
