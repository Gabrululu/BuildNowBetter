import { createWalletClient, http } from "viem";
import { nonceManager, privateKeyToAccount } from "viem/accounts";

import { CHAIN, RELAY_HOT_WALLET_PRIVATE_KEY, RPC_URL } from "./config.js";

export function hasHotWallet(): boolean {
  return Boolean(RELAY_HOT_WALLET_PRIVATE_KEY);
}

function buildHotWalletClient() {
  if (!RELAY_HOT_WALLET_PRIVATE_KEY) {
    throw new Error("RELAY_HOT_WALLET_PRIVATE_KEY not configured");
  }
  const account = privateKeyToAccount(RELAY_HOT_WALLET_PRIVATE_KEY, { nonceManager });
  return createWalletClient({ account, chain: CHAIN, transport: http(RPC_URL) });
}

type HotWalletClient = ReturnType<typeof buildHotWalletClient>;

let client: HotWalletClient | undefined;

/**
 * Throwaway testnet-only wallet that pays gas on behalf of attendees for the whitelisted
 * gasless actions. Never reused across events, never funded with anything but faucet BNB.
 *
 * Built once and cached: `nonceManager` keeps its nonce counter on the *account instance*, so
 * re-deriving the account per request (as this used to) made every concurrent submission read
 * the same on-chain transaction count and claim the same nonce. With 40 attendees tapping
 * "register" on cue, most of those transactions were dropped as duplicates.
 */
export function getHotWalletClient(): HotWalletClient {
  client ??= buildHotWalletClient();
  return client;
}

let tail: Promise<unknown> = Promise.resolve();

/**
 * Serializes hot-wallet submissions. `nonceManager` hands out distinct, increasing nonces, but
 * BSC nodes still reject a transaction whose nonce arrives ahead of its predecessor, so
 * submission order has to match nonce order — one in flight at a time.
 *
 * A rejected submission does not stall the queue: the next caller runs regardless.
 */
export function submitTransaction<T>(submit: () => Promise<T>): Promise<T> {
  const result = tail.then(submit, submit);
  tail = result.catch(() => undefined);
  return result;
}

/** Test seam — drops the cached client and empties the queue. */
export function resetHotWalletForTests(): void {
  client = undefined;
  tail = Promise.resolve();
}
