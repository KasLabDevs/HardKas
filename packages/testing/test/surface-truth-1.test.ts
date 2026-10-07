import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "@hardkas/sdk";
import { enumerateWorkspaceArtifactsSync, verifyArtifactIntegrity } from "@hardkas/artifacts";
import { hardKasMatchers } from "../src/matchers.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// SURFACE-TRUTH-1 (investigation, 2026-10-06, base 7e7cf630f) · BEFORE on the published matchers ("11 semantic
// matchers", `hardkas capabilities`): `toPassLineageCheck` requires `lineage` to be a non-empty ARRAY, while every
// artifact HardKAS writes carries a lineage OBJECT, so the matcher fails on every real artifact.

describe("SURFACE-TRUTH-1 · BEFORE · @hardkas/testing matchers on real artifacts", () => {
  let dir: string;
  let receipt: any;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-st1-testing-"));
    fs.writeFileSync(path.join(dir, "hardkas.config.ts"), "export default {};\n");
    await Hardkas.create({ cwd: dir, autoBootstrap: true, network: "simulated" });
    const sdk = await Hardkas.open({ cwd: dir });
    const wf: any = await sdk.workflow.run({ steps: [{ type: "tx.plan", args: { from: "alice", to: "bob", amount: "1" } }, { type: "tx.simulate" }] } as any);
    expect(wf.status).toBe("completed");
    receipt = enumerateWorkspaceArtifactsSync(dir).find((e: any) => e.artifact?.schema === "hardkas.txReceipt")?.artifact;
    expect(receipt).toBeTruthy();
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("control: the receipt passes integrity and `toHaveValidContentHash`", async () => {
    expect((await verifyArtifactIntegrity(receipt)).ok).toBe(true);
    expect(hardKasMatchers.toHaveValidContentHash(receipt).pass).toBe(true);
  });

  it("`toPassLineageCheck` passes on a real receipt whose lineage HardKAS wrote", () => {
    expect(receipt.lineage).toBeTruthy();
    const r = hardKasMatchers.toPassLineageCheck(receipt);
    expect(r.pass, r.message()).toBe(true);
  });
});
