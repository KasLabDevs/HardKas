import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { runTxPlan } from "../src/runners/tx-plan-runner.js";

// Demo-ready · E02 — planning validity is UTXO-scoped, not virtual-state-scoped.
//   The DAG advancing while a plan is built (new DAA score, virtual parents, sink) does
//   not invalidate it. An attempt is valid when, at its end, every selected input is still
//   in the address UTXO set and the observed mempool of the same node shows no transaction
//   spending it; maturity is established on the initial snapshot. Otherwise the attempt is
//   retried and, when the bounded retries run out, planning fails with
//   SELECTED_UTXO_INVALIDATED. The before/after fingerprints are recorded as evidence only.
//   Absence from this node's mempool is not proof that nobody on the network is spending
//   an input; the race up to submitTransaction remains and stays fail-closed at the node.

const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const SPK = "20" + "00".repeat(32) + "ac";
const A = { transactionId: "a".repeat(64), index: 0 };
const B = { transactionId: "b".repeat(64), index: 1 };
const key = (o: { transactionId: string; index: number }) => `${o.transactionId}:${o.index}`;

const UTXOS = [
  { outpoint: A, address: FROM, amountSompi: 1_000_000_000n, scriptPublicKey: SPK, blockDaaScore: 1000n, isCoinbase: false },
  { outpoint: B, address: FROM, amountSompi: 500_000_000n, scriptPublicKey: SPK, blockDaaScore: 1200n, isCoinbase: false }
];

/**
 * The node the CLI reads, scripted. Every attempt reads the UTXO set twice (selection,
 * then re-validation) and the mempool twice (before selection, after planning).
 */
const node = {
  utxos: UTXOS.map((u) => ({ ...u })),
  daa: 1_000_000n,
  /** Blocks keep arriving: every RPC call sees a newer virtual state. */
  advancing: false,
  dagReads: 0,
  utxoReads: 0,
  mempoolReads: 0,
  /** Outpoints missing from every re-validation read (and present in every selection read). */
  hiddenOnRevalidation: new Set<string>(),
  /** An outpoint that gets spent (and accepted) right when the first re-validation reads the node. */
  spentAtFirstRevalidation: null as string | null,
  /** Outpoints the mempool shows as being spent only in the observations taken after planning. */
  pendingOnlyAfterPlanning: new Set<string>(),
  /** An outpoint that enters the mempool (being spent) at the first after-planning observation, and stays. */
  pendingFromFirstAfter: null as string | null,
  pendingNow: new Set<string>()
};

function resetNode() {
  node.utxos = UTXOS.map((u) => ({ ...u }));
  node.daa = 1_000_000n;
  node.advancing = false;
  node.dagReads = node.utxoReads = node.mempoolReads = 0;
  node.hiddenOnRevalidation = new Set();
  node.spentAtFirstRevalidation = null;
  node.pendingOnlyAfterPlanning = new Set();
  node.pendingFromFirstAfter = null;
  node.pendingNow = new Set();
}

function tick() {
  if (node.advancing) node.daa += 1n;
}

const sendingTx = (outpointKey: string) => {
  const [transactionId, index] = outpointKey.split(":");
  return { fee: "1000", isOrphan: false, transaction: { inputs: [{ previousOutpoint: { transactionId, index: Number(index) } }], outputs: [] } };
};

vi.mock("@hardkas/kaspa-rpc", async () => {
  const actual: any = await vi.importActual("@hardkas/kaspa-rpc");
  class ScriptedClient {
    async getBlockDagInfo() {
      tick();
      node.dagReads += 1;
      return { networkId: "simnet", virtualDaaScore: node.daa, virtualParentHashes: [`p${node.daa}`], sink: `s${node.daa}`, tipHashes: [`s${node.daa}`] };
    }
    async getUtxosByAddress() {
      tick();
      node.utxoReads += 1;
      const revalidation = node.utxoReads % 2 === 0;
      if (revalidation && node.spentAtFirstRevalidation) {
        const spent = node.spentAtFirstRevalidation;
        node.utxos = node.utxos.filter((u) => key(u.outpoint) !== spent);
        node.spentAtFirstRevalidation = null;
      }
      return node.utxos
        .filter((u) => !(revalidation && node.hiddenOnRevalidation.has(key(u.outpoint))))
        .map((u) => ({ ...u }));
    }
    async getMempoolEntriesByAddresses() {
      tick();
      node.mempoolReads += 1;
      const afterPlanning = node.mempoolReads % 2 === 0;
      if (afterPlanning && node.pendingFromFirstAfter) {
        node.pendingNow.add(node.pendingFromFirstAfter);
        node.pendingFromFirstAfter = null;
      }
      const pending = new Set([...node.pendingNow, ...(afterPlanning ? node.pendingOnlyAfterPlanning : [])]);
      return { entries: [{ address: FROM, sending: [...pending].map(sendingTx), receiving: [] }] };
    }
    async close() {}
  }
  return { ...actual, JsonWrpcKaspaClient: ScriptedClient };
});

