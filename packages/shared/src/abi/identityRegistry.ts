/**
 * Hand-written subset of the IdentityRegistry ABI, just enough for the frontend scaffold to
 * typecheck and call register/isRegistered/getIdentityId before a real build pipeline exists.
 * Once `pnpm --filter contracts build` runs, prefer importing the generated artifact from
 * `packages/contracts/artifacts/contracts/IdentityRegistry.sol/IdentityRegistry.json` instead.
 */
export const identityRegistryAbi = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "displayName", type: "string" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "registerFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "displayName", type: "string" },
      { name: "metadataURI", type: "string" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isRegistered",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getIdentityId",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "IdentityRegistered",
    inputs: [
      { name: "identityId", type: "uint256", indexed: true },
      { name: "wallet", type: "address", indexed: true },
      { name: "displayName", type: "string", indexed: false },
      { name: "metadataURI", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;
