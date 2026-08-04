// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./lib/Organized.sol";
import "./interfaces/IIdentityRegistry.sol";

/// @notice Badge/reputation events for the live passport. Deliberately NOT gasless and NOT
/// self-serve: only the organizer or an organizer-appointed facilitator can mint a badge, so a
/// mis-signed relay message can never inflate someone's reputation. No score is stored on-chain —
/// the leaderboard and node-weight math live in the relay's config, computed from `BadgeMinted`
/// events, so badge weights are tunable during rehearsal without a redeploy.
contract ReputationPassport is Organized {
    enum BadgeType {
        Attendance,
        AnsweredQuestion,
        CompletedChallenge,
        HelpedPeer,
        Custom
    }

    IIdentityRegistry public immutable identityRegistry;
    mapping(address => bool) public isFacilitator;

    event FacilitatorUpdated(address indexed facilitator, bool allowed);
    event BadgeMinted(
        uint256 indexed identityId,
        BadgeType badgeType,
        string note,
        uint256 timestamp,
        address indexed mintedBy
    );

    modifier onlyFacilitator() {
        require(msg.sender == organizer || isFacilitator[msg.sender], "ReputationPassport: not facilitator");
        _;
    }

    constructor(address _identityRegistry, address _organizer) Organized(_organizer) {
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    function setFacilitator(address account, bool allowed) external onlyOrganizer {
        isFacilitator[account] = allowed;
        emit FacilitatorUpdated(account, allowed);
    }

    function mintBadge(uint256 identityId, BadgeType badgeType, string calldata note) external onlyFacilitator {
        require(identityRegistry.identityExists(identityId), "ReputationPassport: unknown identity");
        require(bytes(note).length <= 140, "ReputationPassport: note too long");

        emit BadgeMinted(identityId, badgeType, note, block.timestamp, msg.sender);
    }
}
