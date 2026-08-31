import { RELAY_CHAIN_ID } from "@buildnowbetter/shared";
import type { Address } from "viem";
import { bscTestnet } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

export const CHAIN = bscTestnet;
// Shared with the frontend's signing domain and asserted against the contracts' block.chainid.
export const CHAIN_ID = RELAY_CHAIN_ID;

export const RPC_URL = process.env.BSC_TESTNET_RPC_URL ?? "https://data-seed-prebsc-1-s1.binance.org:8545";

export const IDENTITY_REGISTRY_ADDRESS = process.env.IDENTITY_REGISTRY_ADDRESS as Address | undefined;
export const SOCIAL_GRAPH_ADDRESS = process.env.SOCIAL_GRAPH_ADDRESS as Address | undefined;
export const REPUTATION_PASSPORT_ADDRESS = process.env.REPUTATION_PASSPORT_ADDRESS as Address | undefined;
export const FOUNDER_PASSPORT_ADDRESS = process.env.FOUNDER_PASSPORT_ADDRESS as Address | undefined;

export const RELAY_HOT_WALLET_PRIVATE_KEY = process.env.RELAY_HOT_WALLET_PRIVATE_KEY as
  | `0x${string}`
  | undefined;

export const PORT = Number(process.env.PORT ?? 4000);

function parseOptionalBlock(raw: string | undefined): bigint | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`RELAY_START_BLOCK must be a positive block number, got "${raw}"`);
  }
  return BigInt(value);
}

// Block to replay chain history from on boot, so a relay restart mid-workshop rebuilds the graph
// instead of resetting the leaderboard. Set it to the chain head at the *start of the event*, not
// the contract deployment block: BSC testnet produces ~1.3M blocks a week, and public RPCs prune
// old logs ("History has been pruned for this block"), so deep replays are neither fast nor
// possible. Unset = replay a recent window only.
export const RELAY_START_BLOCK = parseOptionalBlock(process.env.RELAY_START_BLOCK);

// Comma-separated list of allowed origins, e.g. "https://app.vercel.app,https://screen.vercel.app".
// Falls back to "*" (any origin) when unset.
const rawCorsOrigin = process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean);
export const CORS_ORIGIN: string | string[] = rawCorsOrigin?.length ? rawCorsOrigin : "*";
