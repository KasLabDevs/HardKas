import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSilArtifactValuesJson } from "@hardkas/core";
import { Hardkas, HardkasCorpus, HardkasSilver } from "../src/index.js";

// silverc level (AUD-41): corpus verification recompiles with, and the Silver
// surface compiles through, the pinned silverc installed in HARDKAS_HOME. The
// capability and localnet.status parity cases stay in sdk-parity-0-9-1.test.ts.

function repoRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.dirname(current);
  }
  throw new Error("repo root not found");
}

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

describe("0.12.0-rc.23 SDK parity surface (silverc installed)", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-sdk-parity-"));
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("exposes corpus.verify with machine-checkable release claims", async () => {
    const root = repoRoot();
    const sdk = await Hardkas.create({
      cwd: root,
      network: "simulated",
      autoBootstrap: true
    });
    const corpus = new HardkasCorpus(sdk);
    const result = await corpus.verify("fixtures/toccata-v2/silver");

    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.schema).toBe("hardkas.silverCorpusVerify.v1");
    expect(result.capabilities["silver.p2sh.deploy-spend.v1"]).toBe("PASS");
    expect(result.capabilities["toccata.covenant.auth-1to1-transition.v1"]).toBe("PASS");
  });

  it("compiles SilverScript with the managed silverc and reproduces a golden case", async () => {
    const caseDir = path.join(repoRoot(), "fixtures", "toccata-v2", "silver", "p2sh-signed-release");
    const golden = readJson(path.join(caseDir, "case.json")).compiles[0];
    const sdk = await Hardkas.create({ cwd: workspaceRoot, network: "simulated", autoBootstrap: true });
    const silver = new HardkasSilver(sdk);

    const compiled = await silver.compile({
      file: path.join(caseDir, golden.source),
      constructorArgs: parseSilArtifactValuesJson(fs.readFileSync(path.join(caseDir, golden.constructorArgs), "utf8"))
    });
    expect(compiled.provenance.artifactSha256).toBe(golden.provenance.artifactSha256);
    expect(compiled.provenance.compiler.releaseTag).toBe("v1.0.0");
    const p2sh = silver.p2sh(compiled);
    expect(p2sh.lockingScript).toEqual(golden.lockingScript);
    expect(p2sh.address).toBe(golden.address);
  });

  it("keeps the SDK Silver surface off mainnet and off the simulator", async () => {
    const caseDir = path.join(repoRoot(), "fixtures", "toccata-v2", "silver", "p2sh-signed-release");
    const sdk = await Hardkas.create({ cwd: workspaceRoot, network: "simulated", autoBootstrap: true });
    const silver = new HardkasSilver(sdk);
    const compiled = await silver.compile({ source: fs.readFileSync(path.join(caseDir, "contract.sil"), "utf8"), constructorArgs: parseSilArtifactValuesJson(fs.readFileSync(path.join(caseDir, "contract.constructor-args.json"), "utf8")) });

    expect(() => silver.p2sh(compiled, { network: "mainnet" })).toThrow(/SILVERSCRIPT_MAINNET_NOT_ENABLED/);
    expect((silver as any).simulate).toBeUndefined();
    expect((silver as any).compare).toBeUndefined();
  });
});
