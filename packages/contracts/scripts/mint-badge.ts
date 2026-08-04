import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Facilitator-only badge minting for the live workshop — run this from a laptop at the event.
 * `mintBadge` is deliberately not gasless/self-serve (see ReputationPassport.sol), so this script
 * signs with the organizer/deployer key, which is a facilitator by default.
 *
 * Order must match ReputationPassport.BadgeType on-chain: index N here is enum value N.
 */
const BADGE_TYPES = ["Attendance", "AnsweredQuestion", "CompletedChallenge", "HelpedPeer", "Custom"] as const;

async function main() {
  const identityIdArg = process.env.IDENTITY_ID;
  const badgeTypeArg = process.env.BADGE_TYPE;
  const note = process.env.NOTE ?? "";

  if (!identityIdArg || !badgeTypeArg) {
    console.error(
      "Usage: IDENTITY_ID=<id> BADGE_TYPE=<Attendance|AnsweredQuestion|CompletedChallenge|HelpedPeer|Custom> " +
        '[NOTE="..."] pnpm --filter contracts mint-badge',
    );
    process.exitCode = 1;
    return;
  }

  const badgeTypeIndex = /^\d+$/.test(badgeTypeArg)
    ? Number(badgeTypeArg)
    : BADGE_TYPES.indexOf(badgeTypeArg as (typeof BADGE_TYPES)[number]);

  if (badgeTypeIndex < 0 || badgeTypeIndex >= BADGE_TYPES.length) {
    console.error(`BADGE_TYPE must be one of: ${BADGE_TYPES.join(", ")} (or a valid index 0-${BADGE_TYPES.length - 1})`);
    process.exitCode = 1;
    return;
  }

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const testnetPath = join(currentDir, "../../shared/src/constants/testnet.json");
  const testnet = JSON.parse(readFileSync(testnetPath, "utf-8"));
  const reputationPassportAddress = testnet.contracts?.ReputationPassport;

  if (!reputationPassportAddress) {
    console.error(`ReputationPassport address not found in ${testnetPath} — deploy contracts first.`);
    process.exitCode = 1;
    return;
  }

  const connection = await network.create();
  const { viem } = connection;
  const [signer] = await viem.getWalletClients();

  const reputationPassport = await viem.getContractAt("ReputationPassport", reputationPassportAddress, {
    client: { wallet: signer },
  });

  const hash = await reputationPassport.write.mintBadge([BigInt(identityIdArg), badgeTypeIndex, note]);
  console.log(
    `Minted "${BADGE_TYPES[badgeTypeIndex]}" badge for identityId ${identityIdArg} — tx: ${hash}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
