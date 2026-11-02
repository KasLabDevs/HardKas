import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MockKaspaRpcClient, RpcError, RpcTimeoutError, markRequestNotSent, officialTxIdOf } from "@hardkas/kaspa-rpc";
import "../src/setup.js";
import { createCovenantTestbed, type CompiledCovenantContract } from "../src/index.js";

// -----------------------------------------------------------------------------
// R-01 · the testbed's CONSENSUS_SIMNET level never reports a pass from a submission alone. Stand-in nodes play every
// answer a node or a broken endpoint can give; only an answer naming the expected txid, followed by an observed
// inclusion (every output listed under that txid, the spent input gone), is CONSENSUS_SIMNET_PASS. A node rejection is
// CONSENSUS_SIMNET_FAIL; an ambiguous answer, a timeout or an acceptance without observed inclusion is
// CONSENSUS_SIMNET_INCONCLUSIVE; a request that never reached the node is BLOCKED. Only a pass moves the testbed's
// ledger. Silverc level: compiling OwnedCounter needs the pinned silverc; no SilverScript runner, no Docker, no node.
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const ownedCounterSource = fs.readFileSync(path.join(repoRoot, "examples", "09-silver-reference", "contracts", "owned-counter.sil"), "utf8");
const BACKENDS = ["SYNTHETIC", "CONSENSUS_SIMNET"] as const;
// a short observation window: the stand-ins answer at once
const OBSERVATION = { attempts: 3, intervalMs: 1 };

type Submitted = { tx: any; txId: string };

/** A stand-in node: `answer` decides what submitTransaction returns or throws; `ledger` what getUtxosByAddress lists. */
function standIn(opts: { answer: (s: Submitted) => unknown; ledger?: (s: Submitted | undefined, address: string) => any[]; mine?: boolean }) {
  let last: Submitted | undefined;
  const calls: string[] = [];
  return {
    calls,
    rpc: {
      async submitTransaction(tx: any) {
        last = { tx, txId: officialTxIdOf(tx) };
        calls.push("submitTransaction");
        const a = opts.answer(last);
        if (a instanceof Error) throw a;
        return a as any;
      },
      async getUtxosByAddress(address: string) {
        calls.push("getUtxosByAddress");
        return opts.ledger ? opts.ledger(last, address) : [];
      },
      ...(opts.mine ? { mineBlocks: async (n: number) => void calls.push(`mineBlocks(${n})`) } : {})
    }
  };
}

/** The submitted transaction's output 0, as a node's UTXO index lists it once the transaction is accepted. */
function successorEntry(s: Submitted, address: string, override: { covenantId?: string } = {}) {
  const out = s.tx.outputs[0];
  const covenantId = override.covenantId ?? out.covenant?.covenantId ?? out.covenant?.covenant_id;
  return {
    outpoint: { transactionId: s.txId, index: 0 },
    address,
    amountSompi: BigInt(out.value ?? out.amount),
    ...(covenantId ? { covenantId: String(covenantId) } : {})
  };
}

const nodeRejection = (s: Submitted) =>
  `Rejected transaction ${s.txId}: failed to verify the signature script: script ran, but verification failed`;

