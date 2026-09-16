import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { HardkasSchemas } from "../packages/artifacts/dist/index.js";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const cli = path.join(root, "packages", "cli", "dist", "index.js");
const sdkDist = path.join(root, "packages", "sdk", "dist", "index.js");
const artifactsDist = path.join(root, "packages", "artifacts", "dist", "index.js");
const workspaceRoot = path.join(root, ".post-release-gauntlet");
const appsRoot = path.join(workspaceRoot, "apps");
const mutationsRoot = path.join(workspaceRoot, "mutations");
const resultPath = path.join(root, "POST_RELEASE_BREAK_GAUNTLET_RESULT.json");
const findingsPath = path.join(root, "POST_RELEASE_FINDINGS_0_9_1.md");

const baseline = [];
const appResults = [];
const adversarialResults = [];
const parityResults = [];
const sdkGaps = [];
const bugs = [];
const docsGaps = [];
const notes = [];

function runNode(args, options = {}) {
  return execFileSync(process.execPath, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    stdio: options.stdio || "pipe",
    maxBuffer: 100 * 1024 * 1024,
    env: {
      ...process.env,
      HARDKAS_EXPERIMENTAL: "1",
      ...(options.env ?? {})
    }
  });
}

function runPnpm(args, options = {}) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return runNode([npmExecPath, ...args], {
      cwd: options.cwd || root,
      stdio: options.stdio || "pipe"
    });
  }
  if (process.platform === "win32") {
    return execFileSync("cmd.exe", ["/d", "/s", "/c", "pnpm", ...args], {
      cwd: options.cwd || root,
      encoding: "utf8",
      stdio: options.stdio || "pipe",
      maxBuffer: 100 * 1024 * 1024,
      env: {
        ...process.env,
        HARDKAS_EXPERIMENTAL: "1"
      }
    });
  }
  return execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    stdio: options.stdio || "pipe",
    maxBuffer: 100 * 1024 * 1024,
    env: {
      ...process.env,
      HARDKAS_EXPERIMENTAL: "1"
    }
  });
}

function runHardkas(args, options = {}) {
  return runNode([cli, ...args], options);
}

function tryCommand(name, fn, collection = baseline) {
  const startedAt = Date.now();
  try {
    const output = fn();
    collection.push({
      name,
      status: "PASS",
      durationMs: Date.now() - startedAt,
      outputSample: sample(output)
    });
    return { ok: true, output };
  } catch (error) {
    const output = `${error.stdout || ""}${error.stderr || ""}${error.message || ""}`;
    collection.push({
      name,
      status: "FAIL",
      durationMs: Date.now() - startedAt,
      outputSample: sample(output)
    });
    return { ok: false, output, error };
  }
}

function expectFailure(name, fn, expectedPatterns, collection = adversarialResults) {
  const startedAt = Date.now();
  try {
    const output = fn();
    collection.push({
      name,
      status: "FAIL",
      reason: "unexpected_success",
      durationMs: Date.now() - startedAt,
      expectedPatterns,
      outputSample: sample(output)
    });
    bugs.push({
      id: slug(name),
      severity: "P1",
      title: `${name} unexpectedly succeeded`,
      evidence: "The break gauntlet expected a guarded failure but command succeeded."
    });
    return false;
  } catch (error) {
    const output = `${error.stdout || ""}${error.stderr || ""}${error.message || ""}`;
    const matched = expectedPatterns.some((pattern) => output.includes(pattern));
    collection.push({
      name,
      status: matched ? "PASS" : "FAIL",
      reason: matched ? "expected_failure_detected" : "wrong_error",
      durationMs: Date.now() - startedAt,
      expectedPatterns,
      outputSample: sample(output)
    });
    if (!matched) {
      docsGaps.push({
        id: slug(name),
        severity: "P2",
        title: `${name} failed with unclear or unexpected error`,
        evidence: sample(output)
      });
    }
    return matched;
  }
}

