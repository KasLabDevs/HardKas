import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// P34: `POST /mine` computed `HARDKAS_NETWORK === "simnet" || true` and never read it. The dead check is gone; what
// limits the route is unchanged: the loopback Host check, a dev account to mine into, and the canonical node's identity
// proof. HARDKAS_NETWORK does not change any of these answers. Hermetic: Docker, accounts and the node identity probe
// are mocked, so nothing is spawned and no node is contacted.

const execFileCalls: unknown[][] = [];
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFile: (...args: unknown[]) => {
    execFileCalls.push(args);
    const cb = args[args.length - 1];
    if (typeof cb === "function") (cb as (e: unknown, r: unknown) => void)(null, { stdout: "", stderr: "" });
  }
}));

let devAccounts: Array<{ address: string }> = [];
vi.mock("@hardkas/accounts", () => ({ listDevAccountsSync: () => devAccounts }));

const identityCalls: unknown[] = [];
vi.mock("@hardkas/node-runner", () => ({
  requireNodeIdentity: async () => {
    identityCalls.push(1);
    throw new Error("NODE_IDENTITY_UNVERIFIED: not the canonical localnet (test)");
  }
}));

const { simnetRoutes } = await import("../src/routes/simnet.js");

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/routes/simnet.ts");
const NETWORKS: Array<string | undefined> = [undefined, "simnet", "testnet-10", "devnet"];
const saved = process.env.HARDKAS_NETWORK;

function setNetwork(n: string | undefined) {
  if (n === undefined) delete process.env.HARDKAS_NETWORK;
  else process.env.HARDKAS_NETWORK = n;
}

const mine = (host: string) => simnetRoutes.request("/mine?blocks=1", { method: "POST", headers: { host } });

describe("P34: dev-server POST /mine has no dead HARDKAS_NETWORK check", () => {
  beforeEach(() => {
    execFileCalls.length = 0;
    identityCalls.length = 0;
    devAccounts = [];
  });
  afterEach(() => setNetwork(saved));

  it("the source no longer carries the always-true network check", () => {
    const src = readFileSync(SRC, "utf8");
    expect(src).not.toMatch(/\|\|\s*true/);
    expect(src).not.toMatch(/process\.env\.HARDKAS_NETWORK/);
    expect(src).toContain("requireNodeIdentity");
  });

  for (const n of NETWORKS) {
    const label = n ?? "(unset)";

    it(`HARDKAS_NETWORK=${label}: a non-loopback Host is refused (403) before anything else`, async () => {
      setNetwork(n);
      const res = await mine("example.test:7420");
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/loopback/);
      expect(identityCalls).toHaveLength(0);
      expect(execFileCalls).toHaveLength(0);
    });

    it(`HARDKAS_NETWORK=${label}: loopback without a dev account answers NO_DEV_ACCOUNT (409)`, async () => {
      setNetwork(n);
      const res = await mine("127.0.0.1:7420");
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/^NO_DEV_ACCOUNT/);
      expect(identityCalls).toHaveLength(0);
      expect(execFileCalls).toHaveLength(0);
    });

    it(`HARDKAS_NETWORK=${label}: a node that fails the identity proof is never mined into (409, no docker)`, async () => {
      setNetwork(n);
      devAccounts = [{ address: "kaspasim:qtestaddress" }];
      const res = await mine("localhost:7420");
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/NODE_IDENTITY_UNVERIFIED/);
      expect(identityCalls).toHaveLength(1);
      expect(execFileCalls).toHaveLength(0);
    });
  }
});
