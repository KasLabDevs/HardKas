import { calculateContentHash } from "./packages/artifacts/dist/index.js";
import fs from "node:fs";

const artifact = {
  schema: "hardkas.txPlan.v2",
  hardkasVersion: "0.4.0-alpha",
  version: "2.0.0",
  createdAt: new Date().toISOString(),
  networkId: "simnet",
  mode: "simulated",
  planId: "test-plan",
  from: { address: "kaspa:alice" },
  to: { address: "kaspa:bob" },
  amountSompi: "1000",
  estimatedFeeSompi: "1",
  estimatedMass: "100",
  inputs: [],
  outputs: [{ address: "kaspa:bob", amountSompi: "1000" }]
};

(artifact as any).contentHash = calculateContentHash(artifact);

fs.writeFileSync("test-artifacts/valid/plan.json", JSON.stringify(artifact, null, 2));

const corrupted = { ...artifact, amountSompi: "2000" };
fs.writeFileSync("test-artifacts/invalid/corrupted.json", JSON.stringify(corrupted, null, 2));
