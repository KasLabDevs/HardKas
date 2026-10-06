import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { enumerateWorkspaceArtifactsSync } from "@hardkas/artifacts";
import { Hardkas } from "../src/index.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// SURFACE-TRUTH-1 (investigation, 2026-10-06, base 7e7cf630f) · BEFORE on the SDK, in a simulated workspace, the part
// SURFACE-TRUTH-1A fixes:
// - ST-B · `hardkas.covenants.planSpend/planDeploy` return ordinary payment plans: the covenant id, the script and the
//   witness data they were asked for are dropped, and the plan signs and simulates as a plain payment;
// - ST-F · `workflow.run` records unknown step types and `network.switch` as success.
// The investigation's other tests here (`covenants.isSupported()` vs `capabilities.get()`, `tx.sign` refusing v1 as
// "runtime too old", the node capability matrix) belong to SURFACE-TRUTH-1B and are added with it.
// Written against the property: a surface that refuses with a typed error satisfies them as well as one that works.

describe("SURFACE-TRUTH-1 · BEFORE · SDK surfaces", () => {
  let dir: string;
  let sdk: Hardkas;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-st1-sdk-"));
    fs.writeFileSync(path.join(dir, "hardkas.config.ts"), "export default {};\n");
    await Hardkas.create({ cwd: dir, autoBootstrap: true, network: "simulated" });
    sdk = await Hardkas.open({ cwd: dir });
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const attempt = async <T>(fn: () => Promise<T>) => {
    try {
      return { value: await fn() };
    } catch (e: any) {
      return { error: { code: e?.code ?? null, message: String(e?.message ?? e) } };
    }
  };

  it("control: a simulated payment plan is a v0 txPlan from alice to bob", async () => {
    const plan: any = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
    expect(plan.schema).toBe("hardkas.txPlan");
    expect(JSON.stringify(plan)).not.toMatch(/covenant/i);
  });

  describe("ST-B · covenants", () => {
    const covenantId = "cd".repeat(32);

    it("`planSpend` never returns a plan that drops the covenant it was asked to spend", async () => {
      const r: any = await attempt(() =>
        sdk.covenants.planSpend({ covenantId, from: "alice", to: "bob", amount: 100_000_000n, witnessData: new Uint8Array([1, 2, 3]) })
      );
      if (r.error) return; // a typed refusal is truthful
      expect(JSON.stringify(r.value)).toContain(covenantId);
    });

    it("`planDeploy` never returns the plain self-payment it would plan without the script", async () => {
      const r: any = await attempt(() => sdk.covenants.planDeploy({ script: "51", from: "alice", amount: 100_000_000n }));
      if (r.error) return;
      const plain: any = await sdk.tx.plan({ from: "alice", to: "alice", amount: 100_000_000n } as any);
      const firstOutput = (p: any) => JSON.stringify((p?.outputs ?? [])[0] ?? null);
      expect(firstOutput(r.value)).not.toBe(firstOutput(plain));
    });
  });

  describe("ST-F · workflows", () => {
    it("control: tx.plan + tx.simulate completes", async () => {
      const wf: any = await sdk.workflow.run({ steps: [{ type: "tx.plan", args: { from: "alice", to: "bob", amount: "1" } }, { type: "tx.simulate" }] } as any);
      expect(wf.status).toBe("completed");
    });

    it("a step type the runtime does not know fails the workflow", async () => {
      const r: any = await attempt(() => sdk.workflow.run({ steps: [{ type: "tx.plann", args: { from: "alice", to: "bob", amount: "1" } }] } as any));
      if (r.error) return;
      expect(r.value.status).not.toBe("completed");
    });

    it("`network.switch` changes the network of the steps after it, or the workflow refuses it", async () => {
      const r: any = await attempt(() =>
        sdk.workflow.run({ steps: [{ type: "network.switch", args: { network: "testnet-10" } }, { type: "tx.plan", args: { from: "alice", to: "bob", amount: "1" } }] } as any)
      );
      if (r.error || r.value.status !== "completed") return;
      const planId = r.value.producedArtifacts?.[0];
      const plan: any = enumerateWorkspaceArtifactsSync(dir).find((e: any) => e.artifact?.contentHash === planId)?.artifact;
      expect(plan?.networkId).toBe("testnet-10");
    });
  });
});
