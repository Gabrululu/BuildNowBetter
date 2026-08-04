// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Organized.sol";

/// @notice Adds a single trusted-relay address, organizer-controlled, used by the gasless
/// onboarding flow: the off-chain relay verifies an attendee's EIP-712 signature and then
/// calls the matching `*For(wallet, ...)` entrypoint on their behalf. Contracts never accept
/// raw calldata from the relay — only these fixed, named actions.
abstract contract RelayGated is Organized {
    address public relay;

    event RelayUpdated(address indexed relay);

    modifier onlyRelay() {
        require(msg.sender == relay, "RelayGated: not relay");
        _;
    }

    constructor(address _organizer) Organized(_organizer) {}

    function setRelay(address _relay) external onlyOrganizer {
        relay = _relay;
        emit RelayUpdated(_relay);
    }
}
