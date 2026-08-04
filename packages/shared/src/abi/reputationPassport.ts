/**
 * Hand-written subset of the ReputationPassport ABI — just the `BadgeMinted` event, which the
 * relay aggregates into leaderboard scores and node weights. Replace with the generated artifact
 * once the contracts build pipeline is wired up.
 */
export const reputationPassportAbi = [
  {
    type: "event",
    name: "BadgeMinted",
    inputs: [
      { name: "identityId", type: "uint256", indexed: true },
      { name: "badgeType", type: "uint8", indexed: false },
      { name: "note", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
      { name: "mintedBy", type: "address", indexed: true },
    ],
    anonymous: false,
  },
] as const;
