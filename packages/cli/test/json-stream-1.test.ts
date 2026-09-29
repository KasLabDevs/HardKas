import { describe, it, expect, vi, beforeEach } from "vitest";

vi.setConfig({ testTimeout: 60_000 });

// FUND-JSON-STREAM-1 (reproduced 2026-10-03): `localnet fund --json` and `accounts consolidate --json` printed their
// structured result with `writeLine(JSON.stringify(…))` — the diagnostic channel, which the CLI renderer sends to stderr
// under --json — so stdout was empty. JSON-STREAM-1: with --json, the normal structured result goes exclusively to
// stdout through writeJson; stderr is for diagnostics. The real renderer runs here in json mode with stdout and stderr
// captured apart; the node, Docker and the SDK are doubles.

const h = vi.hoisted(() => ({
  RECIPIENT: "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn",
  fundingReads: 0,
  utxoCount: 22
}));

// ---- localnet fund doubles (as in aud16-fund-liveness.test.ts) ----
vi.mock("execa", () => ({
  execa: vi.fn(async (_cmd: string, args: string[]) => (args[0] === "inspect" ? { stdout: "running|kaspanet/cpuminer@sha256:test|/hardkas-toccata-miner" } : { stdout: "" }))
}));
vi.mock("@hardkas/node-runner", () => ({
  requireNodeIdentity: vi.fn(async () => ({ verified: true, problems: [] })),
  verifyNodeIdentity: vi.fn(async () => ({ verified: true, problems: [] })),
  DockerKaspadRunner: class {}
}));
vi.mock("@hardkas/config", async (orig) => ({ ...(await orig<any>()), loadHardkasConfig: vi.fn(async () => ({ config: {} })) }));
vi.mock("@hardkas/accounts", async (orig) => ({
  ...(await orig<any>()),
  resolveHardkasAccount: vi.fn(() => ({ name: "alice", kind: "kaspa", network: "simnet", address: h.RECIPIENT }))
}));
const matureUtxo = { outpoint: { transactionId: "ab".repeat(32), index: 0 }, amountSompi: 200_000_000_000n, isCoinbase: true, blockDaaScore: 100n };
vi.mock("@hardkas/kaspa-rpc", async (orig) => ({
  ...(await orig<any>()),
  JsonWrpcKaspaClient: class {
    async getInfo() { return { virtualDaaScore: 5000n }; }
    async getUtxosByAddress() { return h.fundingReads++ === 0 ? [] : [matureUtxo]; }
    async close() {}
  }
}));
// ---- the SDK both commands drive ----
vi.mock("@hardkas/sdk", () => {
  const fake = {
    config: { config: { defaultNetwork: "simulated" } },
    workspace: { root: process.cwd() },
    utxos: { waitForSpendableFunding: async () => ({}) },
    rpc: { getBlockDagInfo: async () => ({ virtualDaaScore: 5000n, virtualParentHashes: ["aa"], sink: "bb" }), getUtxosByAddress: async () => [matureUtxo] },
    accounts: { resolve: async (name: string) => ({ name, kind: "kaspa", address: h.RECIPIENT }) },
    tx: {
      createConsolidationPlan: async () => ({ schema: "hardkas.txPlan" }),
      sign: async (plan: unknown) => ({ schema: "hardkas.signedTx", plan }),
      simulate: async () => ({ receipt: { txId: "cd".repeat(32) } })
    }
  };
  return { Hardkas: { create: async () => fake, open: async () => fake } };
});
// ---- accounts consolidate reads the simulator's UTXOs ----
vi.mock("@hardkas/localnet", async (orig) => ({
  ...(await orig<any>()),
  loadOrCreateLocalnetState: async () => ({}),
  getSpendableUtxos: () => Array.from({ length: h.utxoCount }, (_, i) => ({ id: `${"ef".repeat(32)}:${i}`, address: h.RECIPIENT, amountSompi: String(100_000_000 + i) }))
}));

import { runLocalnetFund } from "../src/runners/localnet-runners.js";
import { runAccountsConsolidate } from "../src/runners/accounts-consolidate-runner.js";
import { createCommandOutput, setGlobalOutput } from "../src/output.js";

let out: string;
let err: string;

beforeEach(() => {
  h.fundingReads = 0;
  out = "";
  err = "";
  setGlobalOutput(createCommandOutput({ mode: "json", stdout: { write: (s: string) => { out += s; } }, stderr: { write: (s: string) => { err += s; } } }));
});

/** stdout must be exactly one JSON document; stderr may hold diagnostics, never a JSON document. */
function expectJsonStream1() {
  expect(out.trim(), "stdout carries the structured result").not.toBe("");
  const doc = JSON.parse(out.trim());
  expect(typeof doc).toBe("object");
  const a = err.indexOf("{"), b = err.lastIndexOf("}");
  let jsonOnStderr = false;
  if (a >= 0 && b > a) { try { JSON.parse(err.slice(a, b + 1)); jsonOnStderr = true; } catch {} }
  expect(jsonOnStderr, "no JSON document on stderr").toBe(false);
  return doc;
}

const consolidate = (over: Record<string, unknown>) =>
  runAccountsConsolidate({ account: "alice", network: "simulated", targetUtxos: 20, batchSize: 256, dryRun: false, execute: false, yes: false, allowMainnet: false, json: true, ...over } as any);

describe("JSON-STREAM-1 · with --json the structured result goes to stdout, through writeJson", () => {
  it("localnet fund --json (success): one JSON result on stdout, none on stderr", async () => {
    await runLocalnetFund({ identifier: "alice", amountSompi: 100_000_000_000n, json: true, stopMiner: true });
    const doc = expectJsonStream1();
    expect(doc.status).toBe("TOCCATA_ACCOUNT_FUNDED");
  });

  it("accounts consolidate --dry-run --json (enough UTXOs to plan): one JSON result on stdout", async () => {
    await consolidate({ dryRun: true });
    const doc = expectJsonStream1();
    expect(doc.batches).toBeGreaterThan(0);
    expect(doc.strategy).toBe("smallest-first");
  });

  it("accounts consolidate --execute --yes --json: one JSON result (with receipts) on stdout", async () => {
    await consolidate({ execute: true, yes: true });
    const doc = expectJsonStream1();
    expect(doc.receipts?.length).toBeGreaterThan(0);
  });
});
