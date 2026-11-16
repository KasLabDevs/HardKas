import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import { cliDist, childEnv } from "./first-contact-helpers.js";
import { startDecoy, type Decoy } from "./helpers/mainnet-decoy.js";
import { txPlanRecipientsOf } from "../src/commands/tx.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 120_000 });

// R4-T · several recipients in ONE transaction from the CLI, real processes on the built CLI in a simulated workspace:
//   - `tx batch --one-transaction` pays every payment of the file in one transaction (one txId, one receipt, output i
//     pays payment i, one change output); the same file without the flag is one transaction per payment, as before;
//   - refused before anything is planned: payments from several payers (TX_BATCH_MULTIPLE_PAYERS), a payment without
//     from/to/amount (TX_BATCH_PAYMENT_INVALID), an empty file (TX_BATCH_EMPTY), more recipients than fit in one standard
//     transaction (TOO_MANY_OUTPUTS, with how many fit), mainnet (MAINNET_BROADCAST_DISABLED, nothing contacted);
//   - `tx plan --to <recipient>=<kas>` repeated plans one transaction for several recipients; one pair is the plan of
//     `--to <r> --amount <kas>` byte for byte; every mixed or ambiguous form is TX_PLAN_USAGE.

let preloadDir = "";
let freeze = "";

beforeAll(() => {
  preloadDir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r4t-preload-"));
  freeze = path.join(preloadDir, "freeze-clock.cjs");
  // a fixed wall clock in the child, so two plans of the same payment write the same createdAt (hence contentHash)
  fs.writeFileSync(
    freeze,
    "const FIXED = 1763215200000; const RealDate = Date; Date.now = () => FIXED;\n" +
      "global.Date = class extends RealDate { constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); } static now() { return FIXED; } };\n"
  );
});
afterAll(() => {
  if (preloadDir) fs.rmSync(preloadDir, { recursive: true, force: true });
});

const cli = (args: string[], cwd: string, env: Record<string, string> = {}) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: childEnv(env), encoding: "utf8", timeout: 200_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};
const firstJson = (stdout: string) => JSON.parse(stdout.split(/\r?\n(?=\{)/)[0]!);
/** The workspace's stored artifacts of one schema (read from the files, never inferred from their names). */
const stored = (ws: string, schema: string) => {
  const root = path.join(ws, ".hardkas", "artifacts");
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
      } catch {
        return undefined;
      }
    })
    .filter((a) => a?.schema === schema);
};
const freshSimulated = async (prefix: string) => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  await (await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" })).close?.();
  return ws;
};

