import { founderPassportAbi, identityRegistryAbi, reputationPassportAbi, socialGraphAbi } from "@buildnowbetter/shared";
import { createPublicClient, http } from "viem";

import {
  CHAIN,
  FOUNDER_PASSPORT_ADDRESS,
  IDENTITY_REGISTRY_ADDRESS,
  RELAY_START_BLOCK,
  REPUTATION_PASSPORT_ADDRESS,
  RPC_URL,
  SOCIAL_GRAPH_ADDRESS,
} from "./config.js";
import { createLogDeduper } from "./logDeduper.js";
import { relayState } from "./state.js";

/** Public BSC testnet RPCs cap eth_getLogs ranges, so history is replayed in chunks. */
const BACKFILL_CHUNK_BLOCKS = 2_000n;
/** Second attempt for endpoints with a tighter range cap than the chunk size above. */
const BACKFILL_RETRY_CHUNK_BLOCKS = 250n;
/** Fallback replay window when RELAY_START_BLOCK is unset (~8h at BSC's 3s blocks). */
const DEFAULT_LOOKBACK_BLOCKS = 10_000n;

function createChainClient() {
  return createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });
}

type ChainClient = ReturnType<typeof createChainClient>;

const deduper = createLogDeduper();

const firstTimeSeeing = (transactionHash: string | null, logIndex: number | null): boolean =>
  deduper.firstTimeSeeing(transactionHash, logIndex);

/**
 * Both IdentityRegistered and Endorsed carry the block's timestamp in their args. Using
 * Date.now() instead (as this used to) collapsed the whole graph's chronology onto restart time
 * on every replay, which breaks the big screen's ordering of edges.
 */
function eventTimeMs(timestamp: bigint | undefined): number {
  return timestamp === undefined ? Date.now() : Number(timestamp) * 1000;
}

function applyIdentityRegistered(args: {
  identityId?: bigint;
  wallet?: string;
  displayName?: string;
  timestamp?: bigint;
}): void {
  if (args.identityId === undefined || args.wallet === undefined || args.displayName === undefined) return;
  relayState.registerIdentity(
    args.identityId.toString(),
    args.wallet,
    args.displayName,
    eventTimeMs(args.timestamp),
  );
}

function applyEndorsed(args: { fromId?: bigint; toId?: bigint; timestamp?: bigint }): void {
  if (args.fromId === undefined || args.toId === undefined) return;
  relayState.recordEndorsement(args.fromId.toString(), args.toId.toString(), eventTimeMs(args.timestamp));
}

function applyBadgeMinted(args: { identityId?: bigint; badgeType?: number }): void {
  if (args.identityId === undefined || args.badgeType === undefined) return;
  relayState.recordBadge(args.identityId.toString(), args.badgeType);
}

function applyProjectRegistered(args: {
  projectId?: bigint;
  leadIdentityId?: bigint;
  name?: string;
  shortDesc?: string;
  greenfieldURI?: string;
}): void {
  if (args.projectId === undefined || args.leadIdentityId === undefined || args.name === undefined) return;
  relayState.registerProject(
    args.projectId.toString(),
    args.leadIdentityId.toString(),
    args.name,
    args.shortDesc ?? "",
    args.greenfieldURI ?? "",
  );
}

function applyTeamMemberAdded(args: { projectId?: bigint; identityId?: bigint }): void {
  if (args.projectId === undefined || args.identityId === undefined) return;
  relayState.addTeamMember(args.projectId.toString(), args.identityId.toString());
}

function applyTeamMemberInvited(args: { projectId?: bigint; identityId?: bigint }): void {
  if (args.projectId === undefined || args.identityId === undefined) return;
  relayState.inviteTeamMember(args.projectId.toString(), args.identityId.toString());
}

function applyTeamInviteDeclined(args: { projectId?: bigint; identityId?: bigint }): void {
  if (args.projectId === undefined || args.identityId === undefined) return;
  relayState.declineTeamInvite(args.projectId.toString(), args.identityId.toString());
}

function applyTeamMemberRemoved(args: { projectId?: bigint; identityId?: bigint }): void {
  if (args.projectId === undefined || args.identityId === undefined) return;
  relayState.removeTeamMember(args.projectId.toString(), args.identityId.toString());
}

function applyBuilderEndorsed(args: { projectId?: bigint }): void {
  if (args.projectId === undefined) return;
  relayState.recordBuilderEndorsement(args.projectId.toString());
}

interface PendingLog {
  blockNumber: bigint;
  logIndex: number;
  apply: () => void;
}

/**
 * Gathers every watched event in one block range. Returned rather than applied, so the caller can
 * order across contracts: an Endorsed log applied before the IdentityRegistered it points at
 * would push an edge whose target isn't in the map yet, and that endorsement would never count.
 */
