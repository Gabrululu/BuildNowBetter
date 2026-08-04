import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { anyValue } from "@nomicfoundation/hardhat-viem-assertions/predicates";
import { network } from "hardhat";

describe("SocialGraph", async function () {
  const { viem } = await network.create();

  async function deployWithTwoRegisteredIdentities() {
    const [organizer, alice, bob] = await viem.getWalletClients();
    const identityRegistry = await viem.deployContract("IdentityRegistry", [organizer.account.address]);
    const socialGraph = await viem.deployContract("SocialGraph", [
      identityRegistry.address,
      organizer.account.address,
    ]);

    await identityRegistry.write.register(["Alice", ""], { account: alice.account.address });
    await identityRegistry.write.register(["Bob", ""], { account: bob.account.address });

    return { organizer, alice, bob, identityRegistry, socialGraph };
  }

  it("records an endorsement between two registered identities", async function () {
    const { alice, socialGraph } = await deployWithTwoRegisteredIdentities();

    await viem.assertions.emitWithArgs(
      socialGraph.write.endorse([2n], { account: alice.account.address }),
      socialGraph,
      "Endorsed",
      [1n, 2n, anyValue],
    );

    assert.equal(await socialGraph.read.hasEndorsed([1n, 2n]), true);
  });

  it("rejects duplicate endorsements and self-endorsement", async function () {
    const { alice, socialGraph } = await deployWithTwoRegisteredIdentities();

    await socialGraph.write.endorse([2n], { account: alice.account.address });

    await viem.assertions.revertWith(
      socialGraph.write.endorse([2n], { account: alice.account.address }),
      "SocialGraph: already endorsed",
    );

    await viem.assertions.revertWith(
      socialGraph.write.endorse([1n], { account: alice.account.address }),
      "SocialGraph: cannot endorse self",
    );
  });
});
