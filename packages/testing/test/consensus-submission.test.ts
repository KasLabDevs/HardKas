import { describe, it, expect } from "vitest";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import {
  MockKaspaRpcClient,
  NodeNetworkIdentityError,
  RpcConnectionError,
  RpcError,
  RpcSubmitOutcomeUnknownError,
  RpcTimeoutError,
  markRequestNotSent,
  officialTxIdOf
} from "@hardkas/kaspa-rpc";
import { submitAndObserveConsensus, type ConsensusSimnetRpc } from "../src/consensus-submission.js";

// -----------------------------------------------------------------------------
// R-01 · what one CONSENSUS_SIMNET submission establishes, stage by stage. Stand-in nodes play every answer a node or a
// broken endpoint can give; CONFIRMED needs the expected txid in the answer AND the transaction's effect in the UTXO
// index (every output under txid:index with its amount and covenant id, every spent input gone). Hermetic: one
// fixture transaction (kaspa-wasm computes its id), no node, no network, no silverc.
// -----------------------------------------------------------------------------

const OUT = "kaspasim:fixture-output-address";
const IN = "kaspasim:fixture-input-address";
const COV = "c0".repeat(32);
const FAST = { attempts: 3, intervalMs: 0 };

/** A fixture transaction (one input, one output) as a signer writes it, and the id the official kaspa-wasm gives it. */
function fixtureTx(seed = "cd") {
  const k: any = loadManagedKaspaWasmSync();
  const prev = { transactionId: seed.repeat(32), index: 0 };
  const spk = { version: 0, scriptPublicKey: "20" + "aa".repeat(32) + "ac" };
  const signatureScript = "41" + "bb".repeat(65);
  const txId = String(
    new k.Transaction({
      version: 0,
      inputs: [{ previousOutpoint: prev, signatureScript, sequence: 0n, sigOpCount: 1 }],
      outputs: [{ value: 900_000n, scriptPublicKey: new k.ScriptPublicKey(spk.version, spk.scriptPublicKey) }],
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: ""
    }).id
  ).toLowerCase();
  const payload = JSON.stringify({
    version: 0,
    inputs: [{ previousOutpoint: prev, signatureScript, sequence: "0", sigOpCount: 1 }],
    outputs: [{ value: "900000", scriptPublicKey: spk }],
    lockTime: "0",
    subnetworkId: "0000000000000000000000000000000000000000",
    gas: "0",
    payload: "",
    storageMass: "0"
  });
  return { payload, txId, prev };
}

const tx = fixtureTx();
const params = (over: Record<string, unknown> = {}) => ({
  rpcTransaction: tx.payload,
  expectedTxId: tx.txId,
  outputs: [{ address: OUT, index: 0, amountSompi: 900_000n, covenantId: COV }],
  spentInputs: [{ address: IN, outpoint: tx.prev }],
  observation: FAST,
  ...over
});

const listedOutput = (over: Record<string, unknown> = {}) => ({
  outpoint: { transactionId: tx.txId, index: 0 },
  address: OUT,
  amountSompi: 900_000n,
  covenantId: COV,
  ...over
});
const listedInput = { outpoint: tx.prev, address: IN, amountSompi: 1_000_000n };

/** A stand-in node. `answer` returns or throws for submitTransaction; `ledger(n)` lists an address at observation n. */
function standIn(opts: {
  answer: (submitted: unknown) => unknown;
  ledger?: (address: string, observation: number) => any[];
  mempool?: boolean;
  mine?: boolean;
}) {
  const calls: string[] = [];
  // an observation reads the outputs' address first, then the inputs'
  let observation = 0;
  const rpc: ConsensusSimnetRpc = {
    async submitTransaction(t: unknown, options?: unknown) {
      calls.push(`submitTransaction ${JSON.stringify(options)}`);
      const a = opts.answer(t);
      if (a instanceof Error) throw a;
      return a;
    },
    async getUtxosByAddress(address: string) {
      if (address === OUT) observation++;
      calls.push(`getUtxosByAddress ${address}`);
      return opts.ledger ? opts.ledger(address, observation) : [];
    },
    ...(opts.mempool !== undefined ? { getMempoolEntry: async (id: string) => (calls.push(`getMempoolEntry ${id}`), opts.mempool ? { txId: id } : null) } : {}),
    ...(opts.mine ? { mineBlocks: async (n: number) => void calls.push(`mineBlocks ${n}`) } : {})
  };
  return { rpc, calls };
}

const confirmedLedger = (address: string) => (address === OUT ? [listedOutput()] : []);
const rejection = `Rejected transaction ${tx.txId}: failed to verify the signature script: script ran, but verification failed`;

