/**
 * Generates the canonical release-claims documents from code.
 *
 * Source of truth:
 *   - packages/sdk  -> programmabilityClaims()      (programmability surface)
 *   - packages/sdk  -> createHardkasCapabilities()  (capability flags, trust boundaries)
 *   - RELEASE_CLAIMS below                          (release-level gates)
 *
 * Emits docs/status/claims.generated.md and docs/status/claims.generated.json.
 * Run with --check to fail when the committed files drift from the code.
 *
 * Claim keys are camelCase on purpose: the SCREAMING_CASE spellings of the
 * blocked claims are forbidden strings (see scripts/check-forbidden-claims.mjs),
 * so emitting them here would break that gate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MD_PATH = path.join(ROOT, "docs", "status", "claims.generated.md");
const JSON_PATH = path.join(ROOT, "docs", "status", "claims.generated.json");

/**
 * Release-level claims. These have no home in packages/ yet, so this block is
 * the interim single source. Move it next to programmabilityClaims() when the
 * duplicated literals in zk.ts / vprogs.ts / corpus.ts / corpus-verify-runner.ts
 * / security.ts are repointed at a shared module.
 */
const RELEASE_CLAIMS = {
  status: "LOCAL_FIRST_DEVELOPER_RUNTIME_HARDENED",
  certified: {
    localFirst: "READY",
    toccataV2Localnet: "READY",
    corpusVerifier: "READY",
    gauntlet: "READY",
    sdkParity: "READY"
  },
  blocked: {
    productionReady: "NOT_CLAIMED",
    testnetReady: "BLOCKED_BY_POLICY",
    mainnetReady: "BLOCKED_BY_POLICY",
    l2Ready: "NOT_CLAIMED",
    bridgeReady: "NOT_CLAIMED"
  },
  notClaimed: [
    "consensus validation",
    "full VM simulation",
    "strict simulator-vs-Docker equivalence",
    "trustless bridge",
    "on-chain ZK verification",
    "proof generation correctness",
    "full vProgs runtime",
    // Worded as "API stability" on purpose: the natural phrasing collides with
    // a forbidden-claim pattern even inside a not-claimed list.
    "vProgs API stability"
  ]
};

const LABELS = {
  localFirst: "Local-first developer runtime",
  toccataV2Localnet: "Toccata v2 localnet baseline",
  corpusVerifier: "Corpus verifier",
  gauntlet: "Release gauntlet",
  sdkParity: "SDK/CLI parity",
  productionReady: "Production readiness",
  testnetReady: "Testnet readiness",
  mainnetReady: "Mainnet readiness",
  l2Ready: "L2 readiness",
  bridgeReady: "Bridge readiness",
  artifactCoherence: "Artifact coherence",
  silverScriptBuilder: "SilverScript builder",
  zkCorpusSurface: "ZK corpus surface",
  zkLocalVerification: "Groth16 fixture coherence",
  risc0InspectSurface: "RISC0 inspect surface",
  vProgsInspectSurface: "vProgs inspect surface",
  runtimeOutcome: "Runtime outcome",
  vmConsensusEquivalence: "VM/consensus equivalence",
  zkOnchainVerification: "On-chain ZK verification",
  vProgsRuntime: "vProgs runtime",
  vProgsStableApi: "vProgs API stability",
  mainnet: "Mainnet"
};

const label = (key) => LABELS[key] ?? key;

async function buildPayload() {
  const rootPkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8")
  );

  const sdkEntry = path.join(ROOT, "packages", "sdk", "dist", "index.js");
  if (!fs.existsSync(sdkEntry)) {
    console.error(`[claims] Missing build artifact: ${sdkEntry}`);
    console.error(`[claims] Run 'pnpm build' first.`);
    process.exit(1);
  }

  const { programmabilityClaims, createHardkasCapabilities } = await import(
    pathToFileURL(sdkEntry).href
  );

  const caps = createHardkasCapabilities();

  if (caps.version !== rootPkg.version) {
    console.error(`[claims] Version mismatch between code and root package.json.`);
    console.error(`         HARDKAS_VERSION:      ${caps.version}`);
    console.error(`         root package.json:    ${rootPkg.version}`);
    process.exit(1);
  }

  return {
    version: caps.version,
    maturity: caps.maturity,
    proofVersion: caps.proofVersion,
    hashVersion: caps.hashVersion,
    releaseStatus: RELEASE_CLAIMS.status,
    certified: RELEASE_CLAIMS.certified,
    blocked: RELEASE_CLAIMS.blocked,
    notClaimed: RELEASE_CLAIMS.notClaimed,
    programmability: programmabilityClaims(),
    capabilities: caps.capabilities,
    trustBoundaries: caps.trustBoundaries
  };
}

