/**
 * EIP-712 typed-data definitions for the gasless onboarding flow. The relay only ever accepts
 * these fixed, named actions — never arbitrary calldata — and maps each one to a single
 * `*For(wallet, ...)` contract entrypoint. Badge minting is deliberately absent: it stays
 * facilitator-only and non-gasless.
 */

export const EIP712_DOMAIN_NAME = "BuildNowBetter";
export const EIP712_DOMAIN_VERSION = "1";

export const RELAY_ACTION_TYPES = {
  RegisterIdentity: {
    RegisterIdentity: [
      { name: "wallet", type: "address" },
      { name: "displayName", type: "string" },
      { name: "metadataURI", type: "string" },
      { name: "nonce", type: "uint256" },
    ],
  },
  Endorse: {
    Endorse: [
      { name: "wallet", type: "address" },
      { name: "toIdentityId", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
  },
  RegisterProject: {
    RegisterProject: [
      { name: "wallet", type: "address" },
      { name: "name", type: "string" },
      { name: "shortDesc", type: "string" },
      { name: "greenfieldURI", type: "string" },
      { name: "nonce", type: "uint256" },
    ],
  },
  EndorseBuilder: {
    EndorseBuilder: [
      { name: "wallet", type: "address" },
      { name: "projectId", type: "uint256" },
      { name: "toIdentityId", type: "uint256" },
      { name: "skillTag", type: "string" },
      { name: "nonce", type: "uint256" },
    ],
  },
} as const;

export type RelayActionName = keyof typeof RELAY_ACTION_TYPES;
