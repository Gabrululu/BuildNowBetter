// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./lib/RelaySigned.sol";
import "./interfaces/IIdentityRegistry.sol";

/// @notice "One-night CV" for hackathon builders: register a project, assemble a team, and collect
/// skill-tagged endorsements from other builders during the event. Deliberately a separate
/// endorsement namespace from SocialGraph.endorse (project-scoped, skill-tagged) so general social
/// endorsements and builder-CV endorsements stay distinguishable. Heavy media (photos, links,
/// longer writeups) lives on BNB Greenfield — `greenfieldURI` only stores the pointer.
///
/// Team membership is invite + accept, never unilateral. A lead used to be able to push any
/// registered identity onto their project, repeatedly and irreversibly: the victim never opted in
/// yet showed up on-chain as a teammate, duplicates inflated team-based counts, and the member
/// array had no cap or removal path.
contract FounderPassport is RelaySigned {
    /// @dev Byte caps on everything the relay pays to store. Without these, one signed request
    /// carrying a megabyte string was a direct drain on the hot wallet. Mirrored in
    /// `packages/shared/src/relaySchemas.ts` so the relay rejects oversized input before paying.
    uint256 public constant MAX_NAME_BYTES = 80;
    uint256 public constant MAX_SHORT_DESC_BYTES = 280;
    uint256 public constant MAX_URI_BYTES = 512;
    uint256 public constant MAX_SKILL_TAG_BYTES = 32;

    /// @dev Bounds `getTeamMembers`, which returns the whole array in one call.
    uint256 public constant MAX_TEAM_MEMBERS = 20;

    IIdentityRegistry public immutable identityRegistry;

    bytes32 private constant REGISTER_PROJECT_TYPEHASH =
        keccak256(
            "RegisterProject(address wallet,string name,string shortDesc,string greenfieldURI,uint256 nonce,uint256 deadline)"
        );
    bytes32 private constant ENDORSE_BUILDER_TYPEHASH =
        keccak256(
            "EndorseBuilder(address wallet,uint256 projectId,uint256 toIdentityId,string skillTag,uint256 nonce,uint256 deadline)"
        );
    bytes32 private constant INVITE_TEAM_MEMBER_TYPEHASH =
        keccak256(
            "InviteTeamMember(address wallet,uint256 projectId,uint256 toIdentityId,uint256 nonce,uint256 deadline)"
        );
    bytes32 private constant ACCEPT_TEAM_INVITE_TYPEHASH =
        keccak256("AcceptTeamInvite(address wallet,uint256 projectId,uint256 nonce,uint256 deadline)");

    struct Project {
        uint256 leadIdentityId;
        string name;
        string shortDesc;
        string greenfieldURI;
        uint64 registeredAt;
    }

    uint256 public nextProjectId = 1;

    mapping(uint256 => Project) private _projects;
    mapping(uint256 => uint256[]) private _teamMembers;
    /// @notice O(1) membership, so endorsements can be scoped to the team without a loop.
    mapping(uint256 => mapping(uint256 => bool)) public isTeamMember;
    /// @notice Outstanding invites, cleared on accept or decline.
    mapping(uint256 => mapping(uint256 => bool)) public isInvited;
    mapping(bytes32 => bool) private _builderEndorsedPair;

    event ProjectRegistered(
        uint256 indexed projectId,
        uint256 indexed leadIdentityId,
        string name,
        string shortDesc,
        string greenfieldURI,
        uint256 timestamp
    );
    event TeamMemberInvited(uint256 indexed projectId, uint256 indexed identityId);
    event TeamInviteDeclined(uint256 indexed projectId, uint256 indexed identityId);
    event TeamMemberAdded(uint256 indexed projectId, uint256 indexed identityId);
    event TeamMemberRemoved(uint256 indexed projectId, uint256 indexed identityId);
    event BuilderEndorsed(
        uint256 indexed projectId,
        uint256 indexed fromId,
        uint256 indexed toId,
        string skillTag,
        uint256 timestamp
    );

    constructor(address _identityRegistry, address _organizer) RelaySigned(_organizer) {
        require(_identityRegistry != address(0), "FounderPassport: zero registry");
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    // --- Projects ---------------------------------------------------------------------------

    function registerProject(
        string calldata name,
        string calldata shortDesc,
        string calldata greenfieldURI
    ) external returns (uint256) {
        return _registerProject(msg.sender, name, shortDesc, greenfieldURI);
    }

    /// @notice Gasless path. Signature verified on-chain and the nonce consumed before any state
    /// changes — this entrypoint has no natural idempotency (every call mints a new projectId),
    /// so it was the one a replayed request could abuse without limit.
    function registerProjectFor(
        address wallet,
        string calldata name,
        string calldata shortDesc,
        string calldata greenfieldURI,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external onlyRelay returns (uint256) {
        _consumeRelayedSignature(
            wallet,
            keccak256(
                abi.encode(
                    REGISTER_PROJECT_TYPEHASH,
                    wallet,
                    keccak256(bytes(name)),
                    keccak256(bytes(shortDesc)),
                    keccak256(bytes(greenfieldURI)),
                    nonce,
                    deadline
                )
            ),
            nonce,
            deadline,
            signature
        );
        return _registerProject(wallet, name, shortDesc, greenfieldURI);
    }

    function _registerProject(
        address wallet,
        string calldata name,
        string calldata shortDesc,
        string calldata greenfieldURI
    ) internal returns (uint256) {
        require(bytes(name).length > 0, "FounderPassport: empty name");
        require(bytes(name).length <= MAX_NAME_BYTES, "FounderPassport: name too long");
        require(bytes(shortDesc).length <= MAX_SHORT_DESC_BYTES, "FounderPassport: shortDesc too long");
        require(bytes(greenfieldURI).length <= MAX_URI_BYTES, "FounderPassport: greenfieldURI too long");

        uint256 leadId = identityRegistry.getIdentityId(wallet);
        require(leadId != 0, "FounderPassport: lead not registered");

        uint256 projectId = nextProjectId++;
        _projects[projectId] = Project({
            leadIdentityId: leadId,
            name: name,
            shortDesc: shortDesc,
            greenfieldURI: greenfieldURI,
            registeredAt: uint64(block.timestamp)
        });

        // The lead is a member by construction — they opted in by creating the project.
        _teamMembers[projectId].push(leadId);
        isTeamMember[projectId][leadId] = true;

        emit ProjectRegistered(projectId, leadId, name, shortDesc, greenfieldURI, block.timestamp);
        emit TeamMemberAdded(projectId, leadId);
        return projectId;
    }

    // --- Team: invite / accept / decline / remove --------------------------------------------

    function inviteTeamMember(uint256 projectId, uint256 identityId) external {
        _invite(msg.sender, projectId, identityId);
    }

    function inviteTeamMemberFor(
        address wallet,
        uint256 projectId,
        uint256 toIdentityId,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external onlyRelay {
        _consumeRelayedSignature(
            wallet,
            keccak256(abi.encode(INVITE_TEAM_MEMBER_TYPEHASH, wallet, projectId, toIdentityId, nonce, deadline)),
            nonce,
            deadline,
            signature
        );
        _invite(wallet, projectId, toIdentityId);
    }

    function _invite(address wallet, uint256 projectId, uint256 identityId) internal {
        uint256 callerId = identityRegistry.getIdentityId(wallet);
        require(
            callerId != 0 && callerId == _projects[projectId].leadIdentityId,
            "FounderPassport: not project lead"
        );
        require(identityRegistry.identityExists(identityId), "FounderPassport: unknown identity");
        require(!isTeamMember[projectId][identityId], "FounderPassport: already on team");
        require(!isInvited[projectId][identityId], "FounderPassport: already invited");

        isInvited[projectId][identityId] = true;
        emit TeamMemberInvited(projectId, identityId);
    }

    /// @notice Joining is the invitee's own decision — this is the consent step.
    function acceptTeamInvite(uint256 projectId) external {
        _accept(msg.sender, projectId);
    }

    function acceptTeamInviteFor(
        address wallet,
        uint256 projectId,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external onlyRelay {
        _consumeRelayedSignature(
            wallet,
            keccak256(abi.encode(ACCEPT_TEAM_INVITE_TYPEHASH, wallet, projectId, nonce, deadline)),
            nonce,
            deadline,
            signature
        );
        _accept(wallet, projectId);
    }

    function _accept(address wallet, uint256 projectId) internal {
        uint256 identityId = identityRegistry.getIdentityId(wallet);
        require(identityId != 0, "FounderPassport: not registered");
        require(isInvited[projectId][identityId], "FounderPassport: not invited");
        require(!isTeamMember[projectId][identityId], "FounderPassport: already on team");
        require(_teamMembers[projectId].length < MAX_TEAM_MEMBERS, "FounderPassport: team full");

        isInvited[projectId][identityId] = false;
        isTeamMember[projectId][identityId] = true;
        _teamMembers[projectId].push(identityId);

        emit TeamMemberAdded(projectId, identityId);
    }

    function declineTeamInvite(uint256 projectId) external {
        uint256 identityId = identityRegistry.getIdentityId(msg.sender);
        require(identityId != 0, "FounderPassport: not registered");
        require(isInvited[projectId][identityId], "FounderPassport: not invited");

        isInvited[projectId][identityId] = false;
        emit TeamInviteDeclined(projectId, identityId);
    }

    /// @notice Removable by the project lead or by the member themselves — nobody is stuck on a
    /// team they no longer want to be listed on. The lead cannot be removed.
    function removeTeamMember(uint256 projectId, uint256 identityId) external {
        uint256 callerId = identityRegistry.getIdentityId(msg.sender);
        require(callerId != 0, "FounderPassport: not registered");

        uint256 leadId = _projects[projectId].leadIdentityId;
        require(leadId != 0, "FounderPassport: unknown project");
        require(callerId == leadId || callerId == identityId, "FounderPassport: not lead or member");
        require(identityId != leadId, "FounderPassport: cannot remove lead");
        require(isTeamMember[projectId][identityId], "FounderPassport: not on team");

        isTeamMember[projectId][identityId] = false;

        uint256[] storage members = _teamMembers[projectId];
        for (uint256 i = 0; i < members.length; i++) {
            if (members[i] == identityId) {
                members[i] = members[members.length - 1];
                members.pop();
                break;
            }
        }

        emit TeamMemberRemoved(projectId, identityId);
    }

    // --- Builder endorsements ---------------------------------------------------------------

    function endorseBuilder(uint256 projectId, uint256 toIdentityId, string calldata skillTag) external {
        _endorseBuilder(msg.sender, projectId, toIdentityId, skillTag);
    }

    function endorseBuilderFor(
        address wallet,
        uint256 projectId,
        uint256 toIdentityId,
        string calldata skillTag,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external onlyRelay {
        _consumeRelayedSignature(
            wallet,
            keccak256(
                abi.encode(
                    ENDORSE_BUILDER_TYPEHASH,
                    wallet,
                    projectId,
                    toIdentityId,
                    keccak256(bytes(skillTag)),
                    nonce,
                    deadline
                )
            ),
            nonce,
            deadline,
            signature
        );
        _endorseBuilder(wallet, projectId, toIdentityId, skillTag);
    }

    function _endorseBuilder(
        address wallet,
        uint256 projectId,
        uint256 toIdentityId,
        string calldata skillTag
    ) internal {
        require(bytes(skillTag).length <= MAX_SKILL_TAG_BYTES, "FounderPassport: skillTag too long");

        uint256 fromId = identityRegistry.getIdentityId(wallet);
        require(fromId != 0, "FounderPassport: sender not registered");
        require(fromId != toIdentityId, "FounderPassport: cannot endorse self");
        require(_projects[projectId].leadIdentityId != 0, "FounderPassport: unknown project");

        // Both checks used to be missing: `toIdentityId` was never validated at all, so an
        // endorsement could be emitted for identity 0 or 999999 and poison the off-chain
        // aggregation that *is* the reputation. And nothing tied the endorsement to the project,
        // which made the "project-scoped" framing unenforced.
        require(identityRegistry.identityExists(toIdentityId), "FounderPassport: unknown target identity");
        require(isTeamMember[projectId][toIdentityId], "FounderPassport: target not on team");

        bytes32 pairHash = keccak256(abi.encodePacked(projectId, fromId, toIdentityId));
        require(!_builderEndorsedPair[pairHash], "FounderPassport: already endorsed");
        _builderEndorsedPair[pairHash] = true;

        emit BuilderEndorsed(projectId, fromId, toIdentityId, skillTag, block.timestamp);
    }

    // --- Views -------------------------------------------------------------------------------

    function getProject(uint256 projectId) external view returns (Project memory) {
        return _projects[projectId];
    }

    function getTeamMembers(uint256 projectId) external view returns (uint256[] memory) {
        return _teamMembers[projectId];
    }

    function teamMemberCount(uint256 projectId) external view returns (uint256) {
        return _teamMembers[projectId].length;
    }

    function hasEndorsedBuilder(uint256 projectId, uint256 fromId, uint256 toId) external view returns (bool) {
        return _builderEndorsedPair[keccak256(abi.encodePacked(projectId, fromId, toId))];
    }
}