async function collectLogs(client: ChainClient, fromBlock: bigint, toBlock: bigint): Promise<PendingLog[]> {
  const pending: PendingLog[] = [];

  const push = (
    log: { blockNumber: bigint | null; logIndex: number | null; transactionHash: string | null },
    apply: () => void,
  ): void => {
    if (!firstTimeSeeing(log.transactionHash, log.logIndex)) return;
    pending.push({ blockNumber: log.blockNumber ?? 0n, logIndex: log.logIndex ?? 0, apply });
  };

  if (IDENTITY_REGISTRY_ADDRESS) {
    const logs = await client.getContractEvents({
      address: IDENTITY_REGISTRY_ADDRESS,
      abi: identityRegistryAbi,
      eventName: "IdentityRegistered",
      fromBlock,
      toBlock,
    });
    for (const log of logs) push(log, () => applyIdentityRegistered(log.args));
  }

  if (SOCIAL_GRAPH_ADDRESS) {
    const logs = await client.getContractEvents({
      address: SOCIAL_GRAPH_ADDRESS,
      abi: socialGraphAbi,
      eventName: "Endorsed",
      fromBlock,
      toBlock,
    });
    for (const log of logs) push(log, () => applyEndorsed(log.args));
  }

  if (REPUTATION_PASSPORT_ADDRESS) {
    const logs = await client.getContractEvents({
      address: REPUTATION_PASSPORT_ADDRESS,
      abi: reputationPassportAbi,
      eventName: "BadgeMinted",
      fromBlock,
      toBlock,
    });
    for (const log of logs) push(log, () => applyBadgeMinted(log.args));
  }

  if (FOUNDER_PASSPORT_ADDRESS) {
    const projects = await client.getContractEvents({
      address: FOUNDER_PASSPORT_ADDRESS,
      abi: founderPassportAbi,
      eventName: "ProjectRegistered",
      fromBlock,
      toBlock,
    });
    for (const log of projects) push(log, () => applyProjectRegistered(log.args));

    const members = await client.getContractEvents({
      address: FOUNDER_PASSPORT_ADDRESS,
      abi: founderPassportAbi,
      eventName: "TeamMemberAdded",
      fromBlock,
      toBlock,
    });
    for (const log of members) push(log, () => applyTeamMemberAdded(log.args));

    const invites = await client.getContractEvents({
      address: FOUNDER_PASSPORT_ADDRESS,
      abi: founderPassportAbi,
      eventName: "TeamMemberInvited",
      fromBlock,
      toBlock,
    });
    for (const log of invites) push(log, () => applyTeamMemberInvited(log.args));

    const declines = await client.getContractEvents({
      address: FOUNDER_PASSPORT_ADDRESS,
      abi: founderPassportAbi,
      eventName: "TeamInviteDeclined",
      fromBlock,
      toBlock,
    });
    for (const log of declines) push(log, () => applyTeamInviteDeclined(log.args));

    const removals = await client.getContractEvents({
      address: FOUNDER_PASSPORT_ADDRESS,
      abi: founderPassportAbi,
      eventName: "TeamMemberRemoved",
      fromBlock,
      toBlock,
    });
    for (const log of removals) push(log, () => applyTeamMemberRemoved(log.args));

    const endorsements = await client.getContractEvents({
      address: FOUNDER_PASSPORT_ADDRESS,
      abi: founderPassportAbi,
      eventName: "BuilderEndorsed",
      fromBlock,
      toBlock,
    });
    for (const log of endorsements) push(log, () => applyBuilderEndorsed(log.args));
  }

  return pending;
}

function applyInOrder(pending: PendingLog[]): void {
  pending.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
    return a.logIndex - b.logIndex;
  });

  for (const item of pending) {
    item.apply();
  }
}

/**
 * The binance.org `data-seed-prebsc-*` endpoints — the default in every .env.example here —
 * answer eth_getLogs with "limit exceeded" for *any* range, even a single block, while still
 * serving the eth_newFilter that the live watcher relies on. Probing once up front turns that
 * into one actionable warning instead of a wall of failed range queries.
 */
async function supportsLogQueries(client: ChainClient, head: bigint): Promise<boolean> {
  const address =
    IDENTITY_REGISTRY_ADDRESS ?? SOCIAL_GRAPH_ADDRESS ?? REPUTATION_PASSPORT_ADDRESS ?? FOUNDER_PASSPORT_ADDRESS;
  if (!address) return false;
  try {
    await client.getLogs({ address, fromBlock: head, toBlock: head });
    return true;
  } catch {
    return false;
  }
}

/**
 * Rebuilds in-memory state from chain logs. The relay holds no database — the chain *is* the
 * persistence layer — so this is what makes a restart mid-workshop recoverable instead of
 * silently resetting the room's leaderboard to whatever happens after reboot.
 *
 * Returns the head block the replay reached, so the live watchers can pick up from there.
 */
