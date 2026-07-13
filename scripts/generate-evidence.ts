import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const version = "0.11.3-alpha";
const auditDir = path.join(process.cwd(), "docs", "audit", "releases", version);

if (!fs.existsSync(auditDir)) {
  fs.mkdirSync(auditDir, { recursive: true });
}

function runCommand(cmd: string) {
  const startTime = new Date().toISOString();
  console.log(`Running: ${cmd}`);
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  try {
    const output = execSync(cmd, { encoding: "utf8", stdio: "pipe" });
    stdout = output;
  } catch (err: any) {
    stdout = err.stdout;
    stderr = err.stderr;
    exitCode = err.status || 1;
  }
  const endTime = new Date().toISOString();
  return {
    command: cmd,
    startTime,
    endTime,
    exitCode,
    stdoutPreview: stdout.substring(0, 1000) + (stdout.length > 1000 ? "\n...truncated" : ""),
    stderrPreview: stderr.substring(0, 1000) + (stderr.length > 1000 ? "\n...truncated" : "")
  };
}

const envInfo = {
  nodeVersion: process.version,
  platform: process.platform,
  arch: process.arch
};

const typecheck = runCommand("pnpm typecheck");
const build = runCommand("pnpm build");
const test = runCommand("pnpm test");
const testE2e = runCommand("pnpm test:e2e:docker -- --runInBand");

const exampleV0 = runCommand("pnpm example:v0-demo");
const exampleV1 = runCommand("pnpm example:v1-demo");
const exampleCovenant = runCommand("pnpm example:covenant-demo");
const smokeTarball = runCommand("pnpm smoke:external-tarball");

const e2eEvidence = {
  version,
  environment: envInfo,
  timestamp: new Date().toISOString(),
  testSuite: test,
  e2e: testE2e,
  examples: {
    v0: exampleV0,
    v1: exampleV1,
    covenant: exampleCovenant
  },
  smoke: smokeTarball
};

fs.writeFileSync(path.join(auditDir, "E2E_EVIDENCE.json"), JSON.stringify(e2eEvidence, null, 2));

const releaseBaseline = {
  version,
  environment: envInfo,
  timestamp: new Date().toISOString(),
  typecheck,
  build
};

fs.writeFileSync(path.join(auditDir, "RELEASE_BASELINE.json"), JSON.stringify(releaseBaseline, null, 2));

// For public API snapshot, we can just save the output of the API checker if it exists, or just say it's successful.
const apiCheck = runCommand("node scripts/api-check.mjs");
const publicApiSnapshot = {
  version,
  timestamp: new Date().toISOString(),
  apiCheck
};
fs.writeFileSync(path.join(auditDir, "PUBLIC_API_SNAPSHOT.json"), JSON.stringify(publicApiSnapshot, null, 2));

// Runtime provenance
const wasmInfo = runCommand("cat packages/wasm/package.json");
let wasmVersion = "unknown";
if (wasmInfo.exitCode === 0) {
  try {
    const pkg = JSON.parse(wasmInfo.stdoutPreview.replace("\n...truncated", ""));
    wasmVersion = pkg.version;
  } catch {}
}

const runtimeProvenance = {
  version,
  timestamp: new Date().toISOString(),
  wasmVersion,
  digests: "Not calculated yet", // Placeholders for now
  environment: envInfo
};
fs.writeFileSync(path.join(auditDir, "RUNTIME_PROVENANCE.json"), JSON.stringify(runtimeProvenance, null, 2));

console.log("Evidence generated in", auditDir);
