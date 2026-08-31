import {
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  RELAY_ACTION_TYPES,
  acceptTeamInviteRequestSchema,
  endorseBuilderRequestSchema,
  endorseRequestSchema,
  founderPassportAbi,
  identityRegistryAbi,
  inviteTeamMemberRequestSchema,
  registerIdentityRequestSchema,
  registerProjectRequestSchema,
  socialGraphAbi,
} from "@buildnowbetter/shared";
import { Router } from "express";
import type { Address, Hex } from "viem";
import { recoverTypedDataAddress } from "viem";

import { CHAIN_ID, FOUNDER_PASSPORT_ADDRESS, IDENTITY_REGISTRY_ADDRESS, SOCIAL_GRAPH_ADDRESS } from "../config.js";
import { getHotWalletClient, hasHotWallet, submitTransaction } from "../hotWallet.js";
import { RelayError } from "../httpError.js";
import { isRateLimited } from "../rateLimit.js";
import { createReplayGuard } from "../replayGuard.js";

const replayGuard = createReplayGuard();

/**
 * The relay only ever accepts these six fixed, named actions — never raw calldata. Each request
 * must carry a valid EIP-712 signature from the wallet it claims to act for, verified here before
 * any hot-wallet gas is spent and verified again on-chain by `RelaySigned`. Badge minting is
 * deliberately absent: it stays facilitator-only and non-gasless.
 */
export const relayRouter = Router();

/** Structural shape of a zod schema, so the relay doesn't need zod as a direct dependency. */
interface ZodIssueLike {
  path: (string | number)[];
  message: string;
}
interface SchemaLike<T> {
  safeParse(
    input: unknown,
  ): { success: true; data: T } | { success: false; error: { issues: ZodIssueLike[] } };
}

interface SignedRequest {
  wallet: string;
  nonce: string;
  deadline: string;
  signature: string;
}

interface RelayActionSpec<T extends SignedRequest> {
  schema: SchemaLike<T>;
  contractAddress: Address | undefined;
  contractEnvName: string;
  types: Record<string, readonly { name: string; type: string }[]>;
  primaryType: string;
  buildMessage: (data: T) => Record<string, unknown>;
}

function describeParseFailure(issues: ZodIssueLike[]): string {
  const first = issues[0];
  if (!first) return "invalid request body";
  const field = first.path.join(".");
  return field ? `${field}: ${first.message}` : first.message;
}

/**
 * The security-critical preamble, shared by every action so the ordering can only be right or
 * wrong in one place. Order matters:
 *
 *   parse → configured → deadline → verify signature → meter → claim nonce → submit
 *
 * Two orderings here are load-bearing, both for the same reason — `wallet` and `nonce` are
 * attacker-chosen strings until the signature recovers to the claimed address:
 *
 *  - Metering runs *after* verification. It used to run before, so ten junk POSTs naming any
 *    attendee's address locked that attendee out of every gasless action for a minute.
 *  - The replay claim runs after verification too. Claiming first would let anyone burn a
 *    victim's nonce with an unsigned request and have their real, signed action rejected.
 */
