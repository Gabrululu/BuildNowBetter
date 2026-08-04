"use client";

import { identityRegistryAbi } from "@buildnowbetter/shared";
import { useAccount, useReadContract } from "wagmi";

const IDENTITY_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS as
  | `0x${string}`
  | undefined;

/** Resolves the connected wallet's on-chain identityId, or undefined if not registered yet. */
export function useMyIdentity() {
  const { address } = useAccount();

  const { data: identityId, isLoading, refetch } = useReadContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: "getIdentityId",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && IDENTITY_REGISTRY_ADDRESS) },
  });

  const id = identityId && identityId > BigInt(0) ? identityId.toString() : undefined;

  return { identityId: id, isLoading, refetch };
}