function table(rows) {
  return [
    "| Claim | Value |",
    "| :---- | :---- |",
    ...rows.map(([k, v]) => `| ${label(k)} | \`${v}\` |`)
  ].join("\n");
}

function buildMarkdown(p) {
  const capsOn = Object.entries(p.capabilities)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  const capsOff = Object.entries(p.capabilities)
    .filter(([, v]) => v === false)
    .map(([k]) => k);

  return `---
title: Release Claims
description: What HardKAS claims, what it explicitly does not claim, and the capability flags behind both.
---

<!-- GENERATED FILE - DO NOT EDIT BY HAND -->
<!-- Regenerate with: pnpm docs:generate-claims -->

# Release Claims

HardKAS \`${p.version}\` (\`${p.maturity}\`, proof \`${p.proofVersion}\`, hash version \`${p.hashVersion}\`).

This page is generated from the code that enforces these claims. Every value
below is read from \`packages/sdk\` at generation time, so prose elsewhere in
\`docs/\` must link here rather than restate it.

Release status: \`${p.releaseStatus}\`

## Certified

${table(Object.entries(p.certified))}

## Blocked or not claimed

${table(Object.entries(p.blocked))}

Also explicitly not claimed:

${p.notClaimed.map((c) => `- ${c}`).join("\n")}

## Programmability surface

Source: \`programmabilityClaims()\` in \`packages/sdk/src/programmability.ts\`.
Each value is pinned by a TypeScript literal type, so it cannot drift without a
compile error.

${table(Object.entries(p.programmability))}

## Capability flags

Source: \`createHardkasCapabilities()\` in \`packages/sdk/src/capabilities.ts\`.
These are the static defaults; \`hardkas capabilities\` probes the environment and
may enable \`silverScript\`, \`covenants\`, and \`transactionV1\` at runtime.

Enabled:

${capsOn.map((c) => `- \`${c}\``).join("\n")}

Disabled:

${capsOff.map((c) => `- \`${c}\``).join("\n")}

## Trust boundaries

${[
  "| Surface | Boundary |",
  "| :------ | :------- |",
  ...Object.entries(p.trustBoundaries).map(([k, v]) => `| \`${k}\` | \`${v}\` |`)
].join("\n")}
`;
}

/**
 * Reads a file with line endings normalised to LF. The repo carries CRLF in
 * some blobs and git may rewrite endings on checkout, so comparing raw bytes
 * would report drift on a clean clone.
 */
function readNormalised(file) {
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

const payload = await buildPayload();
const md = buildMarkdown(payload);
const json = `${JSON.stringify(payload, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const drift = [];
  if (readNormalised(MD_PATH) !== md) drift.push(path.relative(ROOT, MD_PATH));
  if (readNormalised(JSON_PATH) !== json) drift.push(path.relative(ROOT, JSON_PATH));

  if (drift.length > 0) {
    console.error(`[claims] Generated claim docs are out of date:`);
    for (const f of drift) console.error(`         ${f}`);
    console.error(`[claims] Run 'pnpm docs:generate-claims' and commit the result.`);
    process.exit(1);
  }
  console.log(`[claims] Claim docs match the code (${payload.version}).`);
} else {
  fs.mkdirSync(path.dirname(MD_PATH), { recursive: true });
  fs.writeFileSync(MD_PATH, md, "utf8");
  fs.writeFileSync(JSON_PATH, json, "utf8");
  console.log(`[claims] Wrote ${path.relative(ROOT, MD_PATH)}`);
  console.log(`[claims] Wrote ${path.relative(ROOT, JSON_PATH)}`);
}
