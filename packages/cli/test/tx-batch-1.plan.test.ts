import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { runTxPlan } from "../src/runners/tx-plan-runner.js";

// TX-BATCH-1 (2026-10-21) · the planner side of the `tx batch` fix, on a scripted node (no network).
//   An accepted transaction leaves the node's mempool before its UTXO index drops the inputs; a later payment of the
//   same batch must never select them. `spentOutpoints` (outpoint → owner address) are excluded; a payment that cannot
//   be funded while the index still lists any of them waits for the index (bounded) and reads again; without them, or
//   once the index lists none, a planning failure is reported as before.

const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const SPK = "20" + "00".repeat(32) + "ac";
const op = (c: string, index = 0) => ({ transactionId: c.repeat(64), index });
const key = (o: { transactionId: string; index: number }) => `${o.transactionId}:${o.index}`;
const utxo = (address: string, outpoint: { transactionId: string; index: number }, kas: number) => ({
  outpoint,
  address,
  amountSompi: BigInt(kas) * 100_000_000n,
  scriptPublicKey: SPK,
  blockDaaScore: 1000n,
  isCoinbase: false
});

const node = {
  /** What the node's UTXO index lists, per address. */
  utxos: new Map<string, ReturnType<typeof utxo>[]>(),
  virtualDaaScore: 1_000_000n,
  /** getUtxosByAddress calls, per address. */
  reads: new Map<string, number>(),
  /** Runs after every getUtxosByAddress (the index catching up, in a test's own time). */
  afterRead: undefined as undefined | ((address: string, reads: number) => void)
};

vi.mock("@hardkas/kaspa-rpc", async () => {
  const actual: any = await vi.importActual("@hardkas/kaspa-rpc");
  class ScriptedClient {
    async getBlockDagInfo() {
      return { networkId: "simnet", virtualDaaScore: node.virtualDaaScore, virtualParentHashes: ["p"], sink: "s", tipHashes: ["s"] };
    }
    async getUtxosByAddress(address: string) {
      const listed = (node.utxos.get(address) ?? []).map((u) => ({ ...u }));
      const n = (node.reads.get(address) ?? 0) + 1;
      node.reads.set(address, n);
      node.afterRead?.(address, n);
      return listed;
    }
    async getMempoolEntriesByAddresses() {
      return { entries: [] };
    }
    async close() {}
  }
  return { ...actual, JsonWrpcKaspaClient: ScriptedClient };
});

const outcome = async (p: Promise<any>): Promise<{ code: string; message: string; plan?: any }> => {
  try {
    const plan = await p;
    return { code: "OK", message: "", plan };
  } catch (e: any) {
    return { code: e?.code ?? "UNTYPED", message: String(e?.message ?? e) };
  }
};