describe("R4-T · tx batch --one-transaction (simulator)", () => {
  let ws: string;

  beforeEach(async () => {
    ws = await freshSimulated("hk-r4t-batch-");
  });
  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const batch = (payments: unknown, extra: string[] = ["--one-transaction"]) => {
    fs.writeFileSync(path.join(ws, "batch.json"), JSON.stringify(payments));
    return cli(["tx", "batch", "--file", "batch.json", "--network", "simulated", ...extra, "--json"], ws);
  };
  const THREE = [
    { from: "alice", to: "bob", amount: "1" },
    { from: "alice", to: "carol", amount: "2" },
    { from: "alice", to: "bob", amount: 0.5 }
  ];

  it("3 payments: ONE transaction (one txId, one receipt), output i pays payment i, one change output", () => {
    const r = batch(THREE);
    expect(r.status, r.all).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out).toMatchObject({ ok: true, oneTransaction: true, batchSize: 3, successCount: 3, failCount: 0 });
    expect(typeof out.txId).toBe("string");
    expect(out.results.map((x: any) => [x.index, x.ok, x.txId, x.outputIndex, x.amountSompi])).toEqual([
      [0, true, out.txId, 0, "100000000"],
      [1, true, out.txId, 1, "200000000"],
      [2, true, out.txId, 2, "50000000"]
    ]);
    expect(stored(ws, "hardkas.txReceipt").map((a) => a.txId), "one receipt").toEqual([out.txId]);
    expect(stored(ws, "hardkas.txPlan").filter((p) => p.outputs.length === 3), "one plan with the three outputs").toHaveLength(1);
    // the simulator's ledger: the transaction created one UTXO per payment, then the change
    const ledger = JSON.parse(fs.readFileSync(path.join(ws, ".hardkas", "localnet.json"), "utf8"));
    const created = ledger.utxos.filter((u: any) => String(u.id).startsWith(`${out.txId}:`));
    expect(created.map((u: any) => [String(u.id).split(":").pop(), u.amountSompi]).slice(0, 3)).toEqual([
      ["0", "100000000"],
      ["1", "200000000"],
      ["2", "50000000"]
    ]);
    expect(created).toHaveLength(4);
  });

  it("the same file WITHOUT the flag is one transaction per payment, as before", () => {
    const r = batch(THREE, []);
    expect(r.status, r.all).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.oneTransaction).toBeUndefined();
    expect(out).toMatchObject({ ok: true, batchSize: 3, successCount: 3, failCount: 0 });
    expect(new Set(out.results.map((x: any) => x.txId)).size).toBe(3);
  });

  it("refused before anything is planned: several payers, a payment without an amount, an empty file", () => {
    const before = ["hardkas.txPlan", "hardkas.signedTx", "hardkas.txReceipt"].map((s) => stored(ws, s).length);
    const cases: Array<[unknown, string]> = [
      [[{ from: "alice", to: "bob", amount: "1" }, { from: "bob", to: "carol", amount: "1" }], "TX_BATCH_MULTIPLE_PAYERS"],
      [[{ from: "alice", to: "bob", amount: "1" }, { from: "alice", to: "carol" }], "TX_BATCH_PAYMENT_INVALID"],
      [{ payments: [] }, "TX_BATCH_EMPTY"]
    ];
    for (const [payments, code] of cases) {
      const r = batch(payments);
      expect(r.status, r.all).toBe(2);
      expect(JSON.parse(r.stdout).code, r.all).toBe(code);
      expect(JSON.parse(r.stdout).message, r.all).toMatch(/Nothing was planned, signed or sent/);
    }
    expect(["hardkas.txPlan", "hardkas.signedTx", "hardkas.txReceipt"].map((s) => stored(ws, s).length), "nothing planned, signed or executed").toEqual(before);
  });

  it("the same payer spelled two ways (its name and the address it resolves to) is one payer", () => {
    const r = batch([{ from: "alice", to: "bob", amount: "1" }, { from: "kaspa:sim_alice", to: "carol", amount: "1" }]);
    expect(r.status, r.all).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, oneTransaction: true, successCount: 2 });
  });

  it("an identity that resolves to another address is another payer, named in the refusal (the simulator's simnet address of alice too)", () => {
    const ledger = JSON.parse(fs.readFileSync(path.join(ws, ".hardkas", "localnet.json"), "utf8"));
    const simnetAlice = ledger.accounts.find((a: any) => a.name === "alice").address;
    const r = batch([{ from: "alice", to: "bob", amount: "1" }, { from: simnetAlice, to: "carol", amount: "1" }]);
    expect(r.status, r.all).toBe(2);
    const out = JSON.parse(r.stdout);
    expect(out.code).toBe("TX_BATCH_MULTIPLE_PAYERS");
    expect(out.message).toContain(simnetAlice);
  });

  it("TOO_MANY_OUTPUTS: 200 recipients do not fit in one standard transaction; the error says 193 do; nothing signed or executed", () => {
    const payments = Array.from({ length: 200 }, (_, i) => ({ from: "alice", to: i % 2 === 0 ? "bob" : "carol", amount: "0.5" }));
    const r = batch(payments);
    expect(r.status, r.all).toBe(1);
    const out = firstJson(r.stdout);
    expect(out).toMatchObject({ ok: false, oneTransaction: true, failedStep: "plan", code: "TOO_MANY_OUTPUTS", successCount: 0, failCount: 200 });
    expect(out.planError).toMatch(/has 200 recipient outputs, and at most 193 of them/);
    expect(stored(ws, "hardkas.signedTx")).toEqual([]);
    expect(stored(ws, "hardkas.txReceipt")).toEqual([]);
  });

  it("human output names the one transaction", () => {
    fs.writeFileSync(path.join(ws, "batch.json"), JSON.stringify(THREE));
    const r = cli(["tx", "batch", "--file", "batch.json", "--network", "simulated", "--one-transaction"], ws);
    expect(r.status, r.all).toBe(0);
    expect(r.stdout).toMatch(/Paying 3 payment\(s\) from alice in one transaction on simulated/);
    expect(r.stdout).toMatch(/✓ Success: transaction \S+ pays 3 recipient\(s\)/);
  });
});

