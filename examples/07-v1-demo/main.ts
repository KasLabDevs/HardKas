import { Hardkas } from "@hardkas/sdk";
import path from "node:path";
import process from "node:process";

async function main() {
  console.log("Starting HardKAS V1 Tx Demo...");
  
  // Use local provider which points to vendor/kaspa-wasm
  const wasmPath = path.join(process.cwd(), "vendor", "kaspa-wasm");
  console.log(`Using WASM path: ${wasmPath}`);
  
  const sdk = await Hardkas.open({
    cwd: process.cwd(),
    network: "simnet",
    autoBootstrap: true,
    wasm: { 
      provider: "local",
      path: wasmPath
    }
  });

  try {
    // 1. Verify V1 capabilities
    const capabilities = await sdk.capabilities.probeEnvironment();
    console.log("Capabilities:", JSON.stringify(capabilities.kaspa, null, 2));
    if (!capabilities.kaspa.signingV1) {
      throw new Error("WASM environment does not support V1 signing");
    }

    // 2. Resolve accounts from the bootstrap (alice / bob)
    const fromAccount = await sdk.accounts.resolve("alice");
    const toAccount = await sdk.accounts.resolve("bob");
    console.log(`From: ${fromAccount.name} → ${fromAccount.address}`);
    console.log(`To:   ${toAccount.name} → ${toAccount.address}`);

    // 3. Start node with miner targeting the from account
    console.log("Resetting and starting node with miner...");
    await sdk.node.reset();
    await sdk.node.start({ mineTo: fromAccount.address });

    // 4. Wait for coinbase maturity
    console.log("Waiting for coinbase maturity (100 DAA blocks)...");
    await sdk.node.fundDevWallets([fromAccount.address!], { timeoutMs: 300_000 });
    const balance = await sdk.rpc.getBalanceByAddress(fromAccount.address!);
    console.log(`Balance: ${String(balance)}`);
    
    // 5. Build V1 Plan
    console.log("Building V1 Transaction Plan...");
    const planArtifact = await sdk.tx.plan({
      from: "alice",
      to: "bob",
      amount: 100_000_000n, // 1 KAS
      version: 1
    });

    console.log("Plan created successfully!");
    console.log("Estimated Fee:", planArtifact.estimatedFeeSompi);

    // 6. Sign
    console.log("Signing V1 Transaction...");
    const signedTx = await sdk.tx.sign(planArtifact, "alice");
    console.log("Signed successfully!");

    // 7. Submit
    console.log("Submitting V1 Transaction...");
    const submitResult = await sdk.tx.send(signedTx);
    console.log("==========================================");
    console.log("✅ V1 Transaction Accepted!");
    console.log(`TXID: ${submitResult.transactionId}`);
    console.log("==========================================");

  } catch (error) {
    console.error("Error during V1 Demo:");
    console.error(error);
  } finally {
    console.log("Stopping node...");
    await sdk.node.stop();
  }
}

main().catch(console.error);