describe("TX-BATCH-1 · the planner never selects what earlier payments of the batch spent", () => {
  const originalCwd = process.cwd();
  let ws: string;
  let config: any;
  const plan = (extra: Record<string, unknown> = {}, amount = "3") =>
    runTxPlan({ from: FROM, to: TO, amount, networkId: "simnet", provider: "auto", url: "ws://127.0.0.1:1", feeRate: "1000", config, workspaceRoot: ws, ...extra } as any);
  const reset = (entries: Array<[string, ReturnType<typeof utxo>[]]>) => {
    node.utxos = new Map(entries);
    node.reads = new Map();
    node.afterRead = undefined;
  };

  beforeAll(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tb1-plan-"));
    fs.writeFileSync(
      path.join(ws, "hardkas.config.js"),
      `export default {
        defaultNetwork: "simulated",
        networks: {
          simulated: { kind: "simulated" },
          simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" }
        }
      };`
    );
    process.chdir(ws);
    const { loadHardkasConfig } = await import("@hardkas/config");
    ({ config } = await loadHardkasConfig({ workspaceRoot: ws }));
  });

  afterAll(() => {
    process.chdir(originalCwd);
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("an outpoint an earlier payment spent is never selected while the index still lists it, and the plan does not wait when other funds exist", async () => {
    const A = op("a");
    const B = op("b");
    reset([[FROM, [utxo(FROM, A, 10), utxo(FROM, B, 10)]]]);
    const r = await outcome(plan({ spentOutpoints: new Map([[key(A), FROM]]) }));
    expect(r.code, r.message).toBe("OK");
    expect(r.plan.inputs.map((i: any) => key(i.outpoint))).toEqual([key(B)]);
    // an ordinary plan: one read and one re-validation, nothing polled
    expect(node.reads.get(FROM)).toBe(2);
    expect(r.plan.metadata.utxoSelection.warnings.join(" ")).toMatch(/1 outpoint\(s\) excluded/);
  });

  it("only spent outpoints are listed: it waits until the index releases them, then plans on the change it shows", async () => {
    const A = op("a");
    const CHANGE = op("c", 1);
    reset([[FROM, [utxo(FROM, A, 10)]]]);
    // the index catches up on the 4th look: A is gone, the change of the transaction that spent it is listed
    node.afterRead = (address, n) => {
      if (address === FROM && n === 4) node.utxos.set(FROM, [utxo(FROM, CHANGE, 9)]);
    };
    const t0 = Date.now();
    const r = await outcome(plan({ spentOutpoints: new Map([[key(A), FROM]]) }));
    expect(r.code, r.message).toBe("OK");
    expect(r.plan.inputs.map((i: any) => key(i.outpoint))).toEqual([key(CHANGE)]);
    expect(node.reads.get(FROM)!, "it looked again until the index changed").toBeGreaterThan(3);
    expect(Date.now() - t0).toBeLessThan(30_000);
  });

  it("the index never releases them: SPENT_OUTPOINTS_NOT_RELEASED once the wait runs out, and no plan", async () => {
    const A = op("a");
    reset([[FROM, [utxo(FROM, A, 10)]]]);
    const t0 = Date.now();
    const r = await outcome(plan({ spentOutpoints: new Map([[key(A), FROM]]), spentReleaseTimeoutMs: 1500 }));
    const waited = Date.now() - t0;
    expect(r.code, r.message).toBe("SPENT_OUTPOINTS_NOT_RELEASED");
    expect(r.message).toMatch(/1 outpoint\(s\) spent by earlier payments of this run are still listed by the node/);
    expect(r.message).toMatch(/No plan was made/);
    expect(waited).toBeGreaterThanOrEqual(1500);
    expect(waited).toBeLessThan(15_000);
  });

  it("the index no longer lists them and the payment is short of funds: the planner's refusal at once, no wait", async () => {
    const A = op("a");
    const SMALL = op("d");
    reset([[FROM, [utxo(FROM, SMALL, 1)]]]);
    const t0 = Date.now();
    const r = await outcome(plan({ spentOutpoints: new Map([[key(A), FROM]]) }));
    expect(r.code, r.message).not.toBe("OK");
    expect(r.code).not.toBe("SPENT_OUTPOINTS_NOT_RELEASED");
    expect(r.message).toMatch(/Insufficient funds/i);
    expect(Date.now() - t0).toBeLessThan(5_000);
  });

  it("without spentOutpoints nothing changes: an empty address is NO_SPENDABLE_UTXOS at once", async () => {
    reset([]);
    const t0 = Date.now();
    const r = await outcome(plan());
    expect(r.code, r.message).toBe("NO_SPENDABLE_UTXOS");
    expect(node.reads.get(FROM)).toBe(1);
    expect(Date.now() - t0).toBeLessThan(5_000);
  });

  it("a payer funded by an earlier payment of the batch (another address): it waits for the index to show that payment, then plans", async () => {
    const PAYROLL_IN = op("e");
    const RECEIVED = op("f");
    // the earlier payment spent PAYROLL_IN (owned by TO) and pays FROM; the index shows neither yet
    reset([[TO, [utxo(TO, PAYROLL_IN, 10)]]]);
    node.afterRead = (address, n) => {
      if (address === TO && n === 3) {
        node.utxos.set(TO, []);
        node.utxos.set(FROM, [utxo(FROM, RECEIVED, 5)]);
      }
    };
    const r = await outcome(plan({ spentOutpoints: new Map([[key(PAYROLL_IN), TO]]) }, "1"));
    expect(r.code, r.message).toBe("OK");
    expect(r.plan.inputs.map((i: any) => key(i.outpoint))).toEqual([key(RECEIVED)]);
  });
});