async function verifyRelayRequest<T extends SignedRequest>(
  body: unknown,
  spec: RelayActionSpec<T>,
): Promise<{ data: T; contract: Address; signer: Address }> {
  const parsed = spec.schema.safeParse(body);
  if (!parsed.success) {
    throw new RelayError(400, describeParseFailure(parsed.error.issues));
  }
  const data = parsed.data;

  if (!spec.contractAddress) {
    throw new RelayError(503, `${spec.contractEnvName} not configured yet — deploy contracts first`);
  }
  if (!hasHotWallet()) {
    throw new RelayError(503, "relay hot wallet not configured yet");
  }

  // Cheap rejection before spending a signature recovery: the contract enforces this too, but
  // submitting a doomed transaction would burn hot-wallet gas for nothing.
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  if (BigInt(data.deadline) < nowSeconds) {
    throw new RelayError(400, "signature expired, please sign again");
  }

  const claimed = data.wallet as Address;

  let signer: Address;
  try {
    signer = await recoverTypedDataAddress({
      domain: {
        name: EIP712_DOMAIN_NAME,
        version: EIP712_DOMAIN_VERSION,
        chainId: CHAIN_ID,
        verifyingContract: spec.contractAddress,
      },
      types: spec.types,
      primaryType: spec.primaryType,
      message: spec.buildMessage(data),
      signature: data.signature as Hex,
    } as Parameters<typeof recoverTypedDataAddress>[0]);
  } catch {
    // The schema pins the signature to 65 bytes, so this is a well-formed-but-unrecoverable
    // signature (e.g. an out-of-range v byte) rather than a truncated one.
    throw new RelayError(401, "signature is malformed");
  }

  if (signer.toLowerCase() !== claimed.toLowerCase()) {
    throw new RelayError(401, "signature does not match wallet");
  }

  if (isRateLimited(signer)) {
    throw new RelayError(429, "rate limited, try again in a minute");
  }

  if (!replayGuard.claim(signer, data.nonce)) {
    throw new RelayError(409, "this action was already submitted");
  }

  return { data, contract: spec.contractAddress, signer };
}

relayRouter.post("/register", async (req, res) => {
  const { data, contract } = await verifyRelayRequest(req.body, {
    schema: registerIdentityRequestSchema,
    contractAddress: IDENTITY_REGISTRY_ADDRESS,
    contractEnvName: "IDENTITY_REGISTRY_ADDRESS",
    types: RELAY_ACTION_TYPES.RegisterIdentity,
    primaryType: "RegisterIdentity",
    buildMessage: (d) => ({
      wallet: d.wallet as Address,
      displayName: d.displayName,
      metadataURI: d.metadataURI,
      nonce: BigInt(d.nonce),
      deadline: BigInt(d.deadline),
    }),
  });

  const client = getHotWalletClient();
  const hash = await submitTransaction(() =>
    client.writeContract({
      address: contract,
      abi: identityRegistryAbi,
      functionName: "registerFor",
      args: [
        data.wallet as Address,
        data.displayName,
        data.metadataURI,
        BigInt(data.nonce),
        BigInt(data.deadline),
        data.signature as Hex,
      ],
    }),
  );

  res.json({ hash });
});

relayRouter.post("/endorse", async (req, res) => {
  const { data, contract } = await verifyRelayRequest(req.body, {
    schema: endorseRequestSchema,
    contractAddress: SOCIAL_GRAPH_ADDRESS,
    contractEnvName: "SOCIAL_GRAPH_ADDRESS",
    types: RELAY_ACTION_TYPES.Endorse,
    primaryType: "Endorse",
    buildMessage: (d) => ({
      wallet: d.wallet as Address,
      toIdentityId: BigInt(d.toIdentityId),
      nonce: BigInt(d.nonce),
      deadline: BigInt(d.deadline),
    }),
  });

  const client = getHotWalletClient();
  const hash = await submitTransaction(() =>
    client.writeContract({
      address: contract,
      abi: socialGraphAbi,
      functionName: "endorseFor",
      args: [
        data.wallet as Address,
        BigInt(data.toIdentityId),
        BigInt(data.nonce),
        BigInt(data.deadline),
        data.signature as Hex,
      ],
    }),
  );

  res.json({ hash });
});

relayRouter.post("/register-project", async (req, res) => {
  const { data, contract } = await verifyRelayRequest(req.body, {
    schema: registerProjectRequestSchema,
    contractAddress: FOUNDER_PASSPORT_ADDRESS,
    contractEnvName: "FOUNDER_PASSPORT_ADDRESS",
    types: RELAY_ACTION_TYPES.RegisterProject,
    primaryType: "RegisterProject",
    buildMessage: (d) => ({
      wallet: d.wallet as Address,
      name: d.name,
      shortDesc: d.shortDesc,
      greenfieldURI: d.greenfieldURI,
      nonce: BigInt(d.nonce),
      deadline: BigInt(d.deadline),
    }),
  });

  const client = getHotWalletClient();
  const hash = await submitTransaction(() =>
    client.writeContract({
      address: contract,
      abi: founderPassportAbi,
      functionName: "registerProjectFor",
      args: [
        data.wallet as Address,
        data.name,
        data.shortDesc,
        data.greenfieldURI,
        BigInt(data.nonce),
        BigInt(data.deadline),
        data.signature as Hex,
      ],
    }),
  );

  res.json({ hash });
});

