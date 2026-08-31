import {
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  RELAY_CHAIN_ID,
  RELAY_SIGNATURE_TTL_SECONDS,
} from "@buildnowbetter/shared";
import type { FounderProjectSummary, GraphEdge, GraphNode, LeaderboardEntry } from "@buildnowbetter/shared";

export const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL ?? "http://localhost:4000";

/**
 * EIP-712 domain for the fixed, named actions the relay accepts — one per target contract, which
 * is what stops a signature for one module being replayed against another.
 *
 * The chain id is fixed rather than read from the connected wallet: the contract verifies against
 * its own `block.chainid`, so signing with anything else yields a signature that recovers to the
 * wrong address on-chain and fails for reasons that are very hard to read from the UI.
 */
export function relayDomain(verifyingContract: `0x${string}`) {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId: RELAY_CHAIN_ID,
    verifyingContract,
  } as const;
}

/**
 * Random uint256 nonce for the typed-data payload. Single-use: the contracts record every
 * consumed (wallet, nonce) pair in `RelaySigned.relayNonceUsed` and revert on reuse, and the relay
 * rejects a repeat before spending gas. Collisions would cost the attendee a re-sign, so 64 bits
 * of randomness is ample for a room of a few hundred.
 */
export function randomNonce(): bigint {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let value = BigInt(0);
  for (const byte of bytes) {
    value = value * BigInt(256) + BigInt(byte);
  }
  return value;
}

/**
 * Unix-seconds expiry for a signed action. Bounds how long a leaked signature stays submittable;
 * enforced both by the relay and by `RelaySigned` on-chain.
 */
export function signatureDeadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + RELAY_SIGNATURE_TTL_SECONDS);
}

interface RelaySuccess {
  hash: `0x${string}`;
}

/** Reads a JSON body without throwing when the response isn't JSON at all. */
async function readJson(response: Response): Promise<unknown> {
  if (!response.headers.get("content-type")?.includes("application/json")) return undefined;
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function describeFailure(status: number, payload: unknown): string {
  if (status === 429) return "Demasiadas acciones seguidas. Espera un minuto e intenta otra vez.";

  const error = (payload as { error?: unknown } | undefined)?.error;
  if (typeof error === "string" && error.length > 0) return error;

  if (status === 503) return "El relay aún no está configurado. Avisa al organizador.";
  if (status >= 500) return "El relay tuvo un error interno. Intenta de nuevo en unos segundos.";
  return `El relay rechazó la acción (${status}).`;
}

export async function postToRelay(path: string, body: Record<string, unknown>): Promise<RelaySuccess> {
  let response: Response;
  try {
    response = await fetch(`${RELAY_URL}/relay${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("No se pudo contactar al relay. Revisa tu conexión e intenta de nuevo.");
  }

  // Status first, body second: an error response is not guaranteed to be JSON, and parsing it
  // before checking `ok` turned every relay 500 into "Unexpected token '<'" on the attendee's
  // phone instead of a message they could act on.
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(describeFailure(response.status, payload));
  }

  const hash = (payload as { hash?: unknown } | undefined)?.hash;
  if (typeof hash !== "string" || !hash.startsWith("0x")) {
    throw new Error("El relay respondió sin hash de transacción.");
  }
  return { hash: hash as `0x${string}` };
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
