import fs from "node:fs";
import path from "node:path";
import { calculateContentHash } from "../src/canonical.js";

const fixturesDir = "packages/artifacts/test/fixtures";

function writeFixture(dir, name, artifact) {
  const fullDir = path.join(fixturesDir, dir);
  if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
  
  // Calculate hash
  const hash = calculateContentHash(artifact);
  artifact.contentHash = hash;
  
  // Ensure lineage matches hash
  if (artifact.lineage) {
    artifact.lineage.artifactId = hash;
  }
  
  fs.writeFileSync(path.join(fullDir, name), JSON.stringify(artifact, null, 2));
  return hash;
}

const rootHash = writeFixture("valid", "snapshot.valid.json", {
  schema: "hardkas.snapshot",
  hardkasVersion: "0.2.2-alpha",
  version: "1.0.0-alpha",
  networkId: "simnet",
  mode: "simulated",
  workflowId: "test-workflow",
  assumptionLevel: "pessimistic",
  executionMode: "isolated",
  createdAt: new Date().toISOString(),
  daaScore: "1000",
  accounts: [],
  utxos: [],
  lineage: {
    artifactId: "0".repeat(64),
    lineageId: "a".repeat(64),
    rootArtifactId: "0".repeat(64)
  }
});

// Update rootArtifactId after hash calculation
const snapshot = JSON.parse(fs.readFileSync(path.join(fixturesDir, "valid", "snapshot.valid.json"), "utf8"));
snapshot.lineage.rootArtifactId = rootHash;
snapshot.lineage.artifactId = rootHash;
fs.writeFileSync(path.join(fixturesDir, "valid", "snapshot.valid.json"), JSON.stringify(snapshot, null, 2));

const planHash = writeFixture("valid", "tx-plan.valid.json", {
  schema: "hardkas.txPlan",
  hardkasVersion: "0.2.2-alpha",
  version: "1.0.0-alpha",
  createdAt: new Date().toISOString(),
  networkId: "simnet",
  mode: "simulated",
  workflowId: "test-workflow",
  assumptionLevel: "pessimistic",
  executionMode: "isolated",
  planId: "b".repeat(64),
  from: { address: "kaspasim:123" },
  to: { address: "kaspasim:456" },
  amountSompi: "1000000",
  estimatedFeeSompi: "250",
  estimatedMass: "250",
  inputs: [],
  outputs: [
    { address: "kaspasim:456", amountSompi: "1000000" }
  ],
  lineage: {
    artifactId: "0".repeat(64),
    lineageId: "a".repeat(64),
    parentArtifactId: rootHash,
    rootArtifactId: rootHash,
    sequence: 1
  }
});

writeFixture("valid", "signed-tx.valid.json", {
  schema: "hardkas.signedTx",
  hardkasVersion: "0.2.2-alpha",
  version: "1.0.0-alpha",
  createdAt: new Date().toISOString(),
  status: "signed",
  signedId: "c".repeat(64),
  sourcePlanId: "b".repeat(64),
  networkId: "simnet",
  mode: "simulated",
  workflowId: "test-workflow",
  assumptionLevel: "pessimistic",
  executionMode: "isolated",
  from: { address: "kaspasim:123" },
  to: { address: "kaspasim:456" },
  amountSompi: "1000000",
  signedTransaction: { format: "hex", payload: "00" },
  lineage: {
    artifactId: "0".repeat(64),
    lineageId: "a".repeat(64),
    parentArtifactId: planHash,
    rootArtifactId: rootHash,
    sequence: 2
  }
});

console.log("Valid fixtures generated.");

// Also generate golden fixtures (used by determinism tests and CI)
const goldenDir = path.join(fixturesDir, "golden");
if (!fs.existsSync(goldenDir)) fs.mkdirSync(goldenDir, { recursive: true });

for (const file of ["snapshot.valid.json", "tx-plan.valid.json", "signed-tx.valid.json"]) {
  const src = path.join(fixturesDir, "valid", file);
  const dest = path.join(goldenDir, file);
  fs.copyFileSync(src, dest);
}

console.log("Golden fixtures synced from valid.");