describe("R-01 · CONSENSUS_SIMNET requires an observed inclusion, never a submission alone", () => {
  let contract: CompiledCovenantContract;
  beforeAll(async () => {
    const probe = createCovenantTestbed();
    contract = await probe.compileContract({
      source: ownedCounterSource,
      sourceFile: "owned-counter.sil",
      constructorArgs: [`0x${probe.getAccount("owner").xOnlyPublicKey}`, 10n]
    });
  });

  async function attempt(rpc: any) {
    const bed = createCovenantTestbed({ simnetRpc: rpc, consensusObservation: OBSERVATION } as any);
    const genesis = await bed.deployGenesis({ contract, initialState: { value: 10n }, amountSompi: 1_000_000_000n });
    const res = await bed.executeTransition({
      contract,
      utxo: genesis.utxo,
      entrypoint: "bump",
      args: [{ kind: "int", value: 5n }, { kind: "signer", signer: "owner" }],
      nextStates: [{ state: { value: 15n } }],
      backends: [...BACKENDS]
    });
    return { res: res as any, bed, genesis };
  }

  it("C1 answer accepted:false with the node's rejection text: CONSENSUS_SIMNET_FAIL, never PASS", async () => {
    const node = standIn({ answer: (s) => ({ accepted: false, error: nodeRejection(s) }), mine: true });
    const { res } = await attempt(node.rpc);
    expect(res.passed).toBe(false);
    expect(res.status).toBe("CONSENSUS_SIMNET_FAIL");
    expect(res.simnetConfirmed).not.toBe(true);
    expect(res.consensus?.outcome).toBe("REJECTED");
    expect(res.consensus?.stagesReached).toEqual(["BUILT", "SENT"]);
  });

  it("C2 the answer names another transaction and nothing is mined: INCONCLUSIVE (txid mismatch), never PASS", async () => {
    const node = standIn({ answer: () => ({ transactionId: "f".repeat(64) }) });
    const { res } = await attempt(node.rpc);
    expect(res.passed).toBe(false);
    expect(res.status).toBe("CONSENSUS_SIMNET_INCONCLUSIVE");
    expect(res.simnetConfirmed).not.toBe(true);
    expect(res.consensus?.outcome).toBe("UNKNOWN");
    expect(res.consensus?.detail).toMatch(/^TXID_MISMATCH/);
  });

  it("C3 the answer names the expected txid, a block is mined, but no inclusion is observed: INCONCLUSIVE (accepted, unconfirmed)", async () => {
    const node = standIn({ answer: (s) => ({ transactionId: s.txId }), mine: true });
    const { res } = await attempt(node.rpc);
    expect(res.passed).toBe(false);
    expect(res.status).toBe("CONSENSUS_SIMNET_INCONCLUSIVE");
    expect(res.simnetConfirmed).not.toBe(true);
    expect(res.consensus?.outcome).toBe("ACCEPTED_UNCONFIRMED");
    expect(res.consensus?.stagesReached).toEqual(["BUILT", "SENT", "RPC_ACCEPTED"]);
    expect(node.calls).toContain("mineBlocks(1)");
  });

  it("C4 an answer without any transaction id (an empty success object): INCONCLUSIVE, never PASS", async () => {
    const node = standIn({ answer: () => ({}), mine: true });
    const { res } = await attempt(node.rpc);
    expect(res.passed).toBe(false);
    expect(res.status).toBe("CONSENSUS_SIMNET_INCONCLUSIVE");
    expect(res.consensus?.outcome).toBe("UNKNOWN");
  });

  it("C5 the submission times out (it may have reached the node): INCONCLUSIVE (TIMEOUT), not FAIL and not PASS", async () => {
    const node = standIn({ answer: () => new RpcTimeoutError("submitTransaction timed out after 30000ms") });
    const { res } = await attempt(node.rpc);
    expect(res.passed).toBe(false);
    expect(res.status).toBe("CONSENSUS_SIMNET_INCONCLUSIVE");
    expect(res.consensus?.outcome).toBe("TIMEOUT");
  });

  it("C6 the request never reached the node (typed not-sent): BLOCKED (NOT_SENT), no stage past BUILT", async () => {
    const node = standIn({ answer: () => markRequestNotSent(new Error("connection refused before the request was written")) });
    const { res } = await attempt(node.rpc);
    expect(res.passed).toBe(false);
    expect(res.status).toBe("BLOCKED");
    expect(res.consensus?.outcome).toBe("NOT_SENT");
    expect(res.consensus?.stagesReached).toEqual(["BUILT"]);
  });

  it("C7 the successor is listed but the spent input is still unspent: not confirmed (INCONCLUSIVE)", async () => {
    const node = standIn({
      answer: (s) => ({ transactionId: s.txId }),
      mine: true,
      ledger: (s, address) => {
        if (!s) return [];
        const prev = s.tx.inputs[0].previousOutpoint ?? s.tx.inputs[0].previous_outpoint;
        const spent = { outpoint: { transactionId: String(prev.transactionId ?? prev.transaction_id), index: Number(prev.index) }, address, amountSompi: 1_000_000_000n };
        return [successorEntry(s, address), spent];
      }
    });
    const { res } = await attempt(node.rpc);
    expect(res.passed).toBe(false);
    expect(res.status).toBe("CONSENSUS_SIMNET_INCONCLUSIVE");
    expect(res.consensus?.outcome).toBe("ACCEPTED_UNCONFIRMED");
  });

  it("C8 the successor is listed under another covenant id: not confirmed (INCONCLUSIVE, output mismatch)", async () => {
    const node = standIn({
      answer: (s) => ({ transactionId: s.txId }),
      mine: true,
      ledger: (s, address) => (s ? [successorEntry(s, address, { covenantId: "ab".repeat(32) })] : [])
    });
    const { res } = await attempt(node.rpc);
    expect(res.status).toBe("CONSENSUS_SIMNET_INCONCLUSIVE");
    expect(res.consensus?.detail).toMatch(/^OUTPUT_MISMATCH/);
  });

  it("C9 the repo's own MockKaspaRpcClient (accepted:true, transactionId 'mock-txid'): INCONCLUSIVE, never PASS", async () => {
    const { res } = await attempt(new MockKaspaRpcClient());
    expect(res.passed).toBe(false);
    expect(res.status).toBe("CONSENSUS_SIMNET_INCONCLUSIVE");
    expect(res.simnetConfirmed).not.toBe(true);
    expect(res.consensus?.detail).toMatch(/^TXID_MISMATCH/);
  });

  it("C10 the node's rejection thrown as an RPC error (how a real client reports it): CONSENSUS_SIMNET_FAIL", async () => {
    const node = standIn({ answer: (s) => new RpcError(nodeRejection(s)) });
    const { res } = await attempt(node.rpc);
    expect(res.status).toBe("CONSENSUS_SIMNET_FAIL");
    expect(res.consensus?.outcome).toBe("REJECTED");
    // the matchers read the node's reason
    expect(res).toRejectCovenantTransition("script ran, but verification failed");
  });

  it("C11 'already in the mempool' is neither a rejection nor a pass: INCONCLUSIVE", async () => {
    const node = standIn({ answer: (s) => new RpcError(`Rejected transaction ${s.txId}: transaction ${s.txId} is already in the mempool`) });
    const { res } = await attempt(node.rpc);
    expect(res.status).toBe("CONSENSUS_SIMNET_INCONCLUSIVE");
    expect(res.consensus?.outcome).toBe("UNKNOWN");
  });

  it("C12 a result that is not a pass leaves the testbed's ledger as it was (the covenant UTXO unspent, no successor)", async () => {
    const node = standIn({ answer: (s) => ({ transactionId: s.txId }), mine: true });
    const { res, bed, genesis } = await attempt(node.rpc);
    expect(res.status).toBe("CONSENSUS_SIMNET_INCONCLUSIVE");
    const live = bed.getLiveUtxos();
    expect(live.some((u) => u.outpoint.transactionId === genesis.utxo.outpoint.transactionId && u.outpoint.index === 0)).toBe(true);
    expect(live.some((u) => u.outpoint.transactionId === res.txId)).toBe(false);
    expect(res.successorUtxos).toEqual([]);
  });

  it("C14 the matchers read an INCONCLUSIVE result neither as a pass nor as a rejection", async () => {
    const node = standIn({ answer: (s) => ({ transactionId: s.txId }), mine: true });
    const { res } = await attempt(node.rpc);
    expect(res.status).toBe("CONSENSUS_SIMNET_INCONCLUSIVE");
    expect(() => expect(res).toPassCovenantTransition({ minEvidence: "CONSENSUS_SIMNET" })).toThrow();
    expect(res).not.toRejectCovenantTransition();
  });

  it("C13 control: expected txid, then the successor listed with its covenant id and the input gone: CONSENSUS_SIMNET_PASS with every stage", async () => {
    const node = standIn({
      answer: (s) => ({ transactionId: s.txId }),
      mine: true,
      ledger: (s, address) => (s ? [successorEntry(s, address)] : [])
    });
    const { res, bed } = await attempt(node.rpc);
    expect(res.status).toBe("CONSENSUS_SIMNET_PASS");
    expect(res.passed).toBe(true);
    expect(res.simnetConfirmed).toBe(true);
    expect(res.consensus?.outcome).toBe("CONFIRMED");
    expect(res.consensus?.stagesReached).toEqual(["BUILT", "SENT", "RPC_ACCEPTED", "NODE_ACCEPTED", "DAG_CONFIRMED"]);
    expect(res.consensus?.expectedTxId).toBe(res.txId);
    expect(res).toPassCovenantTransition({ minEvidence: "CONSENSUS_SIMNET" });
    expect(bed.getLiveUtxos().some((u) => u.outpoint.transactionId === res.txId && u.outpoint.index === 0)).toBe(true);
    const report = bed.toJsonReport() as any;
    expect(report.results.at(-1).consensus).toMatchObject({ outcome: "CONFIRMED", expectedTxId: res.txId });
  });
});
