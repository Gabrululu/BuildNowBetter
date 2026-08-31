import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  RELAY_ACTION_TYPES,
  relayActionTypeString,
} from "@buildnowbetter/shared";
import { network } from "hardhat";

/**
 * Replay protection for the gasless paths.
 *
 * These tests deliberately sign with `@buildnowbetter/shared`'s RELAY_ACTION_TYPES — the very
 * definitions the frontend uses. A drift between those and the Solidity typehashes would make
 * every real signature invalid, and it would show up here as a signer mismatch.
 */
describe("RelaySigned", async function () {
  const { viem } = await network.create();

  const FAR_FUTURE = BigInt(Math.floor(Date.now() / 1000) + 3600);

  async function setup() {
    const [organizer, relay, alice, bob] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();
    const chainId = await publicClient.getChainId();

    const identityRegistry = await viem.deployContract("IdentityRegistry", [organizer.account.address]);
    const socialGraph = await viem.deployContract("SocialGraph", [
      identityRegistry.address,
      organizer.account.address,
    ]);
    const founderPassport = await viem.deployContract("FounderPassport", [
      identityRegistry.address,
      organizer.account.address,
    ]);

    for (const contract of [identityRegistry, socialGraph, founderPassport]) {
      await contract.write.setRelay([relay.account.address], { account: organizer.account.address });
    }

    return { organizer, relay, alice, bob, chainId, identityRegistry, socialGraph, founderPassport };
  }

  function domain(chainId: number, verifyingContract: `0x${string}`) {
    return {
      name: EIP712_DOMAIN_NAME,
      version: EIP712_DOMAIN_VERSION,
      chainId,
      verifyingContract,
    } as const;
  }

  it("accepts a signed registration through the relay and consumes the nonce", async function () {
    const { relay, alice, chainId, identityRegistry } = await setup();
    const nonce = 42n;

    const signature = await alice.signTypedData({
      account: alice.account,
      domain: domain(chainId, identityRegistry.address),
      types: RELAY_ACTION_TYPES.RegisterIdentity,
      primaryType: "RegisterIdentity",
      message: { wallet: alice.account.address, displayName: "Ada", metadataURI: "", nonce, deadline: FAR_FUTURE },
    });

    assert.equal(await identityRegistry.read.relayNonceUsed([alice.account.address, nonce]), false);

    await identityRegistry.write.registerFor(
      [alice.account.address, "Ada", "", nonce, FAR_FUTURE, signature],
      { account: relay.account.address },
    );

    assert.equal(await identityRegistry.read.getIdentityId([alice.account.address]), 1n);
    assert.equal(await identityRegistry.read.relayNonceUsed([alice.account.address, nonce]), true);
  });

  it("rejects a replayed registration", async function () {
    const { relay, alice, chainId, identityRegistry } = await setup();
    const nonce = 7n;

    const signature = await alice.signTypedData({
      account: alice.account,
      domain: domain(chainId, identityRegistry.address),
      types: RELAY_ACTION_TYPES.RegisterIdentity,
      primaryType: "RegisterIdentity",
      message: { wallet: alice.account.address, displayName: "Ada", metadataURI: "", nonce, deadline: FAR_FUTURE },
    });

    await identityRegistry.write.registerFor(
      [alice.account.address, "Ada", "", nonce, FAR_FUTURE, signature],
      { account: relay.account.address },
    );

    await viem.assertions.revertWithCustomErrorWithArgs(
      identityRegistry.write.registerFor([alice.account.address, "Ada", "", nonce, FAR_FUTURE, signature], {
        account: relay.account.address,
      }),
      identityRegistry,
      "RelayNonceAlreadyUsed",
      [alice.account.address, nonce],
    );
  });

  it("rejects a replayed project registration", async function () {
    // The critical case: registerProjectFor has no natural idempotency, so before nonces were
    // recorded a single captured payload could mint unlimited projects on the relay's gas.
    const { relay, alice, chainId, identityRegistry, founderPassport } = await setup();
    await identityRegistry.write.register(["Ada", ""], { account: alice.account.address });

    const nonce = 99n;
    const signature = await alice.signTypedData({
      account: alice.account,
      domain: domain(chainId, founderPassport.address),
      types: RELAY_ACTION_TYPES.RegisterProject,
      primaryType: "RegisterProject",
      message: {
        wallet: alice.account.address,
        name: "BuildNowBetter",
        shortDesc: "live reputation graph",
        greenfieldURI: "",
        nonce,
        deadline: FAR_FUTURE,
      },
    });

    const args = [
      alice.account.address,
      "BuildNowBetter",
      "live reputation graph",
      "",
      nonce,
      FAR_FUTURE,
      signature,
    ] as const;

    await founderPassport.write.registerProjectFor(args, { account: relay.account.address });
    assert.equal(await founderPassport.read.nextProjectId(), 2n);

    await viem.assertions.revertWithCustomError(
      founderPassport.write.registerProjectFor(args, { account: relay.account.address }),
      founderPassport,
      "RelayNonceAlreadyUsed",
    );

    // Still exactly one project.
    assert.equal(await founderPassport.read.nextProjectId(), 2n);
  });

  it("rejects an expired signature", async function () {
    const { relay, alice, chainId, identityRegistry } = await setup();
    const expired = 1n;

    const signature = await alice.signTypedData({
      account: alice.account,
      domain: domain(chainId, identityRegistry.address),
      types: RELAY_ACTION_TYPES.RegisterIdentity,
      primaryType: "RegisterIdentity",
      message: { wallet: alice.account.address, displayName: "Ada", metadataURI: "", nonce: 1n, deadline: expired },
    });

    await viem.assertions.revertWithCustomError(
      identityRegistry.write.registerFor([alice.account.address, "Ada", "", 1n, expired, signature], {
        account: relay.account.address,
      }),
      identityRegistry,
      "RelaySignatureExpired",
    );
  });

  it("will not let the relay register a wallet that did not sign", async function () {
    // The whole point of verifying on-chain: a compromised relay cannot forge intent.
    const { relay, alice, bob, chainId, identityRegistry } = await setup();

    const bobsSignature = await bob.signTypedData({
      account: bob.account,
      domain: domain(chainId, identityRegistry.address),
      types: RELAY_ACTION_TYPES.RegisterIdentity,
      primaryType: "RegisterIdentity",
      message: { wallet: bob.account.address, displayName: "Bob", metadataURI: "", nonce: 5n, deadline: FAR_FUTURE },
    });

    await viem.assertions.revertWithCustomError(
      identityRegistry.write.registerFor([alice.account.address, "Bob", "", 5n, FAR_FUTURE, bobsSignature], {
        account: relay.account.address,
      }),
      identityRegistry,
      "RelaySignerMismatch",
    );

    assert.equal(await identityRegistry.read.isRegistered([alice.account.address]), false);
  });

  it("will not let a signature be replayed against a different contract", async function () {
    // Each contract's domain separator includes its own address, so an Endorse signature scoped
    // to SocialGraph is meaningless to FounderPassport even with identical field values.
    const { relay, alice, bob, chainId, identityRegistry, socialGraph, founderPassport } = await setup();
    await identityRegistry.write.register(["Ada", ""], { account: alice.account.address });
    await identityRegistry.write.register(["Bob", ""], { account: bob.account.address });
    await founderPassport.write.registerProject(["P", "", ""], { account: bob.account.address });

    const nonce = 11n;
    const wrongDomainSignature = await alice.signTypedData({
      account: alice.account,
      domain: domain(chainId, founderPassport.address), // signed for the wrong contract
      types: RELAY_ACTION_TYPES.Endorse,
      primaryType: "Endorse",
      message: { wallet: alice.account.address, toIdentityId: 2n, nonce, deadline: FAR_FUTURE },
    });

    await viem.assertions.revertWithCustomError(
      socialGraph.write.endorseFor([alice.account.address, 2n, nonce, FAR_FUTURE, wrongDomainSignature], {
        account: relay.account.address,
      }),
      socialGraph,
      "RelaySignerMismatch",
    );
  });

  it("accepts a signed endorsement and rejects its replay", async function () {
    const { relay, alice, bob, chainId, identityRegistry, socialGraph } = await setup();
    await identityRegistry.write.register(["Ada", ""], { account: alice.account.address });
    await identityRegistry.write.register(["Bob", ""], { account: bob.account.address });

    const nonce = 3n;
    const signature = await alice.signTypedData({
      account: alice.account,
      domain: domain(chainId, socialGraph.address),
      types: RELAY_ACTION_TYPES.Endorse,
      primaryType: "Endorse",
      message: { wallet: alice.account.address, toIdentityId: 2n, nonce, deadline: FAR_FUTURE },
    });

    await socialGraph.write.endorseFor([alice.account.address, 2n, nonce, FAR_FUTURE, signature], {
      account: relay.account.address,
    });
    assert.equal(await socialGraph.read.hasEndorsed([1n, 2n]), true);

    await viem.assertions.revertWithCustomError(
      socialGraph.write.endorseFor([alice.account.address, 2n, nonce, FAR_FUTURE, signature], {
        account: relay.account.address,
      }),
      socialGraph,
      "RelayNonceAlreadyUsed",
    );
  });

  it("keeps the shared EIP-712 type strings identical to the Solidity typehashes", async function () {
    // A drift here silently invalidates every signature, so assert it directly for a clear
    // failure message rather than relying on the signing tests above to fail mysteriously.
    const sources = {
      RegisterIdentity: "contracts/IdentityRegistry.sol",
      Endorse: "contracts/SocialGraph.sol",
      RegisterProject: "contracts/FounderPassport.sol",
      EndorseBuilder: "contracts/FounderPassport.sol",
    } as const;

    for (const [action, path] of Object.entries(sources)) {
      const expected = relayActionTypeString(action as keyof typeof RELAY_ACTION_TYPES);
      const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\s+/g, " ");
      assert.ok(
        source.includes(`"${expected}"`),
        `${path} has no typehash string matching shared's ${action}: expected "${expected}"`,
      );
    }
  });
});
