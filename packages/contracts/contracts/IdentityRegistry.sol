// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./lib/RelayGated.sol";
import "./interfaces/IIdentityRegistry.sol";

/// @notice Single source of truth for "one wallet = one identity" across every module
/// (social graph, reputation passport, founder passport). Deliberately a struct+mapping
/// registry rather than a full ERC-721 — pattern-inspired by ERC-8004's identity + agent-card
/// metadataURI, without transfer/approval semantics this one-night demo doesn't need.
contract IdentityRegistry is RelayGated, IIdentityRegistry {
    enum Role {
        Attendee,
        Facilitator,
        Organizer
    }

    struct Identity {
        address wallet;
        string displayName;
        string metadataURI;
        Role role;
        uint64 registeredAt;
    }

    uint256 public nextIdentityId = 1;

    mapping(address => uint256) private _identityOf;
    mapping(uint256 => Identity) private _identities;

    event IdentityRegistered(
        uint256 indexed identityId,
        address indexed wallet,
        string displayName,
        string metadataURI,
        uint256 timestamp
    );
    event RoleGranted(uint256 indexed identityId, Role role);

    constructor(address _organizer) RelayGated(_organizer) {}

    /// @notice Self-serve registration, attendee pays their own gas.
    function register(string calldata displayName, string calldata metadataURI) external returns (uint256) {
        return _register(msg.sender, displayName, metadataURI);
    }

    /// @notice Gasless registration path. Caller must be the whitelisted relay, which is
    /// expected to have already verified the attendee's EIP-712 "RegisterIdentity" signature
    /// off-chain before submitting this call.
    function registerFor(
        address wallet,
        string calldata displayName,
        string calldata metadataURI
    ) external onlyRelay returns (uint256) {
        return _register(wallet, displayName, metadataURI);
    }

    function _register(
        address wallet,
        string calldata displayName,
        string calldata metadataURI
    ) internal returns (uint256) {
        require(wallet != address(0), "IdentityRegistry: zero address");
        require(_identityOf[wallet] == 0, "IdentityRegistry: already registered");

        uint256 identityId = nextIdentityId++;
        _identityOf[wallet] = identityId;
        _identities[identityId] = Identity({
            wallet: wallet,
            displayName: displayName,
            metadataURI: metadataURI,
            role: Role.Attendee,
            registeredAt: uint64(block.timestamp)
        });

        emit IdentityRegistered(identityId, wallet, displayName, metadataURI, block.timestamp);
        return identityId;
    }

    function setRole(uint256 identityId, Role role) external onlyOrganizer {
        require(_identities[identityId].wallet != address(0), "IdentityRegistry: unknown identity");
        _identities[identityId].role = role;
        emit RoleGranted(identityId, role);
    }

    function isRegistered(address wallet) external view returns (bool) {
        return _identityOf[wallet] != 0;
    }

    function getIdentityId(address wallet) external view returns (uint256) {
        return _identityOf[wallet];
    }

    function identityExists(uint256 identityId) external view returns (bool) {
        return _identities[identityId].wallet != address(0);
    }

    function getIdentity(uint256 identityId) external view returns (Identity memory) {
        return _identities[identityId];
    }

    function identityCount() external view returns (uint256) {
        return nextIdentityId - 1;
    }
}
