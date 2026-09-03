import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * ADV-01 — Adversarial Tampered Artifact Verification
 *
 * Authority: HardKAS Artifact Engine & Content Hash Verifier
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates tamper detection on canonical artifacts:
 * 1. Build a VALID TxPlanArtifact -> verify MUST PASS.
 * 2. Mutate amountSompi while keeping contentHash unchanged -> verify MUST FAIL.
 * 3. Mutate networkId while keeping contentHash unchanged -> verify MUST FAIL.
 * 4. Mutate output address while keeping contentHash unchanged -> verify MUST FAIL.
 */
export const scenarioAdv01: GateDefinition = {
  id: "ADV-01",
  name: "Adversarial Tampered Artifacts",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer"],
  provides: [],
  run: async (ctx: ExecutionContext) => {
    const assertions: Array<{ name: string; passed: boolean; expected?: any; actual?: any; error?: any }> = [];
    const evidence: string[] = [];
    let status: QualificationStatus = "PASS";

    const code = `
      const testResults = {};

      try {
        const hk = await Hardkas.create({ mode: "developer" });
        const alice = await hk.accounts.resolve("alice");
        const bob = await hk.accounts.resolve("bob");

        // 1. Create a VALID canonical TxPlanArtifact
        const validPlan = await hk.tx.plan({
          from: alice,
          to: bob,
          amount: 5000000000n
        });

        // 2. Verify valid plan PASSES
        let validPassed = false;
        try {
          await hk.artifacts.verify(validPlan, { throwOnInvalid: true });
          validPassed = true;
        } catch (e) {
          validPassed = false;
        }

        // 3. Mutate amountSompi (semantic field) while PRESERVING original contentHash
        const tamperedAmount = {
          ...validPlan,
          amountSompi: "9999999999999999" // Tampered amount
        };

        let amountTamperCaught = false;
        try {
          await hk.artifacts.verify(tamperedAmount, { throwOnInvalid: true });
        } catch (e) {
          amountTamperCaught = true;
        }

        // 4. Mutate networkId while PRESERVING original contentHash
        const tamperedNetwork = {
          ...validPlan,
          networkId: "mainnet" // Tampered network
        };

        let networkTamperCaught = false;
        try {
          await hk.artifacts.verify(tamperedNetwork, { throwOnInvalid: true });
        } catch (e) {
          networkTamperCaught = true;
        }

        // 5. Mutate output recipient address while PRESERVING original contentHash
        const tamperedRecipient = {
          ...validPlan,
          to: { ...validPlan.to, address: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq" }
        };

        let recipientTamperCaught = false;
        try {
          await hk.artifacts.verify(tamperedRecipient, { throwOnInvalid: true });
        } catch (e) {
          recipientTamperCaught = true;
        }

        __emitEvidence({
          validPassed,
          amountTamperCaught,
          networkTamperCaught,
          recipientTamperCaught
        });
      } catch (e) {
        __emitEvidence({ fatalError: e.message, stack: e.stack });
      } finally {
        process.exit(0);
      }
    `;

    const res = await runConsumerScript(ctx, "adv-01-tamper-canonical.js", code);
    evidence.push("ADV-01 RAW OUTPUT:\n" + res.stdout + "\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "ADV-01 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    // ADV-01.A: Valid canonical artifact passes verification
    assertions.push({
      name: "ADV-01.A valid canonical artifact passes artifact verifier",
      passed: d.validPassed === true,
      actual: d.validPassed
    });

    // ADV-01.B: Tampering amountSompi caught by verifier
    assertions.push({
      name: "ADV-01.B mutating amountSompi causes verifier failure",
      passed: d.amountTamperCaught === true,
      actual: d.amountTamperCaught
    });

    // ADV-01.C: Tampering networkId caught by verifier
    assertions.push({
      name: "ADV-01.C mutating networkId causes verifier failure",
      passed: d.networkTamperCaught === true,
      actual: d.networkTamperCaught
    });

    // ADV-01.D: Tampering recipient address caught by verifier
    assertions.push({
      name: "ADV-01.D mutating recipient address causes verifier failure",
      passed: d.recipientTamperCaught === true,
      actual: d.recipientTamperCaught
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
