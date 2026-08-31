import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { EIP712_DOMAIN_NAME, EIP712_DOMAIN_VERSION, RELAY_ACTION_TYPES } from "@buildnowbetter/shared";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The relay's security boundary: signature verification, the order it runs in relative to rate
 * limiting, and the shape of every failure. The chain is mocked out — what matters here is which
 * requests are allowed to reach a `writeContract` call at all.
 */

const submitted = vi.hoisted(() => ({ calls: [] as { functionName: string }[] }));

vi.mock("../hotWallet.js", () => ({
  hasHotWallet: () => true,
  getHotWalletClient: () => ({
    writeContract: (args: { functionName: string }) => {
      submitted.calls.push(args);
      return Promise.resolve(`0x${"ab".repeat(32)}`);
    },
  }),
  submitTransaction: (submit: () => Promise<unknown>) => submit(),
}));

const IDENTITY_REGISTRY = "0x321a83089d68c37c2ee4df00cc30b4d330f0399b" as const;
const SOCIAL_GRAPH = "0x2bd8abeb2f5598f8477560c70c742affc22912de" as const;
const FOUNDER_PASSPORT = "0x56018a39f418c8e4b138648e2d307f137b2ec3d8" as const;

// Well-known Hardhat development keys — never funded, used only to produce real signatures.
const KEYS = {
  hotWallet: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  happyPath: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  otherSigner: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  impersonated: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  malformed: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  victim: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  spammer: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
  replayer: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
  expired: "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
  shortSig: "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
  teamLead: "0x9f2e3f6d3d4a1f6f7c0a8d9e5b4c3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b",
  invitee: "0x1a2b3c4d5e6f7089a1b2c3d4e5f60718293a4b5c6d7e8f9021a3b4c5d6e7f809",
} as const;

/** Structurally valid (65 bytes) but not recoverable to anybody — reaches the recover step. */
const WELL_FORMED_JUNK_SIGNATURE = `0x${"11".repeat(65)}`;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.IDENTITY_REGISTRY_ADDRESS = IDENTITY_REGISTRY;
  process.env.SOCIAL_GRAPH_ADDRESS = SOCIAL_GRAPH;
  process.env.FOUNDER_PASSPORT_ADDRESS = FOUNDER_PASSPORT;
  process.env.RELAY_HOT_WALLET_PRIVATE_KEY = KEYS.hotWallet;
  process.env.CORS_ORIGIN = "*";

  // Imported after the env is set — config.ts reads process.env at module scope.
  const { createApp } = await import("../app.js");
  server = createServer(createApp());
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

interface PostResult {
  status: number;
  contentType: string;
  raw: string;
  json: Record<string, unknown> | undefined;
}

async function post(path: string, body: unknown, contentType = "application/json"): Promise<PostResult> {
  const response = await fetch(`${baseUrl}/relay${path}`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const raw = await response.text();
  let json: Record<string, unknown> | undefined;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    json = undefined;
  }
  return { status: response.status, contentType: response.headers.get("content-type") ?? "", raw, json };
}

let nonceCounter = 1n;

async function signedRegister(
  privateKey: `0x${string}`,
  { displayName = "Ada", deadline = BigInt(Math.floor(Date.now() / 1000) + 900) } = {},
) {
  const account = privateKeyToAccount(privateKey);
  const nonce = nonceCounter++;
  const signature = await account.signTypedData({
    domain: {
      name: EIP712_DOMAIN_NAME,
      version: EIP712_DOMAIN_VERSION,
      chainId: 97,
      verifyingContract: IDENTITY_REGISTRY,
    },
    types: RELAY_ACTION_TYPES.RegisterIdentity,
    primaryType: "RegisterIdentity",
    message: { wallet: account.address, displayName, metadataURI: "", nonce, deadline },
  });
  return {
    wallet: account.address,
    displayName,
    metadataURI: "",
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    signature,
  };
}

describe("POST /relay/register", () => {
  it("forwards a correctly signed request to registerFor", async () => {
    const before = submitted.calls.length;
    const result = await post("/register", await signedRegister(KEYS.happyPath));

    expect(result.status).toBe(200);
    expect(result.json?.hash).toMatch(/^0x[0-9a-f]+$/);
    expect(submitted.calls.length).toBe(before + 1);
    expect(submitted.calls.at(-1)?.functionName).toBe("registerFor");
  });

  it("rejects a signature that recovers to a different wallet", async () => {
    const signed = await signedRegister(KEYS.otherSigner);
    const impersonated = privateKeyToAccount(KEYS.impersonated).address;

    const result = await post("/register", { ...signed, wallet: impersonated });

    expect(result.status).toBe(401);
    expect(result.json?.error).toBe("signature does not match wallet");
  });

  it("answers an unrecoverable signature with 401 and no stack trace", async () => {
    const signed = await signedRegister(KEYS.malformed);
    const before = submitted.calls.length;

    // A 65-byte signature that recovers to nobody. This used to escape as an HTML 500 carrying
    // err.stack, which the frontend then failed to parse as JSON at all.
    const result = await post("/register", { ...signed, signature: WELL_FORMED_JUNK_SIGNATURE });

    expect(result.status).toBe(401);
    expect(result.contentType).toContain("application/json");
    expect(typeof result.json?.error).toBe("string");
    expect(result.raw).not.toContain("at ");
    expect(submitted.calls.length).toBe(before);
  });

  it("rejects a signature that is not 65 bytes at the schema boundary", async () => {
    const signed = await signedRegister(KEYS.shortSig);

    // The old regex allowed a bare "0x", which sailed past validation and threw inside recovery.
    const result = await post("/register", { ...signed, signature: "0x" });

    expect(result.status).toBe(400);
    expect(result.json?.error).toContain("signature");
  });

  it("answers an invalid body with a readable 400", async () => {
    const result = await post("/register", { displayName: "no wallet" });

    expect(result.status).toBe(400);
    expect(typeof result.json?.error).toBe("string");
    expect(result.json?.error).toContain("wallet");
  });

  it("answers malformed JSON with a JSON 400, not an HTML error page", async () => {
    const result = await post("/register", "{ definitely not json");

    expect(result.status).toBe(400);
    expect(result.contentType).toContain("application/json");
    expect(result.json?.error).toBe("request body is not valid JSON");
  });
});

