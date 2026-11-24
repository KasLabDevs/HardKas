import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

// -----------------------------------------------------------------------------
// BETA-FIX W2 · task 5 — `hardkas silver test --on-node` funds ALL its reproducible cases in ONE transaction (one output
// per case to the contract's P2SH, each case's coin = (fundingTxId, its output index)), through the SDK's multi-output
// payment (`sdk.tx.plan({ outputs })`). It planned one funding per case right after the previous broadcast and never
// excluded what that broadcast had spent: on Testnet-10 (21-nov) the funder had ONE UTXO, case 1's funding was accepted,
// case 2's was planned from a node listing that still showed the input case 1 had just spent (the UTXO index lags the
// mempool) and was refused (COVENANT_UTXO_UNVERIFIED), stopping the run. On simnet the miner fixture's thousands of
// coinbase UTXOs hid it.
// In process, hermetic: the runner with the real compile record, test planning, v0 spend building and records; the
// node and the SDK's send machinery are fakes whose listing keeps showing the funder's one UTXO after it is spent.
// -----------------------------------------------------------------------------

vi.mock("../src/runners/silver-onchain-runner.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, openSilverSdk: vi.fn(async () => (globalThis as any).__w2FakeSilverSdk) };
});

const { runSilverTestOnNode } = await import("../src/runners/silver-test-node-runner.js");
const { silverOnChainKit } = await import("../src/commands/silver.js");

vi.setConfig({ testTimeout: 120_000 });

const FIXTURES = path.join(__dirname, "fixtures", "silver-keys-1");
const RECORD = path.join(FIXTURES, "vault-compile-record.json");
const CTOR = path.join(FIXTURES, "vault-ctor.args.json");
const KEY = "11".repeat(32);
const P2PK = `20${"11".repeat(32)}ac`;
const made: string[] = [];
let ws = "";
let ALICE = "";
let cwd = "";

beforeAll(async () => {
  const core: any = await import("@hardkas/core");
  const k = core.loadManagedKaspaWasmSync();
  ALICE = String(new k.PrivateKey(KEY).toPublicKey().toAddress("simnet").toString());
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w2-silver-fund-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(
    path.join(ws, "hardkas.config.ts"),
    `export default ${JSON.stringify({
      defaultNetwork: "simnet",
      execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
      networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:9" } }
    })};\n`
  );
  const tx = (utxo: number, out: number) => ({ version: 0, inputs: [{ utxo_value: utxo, sig_op_count: 1 }], outputs: [{ value: out, script_hex: P2PK }] });
  fs.writeFileSync(
    path.join(ws, "cases.test.json"),
    JSON.stringify({
      tests: [
        { name: "release-1", function: "release", args: [{ signature: "alice" }], expect: "pass", tx: tx(1_000_000_000, 999_000_000) },
        { name: "release-2", function: "release", args: [{ signature: "alice" }], expect: "pass", tx: tx(2_000_000_000, 1_999_000_000) }
      ]
    })
  );
  cwd = process.cwd();
  process.chdir(ws);
});
afterAll(() => {
  process.chdir(cwd);
  for (const p of made) fs.rmSync(p, { recursive: true, force: true });
});

/** The funder holds ONE UTXO; the node's listing keeps showing it after a transaction spent it (its index lags). */
function fakes() {
  const FUNDER_UTXO = { outpoint: { transactionId: "38".repeat(32), index: 1 }, amountSompi: 824_000_000_000n, address: ALICE };
  const spent = new Set<string>();
  const calls = { plan: [] as any[], fundingSends: 0, spendSends: 0 };
  let n = 0;
  const key = (o: { transactionId: string; index: number }) => `${o.transactionId}:${o.index}`;
  const sdk: any = {
    execution: { mode: "rpc", domain: "kaspa-l1", network: "simnet" },
    workspace: { root: ws },
    artifacts: { write: async (a: any) => ({ artifact: a }) },
    close: async () => {},
    tx: {
      plan: async (options: any) => {
        calls.plan.push(options);
        const outputs = (options.outputs ?? [{ to: options.to, amount: options.amount }]).map((o: any) => ({ address: String(o.to), amountSompi: BigInt(o.amount) }));
        const paid = outputs.reduce((s: bigint, o: any) => s + o.amountSompi, 0n);
        return {
          planId: `plan-${++n}`,
          networkId: "simnet",
          inputs: [{ ...FUNDER_UTXO }],
          outputs: [...outputs, { address: ALICE, amountSompi: FUNDER_UTXO.amountSompi - paid - 5_000n }],
          estimatedFeeSompi: 5_000n
        };
      },
      sign: async (plan: any) => {
        if (!plan.planId) return plan;
        // the send machinery's input check, as on Testnet-10: an input a transaction already spent is not listed unspent
        for (const i of plan.inputs) {
          if (spent.has(key(i.outpoint))) {
            throw Object.assign(new Error(`COVENANT_UTXO_UNVERIFIED: the node does not list 1 of this plan's inputs as unspent (${key(i.outpoint)}). Nothing was signed or sent.`), {
              code: "COVENANT_UTXO_UNVERIFIED"
            });
          }
        }
        return { funding: true, txId: createHash("sha256").update(plan.planId).digest("hex"), inputs: plan.inputs };
      },
      send: async (signed: any) => {
        if (signed.funding) {
          calls.fundingSends++;
          for (const i of signed.inputs) spent.add(key(i.outpoint));
          return { submitted: true, txId: signed.txId };
        }
        calls.spendSends++;
        return { submitted: true, txId: String(signed.txId).toLowerCase() };
      }
    }
  };
  const rpc: any = {
    getUtxosByAddress: async () => [],
    getBlockDagInfo: async () => ({ virtualDaaScore: "1000" }),
    close: async () => {}
  };
  return { sdk, rpc, calls };
}

