import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { CHAIN, RELAY_HOT_WALLET_PRIVATE_KEY, RPC_URL } from "./config.js";

export function hasHotWallet(): boolean {
  return Boolean(RELAY_HOT_WALLET_PRIVATE_KEY);
}

/**
 * Throwaway testnet-only wallet that pays gas on behalf of attendees for the whitelisted
 * gasless actions. Never reused across events, never funded with anything but faucet BNB.
 */
export function getHotWalletClient() {
  if (!RELAY_HOT_WALLET_PRIVATE_KEY) {
    throw new Error("RELAY_HOT_WALLET_PRIVATE_KEY not configured");
  }
  const account = privateKeyToAccount(RELAY_HOT_WALLET_PRIVATE_KEY);
  return createWalletClient({ account, chain: CHAIN, transport: http(RPC_URL) });
}
