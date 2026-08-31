import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { anyValue } from "@nomicfoundation/hardhat-viem-assertions/predicates";
import { network } from "hardhat";

describe("IdentityRegistry", async function () {
  const { viem } = await network.create();

  it("self-registers an attendee and assigns sequential identity ids", async function () {
    const [organizer, attendee] = await viem.getWalletClients();
    const identityRegistry = await viem.deployContract("IdentityRegistry", [organizer.account.address]);

    await viem.assertions.emitWithArgs(
      identityRegistry.write.register(["Ada", "ipfs://ada"], { account: attendee.account.address }),
      identityRegistry,
      "IdentityRegistered",
      [1n, attendee.account.address, "Ada", "ipfs://ada", anyValue],
    );

    assert.equal(await identityRegistry.read.isRegistered([attendee.account.address]), true);
    assert.equal(await identityRegistry.read.getIdentityId([attendee.account.address]), 1n);
  });

  it("rejects an empty or oversized displayName, and an oversized metadataURI", async function () {
    // Without these, a single relay-paid request carrying a megabyte string was a direct gas
    // drain on the hot wallet — nothing capped what got written to storage.
    const [organizer, attendee] = await viem.getWalletClients();
    const identityRegistry = await viem.deployContract("IdentityRegistry", [organizer.account.address]);

    await viem.assertions.revertWith(
      identityRegistry.write.register(["", ""], { account: attendee.account.address }),
      "IdentityRegistry: empty displayName",
    );

    await viem.assertions.revertWith(
      identityRegistry.write.register(["x".repeat(65), ""], { account: attendee.account.address }),
      "IdentityRegistry: displayName too long",
    );

    await viem.assertions.revertWith(
      identityRegistry.write.register(["Ada", "x".repeat(513)], { account: attendee.account.address }),
      "IdentityRegistry: metadataURI too long",
    );
  });

  it("rejects a second registration from the same wallet", async function () {
    const [organizer, attendee] = await viem.getWalletClients();
    const identityRegistry = await viem.deployContract("IdentityRegistry", [organizer.account.address]);

    await identityRegistry.write.register(["Ada", "ipfs://ada"], { account: attendee.account.address });

    await viem.assertions.revertWith(
      identityRegistry.write.register(["Ada Again", "ipfs://ada2"], { account: attendee.account.address }),
      "IdentityRegistry: already registered",
    );
  });

  it("only lets the whitelisted relay call registerFor", async function () {
    const [organizer, attendee, relay, stranger] = await viem.getWalletClients();
    const identityRegistry = await viem.deployContract("IdentityRegistry", [organizer.account.address]);

    // The signature is irrelevant here — onlyRelay rejects the stranger before it is ever checked.
    const unusedSignature = `0x${"11".repeat(65)}` as const;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    await viem.assertions.revertWith(
      identityRegistry.write.registerFor(
        [attendee.account.address, "Ada", "ipfs://ada", 1n, deadline, unusedSignature],
        { account: stranger.account.address },
      ),
      "RelayGated: not relay",
    );

    // Whitelisting the relay is necessary but no longer sufficient: relaying now also requires
    // the attendee's real signature. The signed paths are covered in RelaySigned.test.ts.
    await identityRegistry.write.setRelay([relay.account.address], { account: organizer.account.address });
    assert.equal(await identityRegistry.read.isRegistered([attendee.account.address]), false);
  });

  it("only lets the organizer set the relay", async function () {
    const [organizer, stranger, relay] = await viem.getWalletClients();
    const identityRegistry = await viem.deployContract("IdentityRegistry", [organizer.account.address]);

    await viem.assertions.revertWith(
      identityRegistry.write.setRelay([relay.account.address], { account: stranger.account.address }),
      "Organized: not organizer",
    );

    await identityRegistry.write.setRelay([relay.account.address], { account: organizer.account.address });
    assert.equal((await identityRegistry.read.relay()).toLowerCase(), relay.account.address.toLowerCase());
  });
});
