import { EIP712_DOMAIN_NAME, EIP712_DOMAIN_VERSION } from "@buildnowbetter/shared";
import type { FounderProjectSummary, GraphEdge, GraphNode, LeaderboardEntry } from "@buildnowbetter/shared";

export const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL ?? "http://localhost:4000";

/** EIP-712 domain for the fixed, named actions the relay accepts — one per target contract. */
export function relayDomain(chainId: number, verifyingContract: `0x${string}`) {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  } as const;
}

/** Random uint256 nonce for the typed-data payload — the relay does not require sequencing. */
export function randomNonce(): bigint {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let value = BigInt(0);
  for (const byte of bytes) {
    value = value * BigInt(256) + BigInt(byte);
  }
  return value;
}

interface RelaySuccess {
  hash: `0x${string}`;
}

export async function postToRelay(path: string, body: Record<string, unknown>): Promise<RelaySuccess> {
  const response = await fetch(`${RELAY_URL}/relay${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : JSON.stringify(data?.error ?? data);
    throw new Error(message);
  }
  return data as RelaySuccess;
}

export interface RelaySnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  leaderboard: LeaderboardEntry[];
  projects: FounderProjectSummary[];
}

export async function fetchSnapshot(): Promise<RelaySnapshot> {
  const response = await fetch(`${RELAY_URL}/snapshot`);
  if (!response.ok) {
    throw new Error(`relay /snapshot failed (${response.status})`);
  }
  return (await response.json()) as RelaySnapshot;
}
