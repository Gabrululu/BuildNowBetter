/**
 * Contract ABI types land here once `pnpm --filter contracts build` has run — Hardhat's
 * artifacts aren't generated yet in a fresh scaffold checkout. Import ABIs directly from
 * `packages/contracts/artifacts/contracts/<Name>.sol/<Name>.json` until a generation step is
 * wired up here.
 */

export interface GraphNode {
  identityId: string;
  displayName: string;
  weight: number;
  registeredAt: number;
}

export interface GraphEdge {
  fromId: string;
  toId: string;
  timestamp: number;
}

export interface LeaderboardEntry {
  identityId: string;
  displayName: string;
  score: number;
  badgeCount: number;
}

export interface FounderProjectSummary {
  projectId: string;
  leadIdentityId: string;
  name: string;
  shortDesc: string;
  greenfieldURI: string;
  teamMemberIds: string[];
  /** Invited but not yet accepted — joining a team is the invitee's own decision. */
  invitedIdentityIds: string[];
  endorsementCount: number;
}