async function backfill(client: ChainClient): Promise<bigint> {
  const latest = await client.getBlockNumber();

  if (!(await supportsLogQueries(client, latest))) {
    console.warn(
      "[relay] this RPC refuses eth_getLogs — skipping history replay. Live events are still " +
        "tracked, but a restart loses everything before it. Point BSC_TESTNET_RPC_URL at an " +
        "endpoint that serves logs, e.g. https://bsc-testnet-rpc.publicnode.com",
    );
    return latest;
  }

  const start =
    RELAY_START_BLOCK ?? (latest > DEFAULT_LOOKBACK_BLOCKS ? latest - DEFAULT_LOOKBACK_BLOCKS : 0n);

  if (start > latest) {
    console.warn(`[relay] RELAY_START_BLOCK ${start} is ahead of chain head ${latest} — nothing to replay.`);
    return latest;
  }

  if (RELAY_START_BLOCK === undefined) {
    console.warn(
      `[relay] RELAY_START_BLOCK unset — replaying only the last ${DEFAULT_LOOKBACK_BLOCKS} blocks. ` +
        "Set it to the chain head at the start of the event so a restart recovers the whole workshop.",
    );
  }

  console.log(`[relay] replaying chain history, blocks ${start}–${latest}…`);

  for (let from = start; from <= latest; from += BACKFILL_CHUNK_BLOCKS) {
    const chunkEnd = from + BACKFILL_CHUNK_BLOCKS - 1n;
    const to = chunkEnd > latest ? latest : chunkEnd;

    try {
      applyInOrder(await collectLogs(client, from, to));
    } catch {
      // Some endpoints cap the range instead of refusing outright — retry this chunk smaller.
      try {
        for (let retryFrom = from; retryFrom <= to; retryFrom += BACKFILL_RETRY_CHUNK_BLOCKS) {
          const retryEnd = retryFrom + BACKFILL_RETRY_CHUNK_BLOCKS - 1n;
          applyInOrder(await collectLogs(client, retryFrom, retryEnd > to ? to : retryEnd));
        }
      } catch (error) {
        // Partial history beats no relay: keep whatever replayed and let live events continue.
        console.error(
          `[relay] history replay stopped at blocks ${from}–${to}, continuing with live events only:`,
          error instanceof Error ? error.message : error,
        );
        return latest;
      }
    }
  }

  const { nodes, edges, projects } = relayState.getSnapshot();
  console.log(
    `[relay] replay complete — ${nodes.length} identities, ${edges.length} endorsements, ${projects.length} projects.`,
  );
  return latest;
}

