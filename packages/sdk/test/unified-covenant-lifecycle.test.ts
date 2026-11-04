import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  Hardkas,
  reconstructCovenantLineage,
  collectCovenantTransactions,
  deriveCovenantStatus,
  createCovenantTransitionFactArtifact,
  type CovenantTransitionFact,
  type CovenantLineageTx
} from "../src/index.js";
import { withClientUrl } from "./helpers/rpc-instance.js";
import { FakeNode } from "./helpers/fake-v1-node.js";
import {
  COUNTER_RECORD,
  COVENANT_ID,
  FIXTURE,
  FIXTURE_KEY,
  FIXTURE_XONLY,
  fundingUtxo,
  v1CorpusFacts
} from "./helpers/v1-corpus.js";

vi.setConfig({ testTimeout: 60_000 });

const LOOPBACK = "http://127.0.0.1:16110";
const COUNTER = {
  compileRecord: COUNTER_RECORD,
  contract: "Counter",
  constructorArgs: [{ kind: "int", value: "7" }]
} as any;
const keys = {
  publicKeyOf: (a: string) => (a === FIXTURE || a === "fixture" ? FIXTURE_XONLY : undefined),
  privateKeyOf: async () => FIXTURE_KEY
};
const int = (v: number) => ({ value: { kind: "int", value: String(v) } }) as any;

