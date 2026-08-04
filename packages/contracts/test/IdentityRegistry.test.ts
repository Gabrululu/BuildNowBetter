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

    await viem.assertions.revertWith(
      identityRegistry.write.registerFor([attendee.account.address, "Ada", "ipfs://ada"], {
        account: stranger.account.address,
      }),
      "RelayGated: not relay",
    );

    await identityRegistry.write.setRelay([relay.account.address], { account: organizer.account.address });
    await identityRegistry.write.registerFor([attendee.account.address, "Ada", "ipfs://ada"], {
      account: relay.account.address,
    });

    assert.equal(await identityRegistry.read.getIdentityId([attendee.account.address]), 1n);
  });
});
