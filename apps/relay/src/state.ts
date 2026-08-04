import { BADGE_WEIGHTS, ENDORSEMENT_WEIGHT, badgeTypeFromIndex } from "@buildnowbetter/shared";
import type { FounderProjectSummary, GraphEdge, GraphNode, LeaderboardEntry } from "@buildnowbetter/shared";

export interface Snapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  leaderboard: LeaderboardEntry[];
  projects: FounderProjectSummary[];
}

interface IdentityRecord {
  identityId: string;
  wallet: string;
  displayName: string;
  registeredAt: number;
  badgeCount: number;
  badgeScore: number;
  endorsementsReceived: number;
}

interface ProjectRecord {
  projectId: string;
  leadIdentityId: string;
  name: string;
  shortDesc: string;
  greenfieldURI: string;
  teamMemberIds: string[];
  endorsementCount: number;
}

/**
 * Single in-memory source of truth for the big screen + leaderboard, fed by chainWatcher's
 * event subscriptions. Deliberately not a database — this process IS the canonical live state
 * for the duration of the workshop; a restart means re-backfilling from chain logs.
 */
class RelayState {
  private identities = new Map<string, IdentityRecord>();
  private edges: GraphEdge[] = [];
  private projects = new Map<string, ProjectRecord>();
  private subscribers = new Set<(snapshot: Snapshot) => void>();

  registerIdentity(identityId: string, wallet: string, displayName: string, timestamp: number): void {
    if (this.identities.has(identityId)) return;
    this.identities.set(identityId, {
      identityId,
      wallet,
      displayName,
      registeredAt: timestamp,
      badgeCount: 0,
      badgeScore: 0,
      endorsementsReceived: 0,
    });
    this.publish();
  }

  recordEndorsement(fromId: string, toId: string, timestamp: number): void {
    this.edges.push({ fromId, toId, timestamp });
    const target = this.identities.get(toId);
    if (target) {
      target.endorsementsReceived += 1;
    }
    this.publish();
  }

  recordBadge(identityId: string, badgeTypeIndex: number): void {
    const record = this.identities.get(identityId);
    if (!record) return;
    const badgeType = badgeTypeFromIndex(badgeTypeIndex);
    record.badgeCount += 1;
    record.badgeScore += BADGE_WEIGHTS[badgeType];
    this.publish();
  }

  registerProject(
    projectId: string,
    leadIdentityId: string,
    name: string,
    shortDesc: string,
    greenfieldURI: string,
  ): void {
    if (this.projects.has(projectId)) return;
    this.projects.set(projectId, {
      projectId,
      leadIdentityId,
      name,
      shortDesc,
      greenfieldURI,
      teamMemberIds: [],
      endorsementCount: 0,
    });
    this.publish();
  }

  addTeamMember(projectId: string, identityId: string): void {
    const project = this.projects.get(projectId);
    if (!project || project.teamMemberIds.includes(identityId)) return;
    project.teamMemberIds.push(identityId);
    this.publish();
  }

  recordBuilderEndorsement(projectId: string): void {
    const project = this.projects.get(projectId);
    if (!project) return;
    project.endorsementCount += 1;
    this.publish();
  }

  getSnapshot(): Snapshot {
    const records = [...this.identities.values()];

    const nodes: GraphNode[] = records.map((record) => ({
      identityId: record.identityId,
      displayName: record.displayName,
      weight: record.badgeScore + record.endorsementsReceived * ENDORSEMENT_WEIGHT,
      registeredAt: record.registeredAt,
    }));

    const leaderboard: LeaderboardEntry[] = records
      .map((record) => ({
        identityId: record.identityId,
        displayName: record.displayName,
        score: record.badgeScore + record.endorsementsReceived * ENDORSEMENT_WEIGHT,
        badgeCount: record.badgeCount,
      }))
      .sort((a, b) => b.score - a.score);

    const projects = [...this.projects.values()];

    return { nodes, edges: this.edges, leaderboard, projects };
  }

  subscribe(listener: (snapshot: Snapshot) => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  private publish(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.subscribers) {
      listener(snapshot);
    }
  }
}

export const relayState = new RelayState();
