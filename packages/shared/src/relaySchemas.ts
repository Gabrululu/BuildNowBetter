import { z } from "zod";

/**
 * Byte caps on every string the relay pays to store on-chain. These must match the `MAX_*_BYTES`
 * constants in the contracts (IdentityRegistry.sol, FounderPassport.sol): the contract is the real
 * enforcement, and this copy exists so the relay rejects oversized input *before* spending gas on
 * a transaction that would revert.
 */
export const RELAY_FIELD_LIMITS = {
  displayName: 64,
  metadataURI: 512,
  projectName: 80,
  shortDesc: 280,
  greenfieldURI: 512,
  skillTag: 32,
} as const;

const encoder = new TextEncoder();

/**
 * Length in UTF-8 bytes, not JS characters. The contracts check `bytes(str).length`, so a name
 * made of emoji would pass a `.max(64)` character check here and still revert on-chain — the
 * relay would have paid gas to find that out.
 */
function boundedString(maxBytes: number, minBytes = 0) {
  return z.string().refine(
    (value) => {
      const size = encoder.encode(value).length;
      return size >= minBytes && size <= maxBytes;
    },
    minBytes > 0
      ? `expected ${minBytes}-${maxBytes} UTF-8 bytes`
      : `expected at most ${maxBytes} UTF-8 bytes`,
  );
}

// A 65-byte secp256k1 signature, exactly. The old `0x[0-9a-fA-F]*` also matched a bare "0x",
// which sailed through validation and blew up inside signature recovery instead.
const signature = z
  .string()
  .regex(/^0x[0-9a-fA-F]{130}$/, "expected a 0x-prefixed 65-byte signature");
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected a 0x-prefixed 20-byte address");
// Capped at 78 digits: uint256 max is 78 digits, and unbounded input reached viem's ABI encoder
// and threw there instead of failing validation.
const uint256String = z.string().regex(/^[0-9]{1,78}$/, "expected a decimal uint256 string");

export const registerIdentityRequestSchema = z.object({
  wallet: address,
  displayName: boundedString(RELAY_FIELD_LIMITS.displayName, 1),
  metadataURI: boundedString(RELAY_FIELD_LIMITS.metadataURI).default(""),
  nonce: uint256String,
  deadline: uint256String,
  signature,
});

export const endorseRequestSchema = z.object({
  wallet: address,
  toIdentityId: uint256String,
  nonce: uint256String,
  deadline: uint256String,
  signature,
});

export const registerProjectRequestSchema = z.object({
  wallet: address,
  name: boundedString(RELAY_FIELD_LIMITS.projectName, 1),
  shortDesc: boundedString(RELAY_FIELD_LIMITS.shortDesc),
  greenfieldURI: boundedString(RELAY_FIELD_LIMITS.greenfieldURI).default(""),
  nonce: uint256String,
  deadline: uint256String,
  signature,
});

export const endorseBuilderRequestSchema = z.object({
  wallet: address,
  projectId: uint256String,
  toIdentityId: uint256String,
  skillTag: boundedString(RELAY_FIELD_LIMITS.skillTag),
  nonce: uint256String,
  deadline: uint256String,
  signature,
});

export const inviteTeamMemberRequestSchema = z.object({
  wallet: address,
  projectId: uint256String,
  toIdentityId: uint256String,
  nonce: uint256String,
  deadline: uint256String,
  signature,
});

export const acceptTeamInviteRequestSchema = z.object({
  wallet: address,
  projectId: uint256String,
  nonce: uint256String,
  deadline: uint256String,
  signature,
});

export type RegisterIdentityRequest = z.infer<typeof registerIdentityRequestSchema>;
export type EndorseRequest = z.infer<typeof endorseRequestSchema>;
export type RegisterProjectRequest = z.infer<typeof registerProjectRequestSchema>;
export type EndorseBuilderRequest = z.infer<typeof endorseBuilderRequestSchema>;
export type InviteTeamMemberRequest = z.infer<typeof inviteTeamMemberRequestSchema>;
export type AcceptTeamInviteRequest = z.infer<typeof acceptTeamInviteRequestSchema>;
