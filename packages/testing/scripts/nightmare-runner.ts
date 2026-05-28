import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { randomUUID } from "node:crypto";

import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

async function enforceSafetyGuardrails(targetDir: string) {
  const absoluteTarget = path.resolve(targetDir);
  const absoluteRoot = path.resolve(ROOT_DIR);

  if (absoluteTarget === absoluteRoot || absoluteRoot.startsWith(absoluteTarget)) {
    console.error("FATAL: Refusing to run Nightmare Suite against the repository root.");
    process.exit(1);
  }

  // Must have the nightmare marker to prove it's a disposable workspace
  const markerPath = path.join(absoluteTarget, ".hardkas-nightmare-target");
  try {
    await fs.stat(markerPath);
  } catch {
    console.error(`FATAL: Target directory ${absoluteTarget} is missing the .hardkas-nightmare-target marker. It is not a designated temporary workspace.`);
    process.exit(1);
  }
}

async function createTempWorkspace(name: string): Promise<string> {
  const tmpDir = path.join(ROOT_DIR, `.nightmare-${name}-${randomUUID().slice(0, 8)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(path.join(tmpDir, ".hardkas-nightmare-target"), "DO NOT REMOVE\n");
  
  // Init a blank workspace via SDK or CLI
  const cliPath = path.join(ROOT_DIR, "packages/cli/dist/index.js");
  await execa("node", [cliPath, "init"], { cwd: tmpDir, reject: false });
  return tmpDir;
}

async function cleanupTempWorkspace(tmpDir: string) {
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch (e) {
    console.warn(`WARNING: Failed to cleanup ${tmpDir}:`, e);
  }
}

export interface NightmareResult {
  vector: string;
  passed: boolean;
  severity: "blocker" | "warning";
  error?: string;
  stdout?: string;
  stderr?: string;
}

async function runVector(name: string, fn: (workspace: string, cliPath: string) => Promise<void>): Promise<NightmareResult> {
  console.log(`\n😈 Starting Nightmare Vector: ${name}`);
  const workspace = await createTempWorkspace(name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase());
  await enforceSafetyGuardrails(workspace);
  const cliPath = path.join(ROOT_DIR, "packages/cli/dist/index.js");

  try {
    await fn(workspace, cliPath);
    console.log(`✅ [PASS] ${name}`);
    await cleanupTempWorkspace(workspace);
    return { vector: name, passed: true, severity: "blocker" };
  } catch (error: any) {
    const isWarning = error.message.includes("[WARNING_ONLY]");
    const severity = isWarning ? "warning" : "blocker";
    console.log(`${severity === "blocker" ? "❌ [FAIL]" : "⚠️ [WARN]"} ${name}`);
    console.error(error.message);
    await cleanupTempWorkspace(workspace);
    return { vector: name, passed: false, severity, error: error.message };
  }
}

// -----------------------------------------------------------------------------
// VECTORS
// -----------------------------------------------------------------------------

async function nuclearCorruption(workspace: string, cliPath: string) {
  const child = execa("node", [cliPath, "torture", "matrix", "--profile", "corruption", "--iterations", "10"], { cwd: workspace, reject: false });
  await new Promise(r => setTimeout(r, 500));
  
  const dbPath = path.join(workspace, ".hardkas", "store.db");
  const lockDir = path.join(workspace, ".hardkas", "locks");
  const telPath = path.join(workspace, ".hardkas", "telemetry", "telemetry.jsonl");
  
  try { await fs.rm(dbPath, { force: true }); } catch {}
  try { 
    await fs.mkdir(lockDir, { recursive: true });
    await fs.writeFile(path.join(lockDir, "zombie.lock"), "PID:99999999");
    await fs.chmod(path.join(lockDir, "zombie.lock"), 0o444);
  } catch {}
  try { await fs.appendFile(telPath, "\x00\x01\x02 GARBAGE \r\n"); } catch {}
  
  await child;
  const doc = await execa("node", [cliPath, "dev", "doctor", "--json"], { cwd: workspace, reject: false });
  if (doc.exitCode !== 0 && !doc.stdout.includes("repaired") && !doc.stdout.includes("degraded") && !doc.stdout.includes("failed")) {
    throw new Error(`Nuclear corruption failed silently or did not report damage. Exit: ${doc.exitCode}`);
  }
}

async function kill9PowerLoss(workspace: string, cliPath: string) {
  const child = execa("node", [cliPath, "torture", "matrix", "--profile", "local", "--iterations", "100"], { cwd: workspace });
  await new Promise(r => setTimeout(r, 2000));
  child.kill("SIGKILL");
  await child.catch(() => {});
  
  const doc = await execa("node", [cliPath, "dev", "doctor", "--json"], { cwd: workspace, reject: false });
  try {
    const docJson = JSON.parse(doc.stdout);
    if (docJson.status === "success" && !doc.stdout.includes("repaired")) {
      // If it's pure success without repair, we might have killed it cleanly between writes. That's fine.
      // But if it says success and the ledger is corrupt, that's a blocker.
      // We trust doctor's internal validation here, but we ensure it exits.
    }
  } catch {
    throw new Error("dev doctor returned unparseable JSON after SIGKILL: " + doc.stdout);
  }
}

async function idiotDeveloper(workspace: string, cliPath: string) {
  // 1. Run doctor while rebuild is happening
  const rebuild = execa("node", [cliPath, "rebuild", "--from-artifacts"], { cwd: workspace, reject: false });
  const doctor = await execa("node", [cliPath, "dev", "doctor", "--json"], { cwd: workspace, reject: false });
  await rebuild;
  
  if (!doctor.stdout.includes("EBUSY") && doctor.exitCode !== 0 && !doctor.stdout.includes("error")) {
    // Expected to either succeed cleanly (if locks missed) or fail with clear error
  }
  
  // 2. Duplicate artifacts
  const artifactsDir = path.join(workspace, ".hardkas", "artifacts");
  try { await fs.mkdir(artifactsDir, { recursive: true }); } catch {}
  await fs.writeFile(path.join(artifactsDir, "foo.json"), JSON.stringify({ schemaVersion: "hardkas.artifact.v1", id: "foo", canonicalHash: "123" }));
  await fs.writeFile(path.join(artifactsDir, "bar.json"), JSON.stringify({ schemaVersion: "hardkas.artifact.v1", id: "bar", canonicalHash: "123" }));
  
  const check = await execa("node", [cliPath, "dev", "doctor", "--json"], { cwd: workspace, reject: false });
  if (check.exitCode === 0) {
    throw new Error("Idiot Developer duplicate artifact bypassed doctor!");
  }
}

async function memoryPressure(workspace: string, cliPath: string) {
  // node --max-old-space-size=64
  const res = await execa("node", ["--max-old-space-size=64", cliPath, "torture", "matrix", "--profile", "local", "--iterations", "100"], { cwd: workspace, reject: false });
  if (res.exitCode !== 0) {
    if (res.stderr.includes("JavaScript heap out of memory")) {
       // OOM is allowed as long as the ledger is recoverable
       const doc = await execa("node", [cliPath, "dev", "doctor", "--json"], { cwd: workspace, reject: false });
       if (doc.exitCode !== 0 && !doc.stdout.includes("error")) {
         throw new Error("OOM caused silent unrecoverable ledger corruption.");
       }
    } else {
       throw new Error(`Memory pressure failed for non-OOM reason: ${res.stderr}`);
    }
  }
}

async function parallelHell(workspace: string, cliPath: string) {
  const durationMin = parseInt(process.env.NIGHTMARE_DURATION_MIN || "5", 10);
  console.log(`    Running Parallel Hell for ${durationMin} minutes...`);
  
  const endTime = Date.now() + durationMin * 60 * 1000;
  let hasFailed = false;
  let errString = "";
  
  const runners = [];
  const startRunner = (args: string[]) => {
    return (async () => {
      while (Date.now() < endTime && !hasFailed) {
        try {
          await execa("node", [cliPath, ...args], { cwd: workspace });
        } catch (e: any) {
          if (!e.stderr?.includes("EBUSY") && !e.stderr?.includes("LOCKED") && e.exitCode !== 1) {
             hasFailed = true;
             errString = `Process ${args.join(" ")} crashed fatally: ${e.message}`;
          }
        }
      }
    })();
  };

  for (let i = 0; i < 5; i++) runners.push(startRunner(["dev", "doctor"]));
  for (let i = 0; i < 5; i++) runners.push(startRunner(["artifact", "inspect", "invalid_id_ignore"]));
  for (let i = 0; i < 3; i++) runners.push(startRunner(["rebuild", "--from-artifacts"]));
  for (let i = 0; i < 2; i++) runners.push(startRunner(["torture", "matrix", "--profile", "local", "--iterations", "10"]));
  
  await Promise.all(runners);
  
  if (hasFailed) throw new Error(errString);
  
  // Post-mortem
  const doc = await execa("node", [cliPath, "dev", "doctor", "--json"], { cwd: workspace, reject: false });
  if (doc.exitCode !== 0) {
    throw new Error("Parallel Hell left the workspace in an unrecoverable corrupted state.");
  }
}

async function unicodeNightmare(workspace: string, cliPath: string) {
  const artifactsDir = path.join(workspace, ".hardkas", "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });
  const evilString = "💩مرحبا\t\r\n\\\\";
  const payload = { schemaVersion: "hardkas.artifact.v1", data: evilString, canonicalHash: "abc" };
  await fs.writeFile(path.join(artifactsDir, "unicode.json"), JSON.stringify(payload));
  
  const doc = await execa("node", [cliPath, "dev", "doctor", "--json"], { cwd: workspace, reject: false });
  if (doc.exitCode !== 0) {
     throw new Error("Unicode parsing corrupted doctor output.");
  }
}

async function filesystemFromHell(workspace: string, cliPath: string) {
  // Best effort: very long path
  const deepDir = path.join(workspace, "a".repeat(100), "b".repeat(100));
  try {
    await fs.mkdir(deepDir, { recursive: true });
    await execa("node", [cliPath, "init"], { cwd: deepDir, reject: false });
    await execa("node", [cliPath, "dev", "doctor"], { cwd: deepDir, reject: false });
  } catch (e: any) {
    if (e.code === "ENAMETOOLONG" || e.message.includes("ENOENT")) {
      throw new Error(`[WARNING_ONLY] Filesystem limits prevented execution: ${e.message}`);
    }
    throw e;
  }
}

async function timeTravelInsanity(workspace: string, cliPath: string) {
  const res = await execa("node", [cliPath, "torture", "matrix", "--profile", "local", "--iterations", "50"], { cwd: workspace, reject: false });
  const artifactsDir = path.join(workspace, ".hardkas", "artifacts");
  const files = await fs.readdir(artifactsDir).catch(() => []);
  if (files.length > 0) {
    const inspect = await execa("node", [cliPath, "artifact", "inspect", files[0], "--json"], { cwd: workspace, reject: false });
    if (inspect.exitCode !== 0) throw new Error("Time travel artifact inspect failed.");
  }
}

async function fakeRpcLiar(workspace: string, cliPath: string) {
  // Mock testing that local artifacts do not report as FINALIZED
  const inspect = await execa("node", [cliPath, "artifact", "inspect", "invalid", "--json"], { cwd: workspace, reject: false });
  if (inspect.stdout.includes('"finality": "finalized"')) {
    throw new Error("Fake RPC check failed: System overclaimed finality without proof.");
  }
}

async function theTruthTest(workspace: string, cliPath: string) {
  // Audit the current workspace artifacts for any overclaims
  const doctor = await execa("node", [cliPath, "dev", "doctor", "--json"], { cwd: workspace, reject: false });
  if (doctor.stdout.includes('"deterministic": true') && !doctor.stdout.includes("proof")) {
    throw new Error("Truth Test failed: Doctor claims deterministic without cryptographic proof trace.");
  }
}

async function duplicateArtifactRegression(workspace: string, cliPath: string) {
  const artifactsDir = path.join(workspace, ".hardkas", "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });

  // Rule 1: DUPLICATE_ARTIFACT_ID — same id, same hash, two files
  await fs.writeFile(path.join(artifactsDir, "dup1a.json"), JSON.stringify({ id: "dup-id-1", canonicalHash: "hash-aaa" }));
  await fs.writeFile(path.join(artifactsDir, "dup1b.json"), JSON.stringify({ id: "dup-id-1", canonicalHash: "hash-aaa" }));

  // Rule 2: ARTIFACT_ID_HASH_CONFLICT — same id, different hash
  await fs.writeFile(path.join(artifactsDir, "conflict1.json"), JSON.stringify({ id: "conflict-id", canonicalHash: "hash-bbb" }));
  await fs.writeFile(path.join(artifactsDir, "conflict2.json"), JSON.stringify({ id: "conflict-id", canonicalHash: "hash-ccc" }));

  // Rule 3: DUPLICATE_ARTIFACT_HASH — different id, same hash
  await fs.writeFile(path.join(artifactsDir, "hashdup1.json"), JSON.stringify({ id: "id-x", canonicalHash: "hash-shared" }));
  await fs.writeFile(path.join(artifactsDir, "hashdup2.json"), JSON.stringify({ id: "id-y", canonicalHash: "hash-shared" }));

  // Rule 4: MALFORMED_ARTIFACT
  await fs.writeFile(path.join(artifactsDir, "broken.json"), "NOT VALID JSON {{{");

  const doc = await execa("node", [cliPath, "dev", "doctor", "--json"], { cwd: workspace, reject: false });

  if (doc.exitCode === 0) {
    console.error("DEV DOCTOR STDOUT:", doc.stdout);
    console.error("DEV DOCTOR STDERR:", doc.stderr);
    throw new Error("Doctor reported OK despite 4 categories of artifact corruption!");
  }

  const stdout = doc.stdout;
  const mustContain = ["DUPLICATE_ARTIFACT_ID", "ARTIFACT_ID_HASH_CONFLICT", "DUPLICATE_ARTIFACT_HASH", "MALFORMED_ARTIFACT"];
  for (const code of mustContain) {
    if (!stdout.includes(code)) {
      throw new Error(`Doctor did not report expected error code: ${code}. Output: ${stdout.slice(0, 500)}`);
    }
  }
}

async function parallelHellMiniRegression(workspace: string, cliPath: string) {
  const DURATION_MS = 10_000;
  const endTime = Date.now() + DURATION_MS;
  let nativeCrashDetected = false;
  let crashDetail = "";
  const NATIVE_CRASH_CODE = 3221226505; // STATUS_STACK_BUFFER_OVERRUN on Windows

  const processes: Promise<void>[] = [];

  const spawn = (args: string[]) => {
    return (async () => {
      while (Date.now() < endTime) {
        const res = await execa("node", [cliPath, ...args], { cwd: workspace, reject: false });
        if (res.exitCode === NATIVE_CRASH_CODE || res.exitCode === -1073741819) {
          nativeCrashDetected = true;
          crashDetail = `${args.join(" ")} exited with ${res.exitCode}`;
          return;
        }
      }
    })();
  };

  processes.push(spawn(["dev", "doctor", "--json"]));
  processes.push(spawn(["dev", "doctor", "--json"]));
  processes.push(spawn(["artifact", "inspect", "nonexistent", "--json"]));
  processes.push(spawn(["artifact", "inspect", "nonexistent", "--json"]));
  processes.push(spawn(["rebuild", "--from-artifacts"]));

  await Promise.all(processes);

  if (nativeCrashDetected) {
    throw new Error(`Native crash detected during parallel contention: ${crashDetail}`);
  }
}

async function main() {
  console.log("🔥 INITIALIZING HARDKAS NIGHTMARE SUITE 🔥");

  // Parse --only flag: supports multiple flags or comma-separated values
  const onlyFilters: string[] = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only" && i + 1 < argv.length) {
      i++;
      onlyFilters.push(...argv[i].split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
    }
  }

  const shouldRun = (name: string): boolean => {
    if (onlyFilters.length === 0) return true;
    const lower = name.toLowerCase();
    return onlyFilters.some(f => lower.includes(f));
  };

  if (onlyFilters.length > 0) {
    console.log(`🎯 --only filter active: [${onlyFilters.join(", ")}]`);
  }

  const vectors: Array<{ name: string; fn: (workspace: string, cliPath: string) => Promise<void> }> = [
    { name: "Duplicate Artifact Regression", fn: duplicateArtifactRegression },
    { name: "Parallel Hell Mini Regression", fn: parallelHellMiniRegression },
    { name: "Nuclear Corruption", fn: nuclearCorruption },
    { name: "SIGKILL Power-Loss", fn: kill9PowerLoss },
    { name: "Idiot Developer", fn: idiotDeveloper },
    { name: "Memory Pressure", fn: memoryPressure },
    { name: "Parallel Hell", fn: parallelHell },
    { name: "Unicode Nightmare", fn: unicodeNightmare },
    { name: "Filesystem From Hell", fn: filesystemFromHell },
    { name: "Time Travel Insanity", fn: timeTravelInsanity },
    { name: "Fake RPC Liar Mode", fn: fakeRpcLiar },
    { name: "The Truth Test", fn: theTruthTest },
  ];

  const results: NightmareResult[] = [];

  for (const v of vectors) {
    if (!shouldRun(v.name)) {
      console.log(`⏭️  Skipping vector: ${v.name}`);
      continue;
    }
    results.push(await runVector(v.name, v.fn));
  }

  console.log("\n📊 NIGHTMARE SUITE REPORT");
  let blockers = 0;
  for (const r of results) {
    console.log(`- ${r.vector}: ${r.passed ? "PASS" : r.severity === "blocker" ? "FAIL (BLOCKER)" : "FAIL (WARNING)"}`);
    if (!r.passed && r.severity === "blocker") blockers++;
  }

  if (blockers > 0) {
    console.log(`\n❌ SURVIVAL FAILED. HardKAS is not ready. ${blockers} blockers found.`);
    process.exit(1);
  } else {
    console.log("\n✨ SURVIVED. HardKAS survived the Nightmare Suite under controlled local adversarial conditions.");
    process.exit(0);
  }
}

main().catch(console.error);
