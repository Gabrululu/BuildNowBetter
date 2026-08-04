import { beforeEach, describe, expect, it } from "vitest";

import { relayState } from "./state.js";

// relayState is a module-level singleton (mirrors production, where it's the one live process
// state for the workshop) — reset it by re-registering fresh identities per test via unique ids.
let idCounter = 0;
function freshId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

describe("relayState", () => {
  let alice: string;
  let bob: string;

  beforeEach(() => {
    alice = freshId("alice");
    bob = freshId("bob");
    relayState.registerIdentity(alice, "0xalice", "Alice", Date.now());
    relayState.registerIdentity(bob, "0xbob", "Bob", Date.now());
  });

  it("does not duplicate an identity registered twice with the same id", () => {
    relayState.registerIdentity(alice, "0xalice-new", "Alice Renamed", Date.now());
    const snapshot = relayState.getSnapshot();
    const aliceNodes = snapshot.nodes.filter((node) => node.identityId === alice);
    expect(aliceNodes).toHaveLength(1);
    expect(aliceNodes[0].displayName).toBe("Alice");
  });

  it("weights an endorsement at ENDORSEMENT_WEIGHT and reflects it in the leaderboard", () => {
    relayState.recordEndorsement(alice, bob, Date.now());
    const snapshot = relayState.getSnapshot();
    const bobEntry = snapshot.leaderboard.find((entry) => entry.identityId === bob);
    expect(bobEntry?.score).toBe(1);
  });

  it("adds a badge's weight to the recipient's score, not the sender's", () => {
    relayState.recordBadge(bob, 2); // CompletedChallenge = 3
    const snapshot = relayState.getSnapshot();
    const bobEntry = snapshot.leaderboard.find((entry) => entry.identityId === bob);
    const aliceEntry = snapshot.leaderboard.find((entry) => entry.identityId === alice);
    expect(bobEntry?.score).toBe(3);
    expect(bobEntry?.badgeCount).toBe(1);
    expect(aliceEntry?.score).toBe(0);
  });

  it("ignores a badge for an identity that was never registered", () => {
    expect(() => relayState.recordBadge("unknown-id", 0)).not.toThrow();
  });

  it("sorts the leaderboard by score descending", () => {
    relayState.recordBadge(alice, 2); // 3 points
    relayState.recordEndorsement(bob, bob, Date.now()); // 1 point, self-endorse is fine for this test
    const snapshot = relayState.getSnapshot();
    const scores = snapshot.leaderboard.map((entry) => entry.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("registers a project once and lets team members join without duplicates", () => {
    const projectId = freshId("project");
    relayState.registerProject(projectId, alice, "BuildNowBetter", "desc", "greenfield://uri");
    relayState.addTeamMember(projectId, bob);
    relayState.addTeamMember(projectId, bob);

    const snapshot = relayState.getSnapshot();
    const project = snapshot.projects.find((p) => p.projectId === projectId);
    expect(project?.teamMemberIds).toEqual([bob]);
  });
});