relayRouter.post("/endorse-builder", async (req, res) => {
  const { data, contract } = await verifyRelayRequest(req.body, {
    schema: endorseBuilderRequestSchema,
    contractAddress: FOUNDER_PASSPORT_ADDRESS,
    contractEnvName: "FOUNDER_PASSPORT_ADDRESS",
    types: RELAY_ACTION_TYPES.EndorseBuilder,
    primaryType: "EndorseBuilder",
    buildMessage: (d) => ({
      wallet: d.wallet as Address,
      projectId: BigInt(d.projectId),
      toIdentityId: BigInt(d.toIdentityId),
      skillTag: d.skillTag,
      nonce: BigInt(d.nonce),
      deadline: BigInt(d.deadline),
    }),
  });

  const client = getHotWalletClient();
  const hash = await submitTransaction(() =>
    client.writeContract({
      address: contract,
      abi: founderPassportAbi,
      functionName: "endorseBuilderFor",
      args: [
        data.wallet as Address,
        BigInt(data.projectId),
        BigInt(data.toIdentityId),
        data.skillTag,
        BigInt(data.nonce),
        BigInt(data.deadline),
        data.signature as Hex,
      ],
    }),
  );

  res.json({ hash });
});

/**
 * Team membership is invite + accept, and both halves are gasless. Inviting used to be the only
 * write with no `*For()` entrypoint, so the project lead — the one attendee most likely to be
 * mid-demo — had to hold testnet BNB to add a teammate.
 */
relayRouter.post("/invite-team-member", async (req, res) => {
  const { data, contract } = await verifyRelayRequest(req.body, {
    schema: inviteTeamMemberRequestSchema,
    contractAddress: FOUNDER_PASSPORT_ADDRESS,
    contractEnvName: "FOUNDER_PASSPORT_ADDRESS",
    types: RELAY_ACTION_TYPES.InviteTeamMember,
    primaryType: "InviteTeamMember",
    buildMessage: (d) => ({
      wallet: d.wallet as Address,
      projectId: BigInt(d.projectId),
      toIdentityId: BigInt(d.toIdentityId),
      nonce: BigInt(d.nonce),
      deadline: BigInt(d.deadline),
    }),
  });

  const client = getHotWalletClient();
  const hash = await submitTransaction(() =>
    client.writeContract({
      address: contract,
      abi: founderPassportAbi,
      functionName: "inviteTeamMemberFor",
      args: [
        data.wallet as Address,
        BigInt(data.projectId),
        BigInt(data.toIdentityId),
        BigInt(data.nonce),
        BigInt(data.deadline),
        data.signature as Hex,
      ],
    }),
  );

  res.json({ hash });
});

relayRouter.post("/accept-team-invite", async (req, res) => {
  const { data, contract } = await verifyRelayRequest(req.body, {
    schema: acceptTeamInviteRequestSchema,
    contractAddress: FOUNDER_PASSPORT_ADDRESS,
    contractEnvName: "FOUNDER_PASSPORT_ADDRESS",
    types: RELAY_ACTION_TYPES.AcceptTeamInvite,
    primaryType: "AcceptTeamInvite",
    buildMessage: (d) => ({
      wallet: d.wallet as Address,
      projectId: BigInt(d.projectId),
      nonce: BigInt(d.nonce),
      deadline: BigInt(d.deadline),
    }),
  });

  const client = getHotWalletClient();
  const hash = await submitTransaction(() =>
    client.writeContract({
      address: contract,
      abi: founderPassportAbi,
      functionName: "acceptTeamInviteFor",
      args: [
        data.wallet as Address,
        BigInt(data.projectId),
        BigInt(data.nonce),
        BigInt(data.deadline),
        data.signature as Hex,
      ],
    }),
  );

  res.json({ hash });
});
