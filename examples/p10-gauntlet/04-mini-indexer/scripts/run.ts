import { Hardkas } from "@hardkas/sdk";
import fs from "fs";
import path from "path";

async function main() {
  const result: any = {
    status: "started",
    events: [],
    errors: []
  };

  try {
    const sdk = await Hardkas.create({ network: "simulated", autoBootstrap: true });
    
    // 1. Generate some traffic
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "2" });
    const signed = await sdk.tx.sign(plan, "alice");
    const sim = await sdk.tx.simulate(signed);
    result.events.push({ step: "traffic_generated", txId: sim.receipt?.txId });

    // 2. Sync the query store
    await sdk.query.sync();
    result.events.push({ step: "store_synced", ok: true });

    // 3. Query the store using SQL
    try {
      const sqlResult = await sdk.query.store.query("SELECT address, sompi FROM utxos WHERE sompi > 0");
      result.events.push({ step: "query_utxos", count: sqlResult.length });
    } catch (err: any) {
      result.events.push({ step: "query_utxos", error: err.message });
    }

    // 4. Malformed SQL query (to test error boundary)
    try {
      await sdk.query.store.query("SELECT * FROM non_existent_table");
      result.events.push({ step: "query_malformed", ok: true }); // Should not happen
    } catch (err: any) {
      result.events.push({ step: "query_malformed", ok: false, error: err.message });
    }

    // 5. Inspect artifacts
    try {
      const artifactsList = await sdk.artifacts.list();
      result.events.push({ step: "list_artifacts", count: artifactsList.length });
      
      if (artifactsList.length > 0) {
        const first = await sdk.artifacts.read(artifactsList[0].contentHash || artifactsList[0].txId);
        result.events.push({ step: "read_artifact", id: first.contentHash || first.txId, schema: first.schema });
      }
    } catch (err: any) {
      result.events.push({ step: "inspect_artifacts", error: err.message });
    }

    result.status = "success";
  } catch (err: any) {
    result.status = "error";
    result.errors.push({
      message: err.message,
      code: err.code || "UNKNOWN",
      stack: err.stack
    });
  }

  const outDir = path.join(process.cwd(), "runs", "latest");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2));

  console.log(JSON.stringify(result, null, 2));
  
  if (result.status === "error") process.exit(1);
}

main().catch(console.error);
