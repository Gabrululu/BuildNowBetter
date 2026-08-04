// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./lib/RelayGated.sol";
import "./interfaces/IIdentityRegistry.sol";

/// @notice "One-night CV" for hackathon builders: register a project, add teammates, and collect
/// skill-tagged endorsements from other builders during the event. Deliberately a separate
/// endorsement namespace from SocialGraph.endorse (project-scoped, skill-tagged) so general social
/// endorsements and builder-CV endorsements stay distinguishable. Heavy media (photos, links,
/// longer writeups) lives on BNB Greenfield — `greenfieldURI` only stores the pointer.
contract FounderPassport is RelayGated {
    IIdentityRegistry public immutable identityRegistry;

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
    mapping(bytes32 => bool) private _builderEndorsedPair;

    event ProjectRegistered(
        uint256 indexed projectId,
        uint256 indexed leadIdentityId,
        string name,
        string shortDesc,
        string greenfieldURI,
        uint256 timestamp
    );
    event TeamMemberAdded(uint256 indexed projectId, uint256 indexed identityId);
    event BuilderEndorsed(
        uint256 indexed projectId,
        uint256 indexed fromId,
        uint256 indexed toId,
        string skillTag,
        uint256 timestamp
    );

    constructor(address _identityRegistry, address _organizer) RelayGated(_organizer) {
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    function registerProject(
        string calldata name,
        string calldata shortDesc,
        string calldata greenfieldURI
    ) external returns (uint256) {
        return _registerProject(msg.sender, name, shortDesc, greenfieldURI);
    }

    function registerProjectFor(
        address wallet,
        string calldata name,
        string calldata shortDesc,
        string calldata greenfieldURI
    ) external onlyRelay returns (uint256) {
        return _registerProject(wallet, name, shortDesc, greenfieldURI);
    }

    function _registerProject(
        address wallet,
        string calldata name,
        string calldata shortDesc,
        string calldata greenfieldURI
    ) internal returns (uint256) {
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
        _teamMembers[projectId].push(leadId);

        emit ProjectRegistered(projectId, leadId, name, shortDesc, greenfieldURI, block.timestamp);
        emit TeamMemberAdded(projectId, leadId);
        return projectId;
    }

    function addTeamMember(uint256 projectId, uint256 identityId) external {
        uint256 callerId = identityRegistry.getIdentityId(msg.sender);
        require(callerId != 0 && callerId == _projects[projectId].leadIdentityId, "FounderPassport: not project lead");
        require(identityRegistry.identityExists(identityId), "FounderPassport: unknown identity");

        _teamMembers[projectId].push(identityId);
        emit TeamMemberAdded(projectId, identityId);
    }

    function endorseBuilder(uint256 projectId, uint256 toIdentityId, string calldata skillTag) external {
        _endorseBuilder(msg.sender, projectId, toIdentityId, skillTag);
    }

    function endorseBuilderFor(
        address wallet,
        uint256 projectId,
        uint256 toIdentityId,
        string calldata skillTag
    ) external onlyRelay {
        _endorseBuilder(wallet, projectId, toIdentityId, skillTag);
    }

    function _endorseBuilder(
        address wallet,
        uint256 projectId,
        uint256 toIdentityId,
        string calldata skillTag
    ) internal {
        uint256 fromId = identityRegistry.getIdentityId(wallet);
        require(fromId != 0, "FounderPassport: sender not registered");
        require(fromId != toIdentityId, "FounderPassport: cannot endorse self");
        require(_projects[projectId].leadIdentityId != 0, "FounderPassport: unknown project");

        bytes32 pairHash = keccak256(abi.encodePacked(projectId, fromId, toIdentityId));
        require(!_builderEndorsedPair[pairHash], "FounderPassport: already endorsed");
        _builderEndorsedPair[pairHash] = true;

        emit BuilderEndorsed(projectId, fromId, toIdentityId, skillTag, block.timestamp);
    }

    function getProject(uint256 projectId) external view returns (Project memory) {
        return _projects[projectId];
    }

    function getTeamMembers(uint256 projectId) external view returns (uint256[] memory) {
        return _teamMembers[projectId];
    }
}