describe("R-01 · submitAndObserveConsensus: answers that accept nothing", () => {
  it("U1 accepted:false with the node's rejection text → REJECTED (BUILT, SENT)", async () => {
    const e = await submitAndObserveConsensus(standIn({ answer: () => ({ accepted: false, error: rejection }) }).rpc, params());
    expect(e.outcome).toBe("REJECTED");
    expect(e.stagesReached).toEqual(["BUILT", "SENT"]);
    expect(e.detail).toMatch(/^NODE_REJECTED/);
  });

  it("U2 accepted:false without any text → REJECTED", async () => {
    const e = await submitAndObserveConsensus(standIn({ answer: () => ({ accepted: false }) }).rpc, params());
    expect(e.outcome).toBe("REJECTED");
  });

  it("U3 an answer naming another transaction → UNKNOWN (TXID_MISMATCH), no RPC_ACCEPTED", async () => {
    const e = await submitAndObserveConsensus(standIn({ answer: () => ({ transactionId: "f".repeat(64), accepted: true }), ledger: confirmedLedger }).rpc, params());
    expect(e.outcome).toBe("UNKNOWN");
    expect(e.detail).toMatch(/^TXID_MISMATCH/);
    expect(e.stagesReached).toEqual(["BUILT", "SENT"]);
  });

  it("U4 an empty success object → UNKNOWN (NO_TXID_IN_ANSWER)", async () => {
    const e = await submitAndObserveConsensus(standIn({ answer: () => ({}), ledger: confirmedLedger }).rpc, params());
    expect(e.outcome).toBe("UNKNOWN");
    expect(e.detail).toMatch(/^NO_TXID_IN_ANSWER/);
  });

  it("U5 no answer at all → UNKNOWN (NO_ANSWER)", async () => {
    const e = await submitAndObserveConsensus(standIn({ answer: () => undefined }).rpc, params());
    expect(e.outcome).toBe("UNKNOWN");
    expect(e.detail).toMatch(/^NO_ANSWER/);
  });

  it("U6 the expected txid together with the node's rejection text → REJECTED, never accepted", async () => {
    const e = await submitAndObserveConsensus(standIn({ answer: () => ({ transactionId: tx.txId, error: rejection }), ledger: confirmedLedger }).rpc, params());
    expect(e.outcome).toBe("REJECTED");
  });

  it("U7 the expected txid with accepted set to something other than true → UNKNOWN", async () => {
    const e = await submitAndObserveConsensus(standIn({ answer: () => ({ transactionId: tx.txId, accepted: "yes" }), ledger: confirmedLedger }).rpc, params());
    expect(e.outcome).toBe("UNKNOWN");
    expect(e.detail).toMatch(/^ANSWER_NOT_ACCEPTED/);
  });

  it("U8 the repo's own MockKaspaRpcClient (accepted:true, 'mock-txid') → UNKNOWN, never CONFIRMED", async () => {
    const e = await submitAndObserveConsensus(new MockKaspaRpcClient(), params());
    expect(e.outcome).toBe("UNKNOWN");
    expect(e.detail).toMatch(/^TXID_MISMATCH/);
  });
});

