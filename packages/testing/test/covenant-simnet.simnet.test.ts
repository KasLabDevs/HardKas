import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import "../src/setup.js";
import {
  createCovenantTestbed,
  startIsolatedSimnet,
  stopIsolatedSimnet,
  inspectCoinbaseMaturity,
  createFundedCovenant,
  executeSimnetCovenantTransition,
  getHardkasFixtureKey,
  SIMNET_CONSENSUS_COINBASE_MATURITY_DAA,
  type IsolatedSimnetSession,
  type CompiledCovenantContract,
  type CovenantUtxoFixture
} from "../src/index.js";
import { loadManagedKaspaWasmSync } from "@hardkas/core";

const repoRoot = path.resolve(__dirname, "../../..");
const ownedCounterPath = path.join(
  repoRoot,
  "examples",
  "09-silver-reference",
  "contracts",
  "owned-counter.sil"
);

describe("Fase 5 · Isolated Simnet Laboratory & Consensus Verification (PRUEBA F)", () => {
  let session: IsolatedSimnetSession;
  let ownedCounter: CompiledCovenantContract;
  let genesisUtxo: CovenantUtxoFixture;
  let afterFirstTransitionUtxo: CovenantUtxoFixture;
  const telemetry: Record<string, any> = {};

  beforeAll(async () => {
    session = await startIsolatedSimnet({ minerFixture: "alice" });
    expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
    const serverInfo = await session.rpc.getServerInfo();
    telemetry.session = {
      sessionId: session.sessionId,
      containerName: session.containerName,
      rpcUrl: session.rpcUrl,
      serverVersion: serverInfo.serverVersion,
      networkId: serverInfo.networkId,
      minerAddress: session.minerAddress
    };

    const k = loadManagedKaspaWasmSync();
    const alicePriv = new k.PrivateKey(getHardkasFixtureKey("alice"));
    const aliceXOnly = String(alicePriv.toPublicKey().toXOnlyPublicKey().toString()).toLowerCase();

    const testbed = createCovenantTestbed();
    const source = fs.readFileSync(ownedCounterPath, "utf8");
    ownedCounter = await testbed.compileContract({
      source,
      sourceFile: "owned-counter.sil",
      constructorArgs: [`0x${aliceXOnly}`, 7n]
    });
  }, 120_000);

  afterAll(async () => {
    if (session) {
      await stopIsolatedSimnet(session);
      telemetry.stoppedCleanly = true;
      console.log("[SIMNET_AUDIT_EVIDENCE]", JSON.stringify(telemetry));
    }
  }, 60_000);

  it("verifies rusty-kaspad v2.1.0 simnet coinbase maturity is 1000 DAA (rejects at +105 DAA, accepts at +1000 DAA)", async () => {
    const audit = await inspectCoinbaseMaturity(session);

    expect(audit.consensusCoinbaseMaturityDaa).toBe(SIMNET_CONSENSUS_COINBASE_MATURITY_DAA);
    expect(audit.consensusCoinbaseMaturityDaa).toBe(1000n);
    expect(audit.kaspaWasmDevnetMaturityDaa).toBe(100n);
    expect(audit.immatureSpendRejected).toBe(true);
    expect(audit.immatureRejectReason.length).toBeGreaterThan(0);
    expect(audit.matureSpendAccepted).toBe(true);
    expect(audit.matureSpendTxId).toMatch(/^[0-9a-f]{64}$/);
    telemetry.maturity = {
      consensusCoinbaseMaturityDaa: audit.consensusCoinbaseMaturityDaa.toString(),
      kaspaWasmDevnetMaturityDaa: audit.kaspaWasmDevnetMaturityDaa.toString(),
      immatureSpendRejected: audit.immatureSpendRejected,
      immatureRejectReason: audit.immatureRejectReason,
      matureSpendAccepted: audit.matureSpendAccepted,
      matureSpendTxId: audit.matureSpendTxId
    };
  }, 90_000);

  it("deploys a funded v1 OwnedCounter genesis UTXO on isolated simnet and confirms indexed covenantId", async () => {
    genesisUtxo = await createFundedCovenant(session, {
      contract: ownedCounter,
      funderFixture: "alice",
      valueSompi: 1_000_000_000n,
      initialState: { value: 7n }
    });

    expect(genesisUtxo.covenantId).toMatch(/^[0-9a-f]{64}$/);
    expect(genesisUtxo.amountSompi).toBe(1_000_000_000n);
    expect(genesisUtxo.state?.value).toEqual({ kind: "int", value: 7n });
    telemetry.genesis = {
      outpoint: `${genesisUtxo.outpoint.transactionId}:${genesisUtxo.outpoint.index}`,
      covenantId: genesisUtxo.covenantId,
      amountSompi: genesisUtxo.amountSompi.toString()
    };
  }, 90_000);

  it("executes legitimate v1 covenant transition (7 -> 12, delta = 5, signed by alice) in real rusty-kaspad consensus", async () => {
    const outcome = await executeSimnetCovenantTransition(session, {
      contract: ownedCounter,
      inputUtxo: genesisUtxo,
      policy: "bump",
      args: [
        { kind: "int", value: 5n },
        { kind: "signer", account: "alice" }
      ],
      nextState: { value: 12n },
      feeSompi: 500_000n,
      computeBudget: 20
    });

    expect(outcome.rejectReason).toBeUndefined();
    expect(outcome.acceptedByNode).toBe(true);
    expect(outcome.confirmedInDag).toBe(true);
    expect(outcome.inputSpentOnNode).toBe(true);
    expect(outcome.successorUtxo).toBeDefined();
    expect(outcome.successorUtxo?.covenantId).toBe(genesisUtxo.covenantId);
    expect(outcome.successorUtxo?.amountSompi).toBe(1_000_000_000n - 500_000n);
    expect(outcome.successorUtxo?.state?.value).toEqual({ kind: "int", value: 12n });

    afterFirstTransitionUtxo = outcome.successorUtxo!;
    telemetry.legitimateTransition = {
      txId: outcome.txId,
      acceptedByNode: outcome.acceptedByNode,
      confirmedInDag: outcome.confirmedInDag,
      inputSpentOnNode: outcome.inputSpentOnNode,
      virtualDaaScoreAfter: outcome.virtualDaaScoreAfter?.toString(),
      successorOutpoint: `${afterFirstTransitionUtxo.outpoint.transactionId}:${afterFirstTransitionUtxo.outpoint.index}`,
      successorAmountSompi: afterFirstTransitionUtxo.amountSompi.toString(),
      successorCovenantId: afterFirstTransitionUtxo.covenantId
    };
  }, 60_000);

  it("rejects unauthorized signer, invalid delta (0), wrong successor state, and tampered covenantId in real rusty-kaspad consensus", async () => {
    // 1. Unauthorized signer (bob instead of alice)
    const badSigOutcome = await executeSimnetCovenantTransition(session, {
      contract: ownedCounter,
      inputUtxo: afterFirstTransitionUtxo,
      policy: "bump",
      args: [
        { kind: "int", value: 5n },
        { kind: "signer", account: "bob" }
      ],
      nextState: { value: 17n }
    });
    expect(badSigOutcome.acceptedByNode).toBe(false);
    expect(badSigOutcome.confirmedInDag).toBe(false);
    expect(badSigOutcome.inputSpentOnNode).toBe(false);

    // 2. Invalid contract invariant (delta = 0)
    const zeroDeltaOutcome = await executeSimnetCovenantTransition(session, {
      contract: ownedCounter,
      inputUtxo: afterFirstTransitionUtxo,
      policy: "bump",
      args: [
        { kind: "int", value: 0n },
        { kind: "signer", account: "alice" }
      ],
      nextState: { value: 12n }
    });
    expect(zeroDeltaOutcome.acceptedByNode).toBe(false);
    expect(zeroDeltaOutcome.confirmedInDag).toBe(false);
    expect(zeroDeltaOutcome.inputSpentOnNode).toBe(false);

    // 3. Wrong successor state (delta = 5, 12 -> 999)
    const wrongStateOutcome = await executeSimnetCovenantTransition(session, {
      contract: ownedCounter,
      inputUtxo: afterFirstTransitionUtxo,
      policy: "bump",
      args: [
        { kind: "int", value: 5n },
        { kind: "signer", account: "alice" }
      ],
      nextState: { value: 999n }
    });
    expect(wrongStateOutcome.acceptedByNode).toBe(false);
    expect(wrongStateOutcome.confirmedInDag).toBe(false);
    expect(wrongStateOutcome.inputSpentOnNode).toBe(false);

    // 4. Tampered covenantId on successor output
    const tamperedCovIdOutcome = await executeSimnetCovenantTransition(session, {
      contract: ownedCounter,
      inputUtxo: afterFirstTransitionUtxo,
      policy: "bump",
      args: [
        { kind: "int", value: 5n },
        { kind: "signer", account: "alice" }
      ],
      nextState: { value: 17n },
      overrideSuccessorCovenantId: "ff".repeat(32)
    });
    expect(tamperedCovIdOutcome.acceptedByNode).toBe(false);
    expect(tamperedCovIdOutcome.confirmedInDag).toBe(false);
    expect(tamperedCovIdOutcome.inputSpentOnNode).toBe(false);
    telemetry.rejections = {
      unauthorizedSigner: badSigOutcome.rejectReason,
      zeroDelta: zeroDeltaOutcome.rejectReason,
      wrongSuccessorState: wrongStateOutcome.rejectReason,
      tamperedCovenantId: tamperedCovIdOutcome.rejectReason
    };
  }, 60_000);
});
