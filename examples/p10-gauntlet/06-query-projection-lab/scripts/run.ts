import { Hardkas } from "@hardkas/sdk";
import { HardkasStore, HardkasIndexer } from "@hardkas/query-store";
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
    
    // 1. Generate some initial traffic
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "5" });
    const signed = await sdk.tx.sign(plan, "alice");
    await sdk.tx.simulate(signed);

    result.events.push({ step: "traffic_generated", planId: plan.planId });

    // 2. Normal sync
    await sdk.query.sync();
    result.events.push({ step: "sync_normal", ok: true });

    // 3. Query the store directly (workaround for App 04 bug)
    const dbPath = path.join(sdk.workspace.root, ".hardkas", "store.db");
    const store = new HardkasStore({ dbPath });
    store.connect({ autoMigrate: false }); // Should already be migrated
    
    try {
      const utxos = store.getDatabase().prepare("SELECT * FROM utxos WHERE sompi > 0").all();
      result.events.push({ step: "direct_query", count: utxos.length });
    } catch (err: any) {
      result.events.push({ step: "direct_query", error: err.message });
    }

    // 4. Intentionally write a garbage JSON file into artifacts to simulate corruption
    const artifactsDir = sdk.workspace.artifactsDir;
    const garbageFile = path.join(artifactsDir, "signedTx-garbage12345.json");
    fs.writeFileSync(garbageFile, "{ \"schema\": \"hardkas.signedTx\", \"malformed\": true, missing_quotes }");
    result.events.push({ step: "corrupt_artifact_created", file: garbageFile });

    // 5. Force rebuild projection
    try {
      const stats = await sdk.query.sync({ force: true });
      result.events.push({ step: "force_rebuild", ok: true, stats });
    } catch (err: any) {
      // It might throw on the garbage file
      result.events.push({ step: "force_rebuild", ok: false, error: err.message });
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