const inputKeys = (artifact: any) => artifact.inputs.map((i: any) => key(i.outpoint));

async function errorOf(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected planning to fail");
}

describe("Demo-ready · E02 · planning on a live DAG is UTXO-scoped", () => {
  const originalCwd = process.cwd();
  let ws: string;
  let config: any;
  const plan = () =>
    runTxPlan({ from: FROM, to: TO, amount: "3", networkId: "simnet", provider: "auto", url: "ws://127.0.0.1:1", feeRate: "1000", config, workspaceRoot: ws });

  beforeAll(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-demo-ready-e02-"));
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

  it("A · the DAG advances several times while one plan is built; inputs intact, mempool clean ⇒ the plan is valid", async () => {
    resetNode();
    node.advancing = true;
    const artifact: any = await plan();
    expect(artifact.plannerAuthority).toBe("KASPA_WASM_GENERATOR");
    // Which of the two the upstream Generator selects is its business; that it plans is ours.
    const selected = inputKeys(artifact);
    expect(selected.length).toBeGreaterThan(0);
    for (const k of selected) expect([key(A), key(B)]).toContain(k);
    const w = artifact.metadata.planningWindow;
    expect(w).toMatchObject({ validity: "utxo-scoped", attempts: 1 });
    // One attempt spans several node reads, each on a newer virtual state.
    expect(BigInt(w.after.virtualDaaScore) - BigInt(w.before.virtualDaaScore)).toBeGreaterThanOrEqual(3n);
    expect(w.after.virtualStateFingerprint).not.toBe(w.before.virtualStateFingerprint);
    expect(w.revalidation).toEqual({ scope: "observer-local", selectedInputs: selected.length, presentInUtxoSet: selected.length, pendingInObservedMempool: 0 });
    expect(artifact.metadata.pendingSpendEvidence).toMatchObject({ scope: "observer-local", excludedOutpoints: [] });
  });

  it("control · no block arrives while planning ⇒ one attempt, identical fingerprints, same evidence shape", async () => {
    resetNode();
    const artifact: any = await plan();
    const w = artifact.metadata.planningWindow;
    expect(w).toMatchObject({ validity: "utxo-scoped", attempts: 1 });
    expect(w.after.virtualStateFingerprint).toBe(w.before.virtualStateFingerprint);
  });

  it("B · a selected input missing when the node is re-read is never planned: bounded retries, then SELECTED_UTXO_INVALIDATED", async () => {
    resetNode();
    node.advancing = true;
    node.hiddenOnRevalidation = new Set([key(A), key(B)]);
    const err = await errorOf(plan());
    expect(err.code).toBe("SELECTED_UTXO_INVALIDATED");
    expect(err.attempts).toBe(3);
    expect(err.missing.length).toBeGreaterThan(0);
    expect(node.utxoReads).toBe(6); // 3 attempts × (selection read + re-validation read)
    expect(String(err.message)).not.toMatch(/UTXO_VIRTUAL_STATE_UNSTABLE/);
  });

  it("B · an input spent between selection and re-validation makes the attempt retry; the retry plans on what is still unspent", async () => {
    resetNode();
    node.advancing = true;
    node.spentAtFirstRevalidation = key(A);
    const artifact: any = await plan();
    expect(inputKeys(artifact)).toEqual([key(B)]);
    expect(artifact.metadata.planningWindow.attempts).toBe(2);
  });

  it("C · a selected input the observed mempool shows being spent after planning is never planned: retries, then SELECTED_UTXO_INVALIDATED", async () => {
    resetNode();
    node.advancing = true;
    node.pendingOnlyAfterPlanning = new Set([key(A), key(B)]);
    const err = await errorOf(plan());
    expect(err.code).toBe("SELECTED_UTXO_INVALIDATED");
    expect(err.pending.length).toBeGreaterThan(0);
    // The error scopes what it saw to this node's mempool; it promises nothing about the network.
    expect(String(err.message)).toMatch(/observed mempool/);
    expect(String(err.message).toLowerCase()).not.toMatch(/no competing|guarantee|network-wide|consensus/);
  });

  it("C · once the observed mempool shows the input being spent, the retry excludes it through the pending-spend evidence", async () => {
    resetNode();
    node.advancing = true;
    node.pendingFromFirstAfter = key(A);
    const artifact: any = await plan();
    expect(inputKeys(artifact)).toEqual([key(B)]);
    expect(artifact.metadata.pendingSpendEvidence.excludedOutpoints).toEqual([key(A)]);
    expect(artifact.metadata.planningWindow.attempts).toBe(2);
  });
});
