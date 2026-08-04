import type { Address } from "viem";
import { bscTestnet } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

export const CHAIN = bscTestnet;
export const CHAIN_ID = 97;

export const RPC_URL = process.env.BSC_TESTNET_RPC_URL ?? "https://data-seed-prebsc-1-s1.binance.org:8545";

export const IDENTITY_REGISTRY_ADDRESS = process.env.IDENTITY_REGISTRY_ADDRESS as Address | undefined;
export const SOCIAL_GRAPH_ADDRESS = process.env.SOCIAL_GRAPH_ADDRESS as Address | undefined;
export const REPUTATION_PASSPORT_ADDRESS = process.env.REPUTATION_PASSPORT_ADDRESS as Address | undefined;
export const FOUNDER_PASSPORT_ADDRESS = process.env.FOUNDER_PASSPORT_ADDRESS as Address | undefined;

export const RELAY_HOT_WALLET_PRIVATE_KEY = process.env.RELAY_HOT_WALLET_PRIVATE_KEY as
  | `0x${string}`
  | undefined;

export const PORT = Number(process.env.PORT ?? 4000);
export const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";
