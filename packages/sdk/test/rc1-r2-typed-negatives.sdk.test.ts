import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "../src/index.js";

// RC1-R2 · negative cases typed in the SDK too. A tampered artifact reached SDK callers as a plain Error ("corrupted or
// invalid", no code) while the CLI said ARTIFACT_HASH_MISMATCH; and sdk.tx.sign judged a tampered plan's edited body
// (fee, covenant inputs) before its integrity. Now the SDK raises the same typed code as the CLI, first, and keeps its
// message words. (Immature funds: packages/tx-builder/test/rc1-r2-immature-typed.test.ts.)

describe("RC1-R2 · a tampered artifact is ARTIFACT_HASH_MISMATCH in the SDK", () => {
  let sdk: Hardkas;
  let tmp: string;

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r2-neg-"));
    sdk = await Hardkas.create({ cwd: tmp, autoBootstrap: true, network: "simulated" });
  });
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("N-1 sdk.tx.sign of a plan edited after it was sealed: code ARTIFACT_HASH_MISMATCH, nothing signed", async () => {
    const plan = await sdk.tx.plan({ from: "kaspa:sim_alice", to: "kaspa:sim_bob", amount: "10" });
    const tampered = JSON.parse(JSON.stringify(plan));
    tampered.amountSompi = String(BigInt(tampered.amountSompi) + 1n);
    const err: any = await sdk.tx.sign(tampered, "kaspa:sim_alice").then(
      () => undefined,
      (e) => e
    );
    expect(err, "sign must refuse").toBeDefined();
    expect(err.code).toBe("ARTIFACT_HASH_MISMATCH");
    expect(String(err.message)).toMatch(/corrupted or invalid/);
  });

  it("N-2 sdk.tx.send of a signed transaction edited after it was sealed: code ARTIFACT_HASH_MISMATCH", async () => {
    const plan = await sdk.tx.plan({ from: "kaspa:sim_alice", to: "kaspa:sim_bob", amount: "10" });
    const signed = await sdk.tx.sign(plan, "kaspa:sim_alice");
    const tampered = JSON.parse(JSON.stringify(signed));
    tampered.amountSompi = tampered.amountSompi + "99";
    const err: any = await sdk.tx.send(tampered).then(
      () => undefined,
      (e) => e
    );
    expect(err, "send must refuse").toBeDefined();
    expect(err.code).toBe("ARTIFACT_HASH_MISMATCH");
  });

  it("N-3 sdk.artifacts.verify(tampered, { throwOnInvalid: true }) throws typed; the non-throwing form is unchanged", async () => {
    const plan = await sdk.tx.plan({ from: "kaspa:sim_alice", to: "kaspa:sim_bob", amount: "10" });
    const tampered = JSON.parse(JSON.stringify(plan));
    tampered.to.address = "kaspa:sim_carol";
    const err: any = await sdk.artifacts.verify(tampered, { throwOnInvalid: true }).then(
      () => undefined,
      (e) => e
    );
    expect(err?.code).toBe("ARTIFACT_HASH_MISMATCH");
    expect(err?.metadata?.reason).toBe("content_hash_mismatch");
    const soft: any = await sdk.artifacts.verify(tampered, { throwOnInvalid: false });
    expect(soft).toMatchObject({ valid: false, reason: "content_hash_mismatch" });
  });
});
