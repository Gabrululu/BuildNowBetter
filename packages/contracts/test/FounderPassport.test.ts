import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { anyValue } from "@nomicfoundation/hardhat-viem-assertions/predicates";
import { network } from "hardhat";
import { createWalletClient, custom, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/**
 * FounderPassport had zero tests before this — the whole project/team/builder-endorsement system,
 * including the invite-consent flow, the team cap, and the removal path added alongside it.
 */
describe("FounderPassport", async function () {
  const { viem } = await network.create();

  async function deploy() {
    const [organizer, lead, teammate, stranger, outsider] = await viem.getWalletClients();
    const identityRegistry = await viem.deployContract("IdentityRegistry", [organizer.account.address]);
    const founderPassport = await viem.deployContract("FounderPassport", [
      identityRegistry.address,
      organizer.account.address,
    ]);

    for (const wallet of [lead, teammate, stranger, outsider]) {
      await identityRegistry.write.register(["Name", ""], { account: wallet.account.address });
    }

    return { organizer, lead, teammate, stranger, outsider, identityRegistry, founderPassport };
  }

  async function deployWithProject() {
    const ctx = await deploy();
    await ctx.founderPassport.write.registerProject(["Project", "desc", ""], {
      account: ctx.lead.account.address,
    });
    return ctx;
  }

  /**
   * Hardhat's default account pool only has 20 wallets, and the team-cap test needs more distinct
   * registered identities than that to actually fill MAX_TEAM_MEMBERS. `getWalletClient` and
   * `contract.write.fn({ account })` only work for accounts the node already knows about
   * (impersonation-based JSON-RPC signing) — a freshly generated key needs its own wallet client
   * signing locally, and must call `writeContract` on *that* client directly.
   */
  async function freshFundedWallet(funder: Awaited<ReturnType<typeof viem.getWalletClients>>[number]) {
    const publicClient = await viem.getPublicClient();
    const account = privateKeyToAccount(generatePrivateKey());
    await funder.sendTransaction({ to: account.address, value: parseEther("1") });
    const client = createWalletClient({ account, chain: publicClient.chain, transport: custom(publicClient.transport) });

    /** writeContract on this wallet, waiting for the receipt like the rest of the suite implicitly does. */
    const write = async (call: Parameters<typeof client.writeContract>[0]) => {
      const hash = await client.writeContract(call);
      await publicClient.waitForTransactionReceipt({ hash });
    };

    return { account, write };
  }

  it("registers the lead as the first team member", async function () {
    const { lead, founderPassport } = await deployWithProject();

    assert.deepEqual(await founderPassport.read.getTeamMembers([1n]), [1n]);
    assert.equal(await founderPassport.read.isTeamMember([1n, 1n]), true);
    void lead;
  });

  it("rejects an empty or oversized project name", async function () {
    const { lead, founderPassport } = await deploy();

    await viem.assertions.revertWith(
      founderPassport.write.registerProject(["", "desc", ""], { account: lead.account.address }),
      "FounderPassport: empty name",
    );

    await viem.assertions.revertWith(
      founderPassport.write.registerProject(["x".repeat(81), "desc", ""], { account: lead.account.address }),
      "FounderPassport: name too long",
    );
  });

  describe("team invites", function () {
    it("requires the invitee to accept before they appear on the team", async function () {
      const { lead, teammate, founderPassport } = await deployWithProject();

      await viem.assertions.emitWithArgs(
        founderPassport.write.inviteTeamMember([1n, 2n], { account: lead.account.address }),
        founderPassport,
        "TeamMemberInvited",
        [1n, 2n],
      );

      // Not a member yet — an invite is not membership.
      assert.equal(await founderPassport.read.isTeamMember([1n, 2n]), false);
      assert.deepEqual(await founderPassport.read.getTeamMembers([1n]), [1n]);

      await viem.assertions.emitWithArgs(
        founderPassport.write.acceptTeamInvite([1n], { account: teammate.account.address }),
        founderPassport,
        "TeamMemberAdded",
        [1n, 2n],
      );

      assert.equal(await founderPassport.read.isTeamMember([1n, 2n]), true);
      assert.equal(await founderPassport.read.isInvited([1n, 2n]), false);
    });

    it("only the project lead can invite", async function () {
      const { stranger, founderPassport } = await deployWithProject();

      await viem.assertions.revertWith(
        founderPassport.write.inviteTeamMember([1n, 3n], { account: stranger.account.address }),
        "FounderPassport: not project lead",
      );
    });

    it("rejects accepting without an invite", async function () {
      const { teammate, founderPassport } = await deployWithProject();

      await viem.assertions.revertWith(
        founderPassport.write.acceptTeamInvite([1n], { account: teammate.account.address }),
        "FounderPassport: not invited",
      );
    });

    it("lets the invitee decline instead of joining", async function () {
      const { lead, teammate, founderPassport } = await deployWithProject();

      await founderPassport.write.inviteTeamMember([1n, 2n], { account: lead.account.address });

      await viem.assertions.emitWithArgs(
        founderPassport.write.declineTeamInvite([1n], { account: teammate.account.address }),
        founderPassport,
        "TeamInviteDeclined",
        [1n, 2n],
      );

      assert.equal(await founderPassport.read.isInvited([1n, 2n]), false);
      await viem.assertions.revertWith(
        founderPassport.write.acceptTeamInvite([1n], { account: teammate.account.address }),
        "FounderPassport: not invited",
      );
    });

    it("rejects a duplicate invite and an invite to an existing member", async function () {
      const { lead, teammate, founderPassport } = await deployWithProject();

      await founderPassport.write.inviteTeamMember([1n, 2n], { account: lead.account.address });
      await viem.assertions.revertWith(
        founderPassport.write.inviteTeamMember([1n, 2n], { account: lead.account.address }),
        "FounderPassport: already invited",
      );

      await founderPassport.write.acceptTeamInvite([1n], { account: teammate.account.address });
      await viem.assertions.revertWith(
        founderPassport.write.inviteTeamMember([1n, 2n], { account: lead.account.address }),
        "FounderPassport: already on team",
      );
    });

    it("caps team size", async function () {
      const { organizer, lead, founderPassport, identityRegistry } = await deployWithProject();
      const maxTeamMembers = await founderPassport.read.MAX_TEAM_MEMBERS();

      async function registerAndInvite(name: string) {
        const wallet = await freshFundedWallet(organizer);
        await wallet.write({
          address: identityRegistry.address,
          abi: identityRegistry.abi,
          functionName: "register",
          args: [name, ""],
        });
        const identityId = await identityRegistry.read.getIdentityId([wallet.account.address]);
        await founderPassport.write.inviteTeamMember([1n, identityId], { account: lead.account.address });
        return wallet;
      }

      // Lead is already member #1; fill the rest with freshly generated, freshly funded wallets
      // so the test isn't limited by Hardhat's default 20-account pool.
      for (let i = 0; i < Number(maxTeamMembers) - 1; i++) {
        const wallet = await registerAndInvite(`Member${i}`);
        await wallet.write({
          address: founderPassport.address,
          abi: founderPassport.abi,
          functionName: "acceptTeamInvite",
          args: [1n],
        });
      }
      assert.equal(await founderPassport.read.teamMemberCount([1n]), maxTeamMembers);

      const oneMore = await registerAndInvite("OneMore");

      await viem.assertions.revertWith(
        oneMore.write({
          address: founderPassport.address,
          abi: founderPassport.abi,
          functionName: "acceptTeamInvite",
          args: [1n],
        }),
        "FounderPassport: team full",
      );
    });
  });

  describe("removeTeamMember", function () {
    it("lets the lead remove a member", async function () {
      const { lead, teammate, founderPassport } = await deployWithProject();
      await founderPassport.write.inviteTeamMember([1n, 2n], { account: lead.account.address });
      await founderPassport.write.acceptTeamInvite([1n], { account: teammate.account.address });

      await viem.assertions.emitWithArgs(
        founderPassport.write.removeTeamMember([1n, 2n], { account: lead.account.address }),
        founderPassport,
        "TeamMemberRemoved",
        [1n, 2n],
      );
      assert.equal(await founderPassport.read.isTeamMember([1n, 2n]), false);
    });

    it("lets a member remove themselves", async function () {
      const { lead, teammate, founderPassport } = await deployWithProject();
      await founderPassport.write.inviteTeamMember([1n, 2n], { account: lead.account.address });
      await founderPassport.write.acceptTeamInvite([1n], { account: teammate.account.address });

      await founderPassport.write.removeTeamMember([1n, 2n], { account: teammate.account.address });
      assert.equal(await founderPassport.read.isTeamMember([1n, 2n]), false);
    });

    it("rejects removal by anyone else, and rejects removing the lead", async function () {
      const { lead, teammate, stranger, founderPassport } = await deployWithProject();
      await founderPassport.write.inviteTeamMember([1n, 2n], { account: lead.account.address });
      await founderPassport.write.acceptTeamInvite([1n], { account: teammate.account.address });

      await viem.assertions.revertWith(
        founderPassport.write.removeTeamMember([1n, 2n], { account: stranger.account.address }),
        "FounderPassport: not lead or member",
      );

      await viem.assertions.revertWith(
        founderPassport.write.removeTeamMember([1n, 1n], { account: lead.account.address }),
        "FounderPassport: cannot remove lead",
      );
    });
  });

  describe("endorseBuilder", function () {
    it("rejects endorsing an identity that does not exist", async function () {
      const { lead, founderPassport } = await deployWithProject();

      await viem.assertions.revertWith(
        founderPassport.write.endorseBuilder([1n, 999n, "solidity"], { account: lead.account.address }),
        "FounderPassport: unknown target identity",
      );
    });

    it("rejects endorsing a real identity that is not on the project's team", async function () {
      // This used to pass silently — the target was never checked against project membership,
      // so "project-scoped" endorsements weren't actually scoped to the project.
      const { lead, outsider, founderPassport } = await deployWithProject();

      await viem.assertions.revertWith(
        founderPassport.write.endorseBuilder([1n, 4n, "solidity"], { account: lead.account.address }),
        "FounderPassport: target not on team",
      );
      void outsider;
    });

    it("accepts an endorsement for a real team member", async function () {
      const { lead, teammate, founderPassport } = await deployWithProject();
      await founderPassport.write.inviteTeamMember([1n, 2n], { account: lead.account.address });
      await founderPassport.write.acceptTeamInvite([1n], { account: teammate.account.address });

      await viem.assertions.emitWithArgs(
        founderPassport.write.endorseBuilder([1n, 2n, "solidity"], { account: lead.account.address }),
        founderPassport,
        "BuilderEndorsed",
        [1n, 1n, 2n, "solidity", anyValue],
      );
      assert.equal(await founderPassport.read.hasEndorsedBuilder([1n, 1n, 2n]), true);
    });

    it("rejects an oversized skill tag", async function () {
      const { lead, teammate, founderPassport } = await deployWithProject();
      await founderPassport.write.inviteTeamMember([1n, 2n], { account: lead.account.address });
      await founderPassport.write.acceptTeamInvite([1n], { account: teammate.account.address });

      await viem.assertions.revertWith(
        founderPassport.write.endorseBuilder([1n, 2n, "x".repeat(33)], { account: lead.account.address }),
        "FounderPassport: skillTag too long",
      );
    });
  });
});