describe("Unified Covenant Lifecycle (Persist Facts, Derive States)", () => {
  let ws: string;
  let node: FakeNode;

  async function openSdk(): Promise<Hardkas> {
    const sdk: any = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simnet" });
    const cfg: any = sdk.config.config;
    cfg.networks = {
      ...(cfg.networks ?? {}),
      simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" }
    };
    vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async (address: any) => node.listed(address) as any);
    vi.spyOn(sdk.rpc, "getMempoolEntriesByAddresses").mockImplementation(async (o: any) => node.mempoolEntries(o.addresses) as any);
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockImplementation(async () => ({
      networkId: node.networkId,
      virtualDaaScore: node.virtualDaaScore,
      tipHashes: [node.sink],
      virtualParentHashes: [node.sink],
      sink: node.sink
    }) as any);
    vi.spyOn(sdk.rpc, "getServerInfo").mockImplementation(async () => ({
      networkId: node.networkId,
      serverVersion: "2.1.0",
      isSynced: true
    }) as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockImplementation(async () => ({
      blueScore: node.sinkBlueScore.toString()
    }) as any);
    vi.spyOn(sdk.rpc, "call").mockImplementation(async (method: string, params: any) => node.call(method, params));
    vi.spyOn(sdk.rpc, "submitTransaction").mockImplementation(async (transaction: any) => node.submit(transaction));
    withClientUrl(sdk, LOOPBACK);
    return sdk;
  }

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cov-life-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    node = new FakeNode();
    node.utxos = [fundingUtxo()];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      fs.rmSync(ws, { recursive: true, force: true });
    } catch {}
  });

  it("completes full happy path: genesis -> transition -> fact persisted -> status confirmed -> lineage reconstructed", async () => {
    const sdk: any = await openSdk();
    const facts = v1CorpusFacts();

    // 1. Plan & sign Genesis
    const genesisPlan = await sdk.covenants.planGenesis(
      { contract: COUNTER, outputs: [{ amountSompi: 1_000_000_000n }], funder: FIXTURE },
      { facts }
    );
    const genesisSigned = await sdk.covenants.sign(genesisPlan, { facts, keys });
    await sdk.covenants.send(genesisSigned.signed, { facts });
    node.mine(genesisSigned.txId);

    // 2. Plan & sign Transition (Counter 7 -> 12)
    const transitionPlan = await sdk.covenants.planTransition(
      {
        covenantId: COVENANT_ID,
        inputs: [
          {
            outpoint: { transactionId: genesisSigned.txId, index: 0 },
            contract: {
              ...COUNTER,
              entry: "__covenant_entrypoint_auth_bump",
              policy: "bump",
              args: [{ kind: "int", value: "5" }]
            },
            computeBudget: 0
          }
        ],
        continuations: [{ amountSompi: "rest", state: int(12) }]
      },
      { facts }
    );
    const transitionSigned = await sdk.covenants.sign(transitionPlan, { facts, keys });

    // 3. Emit immutable CovenantTransitionFact
    const transitionFact = createCovenantTransitionFactArtifact({
      networkId: "simnet",
      covenantId: COVENANT_ID,
      contractName: "Counter",
      artifactSha256: "ee".repeat(32),
      entrypoint: "__covenant_entrypoint_auth_bump",
      policy: "bump",
      previousState: { value: 7 },
      nextState: { value: 12 },
      spentOutpoint: { transactionId: genesisSigned.txId, index: 0 },
      successorOutpoint: { transactionId: transitionSigned.txId, index: 0 },
      successorAmountSompi: "999800000",
      planArtifactId: transitionPlan.contentHash ?? "00".repeat(32),
      draftArtifactId: transitionSigned.signed.contentHash ?? "00".repeat(32),
      txId: transitionSigned.txId,
      validation: {
        structuralPassed: true,
        scriptVmPassed: true
      }
    });

    // Write fact to workspace artifacts
    await sdk.artifacts.write(transitionFact);

    // 4. Derive status before node observation: PROPOSED
    const proposedStatus = deriveCovenantStatus({
      transitionFact,
      txStatus: undefined
    });
    expect(proposedStatus.kind).toBe("PROPOSED");
    expect(proposedStatus.isFinal).toBe(false);

    // 5. Send transaction and derive MEMPOOL_PENDING
    await sdk.covenants.send(transitionSigned.signed, { facts });
    const mempoolStatus = deriveCovenantStatus({
      transitionFact,
      txStatus: {
        txId: transitionSigned.txId,
        status: "MEMPOOL_ACCEPTED",
        policy: { policyId: "hardkas.policy.v1", policyVersion: 1, origin: "hardkas-product-default", minConfirmations: 1, confirmationUnit: "blue-score" },
        perObserver: [],
        observers: [],
        evidence: { observationArtifactIds: [], ignored: [] },
        reasons: ["In mempool"],
        isFinal: false
      }
    });
    expect(mempoolStatus.kind).toBe("MEMPOOL_PENDING");

    // 6. Mine block and derive TRANSITION_CONFIRMED
    node.mine(transitionSigned.txId);
    const confirmedStatus = deriveCovenantStatus({
      transitionFact,
      txStatus: {
        txId: transitionSigned.txId,
        status: "CONFIRMED",
        policy: { policyId: "hardkas.policy.v1", policyVersion: 1, origin: "hardkas-product-default", minConfirmations: 1, confirmationUnit: "blue-score" },
        perObserver: [],
        observers: [],
        evidence: { observationArtifactIds: [], ignored: [] },
        reasons: ["Mined into virtual chain"],
        isFinal: true
      }
    });
    expect(confirmedStatus.kind).toBe("TRANSITION_CONFIRMED");
    expect(confirmedStatus.isFinal).toBe(false); // only FINALIZED is final
    expect(confirmedStatus.activeOutpoint).toBe(`${transitionSigned.txId}:0`);

    // 7. Verify collectCovenantTransactions and reconstructCovenantLineage picked up the fact
    const txs = collectCovenantTransactions(ws, COVENANT_ID);
    const lineage = reconstructCovenantLineage(COVENANT_ID, txs);

    expect(lineage.covenantId).toBe(COVENANT_ID);
    expect(lineage.genesis?.txId).toBe(genesisSigned.txId);
    expect(lineage.transitions.length).toBe(1);
    expect(lineage.transitions[0]!.txId).toBe(transitionSigned.txId);
    expect(lineage.transitions[0]!.fact).toBeDefined();
    expect(lineage.transitions[0]!.fact?.nextState).toEqual({ value: 12 });
    expect(lineage.transitions[0]!.sources.some((s) => s.kind === "covenant-fact")).toBe(true);
  });

  it("handles rejection scenario: derives TRANSITION_REJECTED and records finding in lineage", async () => {
    const transitionFact = createCovenantTransitionFactArtifact({
      networkId: "simnet",
      covenantId: COVENANT_ID,
      contractName: "Counter",
      artifactSha256: "ee".repeat(32),
      entrypoint: "__covenant_entrypoint_auth_bump",
      spentOutpoint: { transactionId: "aa".repeat(32), index: 0 },
      successorOutpoint: { transactionId: "bb".repeat(32), index: 0 },
      planArtifactId: "11".repeat(32),
      txId: "bb".repeat(32),
      validation: {
        structuralPassed: true,
        scriptVmPassed: false,
        diagnostic: "SCRIPT_RUN_FAILED: assertion false on bump"
      }
    });

    const rejectedStatus = deriveCovenantStatus({
      transitionFact,
      txStatus: {
        txId: "bb".repeat(32),
        status: "REJECTED_BY_NODE",
        policy: { policyId: "hardkas.policy.v1", policyVersion: 1, origin: "hardkas-product-default", minConfirmations: 1, confirmationUnit: "blue-score" },
        perObserver: [],
        observers: [],
        evidence: { observationArtifactIds: [], ignored: [] },
        reasons: ["Consensus ScriptVM evaluation failed"],
        isFinal: true
      }
    });

    expect(rejectedStatus.kind).toBe("TRANSITION_REJECTED");
    expect(rejectedStatus.isFinal).toBe(true);
    expect(rejectedStatus.reason).toContain("rejected");

    // Lineage reconstruction includes failed preflight finding
    const tx: CovenantLineageTx = {
      txId: "bb".repeat(32),
      kind: "transition",
      sources: [{ kind: "covenant-fact", artifactId: "cc".repeat(32) }],
      spends: [`${"aa".repeat(32)}:0`],
      outputs: [],
      recorded: "rejected",
      fact: transitionFact
    };

    const lineage = reconstructCovenantLineage(COVENANT_ID, [tx]);
    expect(lineage.rejected.length).toBe(1);
    expect(lineage.findings.some((f) => f.includes("failed ScriptVM preflight"))).toBe(true);
  });

  it("handles reorg scenario: derives TRANSITION_REORGED when chain reorganizes", async () => {
    const transitionFact = createCovenantTransitionFactArtifact({
      networkId: "simnet",
      covenantId: COVENANT_ID,
      contractName: "Counter",
      artifactSha256: "ee".repeat(32),
      entrypoint: "__covenant_entrypoint_auth_bump",
      spentOutpoint: { transactionId: "aa".repeat(32), index: 0 },
      successorOutpoint: { transactionId: "bb".repeat(32), index: 0 },
      planArtifactId: "11".repeat(32),
      txId: "bb".repeat(32),
      validation: {
        structuralPassed: true,
        scriptVmPassed: true
      }
    });

    const reorgedStatus = deriveCovenantStatus({
      transitionFact,
      txStatus: {
        txId: "bb".repeat(32),
        status: "REORGED",
        policy: { policyId: "hardkas.policy.v1", policyVersion: 1, origin: "hardkas-product-default", minConfirmations: 1, confirmationUnit: "blue-score" },
        perObserver: [],
        observers: [],
        evidence: { observationArtifactIds: [], ignored: [] },
        reasons: ["Block removed from virtual chain by DAG reorganization"],
        isFinal: false
      }
    });

    expect(reorgedStatus.kind).toBe("TRANSITION_REORGED");
    expect(reorgedStatus.isFinal).toBe(false);
    expect(reorgedStatus.activeOutpoint).toBe(`${"aa".repeat(32)}:0`); // Prior outpoint restored!
  });

  it("reconstructs covenant state progression offline from persisted facts alone without node querying", async () => {
    const genesisFact = createCovenantTransitionFactArtifact({
      networkId: "simnet",
      covenantId: COVENANT_ID,
      contractName: "Counter",
      artifactSha256: "ee".repeat(32),
      entrypoint: "genesis",
      spentOutpoint: { transactionId: "01".repeat(32), index: 0 },
      successorOutpoint: { transactionId: "10".repeat(32), index: 0 },
      successorAmountSompi: "1000000000",
      planArtifactId: "01".repeat(32),
      txId: "10".repeat(32),
      nextState: { value: 7 },
      validation: { structuralPassed: true }
    });

    const hop1Fact = createCovenantTransitionFactArtifact({
      networkId: "simnet",
      covenantId: COVENANT_ID,
      contractName: "Counter",
      artifactSha256: "ee".repeat(32),
      entrypoint: "bump",
      spentOutpoint: { transactionId: "10".repeat(32), index: 0 },
      successorOutpoint: { transactionId: "20".repeat(32), index: 0 },
      successorAmountSompi: "999800000",
      planArtifactId: "11".repeat(32),
      txId: "20".repeat(32),
      previousState: { value: 7 },
      nextState: { value: 12 },
      validation: { structuralPassed: true }
    });

    const hop2Fact = createCovenantTransitionFactArtifact({
      networkId: "simnet",
      covenantId: COVENANT_ID,
      contractName: "Counter",
      artifactSha256: "ee".repeat(32),
      entrypoint: "bump",
      spentOutpoint: { transactionId: "20".repeat(32), index: 0 },
      successorOutpoint: { transactionId: "30".repeat(32), index: 0 },
      successorAmountSompi: "999600000",
      planArtifactId: "22".repeat(32),
      txId: "30".repeat(32),
      previousState: { value: 12 },
      nextState: { value: 20 },
      validation: { structuralPassed: true }
    });

    const txs: CovenantLineageTx[] = [
      {
        txId: "10".repeat(32),
        kind: "genesis",
        sources: [{ kind: "covenant-fact", artifactId: "a1".repeat(32) }],
        spends: [`${"01".repeat(32)}:0`],
        outputs: [{ outpoint: `${"10".repeat(32)}:0`, address: "covenant_addr", amountSompi: 1000000000n, declaredState: { value: 7 } }],
        recorded: "confirmed",
        fact: genesisFact
      },
      {
        txId: "20".repeat(32),
        kind: "transition",
        sources: [{ kind: "covenant-fact", artifactId: "a2".repeat(32) }],
        spends: [`${"10".repeat(32)}:0`],
        outputs: [{ outpoint: `${"20".repeat(32)}:0`, address: "covenant_addr", amountSompi: 999800000n, declaredState: { value: 12 } }],
        recorded: "confirmed",
        fact: hop1Fact
      },
      {
        txId: "30".repeat(32),
        kind: "transition",
        sources: [{ kind: "covenant-fact", artifactId: "a3".repeat(32) }],
        spends: [`${"20".repeat(32)}:0`],
        outputs: [{ outpoint: `${"30".repeat(32)}:0`, address: "covenant_addr", amountSompi: 999600000n, declaredState: { value: 20 } }],
        recorded: "confirmed",
        fact: hop2Fact
      }
    ];

    const lineage = reconstructCovenantLineage(COVENANT_ID, txs);
    expect(lineage.transitions.length).toBe(2);
    expect(lineage.tip.length).toBe(1);
    expect(lineage.tip[0]!.outpoint).toBe(`${"30".repeat(32)}:0`);
    expect(lineage.tip[0]!.declaredState).toEqual({ value: 20 });
    expect(lineage.transitions.map((t) => t.fact?.nextState)).toEqual([{ value: 12 }, { value: 20 }]);
  });
});
