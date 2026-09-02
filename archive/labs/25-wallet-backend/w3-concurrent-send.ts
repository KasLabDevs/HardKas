import { Hardkas } from "@hardkas/sdk";
import { MockRpcProvider } from "./test/mock-rpc";
import { resolve } from "path";

async function main() {
  console.log("=== W3: Diagnostic Characterization of Concurrent Submits ===");

  // We'll mock the provider to return 1 UTXO, just like W2.
  // But we need to intercept submitTransaction to simulate a network rejection for the second submit.
  const provider = new MockRpcProvider();
  
  const hk = await Hardkas.create({
    network: "simnet",
    autoBootstrap: true,
    policy: { allowPublic: true },
    rpc: { provider: provider as any }
  });

  try {
    const alice = await hk.accounts.resolve("alice");
    const bob = await hk.accounts.resolve("bob");
    const address = alice.address;

    // We intercept the query method to simulate exactly 1 spendable UTXO
    hk.query.getSpendableUtxos = async () => {
      return {
        data: [
          {
            address: address.toString(),
            outpoint: { transactionId: "0000000000000000000000000000000000000000000000000000000000000001", index: 0 },
            amountSompi: "5000000000", // 50 KAS
            scriptPublicKey: "00"
          }
        ]
      } as any;
    };

    // Mock RPC methods
    hk.rpc.getBlockDagInfo = async () => ({ virtualDaaScore: "100", sink: "hash1" } as any);
    hk.rpc.getFeeEstimate = async () => ({ priorityBucket: { feePerMass: "1" }, normalBucket: { feePerMass: "1" }, lowBucket: { feePerMass: "1" } } as any);
    hk.rpc.getCurrentNetwork = async () => ({ networkId: "simnet" } as any);
    hk.rpc.connect = async () => {};
    hk.rpc.disconnect = async () => {};
    Object.defineProperty(hk.rpc, 'isConnected', { get: () => true });

    let submitCount = 0;
    
    // Intercept submitTransaction at the RPC level to characterize rejection
    hk.rpc.submitTransaction = async (tx: any) => {
      const order = ++submitCount;
      console.log(`[W3] Submit ${order} started for txid: ${tx.transaction?.id || 'unknown'}`);
      
      // Simulate network latency
      await new Promise(r => setTimeout(r, Math.random() * 50));
      
      if (order === 1) {
        console.log(`[W3] Submit ${order} completing: ACCEPTED`);
        return { transactionId: tx.transaction?.id || "txid1" } as any;
      } else {
        console.log(`[W3] Submit ${order} completing: REJECTED (Double Spend)`);
        throw new Error("SubmitTransactionResponseMessage: INPUT_CONFLICT: Transaction spends an already spent outpoint");
      }
    };

    console.log(`[W3] 1. Planners executing concurrently...`);
    const [intentA, intentB] = await Promise.all([
      hk.tx.plan({ from: alice, amount: "10 KAS", to: bob }),
      hk.tx.plan({ from: alice, amount: "15 KAS", to: bob })
    ]);

    const outpointsA = intentA.inputs.map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`);
    const outpointsB = intentB.inputs.map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`);
    console.log(`[W3] Plan A selected outpoints:`, outpointsA);
    console.log(`[W3] Plan B selected outpoints:`, outpointsB);

    console.log(`[W3] 2. Signers executing concurrently... (mocked)`);
    // Mock the sign function so we don't need real WASM keys
    hk.tx.sign = async (intent: any) => {
      const signed = JSON.parse(JSON.stringify(intent));
      signed.schema = "hardkas.signedTx";
      signed.status = "signed";
      signed.sourcePlanId = intent.planId;
      signed.signedId = intent.planId.replace("plan-", "signed-");
      signed.signedTransaction = { 
        id: intent.planId.replace("plan-", "tx-"),
        payload: "00000000" // mock payload
      };
      
      // Store the plan in artifacts so the semantic verifier finds it
      await hk.artifacts.write(intent);
      
      return signed;
    };

    // Mock verify to avoid hash mismatch and schema invalidation for our mocked sign
    const originalVerify = hk.artifacts.verify.bind(hk.artifacts);
    hk.artifacts.verify = async (artifact: any, options: any) => {
      if (artifact.schema === "hardkas.signedTx") return;
      return originalVerify(artifact, options);
    };

    const [signedA, signedB] = await Promise.all([
      hk.tx.sign(intentA),
      hk.tx.sign(intentB)
    ]);

    console.log(`[W3] Signed A txid:`, signedA.signedTransaction.id);
    console.log(`[W3] Signed B txid:`, signedB.signedTransaction.id);

    console.log(`[W3] 3. Submit executing concurrently...`);
    
    // We run both submits concurrently to see what happens
    const results = await Promise.allSettled([
      hk.tx.send(signedA),
      hk.tx.send(signedB)
    ]);

    console.log(`[W3] 4. Results:`);
    
    // Analyze results
    const resultA = results[0];
    const resultB = results[1];

    if (resultA.status === 'fulfilled') {
      console.log(`[W3] A RPC result: ACCEPTED, receipt: ${resultA.value.txId}`);
    } else {
      console.log(`[W3] A RPC result: REJECTED, error: ${resultA.reason.message}`);
    }

    if (resultB.status === 'fulfilled') {
      console.log(`[W3] B RPC result: ACCEPTED, receipt: ${resultB.value.txId}`);
    } else {
      console.log(`[W3] B RPC result: REJECTED, error: ${resultB.reason.message}`);
    }

    // Verify receipts
    console.log(`[W3] 5. Artifacts State Analysis:`);
    const receiptA = await hk.artifacts.read(signedA.contentHash).catch(() => null);
    const receiptB = await hk.artifacts.read(signedB.contentHash).catch(() => null);

    console.log(`[W3] Receipt A status (in store):`, receiptA?.metadata?.status || "NOT_FOUND");
    console.log(`[W3] Receipt B status (in store):`, receiptB?.metadata?.status || "NOT_FOUND");

  } catch (e) {
    console.error("Test failed ungracefully:", e);
  } finally {
    await hk.rpc.close();
  }
}

main();
