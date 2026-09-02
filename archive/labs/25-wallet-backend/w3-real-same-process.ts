import { Hardkas } from "@hardkas/sdk";

async function main() {
  console.log("=== Phase 9 W3: Real Same-Process Concurrency Qualification ===");

  const hk = await Hardkas.create({
    network: "simnet",
    autoBootstrap: true,
    policy: { allowPublic: true },
    rpc: { url: "ws://127.0.0.1:18210" }
  });

  try {
    const alice = await hk.accounts.resolve("alice");
    const bob = await hk.accounts.resolve("bob");

    console.log(`[W3-REAL] Connected to Node. DAA: ${(await hk.rpc.getBlockDagInfo()).virtualDaaScore}`);
    
    // Create exactly ONE UTXO for bob so that both concurrent planners MUST pick it.
    console.log(`[W3-REAL] Funding bob with exactly 1 UTXO...`);
    const fundIntent = await hk.tx.plan({ from: alice, amount: "5 KAS", to: bob });
    const fundSigned = await hk.tx.sign(fundIntent, alice);
    await hk.tx.send(fundSigned);
    
    console.log(`[W3-REAL] Waiting for UTXO to be spendable by bob (5s)...`);
    await new Promise(r => setTimeout(r, 5000));

    console.log(`[W3-REAL] 1. Planners executing concurrently for bob...`);
    const [intentA, intentB] = await Promise.all([
      hk.tx.plan({ from: bob, amount: "2 KAS", to: alice }),
      hk.tx.plan({ from: bob, amount: "3 KAS", to: alice })
    ]);

    const outpointsA = intentA.inputs.map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`);
    const outpointsB = intentB.inputs.map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`);
    console.log(`[W3-REAL] Plan A selected outpoints:`, outpointsA);
    console.log(`[W3-REAL] Plan B selected outpoints:`, outpointsB);

    if (outpointsA.join(",") !== outpointsB.join(",")) {
      console.warn("[W3-REAL] WARNING: Planners selected DIFFERENT outpoints! The test may not trigger a conflict.");
    }

    console.log(`[W3-REAL] 2. Signers executing concurrently...`);
    const [signedA, signedB] = await Promise.all([
      hk.tx.sign(intentA, bob),
      hk.tx.sign(intentB, bob)
    ]);

    console.log(`[W3-REAL] Signed A txid:`, signedA.txId || signedA.signedId || "unknown");
    console.log(`[W3-REAL] Signed B txid:`, signedB.txId || signedB.signedId || "unknown");

    console.log(`[W3-REAL] 3. Submit executing concurrently to REAL node...`);
    
    // We send in parallel. One should hit the node first and be accepted, the second will be rejected.
    const results = await Promise.allSettled([
      hk.tx.send(signedA),
      hk.tx.send(signedB)
    ]);

    console.log(`\n[W3-REAL] 4. Results:`);
    
    const resultA = results[0];
    const resultB = results[1];
    
    let aTxId = null;
    let bTxId = null;

    if (resultA.status === 'fulfilled') {
      aTxId = resultA.value.txId;
      console.log(`[W3-REAL] A RPC result: ACCEPTED, receipt: ${resultA.value.txId}`);
    } else {
      console.log(`[W3-REAL] A RPC result: REJECTED, error: ${resultA.reason.message}`);
    }

    if (resultB.status === 'fulfilled') {
      bTxId = resultB.value.txId;
      console.log(`[W3-REAL] B RPC result: ACCEPTED, receipt: ${resultB.value.txId}`);
    } else {
      console.log(`[W3-REAL] B RPC result: REJECTED, error: ${resultB.reason.message}`);
    }

    // Verify receipts
    console.log(`\n[W3-REAL] 5. Artifacts State Analysis:`);
    
    let receiptA = null;
    let receiptB = null;
    if (resultA.status === 'fulfilled') {
       receiptA = await hk.artifacts.read(resultA.value.artifactId).catch(() => null);
    }
    if (resultB.status === 'fulfilled') {
       receiptB = await hk.artifacts.read(resultB.value.artifactId).catch(() => null);
    }

    console.log(`[W3-REAL] Receipt A status (in store):`, receiptA?.status || "NOT_FOUND");
    console.log(`[W3-REAL] Receipt B status (in store):`, receiptB?.status || "NOT_FOUND");

    // Also check mempool directly
    try {
      const mempool = await hk.rpc.getMempoolEntries({});
      console.log(`[W3-REAL] Mempool entries:`, mempool.entries?.length || 0);
      const mempoolTxIds = mempool.entries?.map((e: any) => e.transaction.id) || [];
      if (aTxId && mempoolTxIds.includes(aTxId)) console.log(`[W3-REAL] A is in mempool`);
      if (bTxId && mempoolTxIds.includes(bTxId)) console.log(`[W3-REAL] B is in mempool`);
    } catch (e) {
      console.log(`[W3-REAL] Could not read mempool:`, e.message);
    }

  } catch (e) {
    console.error("Test failed ungracefully:", e);
  } finally {
    await hk.rpc.close();
  }
}

main();