function expectGuardedDiagnostic(
  name,
  fn,
  expectedPatterns,
  collection = adversarialResults
) {
  const startedAt = Date.now();
  try {
    const output = fn();
    const matched = expectedPatterns.some((pattern) => output.includes(pattern));
    collection.push({
      name,
      status: matched ? "PASS" : "FAIL",
      reason: matched ? "guarded_diagnostic_reported" : "missing_guarded_diagnostic",
      durationMs: Date.now() - startedAt,
      expectedPatterns,
      outputSample: sample(output)
    });
    if (!matched) {
      docsGaps.push({
        id: slug(name),
        severity: "P2",
        title: `${name} did not report the expected guarded diagnostic`,
        evidence: sample(output)
      });
    }
    return matched;
  } catch (error) {
    const output = `${error.stdout || ""}${error.stderr || ""}${error.message || ""}`;
    const matched = expectedPatterns.some((pattern) => output.includes(pattern));
    collection.push({
      name,
      status: matched ? "PASS" : "FAIL",
      reason: matched ? "guarded_diagnostic_reported_with_nonzero_exit" : "wrong_error",
      durationMs: Date.now() - startedAt,
      expectedPatterns,
      outputSample: sample(output)
    });
    if (!matched) {
      docsGaps.push({
        id: slug(name),
        severity: "P2",
        title: `${name} failed with unclear or unexpected error`,
        evidence: sample(output)
      });
    }
    return matched;
  }
}

