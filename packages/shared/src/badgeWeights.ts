/**
 * Badge weights are intentionally NOT stored on-chain (ReputationPassport only emits
 * BadgeMinted events). Keeping them here means they're tunable during big-screen rehearsal
 * without redeploying any contract.
 *
 * Order must match the Solidity `ReputationPassport.BadgeType` enum — index N here is enum
 * value N on-chain.
 */
export const BADGE_TYPES = [
  "Attendance",
  "AnsweredQuestion",
  "CompletedChallenge",
  "HelpedPeer",
  "Custom",
] as const;

export type BadgeType = (typeof BADGE_TYPES)[number];

export const BADGE_WEIGHTS: Record<BadgeType, number> = {
  Attendance: 1,
  AnsweredQuestion: 2,
  CompletedChallenge: 3,
  HelpedPeer: 2,
  Custom: 1,
};

export const ENDORSEMENT_WEIGHT = 1;

export function badgeTypeFromIndex(index: number): BadgeType {
  const badgeType = BADGE_TYPES[index];
  if (badgeType === undefined) {
    throw new Error(`Unknown BadgeType index: ${index}`);
  }
  return badgeType;
}

export function computeNodeWeight(params: { badges: BadgeType[]; endorsementsReceived: number }): number {
  const badgeScore = params.badges.reduce((sum, badge) => sum + BADGE_WEIGHTS[badge], 0);
  return badgeScore + params.endorsementsReceived * ENDORSEMENT_WEIGHT;
}