describe("replay protection", () => {
  it("rejects a resubmitted payload without spending gas on it", async () => {
    const signed = await signedRegister(KEYS.replayer);

    const first = await post("/register", signed);
    expect(first.status).toBe(200);

    const submittedAfterFirst = submitted.calls.length;

    // The contracts also reject a reused (wallet, nonce) on-chain — that is what makes replay
    // impossible. Catching it here keeps the doomed transaction from costing hot-wallet gas.
    const replay = await post("/register", signed);

    expect(replay.status).toBe(409);
    expect(replay.json?.error).toBe("this action was already submitted");
    expect(submitted.calls.length).toBe(submittedAfterFirst);
  });

  it("rejects an already-expired signature before recovering it", async () => {
    const before = submitted.calls.length;
    const stale = await signedRegister(KEYS.expired, { deadline: 1n });

    const result = await post("/register", stale);

    expect(result.status).toBe(400);
    expect(result.json?.error).toBe("signature expired, please sign again");
    expect(submitted.calls.length).toBe(before);
  });
});

describe("rate limiting", () => {
  it("does not let unsigned requests burn another wallet's budget", async () => {
    const victim = await signedRegister(KEYS.victim);

    // Metering runs after verification, so junk naming the victim must not count against them.
    // With the old ordering, these 15 requests locked the victim out for a full minute.
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const junk = await post("/register", { ...victim, signature: WELL_FORMED_JUNK_SIGNATURE });
      expect(junk.status).toBe(401);
    }

    const legitimate = await post("/register", victim);
    expect(legitimate.status).toBe(200);
  });

  it("still meters a wallet that really is signing", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const result = await post("/register", await signedRegister(KEYS.spammer));
      statuses.push(result.status);
    }

    expect(statuses.slice(0, 10)).toEqual(Array<number>(10).fill(200));
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("POST /relay/invite-team-member and /accept-team-invite", () => {
  // These two used to be one endpoint (addTeamMember) with no gasless entrypoint at all — the
  // project lead had to hold testnet BNB to add a teammate. Splitting into invite + accept also
  // means the invitee's consent is a signed action of their own, not something the lead does to
  // them unilaterally.

  it("routes a signed invite to inviteTeamMemberFor", async () => {
    const account = privateKeyToAccount(KEYS.teamLead);
    const nonce = nonceCounter++;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
    const signature = await account.signTypedData({
      domain: {
        name: EIP712_DOMAIN_NAME,
        version: EIP712_DOMAIN_VERSION,
        chainId: 97,
        verifyingContract: FOUNDER_PASSPORT,
      },
      types: RELAY_ACTION_TYPES.InviteTeamMember,
      primaryType: "InviteTeamMember",
      message: { wallet: account.address, projectId: 1n, toIdentityId: 2n, nonce, deadline },
    });

    const result = await post("/invite-team-member", {
      wallet: account.address,
      projectId: "1",
      toIdentityId: "2",
      nonce: nonce.toString(),
      deadline: deadline.toString(),
      signature,
    });

    expect(result.status).toBe(200);
    expect(submitted.calls.at(-1)?.functionName).toBe("inviteTeamMemberFor");
  });

  it("routes a signed acceptance to acceptTeamInviteFor", async () => {
    const account = privateKeyToAccount(KEYS.invitee);
    const nonce = nonceCounter++;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
    const signature = await account.signTypedData({
      domain: {
        name: EIP712_DOMAIN_NAME,
        version: EIP712_DOMAIN_VERSION,
        chainId: 97,
        verifyingContract: FOUNDER_PASSPORT,
      },
      types: RELAY_ACTION_TYPES.AcceptTeamInvite,
      primaryType: "AcceptTeamInvite",
      message: { wallet: account.address, projectId: 1n, nonce, deadline },
    });

    const result = await post("/accept-team-invite", {
      wallet: account.address,
      projectId: "1",
      nonce: nonce.toString(),
      deadline: deadline.toString(),
      signature,
    });

    expect(result.status).toBe(200);
    expect(submitted.calls.at(-1)?.functionName).toBe("acceptTeamInviteFor");
  });
});

describe("unknown endpoints", () => {
  it("answers JSON 404", async () => {
    const response = await fetch(`${baseUrl}/does-not-exist`);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "unknown endpoint" });
  });
});
