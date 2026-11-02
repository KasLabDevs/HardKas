import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  createCovenantTestbed,
  createFundedCovenant,
  startIsolatedSimnet,
  stopIsolatedSimnet,
  testbedSimnetRpc,
  waitForUtxo,
  type CompiledCovenantContract,
  type CovenantLiveUtxo,
  type IsolatedSimnetSession
} from "@hardkas/testing";

// Example 10 · simnet level (vitest.simnet.config.ts): GuardedVaultCounter against a real rusty-kaspad v2.1.0 simnet
// node raised in Docker by the harness (isolated container, fixture keys only). The testbed's CONSENSUS_SIMNET level
// reports what the node did, stage by stage: a pass needs the node's answer naming the transaction AND its UTXO index
// showing the transaction's effect (DAG_CONFIRMED: included as observed at that moment, not final).
//   E1 a valid transition (fee 300 000 <= max_fee 500 000), one block mined: CONSENSUS_SIMNET_PASS, every stage;
//   E2 a value drain (fee 1 000 000 > max_fee): the node's own script check rejects it, CONSENSUS_SIMNET_FAIL, unspent.
// Simnet results are a local node's, never mainnet's or a public testnet's.

const source = fs.readFileSync(path.resolve(__dirname, "../contracts/guarded-vault-counter.sil"), "utf8");
const BACKENDS = ["SYNTHETIC", "CONSENSUS_SIMNET"] as const;
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

describe("Example 10 · GuardedVaultCounter on a real rusty-kaspad simnet node", () => {
  let session: IsolatedSimnetSession;
  let contract: CompiledCovenantContract;
  let genesis: CovenantLiveUtxo;
  let bed: ReturnType<typeof createCovenantTestbed>;
  let afterE1: CovenantLiveUtxo;
  const evidence: Record<string, unknown> = {};

  beforeAll(async () => {
    session = await startIsolatedSimnet({ minerFixture: "alice" });
    bed = createCovenantTestbed({ simnetRpc: testbedSimnetRpc(session), consensusObservation: { attempts: 20, intervalMs: 250 } });
    contract = await bed.compileContract({
      source,
      sourceFile: "guarded-vault-counter.sil",
      constructorArgs: [`0x${bed.getAccount("owner").xOnlyPublicKey}`, 10n, 500_000n]
    });
    genesis = bed.adoptLiveUtxo(await createFundedCovenant(session, { contract, initialState: { value: 10n } }));
    evidence.session = { containerName: session.containerName, rpcUrl: session.rpcUrl };
    evidence.genesis = { outpoint: genesis.outpoint, covenantId: genesis.covenantId, amountSompi: genesis.amountSompi };
  }, 300_000);

  afterAll(async () => {
    if (session) await stopIsolatedSimnet(session);
    console.log("[EXAMPLE10_SIMNET_EVIDENCE]", json(evidence));
  }, 60_000);

  const transition = (utxo: CovenantLiveUtxo, next: bigint, feeSompi: bigint) =>
    bed.executeTransition({
      contract,
      utxo,
      entrypoint: "bump",
      args: [{ kind: "int", value: 5n }, { kind: "signer", signer: "owner" }],
      nextStates: [{ state: { value: next } }],
      feeSompi,
      backends: [...BACKENDS]
    });

  it("E1 a valid transition: the node accepts it and its UTXO index shows the successor (CONSENSUS_SIMNET_PASS, every stage)", async () => {
    const res = await transition(genesis, 15n, 300_000n);
    evidence.e1 = { status: res.status, txId: res.txId, consensus: res.consensus };
    expect(res.status).toBe("CONSENSUS_SIMNET_PASS");
    expect(res.consensus?.outcome).toBe("CONFIRMED");
    expect(res.consensus?.stagesReached).toEqual(["BUILT", "SENT", "RPC_ACCEPTED", "NODE_ACCEPTED", "DAG_CONFIRMED"]);
    afterE1 = res.successorUtxos[0]!;
    const onChain = await waitForUtxo(session, afterE1.address, { transactionId: res.txId!, index: 0 }, 15_000);
    expect(onChain.covenantId).toBe(genesis.covenantId!.toLowerCase());
    expect(onChain.amountSompi).toBe(afterE1.amountSompi);
  }, 120_000);

  it("E2 a value drain (fee above max_fee): the node rejects it (CONSENSUS_SIMNET_FAIL) and the covenant UTXO stays unspent", async () => {
    const res = await transition(afterE1, 20n, 1_000_000n);
    evidence.e2 = { status: res.status, txId: res.txId, consensus: res.consensus };
    expect(res.structuralPassed).toBe(true);
    expect(res.status).toBe("CONSENSUS_SIMNET_FAIL");
    expect(res.consensus?.outcome).toBe("REJECTED");
    expect(res.consensus?.stagesReached).toEqual(["BUILT", "SENT"]);
    expect(res.consensus?.detail).toMatch(/^NODE_REJECTED: /);
    const listed = await session.rpc.getUtxosByAddress(afterE1.address);
    expect(listed.some((u) => u.outpoint.transactionId.toLowerCase() === afterE1.outpoint.transactionId && u.outpoint.index === 0)).toBe(true);
  }, 120_000);
});
