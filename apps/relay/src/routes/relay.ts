import {
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  RELAY_ACTION_TYPES,
  endorseRequestSchema,
  identityRegistryAbi,
  registerIdentityRequestSchema,
  socialGraphAbi,
} from "@buildnowbetter/shared";
import { Router } from "express";
import type { Address, Hex } from "viem";
import { recoverTypedDataAddress } from "viem";

import { CHAIN_ID, IDENTITY_REGISTRY_ADDRESS, SOCIAL_GRAPH_ADDRESS } from "../config.js";
import { getHotWalletClient, hasHotWallet } from "../hotWallet.js";
import { isRateLimited } from "../rateLimit.js";

/**
 * The relay only ever accepts these two fixed, named actions — never raw calldata. Each request
 * must carry a valid EIP-712 signature from the wallet it claims to act for; the relay verifies
 * that signature here before spending its own hot-wallet gas on a `*For()` contract call.
 */
export const relayRouter = Router();

relayRouter.post("/register", async (req, res) => {
  const parsed = registerIdentityRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { wallet, displayName, metadataURI, nonce, signature } = parsed.data;

  if (isRateLimited(wallet)) {
    res.status(429).json({ error: "rate limited, try again in a minute" });
    return;
  }
  if (!IDENTITY_REGISTRY_ADDRESS) {
    res.status(503).json({ error: "IDENTITY_REGISTRY_ADDRESS not configured yet — deploy contracts first" });
    return;
  }

  const recovered = await recoverTypedDataAddress({
    domain: {
      name: EIP712_DOMAIN_NAME,
      version: EIP712_DOMAIN_VERSION,
      chainId: CHAIN_ID,
      verifyingContract: IDENTITY_REGISTRY_ADDRESS,
    },
    types: RELAY_ACTION_TYPES.RegisterIdentity,
    primaryType: "RegisterIdentity",
    message: { wallet: wallet as Address, displayName, metadataURI, nonce: BigInt(nonce) },
    signature: signature as Hex,
  });

  if (recovered.toLowerCase() !== wallet.toLowerCase()) {
    res.status(401).json({ error: "signature does not match wallet" });
    return;
  }

  if (!hasHotWallet()) {
    res.status(503).json({ error: "relay hot wallet not configured yet" });
    return;
  }

  const client = getHotWalletClient();
  const hash = await client.writeContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: "registerFor",
    args: [wallet as Address, displayName, metadataURI],
  });

  res.json({ hash });
});

relayRouter.post("/endorse", async (req, res) => {
  const parsed = endorseRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { wallet, toIdentityId, nonce, signature } = parsed.data;

  if (isRateLimited(wallet)) {
    res.status(429).json({ error: "rate limited, try again in a minute" });
    return;
  }
  if (!SOCIAL_GRAPH_ADDRESS) {
    res.status(503).json({ error: "SOCIAL_GRAPH_ADDRESS not configured yet — deploy contracts first" });
    return;
  }

  const recovered = await recoverTypedDataAddress({
    domain: {
      name: EIP712_DOMAIN_NAME,
      version: EIP712_DOMAIN_VERSION,
      chainId: CHAIN_ID,
      verifyingContract: SOCIAL_GRAPH_ADDRESS,
    },
    types: RELAY_ACTION_TYPES.Endorse,
    primaryType: "Endorse",
    message: { wallet: wallet as Address, toIdentityId: BigInt(toIdentityId), nonce: BigInt(nonce) },
    signature: signature as Hex,
  });

  if (recovered.toLowerCase() !== wallet.toLowerCase()) {
    res.status(401).json({ error: "signature does not match wallet" });
    return;
  }

  if (!hasHotWallet()) {
    res.status(503).json({ error: "relay hot wallet not configured yet" });
    return;
  }

  const client = getHotWalletClient();
  const hash = await client.writeContract({
    address: SOCIAL_GRAPH_ADDRESS,
    abi: socialGraphAbi,
    functionName: "endorseFor",
    args: [wallet as Address, BigInt(toIdentityId)],
  });

  res.json({ hash });
});
