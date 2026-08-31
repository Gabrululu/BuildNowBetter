/**
 * EIP-712 typed-data definitions for the gasless onboarding flow. The relay only ever accepts
 * these fixed, named actions — never arbitrary calldata — and maps each one to a single
 * `*For(wallet, ...)` contract entrypoint. Badge minting is deliberately absent: it stays
 * facilitator-only and non-gasless.
 *
 * These field lists are consensus-critical: each one must match, in order, the typehash string
 * in the corresponding contract (`REGISTER_IDENTITY_TYPEHASH` in IdentityRegistry.sol,
 * `ENDORSE_TYPEHASH` in SocialGraph.sol, `REGISTER_PROJECT_TYPEHASH` and
 * `ENDORSE_BUILDER_TYPEHASH` in FounderPassport.sol). Signatures are now verified on-chain, so a
 * mismatch here doesn't fail loudly — it makes every signature invalid.
 * `relayActions.test.ts` asserts the field lists against those strings.
 */

export const EIP712_DOMAIN_NAME = "BuildNowBetter";
export const EIP712_DOMAIN_VERSION = "1";

/**
 * Chain the relayed actions are signed for. Must be the chain the contracts are deployed on,
 * because they verify against their own `block.chainid` — signing with the wallet's currently
 * connected chain instead produces a valid-looking signature that fails recovery on-chain.
 */
export const RELAY_CHAIN_ID = 97;

/** How long a signed action stays submittable. Long enough for a slow phone on venue wifi. */
export const RELAY_SIGNATURE_TTL_SECONDS = 15 * 60;

export const RELAY_ACTION_TYPES = {
  RegisterIdentity: {
    RegisterIdentity: [
      { name: "wallet", type: "address" },
      { name: "displayName", type: "string" },
      { name: "metadataURI", type: "string" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  Endorse: {
    Endorse: [
      { name: "wallet", type: "address" },
      { name: "toIdentityId", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  RegisterProject: {
    RegisterProject: [
      { name: "wallet", type: "address" },
      { name: "name", type: "string" },
      { name: "shortDesc", type: "string" },
      { name: "greenfieldURI", type: "string" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  EndorseBuilder: {
    EndorseBuilder: [
      { name: "wallet", type: "address" },
      { name: "projectId", type: "uint256" },
      { name: "toIdentityId", type: "uint256" },
      { name: "skillTag", type: "string" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  InviteTeamMember: {
    InviteTeamMember: [
      { name: "wallet", type: "address" },
      { name: "projectId", type: "uint256" },
      { name: "toIdentityId", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  AcceptTeamInvite: {
    AcceptTeamInvite: [
      { name: "wallet", type: "address" },
      { name: "projectId", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
} as const;

export type RelayActionName = keyof typeof RELAY_ACTION_TYPES;

/** Renders an action's EIP-712 type string, i.e. exactly what the contract hashes as its typehash. */
export function relayActionTypeString(action: RelayActionName): string {
  const definition = RELAY_ACTION_TYPES[action] as Record<string, readonly { name: string; type: string }[]>;
  const fields = definition[action];
  return `${action}(${fields.map((field) => `${field.type} ${field.name}`).join(",")})`;
}