describe("R-01 · failures: transport, timeout and node rejection kept apart", () => {
  it("U9 RpcTimeoutError → TIMEOUT (BUILT, SENT)", async () => {
    const e = await submitAndObserveConsensus(standIn({ answer: () => new RpcTimeoutError("timed out after 30000ms") }).rpc, params());
    expect(e.outcome).toBe("TIMEOUT");
    expect(e.stagesReached).toEqual(["BUILT", "SENT"]);
  });

  it("U10 the outcome-unknown error a real client raises on a timeout → TIMEOUT", async () => {
    const thrown = new RpcSubmitOutcomeUnknownError({ txId: tx.txId, cause: new RpcTimeoutError("timed out") });
    const e = await submitAndObserveConsensus(standIn({ answer: () => thrown }).rpc, params());
    expect(e.outcome).toBe("TIMEOUT");
  });

  it("U11 an outcome-unknown error (answer lost) → UNKNOWN", async () => {
    const thrown = new RpcSubmitOutcomeUnknownError({ txId: tx.txId, reason: "connection closed after the request left" });
    const e = await submitAndObserveConsensus(standIn({ answer: () => thrown }).rpc, params());
    expect(e.outcome).toBe("UNKNOWN");
    expect(e.detail).toMatch(/^SUBMIT_OUTCOME_UNKNOWN/);
  });

  it("U12 a connection lost (not marked not-sent) → UNKNOWN (TRANSPORT_LOST_AFTER_SEND)", async () => {
    const e = await submitAndObserveConsensus(standIn({ answer: () => new RpcConnectionError("connection closed") }).rpc, params());
    expect(e.outcome).toBe("UNKNOWN");
    expect(e.detail).toMatch(/^TRANSPORT_LOST_AFTER_SEND/);
  });

  it("U13 a typed not-sent failure → NOT_SENT, only BUILT", async () => {
    const e = await submitAndObserveConsensus(standIn({ answer: () => markRequestNotSent(new RpcConnectionError("ECONNREFUSED")) }).rpc, params());
    expect(e.outcome).toBe("NOT_SENT");
    expect(e.stagesReached).toEqual(["BUILT"]);
  });

  it("U14 the node's network identity refused → NOT_SENT", async () => {
    const thrown = new NodeNetworkIdentityError("NODE_NETWORK_MISMATCH", "expected simnet, node serves testnet-10", { expected: "simnet", observed: "testnet-10", endpoint: "ws://127.0.0.1:1" });
    const e = await submitAndObserveConsensus(standIn({ answer: () => thrown }).rpc, params());
    expect(e.outcome).toBe("NOT_SENT");
  });

  it("U15 the node's rejection thrown as an RPC error → REJECTED", async () => {
    const e = await submitAndObserveConsensus(standIn({ answer: () => new RpcError(rejection) }).rpc, params());
    expect(e.outcome).toBe("REJECTED");
    expect(e.submitError).toBe(rejection);
  });

  it("U16 'already in the mempool' thrown → UNKNOWN (neither rejected nor accepted)", async () => {
    const text = `Rejected transaction ${tx.txId}: transaction ${tx.txId} is already in the mempool`;
    const e = await submitAndObserveConsensus(standIn({ answer: () => new RpcError(text) }).rpc, params());
    expect(e.outcome).toBe("UNKNOWN");
  });

  it("U17 an unclassified failure → UNKNOWN, never REJECTED", async () => {
    const e = await submitAndObserveConsensus(standIn({ answer: () => new Error("boom") }).rpc, params());
    expect(e.outcome).toBe("UNKNOWN");
    expect(e.detail).toMatch(/^SUBMIT_FAILED_UNCLASSIFIED/);
  });
});

describe("R-01 · the expected transaction, before anything is sent", () => {
  it("U18 the expected txid is not the transaction's official id → NOT_SENT, submitTransaction never called", async () => {
    const node = standIn({ answer: (t) => ({ transactionId: officialTxIdOf(t) }), ledger: confirmedLedger });
    const e = await submitAndObserveConsensus(node.rpc, params({ expectedTxId: fixtureTx("ef").txId }));
    expect(e.outcome).toBe("NOT_SENT");
    expect(e.detail).toMatch(/^EXPECTED_TXID_MISMATCH/);
    expect(e.stagesReached).toEqual([]);
    expect(node.calls).toEqual([]);
  });

  it("U19 an expected txid that is not a 64-hex id → NOT_SENT, nothing called", async () => {
    const node = standIn({ answer: () => ({ transactionId: tx.txId }) });
    const e = await submitAndObserveConsensus(node.rpc, params({ expectedTxId: "abc" }));
    expect(e.outcome).toBe("NOT_SENT");
    expect(node.calls).toEqual([]);
  });

  it("U20 the submission carries expectedTxId and allowOrphan:false (a real client checks it before sending)", async () => {
    const node = standIn({ answer: () => ({ transactionId: tx.txId }), ledger: confirmedLedger });
    await submitAndObserveConsensus(node.rpc, params());
    expect(node.calls[0]).toBe(`submitTransaction ${JSON.stringify({ allowOrphan: false, expectedTxId: tx.txId })}`);
  });
});

