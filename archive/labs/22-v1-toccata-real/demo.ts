import { Hardkas } from "../../packages/sdk/src/index.ts";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

async function run() {
  console.log("Loading HardKAS with local WASM provider (v2.0.1)...");
  
  const sdk = await Hardkas.create({
    cwd: process.cwd(),
    network: "simnet",
    wasm: {
      provider: "local",
      path: path.join(process.cwd(), "vendor", "kaspa-wasm")
    }
  });

  // Load kaspa wasm dynamically
  const kaspaPath = "file:///" + path.join(process.cwd(), "vendor", "kaspa-wasm", "kaspa.js").replace(/\\/g, "/");
  const kaspa = await import(kaspaPath);

  const privKeyBytes = new Uint8Array(32);
  crypto.getRandomValues(privKeyBytes);
  const privHex = Array.from(privKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const privateKey = new kaspa.PrivateKey(privHex);
  const address = privateKey.toAddress("simnet");
  console.log(`Miner address: ${address.toString()}`);
  await sdk.node.start({
    mineTo: address.toString(),
    reset: true
  });

  try {
    const status = await sdk.node.status();
    const rpcUrl = status.rpcUrl;
    if (!rpcUrl) throw new Error("No RPC URL available");

    console.log(`Connected to local node at ${rpcUrl}`);

    const utxoProvider = {
      getUtxos: async (addr: string) => {
        const res = await sdk.rpc.getUtxosByAddress(addr);
        return res.map((u: any) => ({
          outpoint: {
            transactionId: u.outpoint.transactionId,
            index: u.outpoint.index
          },
          address: addr,
          amountSompi: BigInt(u.utxoEntry.amount),
          scriptPublicKey: u.utxoEntry.scriptPublicKey.scriptPublicKey,
          blockDaaScore: BigInt(u.utxoEntry.blockDaaScore),
          isCoinbase: u.utxoEntry.isCoinbase
        }));
      },
      getVirtualDaaScore: async () => {
        const dagInfo = await sdk.rpc.getBlockDagInfo();
        return BigInt(dagInfo?.virtualDaaScore || 0n);
      },
      getNodeVersion: async () => {
        try {
          const info = await sdk.rpc.getServerInfo();
          return info?.serverVersion || "2.0.0";
        } catch {
          return "2.0.0";
        }
      }
    };

    const initialDagInfo = await sdk.rpc.getBlockDagInfo();
    const startScore = BigInt(initialDagInfo?.virtualDaaScore || 0n);

    console.log("Mining blocks (cpuminer running)...");
    let balanceSompi = 0n;
    while (true) {
      const balanceRes = await sdk.rpc.getBalanceByAddress(address.toString());
      balanceSompi = BigInt(balanceRes?.balanceSompi || 0n);

      const dagInfo = await sdk.rpc.getBlockDagInfo();
      const virtualDaaScore = BigInt(dagInfo?.virtualDaaScore || 0n);
      
      if (virtualDaaScore >= startScore + 1050n && balanceSompi > 1000n) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`Balance reached: ${balanceSompi} sompi. Pausing cpuminer...`);
    await sdk.node.pauseMining();
    
    console.log("Cpuminer paused. Waiting for DAG and mempool to fully settle...");
    const settlement = await sdk.node.waitForSettlement({
      stableSamples: 3,
      intervalMs: 1000,
      timeoutMs: 30000
    });
    console.log(`Settled: ${settlement.evidence} after ${settlement.samples} samples.`);

    console.log(`Balance: ${balanceSompi} sompi`);

    if (balanceSompi === 0n) {
      throw new Error("Failed to mine blocks.");
    }

    const { KaspaWasmPrivateKeySigner } = await import("../../packages/accounts/src/kaspa-wasm-signer.ts");
    const { ComputeGrams } = await import("../../packages/core/src/index.ts");

    const signer = new KaspaWasmPrivateKeySigner({
      account: {
        name: "miner",
        address: address.toString(),
        kind: "kaspa-private-key",
        privateKey: privHex
      },
      wasmConfig: {
        provider: "local",
        path: path.join(process.cwd(), "vendor", "kaspa-wasm")
      }
    });

    const destPrivKeyBytes = new Uint8Array(32);
    crypto.getRandomValues(destPrivKeyBytes);
    const destHex = Array.from(destPrivKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const destPrivKey = new kaspa.PrivateKey(destHex);
    const destAddress = destPrivKey.toAddress("simnet").toString();

    console.log("Building V0 Transaction to test UTXOs...");
    
    let v0Success = false;
    let attempts = 0;
    while (!v0Success && attempts < 5) {
      attempts++;
      try {
        const txPlanV0 = await sdk.tx.plan({
          from: address.toString(),
          to: destAddress,
          amount: 100_000_000n,
          version: 0
        });

        const v0Utxo = txPlanV0.inputs[0];
        const dagInfoBeforeSubmit = await sdk.rpc.getBlockDagInfo();
        const currentVirtualDaa = BigInt(dagInfoBeforeSubmit?.virtualDaaScore || 0n);
        console.log(`V0 Selected UTXO (Attempt ${attempts}):`, {
          txid: v0Utxo.outpoint.transactionId,
          index: v0Utxo.outpoint.index,
          blockDaa: v0Utxo.blockDaaScore?.toString(),
          virtualDaa: currentVirtualDaa.toString(),
          maturity: (currentVirtualDaa - BigInt(v0Utxo.blockDaaScore || 0n)).toString()
        });

        console.log("Submitting V0 Transaction...");
        const signedTxV0 = await signer.signTxPlan({
          planArtifact: txPlanV0,
          accountName: "miner"
        });

        const submitResultV0 = await sdk.rpc.submitTransaction(
          signedTxV0.signedTransaction.payload,
          false
        );
        
        console.log("✅ V0 Transaction accepted:", submitResultV0);
        v0Success = true;
      } catch (err: any) {
        console.error(`Attempt ${attempts} failed:`, err.message);
        if (err.message.includes("orphan") || err.message.includes("is not standard")) {
          console.log("Waiting 3 seconds before retrying...");
          await new Promise(r => setTimeout(r, 3000));
        } else {
          throw err;
        }
      }
    }
    
    if (!v0Success) {
      throw new Error("V0 transaction failed after all attempts.");
    }
    
    console.log("Building V1 Transaction...");
    let v1Success = false;
    attempts = 0;
    while (!v1Success && attempts < 5) {
      attempts++;
      try {
        const txPlanV1 = await sdk.tx.plan({
          from: address.toString(),
          to: destAddress,
          amount: 50_000_000n,
          version: 1,
          computeBudget: ComputeGrams.fromScriptUnits(100_000n)
        });

        const v1Utxo = txPlanV1.inputs[0];
        const dagInfoBeforeSubmit = await sdk.rpc.getBlockDagInfo();
        const currentVirtualDaa = BigInt(dagInfoBeforeSubmit?.virtualDaaScore || 0n);
        console.log(`V1 Selected UTXO (Attempt ${attempts}):`, {
          txid: v1Utxo.outpoint.transactionId,
          index: v1Utxo.outpoint.index,
          blockDaa: v1Utxo.blockDaaScore?.toString(),
          virtualDaa: currentVirtualDaa.toString(),
          maturity: (currentVirtualDaa - BigInt(v1Utxo.blockDaaScore || 0n)).toString()
        });

        console.log("Submitting V1 Transaction...");
        const signedTxV1 = await signer.signTxPlan({
          planArtifact: txPlanV1,
          accountName: "miner"
        });

        const submitResultV1 = await sdk.rpc.submitTransaction(
          signedTxV1.signedTransaction.payload,
          false
        );
        
        console.log("✅ V1 Transaction accepted:", submitResultV1);
        v1Success = true;
      } catch (err: any) {
        console.error(`V1 Attempt ${attempts} failed:`, err.message);
        if (err.message.includes("orphan") || err.message.includes("is not standard") || err.message.includes("gas") || err.message.includes("fee")) {
          console.log("Waiting 3 seconds before retrying V1...");
          await new Promise(r => setTimeout(r, 3000));
        } else {
          throw err;
        }
      }
    }
    
    if (!v1Success) {
      throw new Error("V1 transaction failed after all attempts.");
    }
    
    console.log("Demo completed successfully. V0 and V1 transactions accepted in Toccata Simnet!");

  } catch (err) {
    console.error("Error during lab execution:", err);
    throw err;
  } finally {
    console.log("Shutting down localnet...");
    await sdk.node.stop();
  }
}

run().catch(e => {
  console.error("Error running lab:", e);
  process.exit(1);
});
