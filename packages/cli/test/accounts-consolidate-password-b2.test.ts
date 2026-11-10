import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cliDist, childEnv } from "./first-contact-helpers.js";

// L1-CORE-1 B2 · CONSOLIDATE-PASSWORD-1, found by the CLI lifecycle against a real kaspad (B1): `hardkas accounts
// consolidate --execute` signs every batch, but it had no --password-env / --password-stdin and asked for no password,
// so an account with an encrypted keystore (what `accounts real generate --password-env` creates) could not be
// consolidated at all without a terminal: the CLI refused the option ("unknown option '--password-env'"). Now the
// password is read ONCE, before anything is planned (as `tx batch` does), from the named variable, from stdin, or a
// prompt on a terminal (never with --json), and every batch is signed with it.

const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const SPK = "20" + "00".repeat(32) + "ac";
const utxo = (n: number, amountSompi: bigint) => ({
  outpoint: { transactionId: String(n).repeat(64).slice(0, 64), index: 0 },
  address: FROM,
  amountSompi,
  scriptPublicKey: SPK,
  isCoinbase: false,
  blockDaaScore: 100n
});
const nodeUtxos = [utxo(1, 100_000_000n), utxo(2, 200_000_000n), utxo(3, 300_000_000n)];
const signCalls: Array<{ account: any; options: any }> = [];
const plans: number[] = [];
const WS = fs.mkdtempSync(path.join(os.tmpdir(), "hk-consolidate-pw-"));
(globalThis as any).__consolidatePwWorkspace = WS;
afterAll(() => fs.rmSync(WS, { recursive: true, force: true }));

vi.mock("@hardkas/kaspa-rpc", async () => {
  const actual: any = await vi.importActual("@hardkas/kaspa-rpc");
  class ScriptedClient {
    async getUtxosByAddress() {
      return nodeUtxos.map((u) => ({ ...u }));
    }
    async getBlockDagInfo() {
      return { networkId: "simnet", virtualDaaScore: 5000n };
    }
    async close() {}
  }
  return { ...actual, JsonWrpcKaspaClient: ScriptedClient };
});

vi.mock("@hardkas/sdk", async () => {
  const actual: any = await vi.importActual("@hardkas/sdk");
  const encrypted = { name: "a1", kind: "kaspa", address: FROM, keystorePath: ".hardkas/keystore/a1.json", keystoreKind: "encrypted-keystore" };
  const standIn = {
    config: { config: { networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } } } },
    network: "simnet",
    execution: { mode: "localnet" },
    get workspace() {
      return { root: (globalThis as any).__consolidatePwWorkspace as string };
    },
    accounts: { resolve: async () => ({ ...encrypted }) },
    tx: {
      createConsolidationPlan: async (o: any) => {
        plans.push(o.selectedUtxos.length);
        return { planned: true };
      },
      sign: async (_plan: any, account: any, options: any) => {
        signCalls.push({ account, options });
        return { signed: true };
      },
      send: async () => ({ receipt: { txId: "f".repeat(64) } }),
      simulate: async () => ({ receipt: { txId: "f".repeat(64) } })
    },
    close: async () => {}
  };
  return { ...actual, Hardkas: { open: async () => standIn } };
});

const base = { account: "a1", network: "simnet", url: "ws://127.0.0.1:1", targetUtxos: 1, batchSize: 10, dryRun: false, execute: true, yes: true, allowMainnet: false, json: true };

describe("CONSOLIDATE-PASSWORD-1 · an encrypted account can be consolidated without a terminal", () => {
  beforeEach(() => {
    signCalls.length = 0;
    plans.length = 0;
    delete process.env.HK_CONSOLIDATE_PW;
  });

  it("--password-env: the keystore password reaches every signature, and nothing else carries it", async () => {
    process.env.HK_CONSOLIDATE_PW = "correct horse battery staple";
    const { runAccountsConsolidate } = await import("../src/runners/accounts-consolidate-runner.js");
    await runAccountsConsolidate({ ...base, passwordEnv: "HK_CONSOLIDATE_PW" } as any);
    expect(signCalls.length).toBeGreaterThan(0);
    for (const call of signCalls) expect(call.options?.keystorePassword).toBe("correct horse battery staple");
  });

  it("no password source with --json: a typed refusal before anything is planned, signed or sent", async () => {
    const { runAccountsConsolidate } = await import("../src/runners/accounts-consolidate-runner.js");
    await expect(runAccountsConsolidate({ ...base } as any)).rejects.toMatchObject({ code: expect.stringMatching(/PASSWORD/) });
    expect({ plans: plans.length, signs: signCalls.length }).toEqual({ plans: 0, signs: 0 });
  });

  it("the built CLI takes --password-env and --password-stdin (it refused them as unknown options)", () => {
    const r = spawnSync(process.execPath, [cliDist, "accounts", "consolidate", "--help"], { encoding: "utf8", env: childEnv() });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/--password-env <env>/);
    expect(r.stdout).toMatch(/--password-stdin/);
  });
});
