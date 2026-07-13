import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hardkas } from "../src/index.js";

function repoRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.dirname(current);
  }
  throw new Error("repo root not found");
}

describe("0.11.3-alpha programmability SDK surface", () => {
  it("reports builder-ready programmability capabilities", async () => {
    const sdk = await Hardkas.create({
      cwd: repoRoot(),
      network: "simulated",
      autoBootstrap: true
    });
    const result = await sdk.experimental.programmability.capabilities();

    expect(result.ok).toBe(true);
    expect(result.status).toBe("PROGRAMMABILITY_SURFACE_READY");
    expect(result.surfaces.silverScript).toBe("SILVERSCRIPT_BUILDER_READY");
    expect(result.surfaces.zkCorpus).toBe("ZK_CORPUS_SURFACE_READY");
    expect(result.surfaces.vProgsInspect).toBe("VPROGS_INSPECT_SURFACE_READY");
    expect(result.claims.mainnet).toBe("BLOCKED_BY_POLICY");
    expect(result.claims.vmConsensusEquivalence).toBe("NOT_CLAIMED");
  });

  it("verifies the root programmability corpus", async () => {
    const sdk = await Hardkas.create({
      cwd: repoRoot(),
      network: "simulated",
      autoBootstrap: true
    });
    const result = await sdk.experimental.programmability.corpus.verify({
      path: "fixtures/toccata-v2"
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("PROGRAMMABILITY_CORPUS_FAIL");
    expect(result.summary.silver).toBe("PASS");
    expect(result.summary.zk).toBe("PASS");
    expect(result.summary.vprogs).toBe("FAIL");
    expect(result.claims.runtimeOutcome).toBe("PARTIAL");
  });

  it("plans builder apps without runtime claims", async () => {
    const sdk = await Hardkas.create({
      cwd: repoRoot(),
      network: "simulated",
      autoBootstrap: true
    });
    const result = sdk.experimental.programmability.app.plan({ kind: "full-lab" });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("PROGRAMMABILITY_APP_PLAN_READY");
    expect(result.sdkSurfaces).toContain("hardkas.zk.*");
    expect(result.claims.vProgsRuntime).toBe("NOT_CLAIMED");
  });
});
