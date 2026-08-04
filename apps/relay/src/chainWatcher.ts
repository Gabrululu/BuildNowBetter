import { identityRegistryAbi, reputationPassportAbi, socialGraphAbi } from "@buildnowbetter/shared";
import { createPublicClient, http } from "viem";

import { CHAIN, IDENTITY_REGISTRY_ADDRESS, REPUTATION_PASSPORT_ADDRESS, RPC_URL, SOCIAL_GRAPH_ADDRESS } from "./config.js";
import { relayState } from "./state.js";

/**
 * One shared RPC subscription for the whole room, instead of every phone/screen opening its
 * own. Uses polling under an http transport (BSC testnet public RPCs are not reliably
 * WebSocket-capable) — fine at workshop scale.
 */
export function startChainWatcher(): void {
  if (!IDENTITY_REGISTRY_ADDRESS || !SOCIAL_GRAPH_ADDRESS) {
    console.warn(
      "[relay] IDENTITY_REGISTRY_ADDRESS / SOCIAL_GRAPH_ADDRESS not set — skipping chain watcher, serving in-memory state only.",
    );
    return;
  }

  const client = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });

  client.watchContractEvent({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    eventName: "IdentityRegistered",
    onLogs: (logs) => {
      for (const log of logs) {
        const { identityId, wallet, displayName } = log.args;
        if (identityId === undefined || wallet === undefined || displayName === undefined) continue;
        relayState.registerIdentity(identityId.toString(), wallet, displayName, Date.now());
      }
    },
  });

  client.watchContractEvent({
    address: SOCIAL_GRAPH_ADDRESS,
    abi: socialGraphAbi,
    eventName: "Endorsed",
    onLogs: (logs) => {
      for (const log of logs) {
        const { fromId, toId } = log.args;
        if (fromId === undefined || toId === undefined) continue;
        relayState.recordEndorsement(fromId.toString(), toId.toString(), Date.now());
      }
    },
  });

  if (REPUTATION_PASSPORT_ADDRESS) {
    client.watchContractEvent({
      address: REPUTATION_PASSPORT_ADDRESS,
      abi: reputationPassportAbi,
      eventName: "BadgeMinted",
      onLogs: (logs) => {
        for (const log of logs) {
          const { identityId, badgeType } = log.args;
          if (identityId === undefined || badgeType === undefined) continue;
          relayState.recordBadge(identityId.toString(), badgeType);
        }
      },
    });
  }

  console.log(
    `[relay] watching IdentityRegistry ${IDENTITY_REGISTRY_ADDRESS} and SocialGraph ${SOCIAL_GRAPH_ADDRESS}` +
      (REPUTATION_PASSPORT_ADDRESS ? ` and ReputationPassport ${REPUTATION_PASSPORT_ADDRESS}` : ""),
  );
}
