import fs from "node:fs";
import path from "node:path";
import { Hardkas } from "@hardkas/sdk";
import {
  generateMigrationReceipt,
  migrateArtifactPayload,
  verifyLineage
} from "@hardkas/artifacts";

async function runSmoke() {
  console.log("FASE 6B Layer 2: Workspace/NPM smoke externo");
  const sdk = await Hardkas.open({ network: "simnet", autoBootstrap: true });

  const fixturesDir = path.join(process.cwd(), "packages/artifacts/test/fixtures/golden");
  const files = fs.readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));

  let criticalFailures = 0;

  for (const file of files) {
    const originalArtifact = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, file), "utf-8")
    );
    console.log(`\nTesting artifact: ${file}`);

    // Downgrade to simulate a 0.8.2 artifact
    const artifact = { ...originalArtifact, version: "0.1.0", hardkasVersion: "0.8.2" };
    if (artifact.schema === "hardkas.txPlan") artifact.schema = "hardkas.txPlan.v1";
    if (artifact.schema === "hardkas.signedTx") artifact.schema = "hardkas.signedTx.v1";
    if (artifact.schema === "hardkas.snapshot") artifact.schema = "hardkas.snapshot.v1";

    // 1. SAFE_REJECT_UNSUPPORTED
    try {
      await sdk.artifacts.verify(artifact, { throwOnInvalid: true });
      console.log("❌ CRITICAL: Accepted legacy artifact without receipt!");
      criticalFailures++;
    } catch (e: unknown) {
      if (((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)).includes("invalid") || ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)).includes("schema")) {
        console.log("✅ SAFE_REJECT_UNSUPPORTED: Rejected successfully.");
      } else {
        console.log("❌ Unhandled rejection type:", ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)));
        criticalFailures++;
      }
    }

    // 2. Migration Receipt Generation
    try {
      const migrated = migrateArtifactPayload(artifact, "1.0.0-alpha");
      if (migrated.migrated) {
        const receipt = generateMigrationReceipt(
          artifact,
          migrated.artifact,
          "smoke-test"
        );
        const rLineage = verifyLineage(receipt, artifact, { strict: true });
        const aLineage = verifyLineage(migrated.artifact, receipt, { strict: true });

        if (!rLineage.ok || !aLineage.ok) {
          console.log("❌ CRITICAL: Broken lineage after migration!");
          console.log("Receipt Lineage issues:", rLineage.issues);
          console.log("Artifact Lineage issues:", aLineage.issues);
          criticalFailures++;
        } else {
          console.log(
            `✅ migrationReceipt lineage OK: ${receipt.oldHash} -> ${receipt.contentHash} -> ${receipt.newHash}`
          );
        }
      } else {
        console.log("✅ Artifact already at target version (no migration needed).");
      }
    } catch (e: unknown) {
      console.log("❌ Migration error:", ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)));
      criticalFailures++;
    }
  }

  if (criticalFailures === 0) {
    console.log("\nFASE 6B Smoke: PASS (0 CRITICAL, 0 HIGH, 0 silent migration)");
    process.exit(0);
  } else {
    console.error(`\nFASE 6B Smoke: FAIL (${criticalFailures} critical failures)`);
    process.exit(1);
  }
}

runSmoke().catch((e) => {
  console.error("Crash:", e);
  process.exit(1);
});
