// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IIdentityRegistry {
    function isRegistered(address wallet) external view returns (bool);
    function getIdentityId(address wallet) external view returns (uint256);
    function identityExists(uint256 identityId) external view returns (bool);
}
