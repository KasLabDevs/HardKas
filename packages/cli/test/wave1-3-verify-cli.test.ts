import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "@hardkas/sdk";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";

// Wave 1.3 · IC-4′ completion at the CLI boundary
//   AUD-07 / IC-4′.6  JSON output and exit code reflect the verdict: ok:false ⇒ EXIT≠0;
//   AUD-12 / T-A12a   `hardkas verify` is strict: a legacy artifact in the workspace fails (MIGRATION_REQUIRED);
//   AUX-08 / D-Q20    `hardkas verify [path]` verifies THAT contained path; excess arguments are a usage error;
//   AUX-01            `--deep` (a no-op) no longer exists;
//   AUX-03 / D-Q21    `artifact verify` stays non-strict by default but reports the authentication scope;
//   D-Q1.f            `artifact migrate <path> --to 5` re-issues without rewriting the source;
//   AUD-38            the repo's valid fixture corpus verifies strict.

const cliDist = path.resolve(__dirname, "../dist/index.js");
const REPO_ROOT = path.resolve(__dirname, "../../..");

function run(args: string[], cwd: string) {
  const r = spawnSync(process.execPath, [cliDist, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HARDKAS_TEST_IGNORE_STALENESS: "1", NO_COLOR: "1" }
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function parseJson(stdout: string): any {
  return JSON.parse(stdout.trim());
}

/** A plan exactly as rc.22 wrote it: v4, two-pass lineage, label copies after hashing. */
function legacyV4(plan: any): any {
  const legacy: any = structuredClone(plan);
  legacy.hashVersion = 4;
  delete legacy.contentHash;
  delete legacy.planId;
  const firstPass = calculateContentHash(legacy, 4);
  legacy.lineage = { artifactId: "", lineageId: firstPass, parentArtifactId: "", rootArtifactId: firstPass, sequence: 1 };
  legacy.contentHash = calculateContentHash(legacy, 4);
  legacy.lineage.artifactId = legacy.contentHash;
  legacy.planId = `plan-${legacy.contentHash.slice(0, 16)}`;
  legacy.artifactId = legacy.contentHash;
  return legacy;
}

describe("Wave 1.3 · hardkas verify / artifact verify / artifact migrate", () => {
  let ws: string;
  let plan: any;
  let planPath: string;
  let brokenPath: string;

  beforeAll(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w13-cli-"));
    const sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    planPath = (await sdk.artifacts.write(plan)).absolutePath!;
    const broken = structuredClone(plan);
    broken.amountSompi = "1";
    brokenPath = path.join(ws, "broken.json");
    fs.writeFileSync(brokenPath, JSON.stringify(broken, null, 2));
  });

  afterAll(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("AUD-07 · artifact verify --json on a broken hash: ok:false, EXIT≠0, ARTIFACT_HASH_MISMATCH; same verdict in human mode", () => {
    const json = run(["artifact", "verify", "broken.json", "--json"], ws);
    expect(json.status).not.toBe(0);
    const env = parseJson(json.stdout);
    expect(env.ok).toBe(false);
    expect(env.result.ok).toBe(false);
    expect(env.result.issues.map((i: any) => i.code)).toContain("ARTIFACT_HASH_MISMATCH");
    expect(env.result.authScope).toBeDefined();
    const human = run(["artifact", "verify", "broken.json"], ws);
    expect(human.status).not.toBe(0);
  });

  it("AUX-03 · artifact verify --json on a valid artifact reports ok:true, EXIT 0 and the authentication scope", () => {
    const rel = path.relative(ws, planPath);
    const json = run(["artifact", "verify", rel, "--json"], ws);
    expect(json.status, json.stderr).toBe(0);
    const env = parseJson(json.stdout);
    expect(env.ok).toBe(true);
    expect(env.result.ok).toBe(true);
    expect(env.result.authScope).toBe("FULL");
  });

  it("AUX-03 · a legacy v4 artifact verifies non-strict with authScope LEGACY and fails under --strict", () => {
    const legacyPath = path.join(ws, "legacy-plan.json");
    fs.writeFileSync(legacyPath, JSON.stringify(legacyV4(plan), null, 2));
    const relaxed = run(["artifact", "verify", "legacy-plan.json", "--json"], ws);
    expect(relaxed.status, relaxed.stderr).toBe(0);
    const env = parseJson(relaxed.stdout);
    expect(env.ok).toBe(true);
    expect(env.result.authScope).toBe("LEGACY");
    expect(env.result.unauthenticatedMaterialFields).toContain("artifactId");
    const strict = run(["artifact", "verify", "legacy-plan.json", "--json", "--strict"], ws);
    expect(strict.status).not.toBe(0);
    expect(parseJson(strict.stdout).result.issues.map((i: any) => i.code)).toContain("MIGRATION_REQUIRED");
  });

  it("AUD-12 · hardkas verify is strict over the workspace: green with only v5 artifacts, red once a legacy artifact is present", () => {
    const green = run(["verify", "--json"], ws);
    expect(green.status, green.stdout + green.stderr).toBe(0);
    expect(parseJson(green.stdout).ok).toBe(true);

    const legacyInStore = path.join(ws, ".hardkas", "artifacts", "plans", "legacy.json");
    fs.mkdirSync(path.dirname(legacyInStore), { recursive: true });
    fs.writeFileSync(legacyInStore, JSON.stringify(legacyV4(plan), null, 2));
    try {
      const red = run(["verify", "--json"], ws);
      expect(red.status).not.toBe(0);
      const env = parseJson(red.stdout);
      expect(env.ok).toBe(false);
      const allCodes = env.result.results.flatMap((r: any) => r.result.issues.map((i: any) => i.code));
      expect(allCodes).toContain("MIGRATION_REQUIRED");
      const human = run(["verify"], ws);
      expect(human.status).not.toBe(0);
    } finally {
      fs.rmSync(legacyInStore);
    }
  });

  it("AUX-08 / D-Q20 · hardkas verify <path> verifies that contained path; excess arguments and paths outside the workspace are refused", () => {
    const broken = run(["verify", "broken.json", "--json"], ws);
    expect(broken.status).not.toBe(0);
    expect(parseJson(broken.stdout).ok).toBe(false);
    const good = run(["verify", path.relative(ws, planPath), "--json"], ws);
    expect(good.status, good.stdout + good.stderr).toBe(0);
    expect(parseJson(good.stdout).ok).toBe(true);

    // Commander reports excess arguments as a usage error (non-zero exit; its own exit code).
    const excess = run(["verify", "broken.json", path.relative(ws, planPath)], ws);
    expect(excess.status).not.toBe(0);
    expect(excess.stderr).toMatch(/too many arguments|excess/i);

    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w13-outside-"));
    try {
      fs.writeFileSync(path.join(outside, "plan.json"), JSON.stringify(plan));
      const escaped = run(["verify", path.join(outside, "plan.json"), "--json"], ws);
      expect(escaped.status).not.toBe(0);
      expect(parseJson(escaped.stdout).code).toBe("ARTIFACT_PATH_OUTSIDE_WORKSPACE");
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("AUX-01 · the no-op --deep flag is gone", () => {
    const r = run(["verify", "--deep"], ws);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/unknown option '--deep'/);
  });

  it("D-Q1.f · artifact migrate <path> --to 5 re-issues the artifact plus a receipt into the store without touching the source", () => {
    const legacy = legacyV4(plan);
    const legacyPath = path.join(ws, "legacy", "plan.json");
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, JSON.stringify(legacy, null, 2));
    const before = fs.readFileSync(legacyPath, "utf8");

    const r = run(["artifact", "migrate", "legacy/plan.json", "--to", "5", "--json"], ws);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const env = parseJson(r.stdout);
    expect(env.ok).toBe(true);
    expect(env.result.sourceArtifactId).toBe(legacy.contentHash);
    expect(env.result.artifactId).toMatch(/^[0-9a-f]{64}$/);
    expect(env.result.artifactId).not.toBe(legacy.contentHash);
    expect(env.result.receiptArtifactId).toMatch(/^[0-9a-f]{64}$/);
    expect(env.result.legacyClaims).toContain("artifactId");
    expect(fs.readFileSync(legacyPath, "utf8")).toBe(before);
    expect(fs.existsSync(path.join(ws, env.result.artifactPath))).toBe(true);
    expect(fs.existsSync(path.join(ws, env.result.receiptPath))).toBe(true);
    // Review B1: the legacy source stays in the store (it is the re-issue's parent),
    // byte-identical in content to the verified source.
    expect(env.result.sourcePath).toMatch(/^\.hardkas\/artifacts\//);
    expect(JSON.parse(fs.readFileSync(path.join(ws, env.result.sourcePath), "utf8")).contentHash).toBe(legacy.contentHash);

    // The re-issued artifacts are strict-valid members of the workspace, through the
    // normal parent path; the legacy source is reported as superseded, not as valid FULL.
    const verify = run(["verify", "--json"], ws);
    expect(verify.status, verify.stdout + verify.stderr).toBe(0);
    const verified = parseJson(verify.stdout);
    const sourceRow = verified.result.results.find((r: any) => r.result.actualHash === legacy.contentHash);
    expect(sourceRow).toBeDefined();
    expect(sourceRow.result.authScope).toBe("LEGACY");
    expect(sourceRow.result.issues.map((i: any) => i.code)).toContain("SUPERSEDED_BY_MIGRATION");
    expect(sourceRow.result.issues.map((i: any) => i.code)).not.toContain("MIGRATION_REQUIRED");
    const allCodes = verified.result.results.flatMap((r: any) => r.result.issues.map((i: any) => i.code));
    expect(allCodes.some((c: string) => /PARENT_MISSING|PARENT_MIGRATED|MIGRATION_SOURCE_ABSENT/.test(c))).toBe(false);

    const again = run(["artifact", "migrate", env.result.artifactPath, "--to", "5", "--json"], ws);
    expect(again.status).not.toBe(0);
    expect(parseJson(again.stdout).code).toBe("MIGRATION_NOT_NEEDED");
    const wrongTarget = run(["artifact", "migrate", "legacy/plan.json", "--to", "4", "--json"], ws);
    expect(wrongTarget.status).not.toBe(0);
    expect(parseJson(wrongTarget.stdout).code).toBe("MIGRATION_TARGET_UNSUPPORTED");
  });

  it("review B1 · hardkas verify refuses a forged MigrationReceipt over a ghost parent (PARENT_MISSING, EXIT≠0)", async () => {
    const forgeWs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w13-forge-"));
    try {
      await Hardkas.create({ cwd: forgeWs, autoBootstrap: true, network: "simulated" });
      const ghost = "e".repeat(64);
      const seal = (body: Record<string, unknown>) => {
        const a: any = { ...body, hashVersion: CURRENT_HASH_VERSION };
        a.contentHash = calculateContentHash(a, CURRENT_HASH_VERSION);
        if (a.lineage) a.lineage.artifactId = a.contentHash;
        return a;
      };
      const signed = seal({
        schema: "hardkas.signedTx",
        hardkasVersion: "0.12.0-rc.23",
        version: "1.0.0-alpha",
        networkId: "simnet",
        mode: "simulator",
        createdAt: "2026-09-25T00:00:00.000Z",
        execution: { mode: "simulator", domain: "kaspa-l1", network: "simnet" },
        status: "signed",
        sourcePlanId: "plan-0000000000000000",
        from: { address: "kaspasim:qqalice" },
        to: { address: "kaspasim:qqbob" },
        amountSompi: "1",
        workflowId: "wf_0000000000000000",
        assumptionLevel: "local-simulated",
        signedTransaction: { format: "simulated", payload: "x" },
        lineage: { artifactId: "", parentArtifactId: ghost, lineageId: ghost, rootArtifactId: ghost, sequence: 2 }
      });
      signed.signedId = `signed-${signed.contentHash.slice(0, 16)}`;
      const receipt = seal({
        schema: "hardkas.migrationReceipt.v1",
        hardkasVersion: "0.12.0-rc.23",
        version: "1.0.0-alpha",
        networkId: "simnet",
        mode: "simulator",
        createdAt: "2026-09-25T00:00:00.000Z",
        oldHash: ghost,
        newHash: signed.contentHash,
        fromSchema: "hardkas.signedTx",
        toSchema: "hardkas.signedTx",
        migrationId: "forged",
        decision: "MIGRATED_WITH_PROOF",
        lineage: { artifactId: "", parentArtifactId: ghost, lineageId: ghost, rootArtifactId: ghost, sequence: 1 }
      });
      const store = path.join(forgeWs, ".hardkas", "artifacts");
      fs.mkdirSync(path.join(store, "signed"), { recursive: true });
      fs.mkdirSync(path.join(store, "misc"), { recursive: true });
      fs.writeFileSync(path.join(store, "signed", "forged-signed.json"), JSON.stringify(signed, null, 2));
      fs.writeFileSync(path.join(store, "misc", "forged-receipt.json"), JSON.stringify(receipt, null, 2));

      const r = run(["verify", "--json"], forgeWs);
      expect(r.status).not.toBe(0);
      const env = parseJson(r.stdout);
      expect(env.ok).toBe(false);
      const byFile = (name: string) => env.result.results.find((x: any) => x.file.endsWith(name));
      for (const name of ["forged-signed.json", "forged-receipt.json"]) {
        const row = byFile(name);
        expect(row, name).toBeDefined();
        expect(row.result.ok, name).toBe(false);
        const rowCodes = row.result.issues.map((i: any) => i.code);
        expect(rowCodes, name).toContain("PARENT_MISSING");
        expect(rowCodes.some((c: string) => /PARENT_MIGRATED|MIGRATION_SOURCE_ABSENT|SUPERSEDED_BY_MIGRATION/.test(c)), name).toBe(false);
      }
    } finally {
      fs.rmSync(forgeWs, { recursive: true, force: true });
    }
  });

  it("review B1-bis · a v5 child plus a forged receipt does not supersede its legacy root: hardkas verify keeps MIGRATION_REQUIRED, EXIT≠0", async () => {
    const attackWs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w13-descendant-"));
    try {
      const sdk = await Hardkas.create({ cwd: attackWs, autoBootstrap: true, network: "simulated" });
      const rootPlan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
      const legacy = legacyV4(rootPlan);
      const { ProjectArtifactStore, createLineageTransition } = await import("@hardkas/artifacts");
      const store = new ProjectArtifactStore(attackWs);
      await store.writeArtifact(legacy);
      // Wave 1.4 (IC-6′ / IC-4′.4): the producer refuses to authorize a legacy plan, so the
      // descendant is sealed by hand as an intact, non-synthetic (unbound) v5 signed.
      const child: any = {
        schema: "hardkas.signedTx",
        hardkasVersion: "0.12.0-rc.23",
        version: "1.0.0-alpha",
        hashVersion: CURRENT_HASH_VERSION,
        networkId: legacy.networkId,
        mode: legacy.mode,
        createdAt: "2026-09-25T00:00:00.000Z",
        execution: legacy.execution,
        status: "signed",
        sourcePlanId: legacy.planId,
        from: { address: legacy.from.address },
        to: { address: legacy.to.address },
        amountSompi: legacy.amountSompi,
        ...(legacy.workflowId ? { workflowId: legacy.workflowId } : {}),
        ...(legacy.assumptionLevel ? { assumptionLevel: legacy.assumptionLevel } : {}),
        txId: "f".repeat(64),
        signedTransaction: { format: "hex", payload: "deadbeef" },
        lineage: createLineageTransition(legacy, "hardkas.signedTx")
      };
      child.contentHash = calculateContentHash(child, CURRENT_HASH_VERSION);
      child.lineage.artifactId = child.contentHash;
      child.signedId = `signed-${child.contentHash.slice(0, 16)}`;
      await store.writeArtifact(child);
      const receipt: any = {
        schema: "hardkas.migrationReceipt.v1",
        hardkasVersion: "0.12.0-rc.23",
        version: "1.0.0-alpha",
        hashVersion: CURRENT_HASH_VERSION,
        networkId: "simnet",
        mode: "simulator",
        createdAt: "2026-09-25T00:00:00.000Z",
        oldHash: legacy.contentHash,
        newHash: child.contentHash,
        fromSchema: "hardkas.txPlan",
        toSchema: "hardkas.signedTx",
        migrationId: "forged-descendant",
        decision: "MIGRATED_WITH_PROOF",
        lineage: { artifactId: "", parentArtifactId: legacy.contentHash, lineageId: legacy.lineage.lineageId, rootArtifactId: legacy.lineage.rootArtifactId, sequence: 2 }
      };
      receipt.contentHash = calculateContentHash(receipt, CURRENT_HASH_VERSION);
      receipt.lineage.artifactId = receipt.contentHash;
      await store.writeArtifact(receipt);

      const r = run(["verify", "--json"], attackWs);
      expect(r.status).not.toBe(0);
      const env = parseJson(r.stdout);
      expect(env.ok).toBe(false);
      const sourceRow = env.result.results.find((x: any) => x.result.actualHash === legacy.contentHash);
      expect(sourceRow).toBeDefined();
      expect(sourceRow.result.issues.map((i: any) => i.code)).toContain("MIGRATION_REQUIRED");
      expect(sourceRow.result.issues.map((i: any) => i.code)).not.toContain("SUPERSEDED_BY_MIGRATION");
    } finally {
      fs.rmSync(attackWs, { recursive: true, force: true });
    }
  });

  it("AUD-38 · the repository's valid fixture corpus verifies strict (the check:artifacts gate has something to verify)", () => {
    const fixtures = path.join(REPO_ROOT, "packages", "artifacts", "test", "fixtures", "valid");
    const files = fs.readdirSync(fixtures).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(3);
    const r = run(["artifact", "verify", path.relative(REPO_ROOT, fixtures), "--recursive", "--strict", "--json"], REPO_ROOT);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const env = parseJson(r.stdout);
    expect(env.ok).toBe(true);
    expect(env.result.scanned).toBe(files.length);
    expect(env.result.failCount).toBe(0);
    const rootPkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    expect(rootPkg.scripts["artifact:fixtures"]).toContain("packages/artifacts/test/fixtures/valid");
  });
});
