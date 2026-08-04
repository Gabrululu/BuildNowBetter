const WINDOW_MS = 60_000;
const MAX_ACTIONS_PER_WINDOW = 10;

const hits = new Map<string, number[]>();

/**
 * Blunts spam/drain attempts against the relay's hot wallet. Testnet stakes are near-zero, so
 * this is about protecting demo continuity (not running the relay dry mid-workshop), not real
 * financial risk.
 */
export function isRateLimited(signer: string): boolean {
  const key = signer.toLowerCase();
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > MAX_ACTIONS_PER_WINDOW;
}
