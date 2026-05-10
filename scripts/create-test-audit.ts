import { calculateContentHash, ARTIFACT_V2_VERSION } from "../packages/artifacts/dist/index.js";
import fs from "node:fs";
import path from "node:path";

const testDir = "test-audit";
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);

const createArtifact = (planId: string) => ({
  schema: "hardkas.txPlan.v2",
  hardkasVersion: "0.2.0",
  version: ARTIFACT_V2_VERSION,
  createdAt: new Date().toISOString(),
  networkId: "simnet",
  mode: "simulated",
  planId,
  from: { address: "kaspa:alice" },
  to: { address: "kaspa:bob" },
  amountSompi: "1000",
  estimatedFeeSompi: "1",
  estimatedMass: "100",
  inputs: [],
  outputs: [{ address: "kaspa:bob", amountSompi: "1000" }]
});

// 1. Valid Artifact
const valid: any = createArtifact("valid-1");
valid.contentHash = calculateContentHash(valid);
fs.writeFileSync(path.join(testDir, "valid.json"), JSON.stringify(valid, null, 2));

// 2. Manipulated Artifact
const manipulated: any = createArtifact("manipulated-1");
manipulated.contentHash = calculateContentHash(manipulated);
manipulated.amountSompi = "2000"; // Manipulate after hashing
fs.writeFileSync(path.join(testDir, "manipulated.json"), JSON.stringify(manipulated, null, 2));

// 3. Subdirectory with valid artifact
const subDir = path.join(testDir, "subdir");
if (!fs.existsSync(subDir)) fs.mkdirSync(subDir);
const subValid: any = createArtifact("valid-sub");
subValid.contentHash = calculateContentHash(subValid);
fs.writeFileSync(path.join(subDir, "sub-valid.json"), JSON.stringify(subValid, null, 2));

console.log("Test audit directory 'test-audit' created.");
