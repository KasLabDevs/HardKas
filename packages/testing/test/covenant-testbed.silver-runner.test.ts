import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import "../src/setup.js";
import {
  createCovenantTestbed,
  type CompiledCovenantContract
} from "../src/index.js";

const repoRoot = path.resolve(__dirname, "../../..");
const ownedCounterPath = path.join(
  repoRoot,
  "examples",
  "09-silver-reference",
  "contracts",
  "owned-counter.sil"
);

const GUARDED_VAULT_COUNTER_SIL = `pragma silverscript ^0.1.0;

contract GuardedVaultCounter(pubkey owner, int init_value, int max_fee) {
    int value = init_value;

    #[covenant(binding = auth, from = 1, to = 1, mode = transition)]
    function bump(State prev_state, int delta, sig s) : (State) {
        require(checkSig(s, owner));
        require(delta > 0);
        int out_idx = OpAuthOutputIdx(this.activeInputIndex, 0);
        require(tx.outputs[out_idx].value >= tx.inputs[this.activeInputIndex].value - max_fee);
        return(State { value: prev_state.value + delta });
    }
}
`;

describe("Fase 1 & 2 · Covenant Testbed & Kaspa Script VM Debugger (PRUEBAS A, B, C, D)", () => {
  const ownedCounterSource = fs.readFileSync(ownedCounterPath, "utf8");
  let testbed: ReturnType<typeof createCovenantTestbed>;
  let ownedCounter: CompiledCovenantContract;
  let guardedVault: CompiledCovenantContract;

  beforeAll(async () => {
    testbed = createCovenantTestbed();
    const ownerAcct = testbed.getAccount("owner");

    ownedCounter = await testbed.compileContract({
      source: ownedCounterSource,
      sourceFile: "owned-counter.sil",
      constructorArgs: [`0x${ownerAcct.xOnlyPublicKey}`, 10n]
    });

    guardedVault = await testbed.compileContract({
      source: GUARDED_VAULT_COUNTER_SIL,
      sourceFile: "guarded-vault-counter.sil",
      constructorArgs: [`0x${ownerAcct.xOnlyPublicKey}`, 10n, 500_000n]
    });
  });

  it("PRUEBA A (Anti-False-Positive Proof): invalid transition (delta = 0) passes SYNTHETIC structural checks but is REJECTED by SCRIPT_VM at .sil:14:9", async () => {
    const genesis = await testbed.deployGenesis({
      contract: ownedCounter,
      initialState: { value: 10n },
      amountSompi: 1_000_000_000n
    });

    // 1. Evaluate ONLY on SYNTHETIC (FakeNode / structural v1 validator):
    // The transaction shape, signature slot, and state_span encoding are structurally valid!
    const syntheticOnly = await testbed.executeTransition({
      contract: ownedCounter,
      utxo: genesis.utxo,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 0n },
        { kind: "signer", signer: "owner" }
      ],
      nextStates: [{ state: { value: 10n } }],
      backends: ["SYNTHETIC"]
    });

    expect(syntheticOnly.structuralPassed).toBe(true);
    expect(syntheticOnly.status).toBe("SYNTHETIC_PASS");
    expect(syntheticOnly.evidenceLevel).toBe("SYNTHETIC");
    // Matcher MUST refuse SYNTHETIC-only passes by default so structural tests cannot pose as contract-validated
    expect(() => expect(syntheticOnly).toPassCovenantTransition()).toThrow(
      /passed structural checks only/
    );
    expect(syntheticOnly).toPassCovenantTransition({ allowSyntheticOnly: true });

    // 2. Evaluate on SCRIPT_VM (official SilverScript cli-debugger / kaspa-txscript):
    // The VM executes the compiled bytecode and rejects `require(delta > 0);` at line 14!
    const vmEvaluated = await testbed.executeTransition({
      contract: ownedCounter,
      utxo: genesis.utxo,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 0n },
        { kind: "signer", signer: "owner" }
      ],
      nextStates: [{ state: { value: 10n } }],
      backends: ["SYNTHETIC", "SCRIPT_VM"]
    });

    expect(vmEvaluated.structuralPassed).toBe(true);
    expect(vmEvaluated.passed).toBe(false);
    expect(vmEvaluated.status).toBe("SCRIPT_VM_FAIL");
    expect(vmEvaluated.evidenceLevel).toBe("SCRIPT_VM");
    expect(vmEvaluated).toRejectCovenantTransition("require(delta > 0)");
    expect(vmEvaluated).toRejectWithScriptError(14);
    expect(vmEvaluated.diagnostic?.sourceLocationStatus).toBe("RESOLVED");
    expect(vmEvaluated.diagnostic?.location?.line).toBe(14);
    expect(vmEvaluated.diagnostic?.location?.column).toBe(9);
    expect(vmEvaluated.diagnostic?.variables.delta).toBe("0");
  });

  it("PRUEBA B (Legitimate Transition & Step Trace): OwnedCounter bump 10 -> 15 signed by owner passes SYNTHETIC and SCRIPT_VM with full trace", async () => {
    const genesis = await testbed.deployGenesis({
      contract: ownedCounter,
      initialState: { value: 10n },
      amountSompi: 1_000_000_000n
    });

    const result = await testbed.executeTransition({
      contract: ownedCounter,
      utxo: genesis.utxo,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 5n },
        { kind: "signer", signer: "owner" }
      ],
      nextStates: [{ state: { value: 15n } }],
      captureTrace: true
    });

    expect(result).toPassCovenantTransition();
    expect(result).toHaveCovenantState({ value: 15n });
    expect(result).toPreserveCovenantId(genesis.covenantId);
    expect(result).toProduceSuccessor(1);
    expect(result).toConsumeComputeWithin(200_000);
    expect(result.vmResult?.trace?.length).toBeGreaterThan(0);
  });

  it("PRUEBA C (Authorization): rejects wrong account at SYNTHETIC preflight and rejects forged signature in SCRIPT_VM at .sil:13:9", async () => {
    const genesis = await testbed.deployGenesis({
      contract: ownedCounter,
      initialState: { value: 10n },
      amountSompi: 1_000_000_000n
    });

    // 1. Wrong account named in plan -> rejected by F1.4 structural validator before reading private keys
    const wrongAccountRes = await testbed.executeTransition({
      contract: ownedCounter,
      utxo: genesis.utxo,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 5n },
        { kind: "signer", signer: "mallory" }
      ],
      nextStates: [{ state: { value: 15n } }]
    });

    expect(wrongAccountRes.passed).toBe(false);
    expect(wrongAccountRes.structuralPassed).toBe(false);
    expect(wrongAccountRes.structuralErrorCode).toBe("SIGNER_SLOT_KEY_MISMATCH");
    expect(wrongAccountRes).toRejectCovenantTransition("SIGNER_SLOT_KEY_MISMATCH");

    // 2. Forged signature (mallory's private key signing for owner's slot) -> rejected by Kaspa Script VM at line 13
    const mallory = testbed.getAccount("mallory");
    const forgedSigRes = await testbed.executeTransition({
      contract: ownedCounter,
      utxo: genesis.utxo,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 5n },
        {
          kind: "signer",
          signer: "owner",
          overridePrivateKeyHex: mallory.privateKeyHex
        }
      ],
      nextStates: [{ state: { value: 15n } }]
    });

    expect(forgedSigRes.passed).toBe(false);
    expect(forgedSigRes.status).toBe("SCRIPT_VM_FAIL");
    expect(forgedSigRes).toRejectWithScriptError(13);
    expect(forgedSigRes).toRejectWithScriptError("require(checkSig(s, owner))");
  });

  it("PRUEBA D (State Transition, Output Value Guard, and Compute Budget): rejects negative delta, wrong successor state, output value drain, and insufficient compute budget", async () => {
    const genesis = await testbed.deployGenesis({
      contract: ownedCounter,
      initialState: { value: 10n },
      amountSompi: 1_000_000_000n
    });

    // D.1: Negative delta (-3) -> rejected by SCRIPT_VM at line 14
    const negDelta = await testbed.executeTransition({
      contract: ownedCounter,
      utxo: genesis.utxo,
      entrypoint: "bump",
      args: [
        { kind: "int", value: -3n },
        { kind: "signer", signer: "owner" }
      ],
      nextStates: [{ state: { value: 7n } }]
    });
    expect(negDelta).toRejectWithScriptError(14);

    // D.2: Wrong successor state (delta = 5, 10 -> 999) -> passes SYNTHETIC, rejected by SCRIPT_VM covenant wrapper!
    const wrongState = await testbed.executeTransition({
      contract: ownedCounter,
      utxo: genesis.utxo,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 5n },
        { kind: "signer", signer: "owner" }
      ],
      nextStates: [{ state: { value: 999n } }]
    });
    expect(wrongState.structuralPassed).toBe(true);
    expect(wrongState.passed).toBe(false);
    expect(wrongState.status).toBe("SCRIPT_VM_FAIL");
    expect(wrongState).toRejectCovenantTransition();

    // D.3: Output value drain on GuardedVaultCounter (max_fee = 500_000, attempted fee = 1_000_000) ->
    // passes SYNTHETIC, rejected by SCRIPT_VM at line 11!
    const vaultGenesis = await testbed.deployGenesis({
      contract: guardedVault,
      initialState: { value: 10n },
      amountSompi: 1_000_000_000n
    });

    const drainedValue = await testbed.executeTransition({
      contract: guardedVault,
      utxo: vaultGenesis.utxo,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 5n },
        { kind: "signer", signer: "owner" }
      ],
      nextStates: [{ state: { value: 15n } }],
      feeSompi: 1_000_000n // exceeds max_fee (500_000) encoded in the contract!
    });
    expect(drainedValue.structuralPassed).toBe(true);
    expect(drainedValue.passed).toBe(false);
    expect(drainedValue).toRejectWithScriptError(11);
    expect(drainedValue).toRejectWithScriptError(
      "require(tx.outputs[out_idx].value >= tx.inputs[this.activeInputIndex].value - max_fee)"
    );

    // Legitimate fee (300_000 <= 500_000) on GuardedVaultCounter passes SCRIPT_VM!
    const validVault = await testbed.executeTransition({
      contract: guardedVault,
      utxo: vaultGenesis.utxo,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 5n },
        { kind: "signer", signer: "owner" }
      ],
      nextStates: [{ state: { value: 15n } }],
      feeSompi: 300_000n
    });
    expect(validVault).toPassCovenantTransition();
    expect(validVault).toHaveCovenantState({ value: 15n });

    // D.4: Insufficient compute budget (computeBudget = 1) -> rejected with COMPUTE_BUDGET_INSUFFICIENT
    const lowBudget = await testbed.executeTransition({
      contract: guardedVault,
      utxo: validVault.successorUtxos[0]!,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 1n },
        { kind: "signer", signer: "owner" }
      ],
      nextStates: [{ state: { value: 16n } }],
      computeBudget: 1
    });
    expect(lowBudget.passed).toBe(false);
    expect(lowBudget.structuralErrorCode).toBe("COMPUTE_BUDGET_INSUFFICIENT");
    expect(lowBudget).toRejectCovenantTransition("COMPUTE_BUDGET_INSUFFICIENT");

    const jsonReport = testbed.toJsonReport();
    expect(jsonReport.schema).toBe("hardkas.covenantTestReport.v1");
    expect(jsonReport.totalTransitions).toBeGreaterThanOrEqual(7);
  });

  it("PRUEBA 3.E & 3.F (Toolchain Failure Closed & Evidence Level Separation): returns BLOCKED (never PASS) when cli-debugger is missing and refuses SCRIPT_VM when CONSENSUS_SIMNET is required", async () => {
    const blockedBed = createCovenantTestbed({
      runnerPath: "C:/nonexistent/path/to/cli-debugger.exe"
    });
    const ownerAcct = blockedBed.getAccount("owner");
    const contract = await blockedBed.compileContract({
      source: ownedCounterSource,
      sourceFile: "owned-counter.sil",
      constructorArgs: [`0x${ownerAcct.xOnlyPublicKey}`, 10n]
    });
    const genesis = await blockedBed.deployGenesis({
      contract,
      initialState: { value: 10n },
      amountSompi: 1_000_000_000n
    });

    const blockedRes = await blockedBed.executeTransition({
      contract,
      utxo: genesis.utxo,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 5n },
        { kind: "signer", signer: "owner" }
      ],
      nextStates: [{ state: { value: 15n } }],
      backends: ["SYNTHETIC", "SCRIPT_VM"]
    });

    // 3.E: Never returns PASS when cli-debugger is missing
    expect(blockedRes.structuralPassed).toBe(true);
    expect(blockedRes.passed).toBe(false);
    expect(blockedRes.status).toBe("BLOCKED");
    expect(blockedRes.evidenceLevel).toBe("SCRIPT_VM");
    expect(blockedRes.vmResult?.status).toBe("BLOCKED");
    expect(blockedRes.vmResult?.blockedReason).toContain("SILVER_RUNNER_NOT_FOUND");
    expect(() => expect(blockedRes).toPassCovenantTransition()).toThrow(/status "BLOCKED"/);

    // 3.F: A valid SCRIPT_VM transition MUST be rejected by toPassCovenantTransition when minEvidence is CONSENSUS_SIMNET
    const validGenesis = await testbed.deployGenesis({
      contract: ownedCounter,
      initialState: { value: 10n },
      amountSompi: 1_000_000_000n
    });
    const validVmRes = await testbed.executeTransition({
      contract: ownedCounter,
      utxo: validGenesis.utxo,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 5n },
        { kind: "signer", signer: "owner" }
      ],
      nextStates: [{ state: { value: 15n } }]
    });
    expect(validVmRes).toPassCovenantTransition({ minEvidence: "SCRIPT_VM" });
    expect(() =>
      expect(validVmRes).toPassCovenantTransition({ minEvidence: "CONSENSUS_SIMNET" })
    ).toThrow(/evidenceLevel="SCRIPT_VM".*below required "CONSENSUS_SIMNET"/);
  });

  it("PRUEBA 4 (COV-VALUE-001 Concrete Proof): OwnedCounter allows an authorized caller to drain 99% of UTXO sompi value while passing SYNTHETIC and SCRIPT_VM, whereas GuardedVaultCounter rejects the exact same drain in SCRIPT_VM", async () => {
    const mallory = testbed.getAccount("mallory");

    // 1. OwnedCounter (flagged with COV-VALUE-001 because bump does not check tx.outputs[i].value):
    // Spend 10 KAS (1_000_000_000 sompi), leave only 0.1 KAS (10_000_000 sompi) in the covenant successor,
    // and route 9.897 KAS (989_700_000 sompi) to an external output (mallory), paying 300_000 sompi fee.
    const ownedGenesis = await testbed.deployGenesis({
      contract: ownedCounter,
      initialState: { value: 10n },
      amountSompi: 1_000_000_000n
    });

    const ownedDrain = await testbed.executeTransition({
      contract: ownedCounter,
      utxo: ownedGenesis.utxo,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 5n },
        { kind: "signer", signer: "owner" }
      ],
      nextStates: [{ state: { value: 15n }, amountSompi: 10_000_000n }],
      extraOutputs: [{ address: mallory.address, amountSompi: 989_700_000n }],
      feeSompi: 300_000n
    });

    // OwnedCounter passes BOTH SYNTHETIC and SCRIPT_VM because its covenant wrapper only checks
    // successor scriptPubKey (which encodes State { value: 15 }), NOT tx.outputs[0].value!
    expect(ownedDrain.structuralPassed).toBe(true);
    expect(ownedDrain.passed).toBe(true);
    expect(ownedDrain.status).toBe("SCRIPT_VM_PASS");
    expect(ownedDrain.successorUtxos[0]?.amountSompi).toBe(10_000_000n);

    // 2. GuardedVaultCounter (which mitigates COV-VALUE-001 via `require(tx.outputs[out_idx].value >= tx.inputs[this.activeInputIndex].value - max_fee)`):
    // Attempt the exact same 99% value drain -> passes SYNTHETIC, REJECTED by SCRIPT_VM at line 11!
    const guardedGenesis = await testbed.deployGenesis({
      contract: guardedVault,
      initialState: { value: 10n },
      amountSompi: 1_000_000_000n
    });

    const guardedDrain = await testbed.executeTransition({
      contract: guardedVault,
      utxo: guardedGenesis.utxo,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 5n },
        { kind: "signer", signer: "owner" }
      ],
      nextStates: [{ state: { value: 15n }, amountSompi: 10_000_000n }],
      extraOutputs: [{ address: mallory.address, amountSompi: 989_700_000n }],
      feeSompi: 300_000n
    });

    expect(guardedDrain.structuralPassed).toBe(true);
    expect(guardedDrain.passed).toBe(false);
    expect(guardedDrain.status).toBe("SCRIPT_VM_FAIL");
    expect(guardedDrain).toRejectWithScriptError(11);
  });

  it("PRUEBA 5 (Security & Secret Hygiene): never leaks private keys into VM traces, diagnostics, or testbed JSON reports", async () => {
    const ownerAcct = testbed.getAccount("owner");
    const malloryAcct = testbed.getAccount("mallory");
    const g = await testbed.deployGenesis({
      contract: ownedCounter,
      initialState: { value: 10n },
      amountSompi: 1_000_000_000n
    });
    const failedTraceRes = await testbed.executeTransition({
      contract: ownedCounter,
      utxo: g.utxo,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 0n },
        { kind: "signer", signer: "owner" }
      ],
      nextStates: [{ state: { value: 10n } }],
      captureTrace: true
    });

    const serializedResult = JSON.stringify(
      {
        vmResult: failedTraceRes.vmResult,
        diagnostic: failedTraceRes.diagnostic,
        report: testbed.toJsonReport()
      },
      (_k, v) => (typeof v === "bigint" ? v.toString() : v)
    ).toLowerCase();

    expect(serializedResult).not.toContain(ownerAcct.privateKeyHex.toLowerCase());
    expect(serializedResult).not.toContain(malloryAcct.privateKeyHex.toLowerCase());
  });
});
