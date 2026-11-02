import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { silverP2shAddress } from "@hardkas/core";
import { v1ContractFactsAtState } from "@hardkas/accounts";
import {
  createCovenantTestbed,
  createFundedCovenant,
  mineBlocks,
  normalizeStateRecord,
  startIsolatedSimnet,
  stopIsolatedSimnet,
  testbedSimnetRpc,
  waitForUtxo,
  type CompiledCovenantContract,
  type ConsensusSimnetRpc,
  type CovenantLiveUtxo,
  type IsolatedSimnetSession
} from "../src/index.js";

// -----------------------------------------------------------------------------
// R-01 against a real rusty-kaspad v2.1.0 simnet node (isolated container, fixture keys only). The testbed's
// CONSENSUS_SIMNET level reports what the node did, stage by stage:
//   S1 a valid transition, one block mined: CONSENSUS_SIMNET_PASS only after the node's UTXO index shows it;
//   S2 an invalid transition (delta 0): the node's own rejection, CONSENSUS_SIMNET_FAIL, the covenant UTXO unspent;
//   S3 a valid transition the node accepts while nothing is mined: CONSENSUS_SIMNET_INCONCLUSIVE (accepted by the RPC
//      and held in the mempool, not confirmed). Mined afterwards, the node confirms it: the testbed reported "not yet
//      observed", never a rejection and never a pass.
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const source = fs.readFileSync(path.join(repoRoot, "examples", "09-silver-reference", "contracts", "owned-counter.sil"), "utf8");
const BACKENDS = ["SYNTHETIC", "CONSENSUS_SIMNET"] as const;

const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

describe("R-01 · CONSENSUS_SIMNET against a real rusty-kaspad simnet node", () => {
  let session: IsolatedSimnetSession;
  let contract: CompiledCovenantContract;
  let genesis: CovenantLiveUtxo;
  let bed: ReturnType<typeof createCovenantTestbed>;
  let mining = true;
  let afterS1: CovenantLiveUtxo;
  const evidence: Record<string, unknown> = {};

  beforeAll(async () => {
    session = await startIsolatedSimnet({ minerFixture: "alice" });
    const node = testbedSimnetRpc(session);
    // a node whose miner can be stopped: with `mining` false, nothing is mined after a submission
    const rpc: ConsensusSimnetRpc = { ...node, mineBlocks: async (n, a) => (mining ? node.mineBlocks!(n, a) : undefined) };
    bed = createCovenantTestbed({ simnetRpc: rpc, consensusObservation: { attempts: 20, intervalMs: 250 } });
    contract = await bed.compileContract({
      source,
      sourceFile: "owned-counter.sil",
      constructorArgs: [`0x${bed.getAccount("owner").xOnlyPublicKey}`, 10n]
    });
    genesis = bed.adoptLiveUtxo(await createFundedCovenant(session, { contract, initialState: { value: 10n } }));
    evidence.session = { containerName: session.containerName, rpcUrl: session.rpcUrl };
    evidence.genesis = { outpoint: genesis.outpoint, covenantId: genesis.covenantId, amountSompi: genesis.amountSompi };
  }, 300_000);

  afterAll(async () => {
    if (session) await stopIsolatedSimnet(session);
    console.log("[R01_SIMNET_EVIDENCE]", json(evidence));
  }, 60_000);

  const transition = (utxo: CovenantLiveUtxo, delta: bigint, next: bigint) =>
    bed.executeTransition({
      contract,
      utxo,
      entrypoint: "bump",
      args: [{ kind: "int", value: delta }, { kind: "signer", signer: "owner" }],
      nextStates: [{ state: { value: next } }],
      backends: [...BACKENDS]
    });

  const record = (key: string, res: any) =>
    (evidence[key] = { status: res.status, passed: res.passed, txId: res.txId, consensus: res.consensus });

  it("S1 a valid transition with a block mined: CONSENSUS_SIMNET_PASS with every stage, the node lists the successor", async () => {
    mining = true;
    const res = await transition(genesis, 5n, 15n);
    record("s1", res);
    expect(res.status).toBe("CONSENSUS_SIMNET_PASS");
    expect(res.passed).toBe(true);
    expect(res.simnetConfirmed).toBe(true);
    expect(res.consensus?.outcome).toBe("CONFIRMED");
    expect(res.consensus?.stagesReached).toEqual(["BUILT", "SENT", "RPC_ACCEPTED", "NODE_ACCEPTED", "DAG_CONFIRMED"]);
    expect(res.consensus?.expectedTxId).toBe(res.txId);
    // independent read of the node, outside the testbed
    afterS1 = res.successorUtxos[0]!;
    const onChain = await waitForUtxo(session, afterS1.address, { transactionId: res.txId!, index: 0 }, 15_000);
    expect(onChain.covenantId).toBe(genesis.covenantId!.toLowerCase());
    expect(onChain.amountSompi).toBe(afterS1.amountSompi);
  }, 120_000);

  it("S2 an invalid transition (delta 0, `require(delta > 0)`): the node rejects it, CONSENSUS_SIMNET_FAIL, the UTXO unspent", async () => {
    mining = true;
    const res = await transition(afterS1, 0n, 15n);
    record("s2", res);
    expect(res.status).toBe("CONSENSUS_SIMNET_FAIL");
    expect(res.passed).toBe(false);
    expect(res.consensus?.outcome).toBe("REJECTED");
    expect(res.consensus?.stagesReached).toEqual(["BUILT", "SENT"]);
    expect(res.consensus?.detail).toMatch(/^NODE_REJECTED: .*Rejected transaction/);
    const listed = await session.rpc.getUtxosByAddress(afterS1.address);
    expect(listed.some((u) => u.outpoint.transactionId.toLowerCase() === afterS1.outpoint.transactionId && u.outpoint.index === 0)).toBe(true);
  }, 120_000);

  it("S3 a valid transition accepted while nothing is mined: CONSENSUS_SIMNET_INCONCLUSIVE; mined afterwards, the node confirms it", async () => {
    mining = false;
    const res = await transition(afterS1, 5n, 20n);
    record("s3", res);
    expect(res.status).toBe("CONSENSUS_SIMNET_INCONCLUSIVE");
    expect(res.passed).toBe(false);
    expect(res.simnetConfirmed).toBe(false);
    expect(res.consensus?.outcome).toBe("ACCEPTED_UNCONFIRMED");
    expect(res.consensus?.stagesReached).toEqual(["BUILT", "SENT", "RPC_ACCEPTED", "NODE_ACCEPTED"]);
    // the testbed's ledger did not move
    expect(bed.getLiveUtxos().some((u) => u.outpoint.transactionId === afterS1.outpoint.transactionId)).toBe(true);
    expect(bed.getLiveUtxos().some((u) => u.outpoint.transactionId === res.txId)).toBe(false);
    // the node held it: one block later its successor is listed
    await mineBlocks(session, 1);
    const successorAddress = silverP2shAddress(
      v1ContractFactsAtState(contract.facts, normalizeStateRecord({ value: 20n })).bytecodeHex,
      "simnet"
    );
    const onChain = await waitForUtxo(session, successorAddress, { transactionId: res.txId!, index: 0 }, 15_000);
    expect(onChain.covenantId).toBe(genesis.covenantId!.toLowerCase());
    (evidence.s3 as any).confirmedLater = { outpoint: onChain.outpoint, blockDaaScore: onChain.blockDaaScore };
  }, 120_000);
});
