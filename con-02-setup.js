
import { Hardkas } from "@hardkas/sdk";

function __emitEvidence(data) {
  console.log("\n---EVIDENCE_START---");
  console.log(JSON.stringify(data, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
  console.log("---EVIDENCE_END---\n");
}


      const hk = await Hardkas.create({
        network: "simnet",
        rpc: { endpoints: ["127.0.0.1:18210"] }
      });

      try {
        const alice = await hk.accounts.resolve("alice");
        const singleAcc = await hk.accounts.resolve("dave");

        const plan = await hk.tx.plan({
          from: alice,
          to: singleAcc,
          amount: 10000000000n, // 10 KAS
          feeRate: 100n
        });

        const signed = await hk.tx.sign(plan, { account: alice });
        const sendRes = await hk.tx.send(signed);

        const txId = sendRes.txId || sendRes.receipt?.txId;
        if (txId) {
          try {
            await hk.tx.waitForAccepted({ txId, timeoutMs: 5000, pollIntervalMs: 500 });
          } catch (e) {}
        }

        const utxosRes = await hk.query.utxos(singleAcc.address);
        const utxos = utxosRes.data || [];

        __emitEvidence({
          setupSuccessful: true,
          address: singleAcc.address,
          utxoCount: utxos.length,
          utxoId: utxos[0]?.id || utxos[0]?.outpoint?.transactionId
        });
      } catch (e) {
        __emitEvidence({ setupSuccessful: false, error: String(e.message || e) });
      } finally {
        process.exit(0);
      }
    
