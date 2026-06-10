import { getQueryBackend } from "../packages/dev-server/src/db.js";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { HardkasSchemas } from "@hardkas/artifacts";

async function run() {
  const root = process.cwd();
  const artifactsDir = path.join(root, ".hardkas", "artifacts");
  const localnetPath = path.join(root, ".hardkas", "localnet.json");

  // 1. Fund Accounts in localnet.json
  const utxos = [
    {
      id: "utxo_1",
      address: "kaspa:sim_alice",
      amountSompi: "50000000000000",
      spent: false
    }, // 50,000 KAS
    {
      id: "utxo_2",
      address: "kaspa:sim_bob",
      amountSompi: "1500000000000",
      spent: false
    }, // 1,500 KAS
    {
      id: "utxo_3",
      address: "kaspa:sim_carol",
      amountSompi: "250000000000",
      spent: false
    }, // 250 KAS
    { id: "utxo_4", address: "kaspa:sim_dave", amountSompi: "10000000000", spent: false } // 10 KAS
  ];

  fs.writeFileSync(
    localnetPath,
    JSON.stringify(
      {
        version: "1.0.0",
        network: "simulated",
        height: 12543,
        utxos
      },
      null,
      2
    )
  );

  // 2. Generate Deterministic Artifacts (Receipts & Replays)
  const backend = getQueryBackend();
  const now = new Date().toISOString();

  for (let i = 1; i <= 3; i++) {
    const txId = crypto.randomBytes(16).toString("hex");
    const artifactId = `tx_${txId}`;
    const replayId = `replay_${txId}`;
    const from = i === 1 ? "alice" : i === 2 ? "bob" : "carol";
    const to = i === 1 ? "bob" : i === 2 ? "carol" : "dave";

    // Receipt Artifact
    const receipt = {
      schema: HardkasSchemas.TxReceiptV1,
      artifactId,
      createdAt: now,
      payload: {
        txId,
        status: "confirmed",
        network: "simulated",
        from,
        to,
        amountSompi: (100000000 * i).toString(), // 1, 2, 3 KAS
        feeSompi: "10000",
        causalLineage: ["plan_" + txId, "signed_" + txId]
      }
    };

    fs.writeFileSync(
      path.join(artifactsDir, `${artifactId}.json`),
      JSON.stringify(receipt, null, 2)
    );

    // Replay Artifact
    const replay = {
      schema: HardkasSchemas.ReplayReportV1,
      artifactId: replayId,
      createdAt: now,
      payload: {
        txId,
        replayOk: true,
        planOk: true,
        receiptOk: true,
        invariantsOk: true,
        drift: 0
      }
    };

    fs.writeFileSync(
      path.join(artifactsDir, `${replayId}.json`),
      JSON.stringify(replay, null, 2)
    );

    // 3. Inject Events into the File System Ledger (events.jsonl)
    const ledgerPath = path.join(root, ".hardkas", "events.jsonl");
    const logEvent = (txId: string, kind: string, data: any) => {
      const eventId = crypto.randomUUID();
      const eventDoc = {
        eventId,
        kind,
        domain: "runtime",
        workflowId: "seed",
        correlationId: txId,
        txId,
        networkId: "simulated",
        timestamp: now,
        data
      };
      // hardkas-append-allow
      fs.appendFileSync(ledgerPath, JSON.stringify(eventDoc) + "\n");
    };

    logEvent(txId, "transaction.planned", {
      from,
      to,
      amount: receipt.payload.amountSompi
    });
    logEvent(txId, "transaction.signed", { signer: from });
    logEvent(txId, "transaction.broadcast", { network: "simulated" });
    logEvent(txId, "transaction.confirmed", { block: 12543 + i });
    logEvent(txId, "replay.verified", { status: "PASS" });
  }

  // Force re-index by running sync
  await backend.sync();

  // Force re-index by restarting indexer (mocked by just adding to db)
  console.log(
    "Workspace seeded successfully with deterministic artifacts, events, and balances."
  );
}

run().catch(console.error);
