// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "./RelayGated.sol";

/// @notice On-chain EIP-712 verification and nonce consumption for the gasless relay paths.
///
/// The relay used to be fully trusted: it verified the attendee's signature off-chain and the
/// contract accepted whatever `wallet` it passed. Two problems followed from that. A compromised
/// relay could register or endorse on behalf of any address, irreversibly. And because the signed
/// `nonce` was never recorded anywhere, a captured request body could be replayed forever — most
/// damagingly against `registerProjectFor`, which mints a fresh project on every call.
///
/// Verifying here fixes both: the relay becomes a pure gas payer that cannot forge intent, and
/// each (wallet, nonce) pair is single-use. `deadline` additionally bounds how long a leaked
/// signature stays dangerous.
///
/// The domain matches what the frontend already signs — name "BuildNowBetter", version "1",
/// the current chain id, and the target contract as `verifyingContract`. Scoping the domain per
/// contract is what keeps an `Endorse` signature from being replayed against another module.
abstract contract RelaySigned is RelayGated {
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant DOMAIN_NAME_HASH = keccak256("BuildNowBetter");
    bytes32 private constant DOMAIN_VERSION_HASH = keccak256("1");

    /// @notice Consumed relay nonces, per signer. Single-use, never cleared.
    mapping(address => mapping(uint256 => bool)) public relayNonceUsed;

    event RelayNonceConsumed(address indexed wallet, uint256 nonce);

    error RelaySignatureExpired(uint256 deadline, uint256 nowTimestamp);
    error RelayNonceAlreadyUsed(address wallet, uint256 nonce);
    error RelaySignerMismatch(address expected, address recovered);

    constructor(address _organizer) RelayGated(_organizer) {}

    /// @notice EIP-712 domain separator for this contract on this chain.
    /// @dev Computed on demand rather than cached at construction so it stays correct if the
    /// chain forks (a cached separator would be replayable on the forked chain).
    function domainSeparator() public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    EIP712_DOMAIN_TYPEHASH,
                    DOMAIN_NAME_HASH,
                    DOMAIN_VERSION_HASH,
                    block.chainid,
                    address(this)
                )
            );
    }

    /// @notice Hashes a struct hash into the final EIP-712 digest for this contract.
    function relayDigest(bytes32 structHash) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /// @dev Reverts unless `signature` is `wallet`'s signature over `structHash`, the deadline is
    /// still in the future, and `nonce` has never been used by `wallet`. Marks it used on success.
    function _consumeRelayedSignature(
        address wallet,
        bytes32 structHash,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) internal {
        if (block.timestamp > deadline) revert RelaySignatureExpired(deadline, block.timestamp);
        if (relayNonceUsed[wallet][nonce]) revert RelayNonceAlreadyUsed(wallet, nonce);

        // OZ's ECDSA rejects malleable (high-s) and malformed signatures by reverting, so a
        // tampered signature can never silently recover to an unexpected address.
        address recovered = ECDSA.recover(relayDigest(structHash), signature);
        if (recovered != wallet) revert RelaySignerMismatch(wallet, recovered);

        relayNonceUsed[wallet][nonce] = true;
        emit RelayNonceConsumed(wallet, nonce);
    }
}