describe("R-01 · accepted by the RPC is not confirmed", () => {
  it("U21 expected txid, nothing in the UTXO index → ACCEPTED_UNCONFIRMED (BUILT, SENT, RPC_ACCEPTED) after every observation", async () => {
    const e = await submitAndObserveConsensus(standIn({ answer: () => ({ transactionId: tx.txId }), mine: true }).rpc, params());
    expect(e.outcome).toBe("ACCEPTED_UNCONFIRMED");
    expect(e.stagesReached).toEqual(["BUILT", "SENT", "RPC_ACCEPTED"]);
    expect(e.observation?.attempts).toBe(3);
  });

  it("U22 the mempool lists it, the UTXO index does not → NODE_ACCEPTED but ACCEPTED_UNCONFIRMED", async () => {
    const e = await submitAndObserveConsensus(standIn({ answer: () => ({ transactionId: tx.txId }), mempool: true }).rpc, params());
    expect(e.outcome).toBe("ACCEPTED_UNCONFIRMED");
    expect(e.stagesReached).toEqual(["BUILT", "SENT", "RPC_ACCEPTED", "NODE_ACCEPTED"]);
  });

  it("U23 the output is listed but the spent input is still unspent → ACCEPTED_UNCONFIRMED", async () => {
    const ledger = (a: string) => (a === OUT ? [listedOutput()] : a === IN ? [listedInput] : []);
    const e = await submitAndObserveConsensus(standIn({ answer: () => ({ transactionId: tx.txId }), ledger }).rpc, params());
    expect(e.outcome).toBe("ACCEPTED_UNCONFIRMED");
    expect(e.observation?.inputsStillUnspent).toBe(1);
  });

  it("U24 the output listed with another amount → ACCEPTED_UNCONFIRMED (OUTPUT_MISMATCH)", async () => {
    const ledger = (a: string) => (a === OUT ? [listedOutput({ amountSompi: 899_999n })] : []);
    const e = await submitAndObserveConsensus(standIn({ answer: () => ({ transactionId: tx.txId }), ledger }).rpc, params());
    expect(e.outcome).toBe("ACCEPTED_UNCONFIRMED");
    expect(e.detail).toMatch(/^OUTPUT_MISMATCH: output 0: amount/);
  });

  it("U25 the output listed under another covenant id → ACCEPTED_UNCONFIRMED (OUTPUT_MISMATCH)", async () => {
    const ledger = (a: string) => (a === OUT ? [listedOutput({ covenantId: "ab".repeat(32) })] : []);
    const e = await submitAndObserveConsensus(standIn({ answer: () => ({ transactionId: tx.txId }), ledger }).rpc, params());
    expect(e.outcome).toBe("ACCEPTED_UNCONFIRMED");
    expect(e.detail).toMatch(/^OUTPUT_MISMATCH: output 0: covenant id/);
  });

  it("U26 the UTXO index cannot be read → ACCEPTED_UNCONFIRMED, the errors kept", async () => {
    const rpc: ConsensusSimnetRpc = {
      submitTransaction: async () => ({ transactionId: tx.txId }),
      getUtxosByAddress: async () => {
        throw new Error("utxoindex is not enabled");
      }
    };
    const e = await submitAndObserveConsensus(rpc, params());
    expect(e.outcome).toBe("ACCEPTED_UNCONFIRMED");
    expect(e.observation?.errors.length).toBe(3);
  });

  it("U27 a transaction without outputs to observe → ACCEPTED_UNCONFIRMED (NO_OBSERVABLE_OUTPUT), never CONFIRMED", async () => {
    const e = await submitAndObserveConsensus(standIn({ answer: () => ({ transactionId: tx.txId }) }).rpc, params({ outputs: [] }));
    expect(e.outcome).toBe("ACCEPTED_UNCONFIRMED");
    expect(e.detail).toMatch(/^NO_OBSERVABLE_OUTPUT/);
  });
});

describe("R-01 · CONFIRMED", () => {
  it("U28 expected txid, mempool entry, one block mined, the output listed and the input gone → CONFIRMED with every stage", async () => {
    const node = standIn({ answer: () => ({ transactionId: tx.txId, accepted: true }), ledger: confirmedLedger, mempool: true, mine: true });
    const e = await submitAndObserveConsensus(node.rpc, params());
    expect(e.outcome).toBe("CONFIRMED");
    expect(e.stagesReached).toEqual(["BUILT", "SENT", "RPC_ACCEPTED", "NODE_ACCEPTED", "DAG_CONFIRMED"]);
    // the mempool is read before the block that takes the transaction out of it
    expect(node.calls.slice(0, 3)).toEqual([
      `submitTransaction ${JSON.stringify({ allowOrphan: false, expectedTxId: tx.txId })}`,
      `getMempoolEntry ${tx.txId}`,
      "mineBlocks 1"
    ]);
  });

  it("U29 the output appears on the third observation → CONFIRMED, observation 3 recorded", async () => {
    const ledger = (a: string, n: number) => (a === OUT && n >= 3 ? [listedOutput()] : []);
    const e = await submitAndObserveConsensus(standIn({ answer: () => ({ transactionId: tx.txId }), ledger }).rpc, params({ observation: { attempts: 5, intervalMs: 0 } }));
    expect(e.outcome).toBe("CONFIRMED");
    expect(e.observation?.attempts).toBe(3);
    expect(e.stagesReached).toEqual(["BUILT", "SENT", "RPC_ACCEPTED", "NODE_ACCEPTED", "DAG_CONFIRMED"]);
  });

  it("U30 the answer as a bare txid string (some clients) names the expected txid → CONFIRMED when included", async () => {
    const e = await submitAndObserveConsensus(standIn({ answer: () => tx.txId, ledger: confirmedLedger }).rpc, params());
    expect(e.outcome).toBe("CONFIRMED");
  });
});
