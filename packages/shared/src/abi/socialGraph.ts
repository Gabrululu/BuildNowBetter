/**
 * Hand-written subset of the SocialGraph ABI — just the `Endorsed` event, which is all the
 * relay/screen apps need to reconstruct the live graph client-side. Replace with the generated
 * artifact once the contracts build pipeline is wired up.
 */
export const socialGraphAbi = [
  {
    type: "function",
    name: "endorse",
    stateMutability: "nonpayable",
    inputs: [{ name: "toIdentityId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "endorseFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "toIdentityId", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "Endorsed",
    inputs: [
      { name: "fromId", type: "uint256", indexed: true },
      { name: "toId", type: "uint256", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;
