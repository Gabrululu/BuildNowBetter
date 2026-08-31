import { network } from "hardhat";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

async function main() {
  const connection = await network.create();
  const { viem, networkName } = connection;

  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  const [deployer] = await viem.getWalletClients();
  const organizer = deployer.account.address;

  console.log(`Deploying on "${networkName}" (chainId ${chainId}) as organizer: ${organizer}`);

  const identityRegistry = await viem.deployContract("IdentityRegistry", [organizer]);
  console.log(`IdentityRegistry deployed to: ${identityRegistry.address}`);

  const socialGraph = await viem.deployContract("SocialGraph", [identityRegistry.address, organizer]);
  console.log(`SocialGraph deployed to: ${socialGraph.address}`);

  const reputationPassport = await viem.deployContract("ReputationPassport", [
    identityRegistry.address,
    organizer,
  ]);
  console.log(`ReputationPassport deployed to: ${reputationPassport.address}`);

  const founderPassport = await viem.deployContract("FounderPassport", [identityRegistry.address, organizer]);
  console.log(`FounderPassport deployed to: ${founderPassport.address}`);

  // Without this the `relay` address is 0x0 and every gasless path reverts, which used to mean a
  // fresh deploy looked fine until the first attendee tried to register.
  const relayAddress = process.env.RELAY_ADDRESS?.trim();
  const gaslessContracts = [
    ["IdentityRegistry", identityRegistry],
    ["SocialGraph", socialGraph],
    ["FounderPassport", founderPassport],
  ] as const;

  if (relayAddress) {
    for (const [name, contract] of gaslessContracts) {
      await contract.write.setRelay([relayAddress as `0x${string}`], { account: organizer });
      console.log(`${name}: relay set to ${relayAddress}`);
    }
  } else {
    console.warn(
      "RELAY_ADDRESS not set — the gasless *For() paths will revert until you run `pnpm set-relay`.",
    );
  }

  // The relay replays chain history from here on boot; see RELAY_START_BLOCK in apps/relay.
  const startBlock = await publicClient.getBlockNumber();

  const output = {
    network: networkName,
    chainId,
    organizer,
    deployedAt: new Date().toISOString(),
    startBlock: Number(startBlock),
    relay: relayAddress ?? null,
    contracts: {
      IdentityRegistry: identityRegistry.address,
      SocialGraph: socialGraph.address,
      ReputationPassport: reputationPassport.address,
      FounderPassport: founderPassport.address,
    },
  };

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const outPath = join(currentDir, "../../shared/src/constants/testnet.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");
  console.log(`Wrote deployed addresses to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
