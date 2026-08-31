// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./lib/RelaySigned.sol";
import "./interfaces/IIdentityRegistry.sol";

/// @notice Live endorsement/follow graph. Event-log only — no adjacency list is stored on-chain;
/// the relay/frontend reconstruct the graph client-side from `Endorsed` events. This keeps writes
/// cheap and lets node-weight/leaderboard logic be tuned without redeploying anything.
contract SocialGraph is RelaySigned {
    IIdentityRegistry public immutable identityRegistry;

    bytes32 private constant ENDORSE_TYPEHASH =
        keccak256("Endorse(address wallet,uint256 toIdentityId,uint256 nonce,uint256 deadline)");

    mapping(bytes32 => bool) private _endorsedPair;

    event Endorsed(uint256 indexed fromId, uint256 indexed toId, uint256 timestamp);

    constructor(address _identityRegistry, address _organizer) RelaySigned(_organizer) {
        // The pointer is immutable with no setter, so a wiring mistake here bricks the module
        // permanently — and a registry under someone else's control could fabricate identity ids.
        require(_identityRegistry != address(0), "SocialGraph: zero registry");
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    function endorse(uint256 toIdentityId) external {
        _endorse(msg.sender, toIdentityId);
    }

    /// @notice Gasless path — the relay pays gas, but the attendee's EIP-712 "Endorse" signature
    /// is verified here, and each (wallet, nonce) works exactly once.
    function endorseFor(
        address wallet,
        uint256 toIdentityId,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external onlyRelay {
        _consumeRelayedSignature(
            wallet,
            keccak256(abi.encode(ENDORSE_TYPEHASH, wallet, toIdentityId, nonce, deadline)),
            nonce,
            deadline,
            signature
        );
        _endorse(wallet, toIdentityId);
    }

    function _endorse(address wallet, uint256 toIdentityId) internal {
        uint256 fromId = identityRegistry.getIdentityId(wallet);
        require(fromId != 0, "SocialGraph: sender not registered");
        require(identityRegistry.identityExists(toIdentityId), "SocialGraph: unknown target identity");
        require(fromId != toIdentityId, "SocialGraph: cannot endorse self");

        bytes32 pairHash = keccak256(abi.encodePacked(fromId, toIdentityId));
        require(!_endorsedPair[pairHash], "SocialGraph: already endorsed");
        _endorsedPair[pairHash] = true;

        emit Endorsed(fromId, toIdentityId, block.timestamp);
    }

    function hasEndorsed(uint256 fromId, uint256 toId) external view returns (bool) {
        return _endorsedPair[keccak256(abi.encodePacked(fromId, toId))];
    }
}