function watchAll(client: ChainClient, fromBlock: bigint): (() => void)[] {
  const unwatchers: (() => void)[] = [];

  // Logged rather than resubscribed for now: a dead poller at least stops being invisible.
  const onError = (label: string) => (error: Error) => {
    console.error(`[relay] ${label} subscription error:`, error.message);
  };

  if (IDENTITY_REGISTRY_ADDRESS) {
    unwatchers.push(
      client.watchContractEvent({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: identityRegistryAbi,
        eventName: "IdentityRegistered",
        fromBlock,
        onError: onError("IdentityRegistered"),
        onLogs: (logs) => {
          for (const log of logs) {
            if (!firstTimeSeeing(log.transactionHash, log.logIndex)) continue;
            applyIdentityRegistered(log.args);
          }
        },
      }),
    );
  }

  if (SOCIAL_GRAPH_ADDRESS) {
    unwatchers.push(
      client.watchContractEvent({
        address: SOCIAL_GRAPH_ADDRESS,
        abi: socialGraphAbi,
        eventName: "Endorsed",
        fromBlock,
        onError: onError("Endorsed"),
        onLogs: (logs) => {
          for (const log of logs) {
            if (!firstTimeSeeing(log.transactionHash, log.logIndex)) continue;
            applyEndorsed(log.args);
          }
        },
      }),
    );
  }

  if (REPUTATION_PASSPORT_ADDRESS) {
    unwatchers.push(
      client.watchContractEvent({
        address: REPUTATION_PASSPORT_ADDRESS,
        abi: reputationPassportAbi,
        eventName: "BadgeMinted",
        fromBlock,
        onError: onError("BadgeMinted"),
        onLogs: (logs) => {
          for (const log of logs) {
            if (!firstTimeSeeing(log.transactionHash, log.logIndex)) continue;
            applyBadgeMinted(log.args);
          }
        },
      }),
    );
  }

  if (FOUNDER_PASSPORT_ADDRESS) {
    unwatchers.push(
      client.watchContractEvent({
        address: FOUNDER_PASSPORT_ADDRESS,
        abi: founderPassportAbi,
        eventName: "ProjectRegistered",
        fromBlock,
        onError: onError("ProjectRegistered"),
        onLogs: (logs) => {
          for (const log of logs) {
            if (!firstTimeSeeing(log.transactionHash, log.logIndex)) continue;
            applyProjectRegistered(log.args);
          }
        },
      }),
      client.watchContractEvent({
        address: FOUNDER_PASSPORT_ADDRESS,
        abi: founderPassportAbi,
        eventName: "TeamMemberAdded",
        fromBlock,
        onError: onError("TeamMemberAdded"),
        onLogs: (logs) => {
          for (const log of logs) {
            if (!firstTimeSeeing(log.transactionHash, log.logIndex)) continue;
            applyTeamMemberAdded(log.args);
          }
        },
      }),
      client.watchContractEvent({
        address: FOUNDER_PASSPORT_ADDRESS,
        abi: founderPassportAbi,
        eventName: "TeamMemberInvited",
        fromBlock,
        onError: onError("TeamMemberInvited"),
        onLogs: (logs) => {
          for (const log of logs) {
            if (!firstTimeSeeing(log.transactionHash, log.logIndex)) continue;
            applyTeamMemberInvited(log.args);
          }
        },
      }),
      client.watchContractEvent({
        address: FOUNDER_PASSPORT_ADDRESS,
        abi: founderPassportAbi,
        eventName: "TeamInviteDeclined",
        fromBlock,
        onError: onError("TeamInviteDeclined"),
        onLogs: (logs) => {
          for (const log of logs) {
            if (!firstTimeSeeing(log.transactionHash, log.logIndex)) continue;
            applyTeamInviteDeclined(log.args);
          }
        },
      }),
      client.watchContractEvent({
        address: FOUNDER_PASSPORT_ADDRESS,
        abi: founderPassportAbi,
        eventName: "TeamMemberRemoved",
        fromBlock,
        onError: onError("TeamMemberRemoved"),
        onLogs: (logs) => {
          for (const log of logs) {
            if (!firstTimeSeeing(log.transactionHash, log.logIndex)) continue;
            applyTeamMemberRemoved(log.args);
          }
        },
      }),
      client.watchContractEvent({
        address: FOUNDER_PASSPORT_ADDRESS,
        abi: founderPassportAbi,
        eventName: "BuilderEndorsed",
        fromBlock,
        onError: onError("BuilderEndorsed"),
        onLogs: (logs) => {
          for (const log of logs) {
            if (!firstTimeSeeing(log.transactionHash, log.logIndex)) continue;
            applyBuilderEndorsed(log.args);
          }
        },
      }),
    );
  }

  return unwatchers;
}

/**
 * One shared RPC subscription for the whole room, instead of every phone/screen opening its
 * own. Uses polling under an http transport (BSC testnet public RPCs are not reliably
 * WebSocket-capable) — fine at workshop scale.
 *
 * Replays history first, then watches live from where the replay stopped. Each contract is gated
 * independently, so a missing FounderPassport address no longer disables identity tracking.
 *
 * Returns a stop function for shutdown.
 */
export async function startChainWatcher(): Promise<() => void> {
  if (!IDENTITY_REGISTRY_ADDRESS && !SOCIAL_GRAPH_ADDRESS && !REPUTATION_PASSPORT_ADDRESS && !FOUNDER_PASSPORT_ADDRESS) {
    console.warn("[relay] no contract addresses set — skipping chain watcher, serving in-memory state only.");
    return () => undefined;
  }

  const client = createChainClient();

  // A replay failure must never stop the live watcher — that would take the big screen down for
  // the rest of the workshop over history nobody in the room is looking at.
  let head: bigint;
  try {
    head = await backfill(client);
  } catch (error) {
    console.error("[relay] history replay failed, starting live watch only:", error);
    head = await client.getBlockNumber();
  }

  const unwatchers = watchAll(client, head + 1n);

  const watched = [
    IDENTITY_REGISTRY_ADDRESS && `IdentityRegistry ${IDENTITY_REGISTRY_ADDRESS}`,
    SOCIAL_GRAPH_ADDRESS && `SocialGraph ${SOCIAL_GRAPH_ADDRESS}`,
    REPUTATION_PASSPORT_ADDRESS && `ReputationPassport ${REPUTATION_PASSPORT_ADDRESS}`,
    FOUNDER_PASSPORT_ADDRESS && `FounderPassport ${FOUNDER_PASSPORT_ADDRESS}`,
  ].filter(Boolean);
  console.log(`[relay] watching from block ${head + 1n}: ${watched.join(", ")}`);

  return () => {
    for (const unwatch of unwatchers) unwatch();
  };
}
