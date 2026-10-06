import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "../src/index.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// SURFACE-TRUTH-1A · the contract the fix settles (the BEFORE file only requires "no plain-payment substitute"):
// every covenant planning or query method of the SDK refuses with its typed code, and writes nothing.

describe("SURFACE-TRUTH-1A · contract · SDK covenants refuse with typed codes", () => {
  let dir: string;
  let sdk: Hardkas;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-st1a-sdk-"));
    fs.writeFileSync(path.join(dir, "hardkas.config.ts"), "export default {};\n");
    await Hardkas.create({ cwd: dir, autoBootstrap: true, network: "simulated" });
    sdk = await Hardkas.open({ cwd: dir });
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const storeFiles = () => {
    const out: string[] = [];
    const walk = (d: string) => {
      if (!fs.existsSync(d)) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : out.push(path.join(d, e.name));
    };
    walk(path.join(dir, ".hardkas", "artifacts"));
    return out.sort();
  };
  const codeOf = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return "resolved";
    } catch (e: any) {
      return `${e?.name}:${e?.code}`;
    }
  };

  it("planSpend and planDeploy refuse with COVENANT_PLAN_UNSUPPORTED and write no artifact", async () => {
    const before = storeFiles();
    expect(
      await codeOf(() => sdk.covenants.planSpend({ covenantId: "cd".repeat(32), from: "alice", to: "bob", amount: 100_000_000n }))
    ).toBe("HardkasError:COVENANT_PLAN_UNSUPPORTED");
    expect(await codeOf(() => sdk.covenants.planDeploy({ script: "51", from: "alice", amount: 100_000_000n }))).toBe(
      "HardkasError:COVENANT_PLAN_UNSUPPORTED"
    );
    expect(storeFiles()).toEqual(before);
  });

  it("inspect and getState refuse with their typed codes", async () => {
    expect(await codeOf(() => sdk.covenants.inspect("ab".repeat(32)))).toBe("HardkasError:COVENANT_INSPECT_UNSUPPORTED");
    expect(await codeOf(() => sdk.covenants.getState("ab".repeat(32)))).toBe("HardkasError:COVENANT_STATE_UNSUPPORTED");
  });
});

// SURFACE-TRUTH-1A · workflows: a refused step fails the whole definition before any step runs, with its typed code.
describe("SURFACE-TRUTH-1A · contract · workflow.run refuses before running", () => {
  let dir: string;
  const open = async (mode?: "agent") =>
    Hardkas.open({ cwd: dir, ...(mode ? { mode, policy: { requireDryRun: false, allowNetwork: false } } : {}) } as any);
  const plan = { type: "tx.plan", args: { from: "alice", to: "bob", amount: "1" } };

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-st1a-wf-"));
    fs.writeFileSync(path.join(dir, "hardkas.config.ts"), "export default {};\n");
    await Hardkas.create({ cwd: dir, autoBootstrap: true, network: "simulated" });
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const outcome = (wf: any) => ({ status: wf.status, code: wf.errorEnvelope?.code ?? null, ran: wf.producedArtifacts.length, steps: wf.steps.map((s: any) => `${s.type}:${s.status}`) });

  it("an unknown step type: WORKFLOW_STEP_UNKNOWN, and the valid step before it never runs", async () => {
    const sdk = await open();
    expect(outcome(await sdk.workflow.run({ steps: [plan, { type: "tx.plann" }] } as any))).toEqual({
      status: "failed",
      code: "WORKFLOW_STEP_UNKNOWN",
      ran: 0,
      steps: ["tx.plann:failed"]
    });
  });

  it("network.switch to another network: WORKFLOW_STEP_UNSUPPORTED; to the network it runs on: completes", async () => {
    const sdk = await open();
    expect(outcome(await sdk.workflow.run({ steps: [{ type: "network.switch", args: { network: "testnet-10" } }, plan] } as any)).code).toBe(
      "WORKFLOW_STEP_UNSUPPORTED"
    );
    const same = await sdk.workflow.run({ steps: [{ type: "network.switch", args: { network: sdk.network } }, plan], dryRun: true } as any);
    expect(same.status).toBe("completed");
  });

  it("a script step: refused under agent mode and under dryRun, before it runs; allowed in developer mode", async () => {
    const marker = path.join(dir, "script-ran.txt");
    const script = { type: "script", script: `process.getBuiltinModule("node:fs").writeFileSync(${JSON.stringify(marker)}, "x"); return 1;` };
    const agent = await open("agent");
    expect(outcome(await agent.workflow.run({ steps: [script] } as any)).code).toBe("WORKFLOW_SCRIPT_REFUSED");
    const dev = await open();
    expect(outcome(await dev.workflow.run({ steps: [script], dryRun: true } as any)).code).toBe("WORKFLOW_SCRIPT_REFUSED");
    expect(fs.existsSync(marker)).toBe(false);
    expect((await dev.workflow.run({ steps: [script] } as any)).status).toBe("completed");
    expect(fs.existsSync(marker)).toBe(true);
  });
});
