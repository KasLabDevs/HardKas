import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../../src/index.js";
import { verifyArtifactIntegritySync, resolveArtifactSync } from "@hardkas/artifacts";

// First contact · E01 — `plan → sign → simulate/send` through the public SDK.
//   Since Wave 1.4 the executor resolves the plan ONLY by the artifactId the signed
//   authorization names, from the store (IC-6′.2), and the strict verifier needs the
//   signed artifact's lineage parent in the store. `sign()` persisted the signed
//   artifact but never the plan it authorizes, so the documented flow (quickstart,
//   README, `hardkas init` test, `sdk.localnet.fund`) failed with
//   `parent_plan_unresolved`. `sign()` now persists the plan it authorizes (its
//   subject) next to the signed artifact — and never overwrites a stored copy that
//   does not verify.

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "OK";
  } catch (e: any) {
    return e?.code ?? `ERR:${e?.message}`;
  }
};

describe("First contact · E01 · sign() persists the plan it authorizes", () => {
  let ws: string;
  let sdk: Hardkas;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-fc-e01-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("the quickstart flow (plan → sign → simulate) runs without writing the plan by hand", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    const signed = await sdk.tx.sign(plan, "alice");
    const { receipt } = await sdk.tx.simulate(signed);
    expect(receipt.txId).toBe(`synthetic-${plan.contentHash}`);
  });

  it("send() on the simulator follows the same path", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "3" });
    const signed = await sdk.tx.sign(plan, "alice");
    const sent: any = await sdk.tx.send(signed);
    expect(sent.receipt.txId).toBe(`synthetic-${plan.contentHash}`);
  });

  it("sdk.localnet.fund and sdk.accounts.fund work on the simulator", async () => {
    const funded: any = await sdk.localnet.fund("bob", { amount: "100" });
    expect(funded.status).toBe("SIMULATED_ACCOUNT_FUNDED");
    expect(funded.receipt.receipt.txId).toMatch(/^synthetic-[0-9a-f]{64}$/);
    const direct: any = await sdk.accounts.fund("carol", { amount: "5" });
    expect(direct.receipt.txId).toMatch(/^synthetic-[0-9a-f]{64}$/);
  });

  it("after sign() the plan is in the store under its own identity, FULL scope, and the signed verifies strictly", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    const signed: any = await sdk.tx.sign(plan, "alice");
    const stored = resolveArtifactSync(ws, { artifact: plan.contentHash });
    const onDisk = JSON.parse(fs.readFileSync(stored.path, "utf8"));
    expect(onDisk.contentHash).toBe(plan.contentHash);
    expect(verifyArtifactIntegritySync(onDisk, { strict: true }).authScope).toBe("FULL");
    expect(signed.authorization.planArtifactId).toBe(plan.contentHash);
    await expect(sdk.artifacts.verify(signed, { throwOnInvalid: true, strict: true, enforceMetadata: false })).resolves.toBeTruthy();
  });

  it("persisting is idempotent: writing the plan again, or signing it twice, still works", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
    await sdk.artifacts.write(plan);
    const a = await sdk.tx.sign(plan, "alice");
    await sdk.artifacts.write(plan);
    const b = await sdk.tx.sign(plan, "alice");
    expect((a as any).authorization.planArtifactId).toBe(plan.contentHash);
    expect((b as any).authorization.planArtifactId).toBe(plan.contentHash);
    const { receipt } = await sdk.tx.simulate(b);
    expect(receipt.txId).toBe(`synthetic-${plan.contentHash}`);
  });

  it("a tampered stored copy of the plan is never overwritten: sign() refuses and the evidence stays on disk", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "2" });
    const { absolutePath } = await sdk.artifacts.write(plan);
    const tampered = JSON.parse(fs.readFileSync(absolutePath!, "utf8"));
    tampered.amountSompi = "1";
    fs.writeFileSync(absolutePath!, JSON.stringify(tampered, null, 2));
    const fresh = await Hardkas.open({ cwd: ws });
    const code = await codeOf(fresh.tx.sign(plan, "alice"));
    expect(code).toBe("CANDIDATE_INVALID");
    expect(JSON.parse(fs.readFileSync(absolutePath!, "utf8")).amountSompi).toBe("1");
    const signedDir = path.join(ws, ".hardkas", "artifacts", "signed");
    expect(fs.existsSync(signedDir) ? fs.readdirSync(signedDir) : []).toEqual([]);
  });

  it("the binding is unchanged: a signed artifact cannot be executed with a different plan", async () => {
    const planA = await sdk.tx.plan({ from: "alice", to: "bob", amount: "4" });
    const planB = await sdk.tx.plan({ from: "alice", to: "bob", amount: "5" });
    const signedA = await sdk.tx.sign(planA, "alice");
    await sdk.tx.sign(planB, "alice");
    expect(await codeOf(sdk.tx.simulate(signedA, { plan: planB }))).toBe("PARENT_PLAN_MISMATCH");
  });
});