describe("R4-T · tx batch --one-transaction on mainnet", () => {
  let decoy: Decoy;
  let ws: string;
  beforeAll(async () => {
    decoy = await startDecoy("mainnet");
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r4t-main-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    const config = {
      execution: { default: "main", targets: { main: { mode: "rpc", domain: "kaspa-l1", network: "mainnet" } } },
      network: { allowPublic: true },
      experimental: true,
      networks: { mainnet: { kind: "kaspa-rpc", network: "mainnet", rpcUrl: decoy.url, allowMainnet: true } }
    };
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config)};\n`);
  });
  afterAll(async () => {
    await decoy?.close();
    if (ws) fs.rmSync(ws, { recursive: true, force: true });
  });

  it("MAINNET_BROADCAST_DISABLED first: before the file is read, a payer resolved or a password read; the decoy sees nothing", async () => {
    fs.writeFileSync(path.join(ws, "batch.json"), JSON.stringify([{ from: "someone", to: "kaspa:qz7ulu4c25dh7fzec9zjyrmlhnkzrg4wmf89q7gzr3gfrsj3uz6xjellj43pf", amount: "1" }]));
    // asynchronously: the decoy lives in this process
    const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(process.execPath, [cliDist, "tx", "batch", "--file", "batch.json", "--network", "mainnet", "--one-transaction", "--password-stdin", "--json"], { cwd: ws, env: childEnv() });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.stdin.end();
      child.on("close", (status) => resolve({ status, stdout, stderr }));
    });
    expect(JSON.parse(r.stdout).code, `${r.stdout}\n${r.stderr}`).toBe("MAINNET_BROADCAST_DISABLED");
    expect(r.status).not.toBe(0);
    expect(decoy.connections).toBe(0);
    expect(decoy.methods).toEqual([]);
  });

  it("without --one-transaction too: MAINNET_BROADCAST_DISABLED before the file is read (so before any keystore is opened)", async () => {
    // the file does not exist: before the fix, a batch without the flag read it (and then opened an encrypted payer's
    // keystore) before its plan step refused mainnet, so this failed on the missing file instead
    const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(process.execPath, [cliDist, "tx", "batch", "--file", "no-such-batch.json", "--network", "mainnet", "--password-stdin", "--json"], { cwd: ws, env: childEnv() });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.stdin.end();
      child.on("close", (status) => resolve({ status, stdout, stderr }));
    });
    expect(JSON.parse(r.stdout).code, `${r.stdout}\n${r.stderr}`).toBe("MAINNET_BROADCAST_DISABLED");
    expect(r.status).not.toBe(0);
    expect(decoy.connections).toBe(0);
    expect(decoy.methods).toEqual([]);
  });
});

describe("R4-T · tx plan --to <recipient>=<kas> (simulator)", () => {
  let ws: string;
  beforeAll(async () => {
    ws = await freshSimulated("hk-r4t-plan-");
  });
  afterAll(() => {
    if (ws) fs.rmSync(ws, { recursive: true, force: true });
  });
  const plan = (args: string[], env: Record<string, string> = {}) => cli(["tx", "plan", "--network", "simulated", "--from", "alice", ...args, "--json"], ws, env);

  it("two pairs: one plan paying both, in order, plus the change", () => {
    const r = plan(["--to", "bob=1.5", "--to", "carol=2"]);
    expect(r.status, r.all).toBe(0);
    const p = JSON.parse(r.stdout);
    expect(p.outputs.map((o: any) => o.amountSompi)).toEqual(["150000000", "200000000"]);
    expect(p.amountSompi).toBe("150000000");
  });

  it("one pair is the plan of --to <r> --amount <kas>, byte for byte (frozen clock, two fresh workspaces)", async () => {
    const env = { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${freeze.replace(/\\/g, "/")}`.trim() };
    const a = await freshSimulated("hk-r4t-pair-");
    const b = await freshSimulated("hk-r4t-classic-");
    try {
      const pair = cli(["tx", "plan", "--network", "simulated", "--from", "alice", "--to", "bob=1.5", "--json"], a, env);
      const classic = cli(["tx", "plan", "--network", "simulated", "--from", "alice", "--to", "bob", "--amount", "1.5", "--json"], b, env);
      expect(pair.status, pair.all).toBe(0);
      expect(classic.status, classic.all).toBe(0);
      expect(JSON.parse(pair.stdout).contentHash).toBe(JSON.parse(classic.stdout).contentHash);
      expect(pair.stdout).toBe(classic.stdout);
    } finally {
      fs.rmSync(a, { recursive: true, force: true });
      fs.rmSync(b, { recursive: true, force: true });
    }
  });

  it("mixed or ambiguous forms: TX_PLAN_USAGE (exit 2), nothing planned", () => {
    for (const args of [
      ["--to", "bob", "--to", "carol"],
      ["--to", "bob=1", "--to", "carol"],
      ["--to", "bob=1", "--amount", "2"],
      ["--to", "bob=1=2"],
      ["--to", "=1"],
      ["--to", "bob="]
    ]) {
      const r = plan(args);
      expect(r.status, `${args.join(" ")}\n${r.all}`).toBe(2);
      expect(JSON.parse(r.stdout).code, r.all).toBe("TX_PLAN_USAGE");
    }
    const positional = cli(["tx", "plan", "alice", "bob", "--to", "carol=1", "--network", "simulated", "--json"], ws);
    expect(positional.status, positional.all).toBe(2);
    expect(JSON.parse(positional.stdout).code).toBe("TX_PLAN_USAGE");
  });

  it("human output lists every recipient", () => {
    const r = cli(["tx", "plan", "--network", "simulated", "--from", "alice", "--to", "bob=1", "--to", "carol=2"], ws);
    expect(r.status, r.all).toBe(0);
    expect(r.stdout).toMatch(/Recipients \(2, one transaction; To and Amount above are the first\):/);
    expect(r.stdout).toMatch(/1\. \S+\s+1 KAS/);
    expect(r.stdout).toMatch(/2\. \S+\s+2 KAS/);
  });

  it("txPlanRecipientsOf: a value that is also the name of a config account is ambiguous", () => {
    expect(() => txPlanRecipientsOf({ to: ["pay=1"], amount: undefined, positionalTo: undefined, configAccounts: { "pay=1": {} } })).toThrow(/both an account of hardkas.config.ts/);
    expect(txPlanRecipientsOf({ to: ["bob=1", "carol=2.5"], amount: undefined, positionalTo: undefined, configAccounts: { bob: {} } })).toEqual({
      kind: "several",
      outputs: [
        { to: "bob", amount: "1" },
        { to: "carol", amount: "2.5" }
      ]
    });
    expect(txPlanRecipientsOf({ to: ["bob"], amount: "3", positionalTo: undefined, configAccounts: undefined })).toEqual({ kind: "one", to: "bob" });
    expect(txPlanRecipientsOf({ to: undefined, amount: undefined, positionalTo: "bob", configAccounts: undefined })).toEqual({ kind: "one", to: undefined });
  });
});
