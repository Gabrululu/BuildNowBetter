import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Organizer-only: points the relay-gated contracts at a new trusted relay address (the
 * relay's hot wallet). Run this after rotating RELAY_HOT_WALLET_PRIVATE_KEY, before updating
 * the deployed relay's env var — the old key stops working for gasless *For() calls the
 * moment this transaction lands, so there's a brief window where you should not have the
 * relay serving traffic with the old key.
 *
 * ReputationPassport is intentionally excluded: mintBadge() is signed by the organizer
 * directly, not the relay (see mint-badge.ts).
 */
const RELAY_GATED_CONTRACTS = ["IdentityRegistry", "SocialGraph", "FounderPassport"] as const;

async function main() {
  const newRelayAddress = process.env.NEW_RELAY_ADDRESS;

  if (!newRelayAddress || !/^0x[0-9a-fA-F]{40}$/.test(newRelayAddress)) {
    console.error("Usage: NEW_RELAY_ADDRESS=0x... pnpm --filter contracts set-relay");
    process.exitCode = 1;
    return;
  }

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const testnetPath = join(currentDir, "../../shared/src/constants/testnet.json");
  const testnet = JSON.parse(readFileSync(testnetPath, "utf-8"));

  const connection = await network.create();
  const { viem } = connection;
  const [signer] = await viem.getWalletClients();

  for (const contractName of RELAY_GATED_CONTRACTS) {
    const address = testnet.contracts?.[contractName];
    if (!address) {
      console.error(`${contractName} address not found in ${testnetPath} — deploy contracts first.`);
      process.exitCode = 1;
      return;
    }

    const contract = await viem.getContractAt(contractName, address, { client: { wallet: signer } });
    const write = contract.write as { setRelay: (args: [string]) => Promise<`0x${string}`> };
    const hash = await write.setRelay([newRelayAddress]);
    console.log(`${contractName} (${address}): relay -> ${newRelayAddress} — tx: ${hash}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
