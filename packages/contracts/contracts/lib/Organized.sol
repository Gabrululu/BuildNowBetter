// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Minimal single-organizer access control, avoids pulling in a full Ownable dependency.
abstract contract Organized {
    address public organizer;

    event OrganizerTransferred(address indexed previousOrganizer, address indexed newOrganizer);

    modifier onlyOrganizer() {
        require(msg.sender == organizer, "Organized: not organizer");
        _;
    }

    constructor(address _organizer) {
        require(_organizer != address(0), "Organized: zero address");
        organizer = _organizer;
    }

    function transferOrganizer(address newOrganizer) external onlyOrganizer {
        require(newOrganizer != address(0), "Organized: zero address");
        emit OrganizerTransferred(organizer, newOrganizer);
        organizer = newOrganizer;
    }
}
