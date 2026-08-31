"use client";

import type { FounderProjectSummary, GraphEdge, GraphNode, LeaderboardEntry } from "@buildnowbetter/shared";
import { useEffect, useState } from "react";

export interface RelaySnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  leaderboard: LeaderboardEntry[];
  projects: FounderProjectSummary[];
}

export interface RelayState extends RelaySnapshot {
  connected: boolean;
}

const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL ?? "http://localhost:4000";

/**
 * Placeholder demo data so `pnpm --filter screen dev` renders something meaningful even before
 * apps/relay (or a real testnet deployment) is up and running.
 */
const PLACEHOLDER_STATE: RelayState = {
  nodes: [
    { identityId: "1", displayName: "Ada", weight: 6, registeredAt: Date.now() },
    { identityId: "2", displayName: "Grace", weight: 4, registeredAt: Date.now() },
    { identityId: "3", displayName: "Satoshi", weight: 9, registeredAt: Date.now() },
    { identityId: "4", displayName: "Katie", weight: 3, registeredAt: Date.now() },
  ],
  edges: [
    { fromId: "1", toId: "2", timestamp: Date.now() },
    { fromId: "2", toId: "3", timestamp: Date.now() },
    { fromId: "4", toId: "3", timestamp: Date.now() },
  ],
  leaderboard: [
    { identityId: "3", displayName: "Satoshi", score: 9, badgeCount: 3 },
    { identityId: "1", displayName: "Ada", score: 6, badgeCount: 2 },
    { identityId: "2", displayName: "Grace", score: 4, badgeCount: 1 },
    { identityId: "4", displayName: "Katie", score: 3, badgeCount: 1 },
  ],
  projects: [
    {
      projectId: "1",
      leadIdentityId: "3",
      name: "ReputationGraph",
      shortDesc: "Grafo social en vivo para hackathons.",
      greenfieldURI: "",
      teamMemberIds: ["3", "1"],
      invitedIdentityIds: [],
      endorsementCount: 4,
    },
  ],
  connected: false,
};

export function useRelayStream(): RelayState {
  const [state, setState] = useState<RelayState>(PLACEHOLDER_STATE);

  useEffect(() => {
    let cancelled = false;

    fetch(`${RELAY_URL}/snapshot`)
      .then((res) => res.json() as Promise<RelaySnapshot>)
      .then((snapshot) => {
        if (!cancelled) setState({ ...snapshot, connected: true });
      })
      .catch(() => {
        // apps/relay isn't reachable yet — keep showing placeholder demo data.
      });

    const eventSource = new EventSource(`${RELAY_URL}/stream`);

    eventSource.onmessage = (event) => {
      const snapshot = JSON.parse(event.data) as RelaySnapshot;
      setState({ ...snapshot, connected: true });
    };

    eventSource.onerror = () => {
      setState((prev) => ({ ...prev, connected: false }));
    };

    return () => {
      cancelled = true;
      eventSource.close();
    };
  }, []);

  return state;
}