describe("BETA-FIX W2 · silver test --on-node funds every case in one transaction", () => {
  it("one funding transaction, one output per case at the contract's P2SH; each case spends its own (fundingTxId, index); both PASS", async () => {
    const { sdk, rpc, calls } = fakes();
    (globalThis as any).__w2FakeSilverSdk = sdk;
    const waited: Array<{ transactionId: string; index: number }> = [];
    let lockingScript: any;
    const kit: any = {
      ...silverOnChainKit,
      silverTarget: async () => ({ network: "simnet", rpcUrl: "ws://127.0.0.1:9", managed: false }),
      assertCanonicalWorkspace: async () => ws,
      keySource: () => ({ interactive: false }),
      accountKey: async () => ({ privateKey: KEY, address: ALICE }),
      silverNode: async () => ({ identity: { kind: "rusty-kaspad", serverVersion: "2.1.0" }, rpc }),
      waitForUtxo: async (_rpc: any, _address: string, outpoint: { transactionId: string; index: number }) => {
        waited.push(outpoint);
        const funding = calls.plan[calls.plan.length - 1];
        const values = (funding.outputs ?? [{ amount: funding.amount }]).map((o: any) => BigInt(o.amount));
        return { outpoint, amountSompi: values[outpoint.index] ?? values[0], scriptPublicKey: lockingScript, blockDaaScore: 10n, isCoinbase: false };
      },
      nodeRecordOf: () => ({ kind: "rusty-kaspad", serverVersion: "2.1.0" })
    };
    // the contract's locking script, as the runner plans it
    {
      const core: any = await import("@hardkas/core");
      const record = JSON.parse(fs.readFileSync(RECORD, "utf8"));
      const artifact = core.parseSilAbiArtifact(JSON.parse(record.artifactJson));
      lockingScript = core.planSilverNodeTests({ artifact, tests: JSON.parse(fs.readFileSync(path.join(ws, "cases.test.json"), "utf8")), networkId: "simnet" }).lockingScript;
    }
    const out = path.join(ws, "node-test-record.json");
    await runSilverTestOnNode(RECORD, { tests: "cases.test.json", args: CTOR, onNode: true, from: "alice", json: true, out, timeout: "5" }, kit);

    // ONE funding plan: the SDK's multi-output payment, one output per case in case order
    expect(calls.plan).toHaveLength(1);
    expect(calls.plan[0].outputs?.map((o: any) => BigInt(o.amount))).toEqual([1_000_000_000n, 2_000_000_000n]);
    expect(calls.fundingSends).toBe(1);
    expect(calls.spendSends).toBe(2);
    const record = JSON.parse(fs.readFileSync(out, "utf8"));
    const fundingTxId = record.results[0].coin.fundingTxId;
    expect(record.results.map((r: any) => [r.name, r.outcome, r.coin.fundingTxId, r.coin.outpoint.index, r.coin.valueSompi])).toEqual([
      ["release-1", "PASS", fundingTxId, 0, "1000000000"],
      ["release-2", "PASS", fundingTxId, 1, "2000000000"]
    ]);
    expect(waited).toEqual([
      { transactionId: fundingTxId, index: 0 },
      { transactionId: fundingTxId, index: 1 }
    ]);
    expect(record.status).toBe("PASS");
  });

  // BETA-FIX (TN10 rehearsal, 21-nov): 0.5 + 0.2 + 0.2 + 0.5 TKAS in one transaction exceeded the standard storage mass
  // (OUTPUT_BELOW_STANDARD_AMOUNT) where each coin alone fits. The cases are then funded in smaller groups, each planned
  // only once the node lists the previous group's funding — so the race of the first fix cannot come back.
  it("too much storage mass for one transaction: funded in groups, each planned after the node lists the previous funding", async () => {
    let current = { outpoint: { transactionId: "38".repeat(32), index: 1 }, amountSompi: 824_000_000_000n, address: ALICE };
    let pendingChange: typeof current | undefined;
    const spent = new Set<string>();
    const key = (o: { transactionId: string; index: number }) => `${o.transactionId}:${o.index}`;
    const calls = { plan: [] as any[], fundingSends: 0, spendSends: 0, waits: [] as string[] };
    const fundedValues = new Map<string, bigint[]>();
    let n = 0;
    const sdk: any = {
      execution: { mode: "rpc", domain: "kaspa-l1", network: "simnet" },
      workspace: { root: ws },
      artifacts: { write: async (a: any) => ({ artifact: a }) },
      close: async () => {},
      tx: {
        plan: async (options: any) => {
          calls.plan.push(options);
          const outputs = options.outputs.map((o: any) => ({ address: String(o.to), amountSompi: BigInt(o.amount) }));
          if (outputs.length > 1) {
            throw Object.assign(new Error("OUTPUT_BELOW_STANDARD_AMOUNT: the 2 payment outputs are too small together for a standard transaction (Generator: Storage mass exceeds maximum)"), { code: "OUTPUT_BELOW_STANDARD_AMOUNT" });
          }
          const paid = outputs.reduce((s: bigint, o: any) => s + o.amountSompi, 0n);
          return { planId: `plan-${++n}`, networkId: "simnet", inputs: [{ ...current }], outputs: [...outputs, { address: ALICE, amountSompi: current.amountSompi - paid - 5_000n }], estimatedFeeSompi: 5_000n };
        },
        sign: async (plan: any) => {
          if (!plan.planId) return plan;
          for (const i of plan.inputs) {
            if (spent.has(key(i.outpoint))) throw Object.assign(new Error(`COVENANT_UTXO_UNVERIFIED: ${key(i.outpoint)} is not listed unspent`), { code: "COVENANT_UTXO_UNVERIFIED" });
          }
          const txId = createHash("sha256").update(plan.planId).digest("hex");
          return { funding: true, txId, inputs: plan.inputs, outputs: plan.outputs };
        },
        send: async (signed: any) => {
          if (signed.funding) {
            calls.fundingSends++;
            for (const i of signed.inputs) spent.add(key(i.outpoint));
            const change = signed.outputs[signed.outputs.length - 1];
            pendingChange = { outpoint: { transactionId: signed.txId, index: signed.outputs.length - 1 }, amountSompi: change.amountSompi, address: ALICE };
            fundedValues.set(signed.txId, signed.outputs.slice(0, -1).map((o: any) => o.amountSompi));
            return { submitted: true, txId: signed.txId };
          }
          calls.spendSends++;
          return { submitted: true, txId: String(signed.txId).toLowerCase() };
        }
      }
    };
    (globalThis as any).__w2FakeSilverSdk = sdk;
    const rpc: any = { getUtxosByAddress: async () => [], getBlockDagInfo: async () => ({ virtualDaaScore: "1000" }), close: async () => {} };
    let lockingScript: any;
    {
      const core: any = await import("@hardkas/core");
      const record = JSON.parse(fs.readFileSync(RECORD, "utf8"));
      const artifact = core.parseSilAbiArtifact(JSON.parse(record.artifactJson));
      lockingScript = core.planSilverNodeTests({ artifact, tests: JSON.parse(fs.readFileSync(path.join(ws, "cases.test.json"), "utf8")), networkId: "simnet" }).lockingScript;
    }
    const kit: any = {
      ...silverOnChainKit,
      silverTarget: async () => ({ network: "simnet", rpcUrl: "ws://127.0.0.1:9", managed: false }),
      assertCanonicalWorkspace: async () => ws,
      keySource: () => ({ interactive: false }),
      accountKey: async () => ({ privateKey: KEY, address: ALICE }),
      silverNode: async () => ({ identity: { kind: "rusty-kaspad", serverVersion: "2.1.0" }, rpc }),
      // the node's UTXO index catches up when a funding is waited for: its input gone, its change listed
      waitForUtxo: async (_rpc: any, _address: string, outpoint: { transactionId: string; index: number }) => {
        calls.waits.push(key(outpoint));
        if (pendingChange && pendingChange.outpoint.transactionId === outpoint.transactionId) {
          current = pendingChange;
          pendingChange = undefined;
        }
        return { outpoint, amountSompi: fundedValues.get(outpoint.transactionId)?.[outpoint.index] ?? 0n, scriptPublicKey: lockingScript, blockDaaScore: 10n, isCoinbase: false };
      },
      nodeRecordOf: () => ({ kind: "rusty-kaspad", serverVersion: "2.1.0" })
    };
    const out = path.join(ws, "node-test-record-groups.json");
    await runSilverTestOnNode(RECORD, { tests: "cases.test.json", args: CTOR, onNode: true, from: "alice", json: true, out, timeout: "5" }, kit);

    // the whole set refused for its mass, then one group per case; the second planned only after the first was listed
    expect(calls.plan.map((p) => p.outputs.length)).toEqual([2, 1, 1]);
    expect(calls.fundingSends).toBe(2);
    expect(calls.spendSends).toBe(2);
    const record = JSON.parse(fs.readFileSync(out, "utf8"));
    const [a, b] = record.results;
    expect(a.coin.fundingTxId).not.toBe(b.coin.fundingTxId);
    expect([a.coin.outpoint.index, b.coin.outpoint.index]).toEqual([0, 0]);
    expect(calls.waits[0]).toBe(`${a.coin.fundingTxId}:0`);
    expect(record.results.map((r: any) => r.outcome)).toEqual(["PASS", "PASS"]);
  });
});
