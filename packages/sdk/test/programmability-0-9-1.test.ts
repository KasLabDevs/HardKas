import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas, HardkasProgrammability } from "../src/index.js";

describe("0.13.0-rc.1 programmability SDK surface", () => {
  // REMED-CLOSE · test isolation: an SDK opened with autoBootstrap writes its workspace state (.hardkas); these surfaces
  // read nothing from the workspace, so each test gets an empty temporary one, never the repository root
  let workspaceRoot = "";

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hk-sdk-programmability-"));
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("reports builder-ready programmability capabilities", async () => {
    const sdk = await Hardkas.create({
      cwd: workspaceRoot,
      network: "simulated",
      autoBootstrap: true
    });
    const prog = new HardkasProgrammability(sdk);
    const result = await prog.capabilities();

    expect(result.ok).toBe(true);
    expect(result.status).toBe("PROGRAMMABILITY_SURFACE_READY");
    expect(result.surfaces.silverScript).toBe("SILVERSCRIPT_V1_LIFECYCLE");
    expect(result.claims.silverCapabilities["silver.compile.v1"]).toBe("REAL_NODE_EVIDENCE");
    expect(result.claims.silverCapabilities["silver.p2sh.deploy-spend.v1"]).toBe("REAL_NODE_EVIDENCE");
    expect(result.claims.silverCapabilities["silver.p2sh.relative-timelock.v1"]).toBe("REAL_NODE_EVIDENCE");
    expect(result.claims.silverCapabilities["toccata.covenant.auth-1to1-transition.v1"]).toBe("REAL_NODE_EVIDENCE");
    expect(result.claims.generalCovenantSupport).toBe("NOT_CLAIMED");
    expect(result.surfaces.zkCorpus).toBe("ZK_CORPUS_SURFACE_READY");
    expect(result.surfaces.vProgsInspect).toBe("VPROGS_INSPECT_SURFACE_READY");
    expect(result.claims.mainnet).toBe("BLOCKED_BY_POLICY");
    expect(result.claims.vmConsensusEquivalence).toBe("NOT_CLAIMED");
  });

  // "verifies the root programmability corpus" recompiles with the pinned silverc:
  // see programmability-corpus.silverc.test.ts (silverc level).

  it("plans builder apps without runtime claims", async () => {
    const sdk = await Hardkas.create({
      cwd: workspaceRoot,
      network: "simulated",
      autoBootstrap: true
    });
    const prog = new HardkasProgrammability(sdk);
    const result = prog.app.plan({ kind: "full-lab" });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("PROGRAMMABILITY_APP_PLAN_READY");
    expect(result.sdkSurfaces).toContain("hardkas.zk.*");
    expect(result.claims.vProgsRuntime).toBe("NOT_CLAIMED");
  });
});
