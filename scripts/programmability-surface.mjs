import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "packages/sdk/src/programmability.ts",
  "packages/cli/src/commands/programmability.ts",
  "fixtures/toccata-v2/manifest.json",
  "docs/programmability-builder-surface.md",
  "examples/apps/silver-vault-policy/main.ts",
  "examples/apps/zk-proof-registry/main.ts",
  "examples/apps/vprogs-artifact-browser/main.ts",
  "templates/programmability/full-lab-app/main.ts"
];

const forbiddenClaims = [
  "ZK_READY",
  "VPROGS_READY",
  "ONCHAIN_ZK_READY",
  "MAINNET_READY",
  "TESTNET_READY",
  "TRUSTLESS_BRIDGE_READY",
  "VPROGS_RUNTIME_READY",
  "ZK_ONCHAIN_VERIFICATION_READY",
  "VM_CONSENSUS_EQUIVALENCE_READY"
];

const scanRoots = [
  "README.md",
  "CHANGELOG.md",
  "docs",
  "packages/sdk/src",
  "packages/cli/src/commands",
  "fixtures/toccata-v2",
  "examples/apps",
  "templates/programmability"
];

const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
const forbiddenMatches = [];
for (const file of listFiles(scanRoots)) {
  const text = fs.readFileSync(file, "utf8");
  for (const claim of forbiddenClaims) {
    if (text.includes(claim)) {
      forbiddenMatches.push({
        claim,
        file: path.relative(root, file).replace(/\\/g, "/")
      });
    }
  }
}

const ok = missing.length === 0 && forbiddenMatches.length === 0;
const result = {
  ok,
  schema: "hardkas.programmability.surfaceCheck.v1",
  status: ok ? "PROGRAMMABILITY_SURFACE_READY" : "PROGRAMMABILITY_SURFACE_INVALID",
  missing,
  forbiddenMatches,
  claims: {
    artifactCoherence: "READY_MATCH",
    runtimeOutcome: "PARTIAL",
    vmConsensusEquivalence: "NOT_CLAIMED",
    mainnet: "BLOCKED_BY_POLICY"
  }
};

console.log(JSON.stringify(result, null, 2));
if (!ok) process.exitCode = 1;

function listFiles(entries) {
  const out = [];
  for (const entry of entries) {
    const full = path.join(root, entry);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    if (stat.isFile()) {
      out.push(full);
      continue;
    }
    walk(full, out);
  }
  return out.filter((file) => /\.(md|ts|js|json|mjs)$/.test(file));
}

function walk(dir, out) {
  for (const item of fs.readdirSync(dir)) {
    if (item === "node_modules" || item === "dist") continue;
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else out.push(full);
  }
}
