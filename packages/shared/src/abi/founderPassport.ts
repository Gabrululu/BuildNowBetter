/**
 * Hand-written subset of the FounderPassport ABI — just enough for the relay to submit gasless
 * `*For()` calls and watch its events, plus the reads the frontend needs. Replace with the
 * generated artifact once the contracts build pipeline is wired up.
 */
export const founderPassportAbi = [
  {
    type: "function",
    name: "registerProject",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "shortDesc", type: "string" },
      { name: "greenfieldURI", type: "string" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "registerProjectFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "name", type: "string" },
      { name: "shortDesc", type: "string" },
      { name: "greenfieldURI", type: "string" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "inviteTeamMemberFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "projectId", type: "uint256" },
      { name: "toIdentityId", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "acceptTeamInviteFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "projectId", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "declineTeamInvite",
    stateMutability: "nonpayable",
    inputs: [{ name: "projectId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "removeTeamMember",
    stateMutability: "nonpayable",
    inputs: [
      { name: "projectId", type: "uint256" },
      { name: "identityId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isTeamMember",
    stateMutability: "view",
    inputs: [
      { name: "projectId", type: "uint256" },
      { name: "identityId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "isInvited",
    stateMutability: "view",
    inputs: [
      { name: "projectId", type: "uint256" },
      { name: "identityId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "endorseBuilder",
    stateMutability: "nonpayable",
    inputs: [
      { name: "projectId", type: "uint256" },
      { name: "toIdentityId", type: "uint256" },
      { name: "skillTag", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "endorseBuilderFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "projectId", type: "uint256" },
      { name: "toIdentityId", type: "uint256" },
      { name: "skillTag", type: "string" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getProject",
    stateMutability: "view",
    inputs: [{ name: "projectId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "leadIdentityId", type: "uint256" },
          { name: "name", type: "string" },
          { name: "shortDesc", type: "string" },
          { name: "greenfieldURI", type: "string" },
          { name: "registeredAt", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getTeamMembers",
    stateMutability: "view",
    inputs: [{ name: "projectId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    type: "event",
    name: "ProjectRegistered",
    inputs: [
      { name: "projectId", type: "uint256", indexed: true },
      { name: "leadIdentityId", type: "uint256", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "shortDesc", type: "string", indexed: false },
      { name: "greenfieldURI", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TeamMemberInvited",
    inputs: [
      { name: "projectId", type: "uint256", indexed: true },
      { name: "identityId", type: "uint256", indexed: true },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TeamInviteDeclined",
    inputs: [
      { name: "projectId", type: "uint256", indexed: true },
      { name: "identityId", type: "uint256", indexed: true },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TeamMemberRemoved",
    inputs: [
      { name: "projectId", type: "uint256", indexed: true },
      { name: "identityId", type: "uint256", indexed: true },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TeamMemberAdded",
    inputs: [
      { name: "projectId", type: "uint256", indexed: true },
      { name: "identityId", type: "uint256", indexed: true },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BuilderEndorsed",
    inputs: [
      { name: "projectId", type: "uint256", indexed: true },
      { name: "fromId", type: "uint256", indexed: true },
      { name: "toId", type: "uint256", indexed: true },
      { name: "skillTag", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;
