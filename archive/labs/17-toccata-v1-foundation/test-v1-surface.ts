import { getKaspaSigningBackendStatus } from "../../packages/accounts/src/signer-backend.js";
import { buildPaymentPlan } from "../../packages/tx-builder/src/index.js";
import { KaspaWasmPrivateKeySigner } from "../../packages/accounts/src/kaspa-wasm-signer.js";

async function runTest() {
  console.log("Checking Kaspa SDK capabilities...");
  const status = await getKaspaSigningBackendStatus();
  console.log(`Backend Available: ${status.available}`);
  console.log(`V1 Signing Capability: ${status.capabilities.transactionV1Signing}`);

  // 1. Structural Test: Building a plan with V1 fields
  console.log("\n[1] Structural V1 Test (TxBuilder)");
  const plan = buildPaymentPlan({
    fromAddress: "simnet:qrxxxxxxxxx",
    outputs: [
      {
        address: "simnet:qryyyyyyyyy",
        amountSompi: 1000n,
        covenant: "01020304"
      }
    ],
    availableUtxos: [
      {
        outpoint: { transactionId: "0000000000000000000000000000000000000000000000000000000000000000", index: 0 },
        address: "simnet:qrxxxxxxxxx",
        amountSompi: 5000n,
        scriptPublicKey: "20" + "00".repeat(32),
        covenantId: "abcdef"
      }
    ],
    feeRateSompiPerMass: 1n,
    computeBudget: 500
  });

  console.log("TxPlan generated successfully.");
  console.log(`Has computeBudget: ${plan.computeBudget === 500}`);
  console.log(`Has covenant on output: ${plan.outputs[0].covenant === "01020304"}`);

  // 2. Mocking the artifact for the signer
  const artifactMock: any = {
    planId: "test-v1",
    networkId: "simnet",
    mode: "mock",
    from: { address: "simnet:qrxxxxxxxxx" },
    inputs: plan.inputs,
    outputs: plan.outputs,
    change: plan.change,
    estimatedFeeSompi: plan.estimatedFeeSompi,
    computeBudget: plan.computeBudget
  };

  const signer = new KaspaWasmPrivateKeySigner({
    account: {
      name: "test",
      kind: "kaspa-private-key",
      privateKey: "0000000000000000000000000000000000000000000000000000000000000001"
    } as any
  });

  console.log("\n[2] Capability Gateway Test");
  try {
    await signer.signTxPlan({ planArtifact: artifactMock } as any);
    if (!status.capabilities.transactionV1Signing) {
      console.error("❌ FAILED: Should have thrown capability error for V1 fields!");
      process.exit(1);
    } else {
      console.log("✅ Wasm officially supports V1, signed successfully.");
    }
  } catch (err: any) {
    if (err.message.includes("Transaction V1 signing is not supported")) {
      console.log("✅ Expected V1 Capability Exception caught.");
    } else {
      console.error("❌ Unexpected error:", err);
      process.exit(1);
    }
  }
}

runTest().catch(console.error);