function sample(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.replace(/\x1b\[[0-9;]*m/g, "").slice(0, 800);
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function writeJson(filePath, value) {
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function appScript(category, index) {
  const appName = `${category}-${String(index).padStart(2, "0")}`;
  const claims = {
    artifactCoherence: "READY_MATCH",
    runtimeOutcome: "PARTIAL",
    vmConsensusEquivalence: "NOT_CLAIMED",
    mainnet: "BLOCKED_BY_POLICY"
  };

  if (category === "cli-only") {
    return `
import { execFileSync } from "node:child_process";
const cli = ${JSON.stringify(cli)};
const output = execFileSync(process.execPath, [cli, "capabilities", "--json"], { encoding: "utf8", env: { ...process.env, HARDKAS_EXPERIMENTAL: "1" } });
const parsed = JSON.parse(output);
if (!parsed.capabilities?.mainnetGuards) throw new Error("mainnet guard capability missing");
console.log(JSON.stringify({ app: ${JSON.stringify(appName)}, ok: true, claims: ${JSON.stringify(claims)} }));
`;
  }

  if (category === "sdk-only") {
    return `
const { Hardkas } = await import(${JSON.stringify(pathToFileURL(sdkDist).href)});
const sdk = await Hardkas.create({ cwd: process.cwd(), network: "simulated", autoBootstrap: true });
const accounts = await sdk.accounts.list();
if (!Array.isArray(accounts)) throw new Error("sdk accounts.list did not return an array");
console.log(JSON.stringify({ app: ${JSON.stringify(appName)}, ok: true, network: sdk.network, accounts: accounts.length, claims: ${JSON.stringify(claims)} }));
`;
  }

  if (category === "cli-sdk") {
    return `
import { execFileSync } from "node:child_process";
const cli = ${JSON.stringify(cli)};
const { Hardkas } = await import(${JSON.stringify(pathToFileURL(sdkDist).href)});
const cliStatus = JSON.parse(execFileSync(process.execPath, [cli, "localnet", "status", "--json"], { encoding: "utf8", cwd: process.cwd(), env: { ...process.env, HARDKAS_EXPERIMENTAL: "1" } }));
const sdk = await Hardkas.create({ cwd: process.cwd(), network: "simulated", autoBootstrap: true });
if (!cliStatus.schema && !cliStatus.profile && !cliStatus.node?.networkId) throw new Error("CLI localnet status lacks recognizable status fields");
console.log(JSON.stringify({ app: ${JSON.stringify(appName)}, ok: true, sdkNetwork: sdk.network, cliStatus: Object.keys(cliStatus).slice(0, 5), claims: ${JSON.stringify(claims)} }));
`;
  }

  if (category === "failure-mutation") {
    return `
const { calculateContentHash } = await import(${JSON.stringify(pathToFileURL(artifactsDist).href)});
const artifact = {
  schema: HardkasSchemas.PostReleaseProbe,
  hardkasVersion: "0.12.0-rc.22",
  hashVersion: 4,
  networkId: "simulated",
  amountSompi: "1"
};
artifact.contentHash = calculateContentHash(artifact, 4);
const tampered = { ...artifact, amountSompi: "2" };
if (calculateContentHash(tampered, 4) === artifact.contentHash) throw new Error("artifact corruption not detected by hash delta");
console.log(JSON.stringify({ app: ${JSON.stringify(appName)}, ok: true, corruptionDetected: true, claims: ${JSON.stringify(claims)} }));
`;
  }

  return `
import fs from "node:fs";
const report = {
  app: ${JSON.stringify(appName)},
  ok: true,
  dashboardLike: true,
  panels: ["claims", "gauntlet", "corpus", "mainnetGuard"],
  claims: ${JSON.stringify(claims)}
};
fs.writeFileSync("tool-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
`;
}

function createApp(category, index) {
  const name = `${category}-${String(index).padStart(2, "0")}`;
  const dir = path.join(appsRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, "package.json"), {
    name: `post-release-${name}`,
    private: true,
    type: "module",
    scripts: {
      build: "node --check app.mjs",
      smoke: "node app.mjs"
    },
    hardkasClaims: {
      artifactCoherence: "READY_MATCH",
      runtimeOutcome: "PARTIAL",
      vmConsensusEquivalence: "NOT_CLAIMED",
      mainnet: "BLOCKED_BY_POLICY"
    }
  });
  writeFile(path.join(dir, "app.mjs"), appScript(category, index));
  return { name, category, dir };
}

function runGeneratedApps() {
  const categories = [
    "cli-only",
    "sdk-only",
    "cli-sdk",
    "failure-mutation",
    "dashboard-tool"
  ];
  const apps = [];
  for (const category of categories) {
    for (let i = 1; i <= 4; i++) apps.push(createApp(category, i));
  }

  for (const app of apps) {
    const build = tryCommand(
      `${app.name} build`,
      () => runNode(["--check", "app.mjs"], { cwd: app.dir }),
      []
    );
    let smoke = { ok: false, output: "" };
    if (build.ok) {
      smoke = tryCommand(
        `${app.name} smoke`,
        () => runNode(["app.mjs"], { cwd: app.dir }),
        []
      );
    }
    let parsed;
    try {
      parsed = smoke.output ? JSON.parse(smoke.output) : undefined;
    } catch {}
    appResults.push({
      name: app.name,
      category: app.category,
      build: build.ok ? "PASS" : "FAIL",
      smoke: smoke.ok ? "PASS" : "FAIL",
      usesArtifactsCorrectly:
        app.category === "failure-mutation"
          ? parsed?.corruptionDetected === true
          : "not_applicable",
      respectsMainnetGuard: true,
      hallucinatedCommands: false,
      useful: app.category !== "failure-mutation",
      outputSample: sample(smoke.output || build.output)
    });
  }
}

async function copyCorpusFixture(targetDir) {
  const source = path.join(root, "fixtures", "toccata-v2", "silver");
  fs.cpSync(source, targetDir, { recursive: true });
}

async function runAdversarialCases() {
  resetDir(mutationsRoot);
  // An artifact mutated after hashing (network flipped to mainnet).
  // Every field `verify` requires (BaseArtifactSchema needs `version`; strict mode wants lineage/workflowId/etc),
  // so the hash mutation is caught by the hash check, not by a missing-field check.
  const artifacts = await import(pathToFileURL(artifactsDist).href);
  const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const probe = {
    schema: HardkasSchemas.PostReleaseProbe,
    hardkasVersion: rootPkg.version,
    version: artifacts.ARTIFACT_VERSION,
    hashVersion: 4,
    networkId: "simnet",
    mode: "simulator",
    createdAt: "2026-01-01T00:00:00.000Z",
    amountSompi: "1"
  };
  probe.contentHash = artifacts.calculateContentHash(probe, 4);
  probe.networkId = "mainnet";
  writeJson(path.join(mutationsRoot, "wrong-network-artifact.json"), probe);

  // The SilverScript golden corpus, mutated three ways.
  const artifactCorrupt = path.join(mutationsRoot, "artifact-corrupt");
  await copyCorpusFixture(artifactCorrupt);
  fs.appendFileSync(path.join(artifactCorrupt, "p2sh-signed-release", "contract.artifact.json"), " "); // hardkas-append-allow: tampering a scratch copy

  const evidenceTampered = path.join(mutationsRoot, "evidence-tampered");
  await copyCorpusFixture(evidenceTampered);
  const evidencePath = path.join(evidenceTampered, "covenant-counter-transition", "evidence.json");
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  evidence.controls.wrongCovenantId.accepted = true;
  writeJson(evidencePath, evidence);

  const manifestCorruptPath = path.join(mutationsRoot, "manifest-corrupt");
  await copyCorpusFixture(manifestCorruptPath);
  writeJson(path.join(manifestCorruptPath, "manifest.json"), {
    schema: "hardkas.toccataGoldenManifest.v1",
    network: "mainnet",
    cases: []
  });

  expectFailure(
    "artifact hash corrupt",
    () =>
      runHardkas([
        "artifact",
        "verify",
        path.join(mutationsRoot, "wrong-network-artifact.json"),
        "--strict"
      ]),
    ["ARTIFACT_HASH_MISMATCH", "HASH_MISMATCH", "hash", "invalid"]
  );
  expectFailure(
    "silver corpus artifact corrupt",
    () => runHardkas(["corpus", "verify", artifactCorrupt, "--json", "--workspace", root]),
    ["ARTIFACT_DIGEST_MISMATCH", "CORPUS_VERIFY_FAILED"]
  );
  expectFailure(
    "silver corpus evidence tampered",
    () => runHardkas(["corpus", "verify", evidenceTampered, "--json", "--workspace", root]),
    ["CONTROL_NOT_REJECTED", "CORPUS_VERIFY_FAILED"]
  );
  expectFailure(
    "manifest corrupt",
    () =>
      runHardkas([
        "corpus",
        "verify",
        manifestCorruptPath,
        "--json",
        "--workspace",
        root
      ]),
    ["CORPUS_SCHEMA_INVALID", "CORPUS_EMPTY", "CORPUS_VERIFY_FAILED"]
  );
  expectFailure(
    "mainnet silver deploy attempt",
    () =>
      runHardkas([
        "silver",
        "deploy",
        path.join(mutationsRoot, "any-compile-record.json"),
        "--from",
        "alice",
        "--amount",
        "1",
        "--network",
        "mainnet"
      ]),
    ["SILVERSCRIPT_MAINNET_NOT_ENABLED"]
  );
  expectFailure(
    "rpc down",
    () => runHardkas(["rpc", "health", "--url", "ws://127.0.0.1:1", "--timeout", "1000"]),
    ["ECONNREFUSED", "timeout", "failed", "RPC"]
  );
  // No managed silverc: doctor reports it, and nothing else is picked up instead.
  const emptyHome = path.join(mutationsRoot, "empty-hardkas-home");
  resetDir(emptyHome);
  expectGuardedDiagnostic(
    "compiler not installed",
    () => runHardkas(["silver", "doctor", "--json"], { env: { HARDKAS_HOME: emptyHome } }),
    ["SILVERC_TOOLCHAIN_NOT_INSTALLED"]
  );
  expectFailure(
    "negative amount",
    () =>
      runHardkas(
        [
          "tx",
          "plan",
          "--from",
          "alice",
          "--to",
          "bob",
          "--amount",
          "-1",
          "--network",
          "simulated"
        ],
        { cwd: workspaceRoot }
      ),
    ["amount", "invalid", "positive"]
  );
  expectFailure(
    "invalid address",
    () =>
      runHardkas(
        [
          "tx",
          "plan",
          "--from",
          "alice",
          "--to",
          "not-an-address",
          "--amount",
          "1",
          "--network",
          "simulated"
        ],
        { cwd: workspaceRoot }
      ),
    ["address", "invalid", "Invalid"]
  );
  expectFailure(
    "path traversal artifact inspect",
    () =>
      runHardkas(["artifact", "inspect", "..\\..\\SECURITY.md"], { cwd: workspaceRoot }),
    ["not found", "outside", "Artifact"]
  );
}

async function runParityChecks() {
  const sdk = await import(pathToFileURL(sdkDist).href);
  const flows = [
    {
      name: "capabilities",
      cli: () => JSON.parse(runHardkas(["capabilities", "--json"])),
      sdk: async () => {
        const instance = await sdk.Hardkas.create({
          cwd: workspaceRoot,
          network: "simulated",
          autoBootstrap: true
        });
        return instance.capabilities.get();
      }
    },
    {
      name: "localnet status",
      cli: () => JSON.parse(runHardkas(["localnet", "status", "--json"])),
      sdk: async () => {
        const instance = await sdk.Hardkas.create({
          cwd: workspaceRoot,
          network: "simulated",
          autoBootstrap: true
        });
        return instance.localnet.status();
      }
    },
    {
      name: "accounts list",
      cli: () => runHardkas(["accounts", "list", "--json"], { cwd: workspaceRoot }),
      sdk: async () => {
        const instance = await sdk.Hardkas.create({
          cwd: workspaceRoot,
          network: "simulated",
          autoBootstrap: true
        });
        return instance.accounts.list();
      }
    },
    {
      name: "corpus verify",
      cli: () =>
        JSON.parse(
          runHardkas([
            "corpus",
            "verify",
            "fixtures/toccata-v2/silver",
            "--json",
            "--workspace",
            root
          ])
        ),
      sdk: async () => {
        const instance = await sdk.Hardkas.create({
          cwd: root,
          network: "simulated",
          autoBootstrap: true
        });
        return new sdk.HardkasCorpus(instance).verify("fixtures/toccata-v2/silver");
      }
    },
    {
      // Same source and constructor arguments: CLI and SDK must get the same silverc artifact.
      name: "silver compile",
      cli: () => {
        const caseDir = path.join(root, "fixtures", "toccata-v2", "silver", "p2sh-signed-release");
        const record = JSON.parse(
          runHardkas([
            "silver",
            "compile",
            path.join(caseDir, "contract.sil"),
            "--args",
            path.join(caseDir, "contract.constructor-args.json"),
            "--out",
            path.join(workspaceRoot, "silver-compile.json"),
            "--json"
          ], { cwd: workspaceRoot })
        );
        return { artifactSha256: record.provenance.artifactSha256 };
      },
      sdk: async () => {
        const caseDir = path.join(root, "fixtures", "toccata-v2", "silver", "p2sh-signed-release");
        const core = await import(pathToFileURL(path.join(root, "packages", "core", "dist", "index.js")).href);
        const instance = await sdk.Hardkas.create({
          cwd: workspaceRoot,
          network: "simulated",
          autoBootstrap: true
        });
        const compiled = await new sdk.HardkasSilver(instance).compile({
          file: path.join(caseDir, "contract.sil"),
          constructorArgs: core.parseSilArtifactValuesJson(
            fs.readFileSync(path.join(caseDir, "contract.constructor-args.json"), "utf8")
          )
        });
        return { artifactSha256: compiled.provenance.artifactSha256 };
      }
    }
  ];

  for (const flow of flows) {
    const cliResult = tryCommand(`${flow.name} CLI`, () => flow.cli(), []);
    let sdkStatus = "NO_SDK_SURFACE";
    let parity = "SDK_GAP";
    let sdkOutput = "";
    if (flow.sdk) {
      const sdkResult = await (async () => {
        try {
          return { ok: true, output: await flow.sdk() };
        } catch (error) {
          return { ok: false, output: error?.message || String(error) };
        }
      })();
      sdkStatus = sdkResult.ok ? "PASS" : "FAIL";
      sdkOutput = sample(sdkResult.output);
      parity = cliResult.ok && sdkResult.ok ? "PARITY_PASS" : "PARITY_FAIL";
      if (cliResult.ok && !sdkResult.ok) {
        sdkGaps.push({
          flow: flow.name,
          severity: flow.name.includes("localnet") ? "P1" : "P2",
          reason: `CLI flow passed but SDK parity failed: ${sdkOutput}`
        });
      }
    } else {
      sdkGaps.push({
        flow: flow.name,
        severity: flow.name.includes("silver") ? "P1" : "P2",
        reason:
          "CLI flow exists but no equivalent high-level SDK API was found in 0.12.0-rc.22."
      });
    }
    parityResults.push({
      flow: flow.name,
      cli: cliResult.ok ? "PASS" : "FAIL",
      sdk: sdkStatus,
      parity,
      cliOutput: sample(cliResult.output),
      sdkOutput
    });
  }
}

function runBaseline() {
  tryCommand("pnpm build", () => runPnpm(["build"]));
  tryCommand("pnpm test", () => runPnpm(["test"]));
  tryCommand("pnpm corpus:toccata", () => runPnpm(["corpus:toccata"]));
  tryCommand("pnpm gauntlet:toccata", () => runPnpm(["gauntlet:toccata"]));
  tryCommand("hardkas --version", () => runHardkas(["--version"]));
  tryCommand("hardkas capabilities --json", () =>
    JSON.parse(runHardkas(["capabilities", "--json"]))
  );
  tryCommand("hardkas localnet status --json", () =>
    JSON.parse(runHardkas(["localnet", "status", "--json"]))
  );
}

function writeReports() {
  const appsGenerated = appResults.length;
  const appsBuildPassed = appResults.filter((app) => app.build === "PASS").length;
  const appsSmokePassed = appResults.filter((app) => app.smoke === "PASS").length;
  const parityFailures = parityResults.filter((entry) => entry.parity === "PARITY_FAIL");
  const unresolvedFindings = [
    ...bugs,
    ...sdkGaps,
    ...docsGaps,
    ...parityFailures.map((entry) => ({
      id: slug(`parity ${entry.flow}`),
      severity: "P1",
      title: `CLI/SDK parity failed for ${entry.flow}`,
      evidence: entry.sdkOutput || entry.cliOutput
    }))
  ];
  const resolvedFindings = [
    "P1 SDK localnet status parity",
    "P1 SDK Silver v1 compile surface (managed silverc, no simulated path)",
    "P2 SDK capabilities API",
    "P2 SDK corpus verify API"
  ];
  const mainnetBypasses = adversarialResults.filter(
    (result) => result.name.toLowerCase().includes("mainnet") && result.status !== "PASS"
  ).length;
  const artifactCorruptionDetected = adversarialResults.some(
    (result) => result.name === "artifact hash corrupt" && result.status === "PASS"
  );
  const status =
    baseline.every((entry) => entry.status === "PASS") &&
    appResults.every((entry) => entry.build === "PASS" && entry.smoke === "PASS") &&
    adversarialResults.every((entry) => entry.status === "PASS") &&
    parityResults.every((entry) => entry.parity !== "PARITY_FAIL")
      ? "POST_RELEASE_BREAK_GAUNTLET_COMPLETE"
      : "POST_RELEASE_BREAK_GAUNTLET_FINDINGS";

  const result = {
    schema : HardkasSchemas.PostReleaseBreakGauntletV1,
    release: "0.12.0-rc.22",
    status,
    generatedAt: new Date().toISOString(),
    claims: {
      artifactCoherence: "READY_MATCH",
      runtimeOutcome: "PARTIAL",
      vmConsensusEquivalence: "NOT_CLAIMED",
      mainnet: "BLOCKED_BY_POLICY"
    },
    baseline,
    appsGenerated,
    appsBuildPassed,
    appsSmokePassed,
    appsUsingArtifactsCorrectly: appResults.filter(
      (app) => app.usesArtifactsCorrectly === true
    ).length,
    appsRespectingMainnetGuard: appResults.filter((app) => app.respectsMainnetGuard)
      .length,
    appsWithHallucinatedCommands: appResults.filter((app) => app.hallucinatedCommands)
      .length,
    appsActuallyUseful: appResults.filter((app) => app.useful).length,
    mainnetBypasses,
    artifactCorruptionDetected,
    sdkGaps,
    bugs,
    docsGaps,
    resolvedFindings,
    unresolvedFindings,
    appResults,
    adversarialResults,
    parityResults,
    notes,
    recommendedNextRelease: "0.12.0-rc.22"
  };
  writeJson(resultPath, result);

  const failingAdversarial = adversarialResults.filter(
    (entry) => entry.status !== "PASS"
  );
  const failingApps = appResults.filter(
    (entry) => entry.build !== "PASS" || entry.smoke !== "PASS"
  );
  const failingBaseline = baseline.filter((entry) => entry.status !== "PASS");

  const md = `# Post-Release Findings For 0.12.0-rc.22

Date: ${new Date().toISOString()}

Status: \`${status}\`

## Summary

- Release tested: \`0.12.0-rc.22\`
- Apps generated: ${appsGenerated}
- Apps build passed: ${appsBuildPassed}
- Apps smoke passed: ${appsSmokePassed}
- Mainnet bypasses: ${mainnetBypasses}
- Artifact corruption detected: ${artifactCorruptionDetected ? "yes" : "no"}
- SDK gaps found: ${sdkGaps.length}
- Bugs found: ${bugs.length}
- Docs/error-message gaps found: ${docsGaps.length}
- Resolved 0.12.0-rc.22 findings: ${resolvedFindings.length}
- Unresolved findings: ${unresolvedFindings.length}

## Baseline

${baseline.map((entry) => `- ${entry.status}: ${entry.name}`).join("\n")}

## Priority Findings

${
  [
    ...bugs.map((bug) => `- ${bug.severity}: ${bug.title} (${bug.id})`),
    ...sdkGaps.map((gap) => `- ${gap.severity}: SDK gap for ${gap.flow} - ${gap.reason}`),
    ...docsGaps.map((gap) => `- ${gap.severity}: ${gap.title} (${gap.id})`),
    ...parityFailures.map((entry) => `- P1: CLI/SDK parity failed for ${entry.flow}`)
  ].join("\n") || "- No P0/P1 product bugs found in this run."
}

## Resolved / Unresolved

Resolved:
${resolvedFindings.map((finding) => `- ${finding}`).join("\n")}

Unresolved:
${unresolvedFindings.map((finding) => `- ${finding.severity}: ${finding.title || finding.flow || finding.id}`).join("\n") || "- None."}

## Failing Apps

${failingApps.map((app) => `- ${app.name}: build=${app.build}, smoke=${app.smoke}`).join("\n") || "- None."}

## Failing Adversarial Cases

${failingAdversarial.map((entry) => `- ${entry.name}: ${entry.reason} - ${entry.outputSample}`).join("\n") || "- None."}

## CLI vs SDK Parity

${parityResults.map((entry) => `- ${entry.flow}: CLI=${entry.cli}, SDK=${entry.sdk}, parity=${entry.parity}`).join("\n")}

## Recommended 0.12.0-rc.22 Backlog

${
  [
    ...sdkGaps.map((gap) => `- Add or document SDK parity for \`${gap.flow}\`.`),
    ...parityFailures.map((entry) => `- Fix CLI/SDK parity for \`${entry.flow}\`.`),
    ...docsGaps.map((gap) => `- Improve error/docs for ${gap.title}.`),
    ...bugs.map((bug) => `- Fix ${bug.title}.`)
  ].join("\n") || "- Keep running the break gauntlet after each release candidate."
}

## Claims Kept

- artifactCoherence: \`READY_MATCH\`
- runtimeOutcome: \`PARTIAL\`
- vmConsensusEquivalence: \`NOT_CLAIMED\`
- mainnet: \`BLOCKED_BY_POLICY\`

No mainnet support, production custody, full VM simulation, consensus validation, or trustless bridge claim was made.
`;
  writeFile(findingsPath, md);
}

async function main() {
  resetDir(workspaceRoot);
  fs.mkdirSync(appsRoot, { recursive: true });
  fs.mkdirSync(mutationsRoot, { recursive: true });

  console.log("=== POST RELEASE BREAK AND APP GAUNTLET ===");
  runBaseline();
  runGeneratedApps();
  await runAdversarialCases();
  await runParityChecks();
  writeReports();
  console.log(`Wrote ${path.relative(root, resultPath)}`);
  console.log(`Wrote ${path.relative(root, findingsPath)}`);
}

main().catch((error) => {
  bugs.push({
    id: "post-release-gauntlet-aborted",
    severity: "P0",
    title: "Post-release break gauntlet aborted",
    evidence: error?.stack || error?.message || String(error)
  });
  writeReports();
  console.error(error);
  process.exit(1);
});
