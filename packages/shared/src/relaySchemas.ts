import { z } from "zod";

const hexString = z.string().regex(/^0x[0-9a-fA-F]*$/, "expected a 0x-prefixed hex string");
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected a 0x-prefixed 20-byte address");
const uint256String = z.string().regex(/^[0-9]+$/, "expected a decimal uint256 string");

export const registerIdentityRequestSchema = z.object({
  wallet: address,
  displayName: z.string().min(1).max(64),
  metadataURI: z.string().max(512).default(""),
  nonce: uint256String,
  signature: hexString,
});

export const endorseRequestSchema = z.object({
  wallet: address,
  toIdentityId: uint256String,
  nonce: uint256String,
  signature: hexString,
});

export const registerProjectRequestSchema = z.object({
  wallet: address,
  name: z.string().min(1).max(80),
  shortDesc: z.string().max(280),
  greenfieldURI: z.string().max(512).default(""),
  nonce: uint256String,
  signature: hexString,
});

export const endorseBuilderRequestSchema = z.object({
  wallet: address,
  projectId: uint256String,
  toIdentityId: uint256String,
  skillTag: z.string().max(32),
  nonce: uint256String,
  signature: hexString,
});

export type RegisterIdentityRequest = z.infer<typeof registerIdentityRequestSchema>;
export type EndorseRequest = z.infer<typeof endorseRequestSchema>;
export type RegisterProjectRequest = z.infer<typeof registerProjectRequestSchema>;
export type EndorseBuilderRequest = z.infer<typeof endorseBuilderRequestSchema>;
