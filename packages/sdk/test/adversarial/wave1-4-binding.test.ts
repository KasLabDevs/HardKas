import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../../src/index.js";
import { calculateContentHash, CURRENT_HASH_VERSION, finalizeTxPlanIdentity } from "@hardkas/artifacts";

// Wave 1.4 · AUD-13 / Closure Pack D-Q2 (Q2-B) / IC-6′ — signed↔plan binding in the simulator
//   T-C4b  the exact attack: the plan the signed authorizes is swapped in the store for a
//          redirected, re-hashed plan → `send` refuses, the state does not change;
//   T-B4   a redirected + re-hashed plan is a NEW identity: a signed binds to the identity
//          it authorizes and never executes another one;
//   T-B6   a wrong signer never yields the same identity and is refused (SIGNER_MISMATCH);
//   T-B7   an authorization for another plan is refused (AUTHORIZATION_PLAN_MISMATCH);
//   IC-6′.5 legacy `format: "simulated"` artifacts are unbound → send/simulate refuse with a
//          re-authorization code;
//   IC-4′.4 a LEGACY (v4) plan is never executed;
//   T-DBL  a second send executes nothing and returns the same submission;
//   N4     the synthetic txId is `synthetic-<planArtifactId>`;
//   T-DET  identical inputs in two fresh workspaces give identical identities and txIds.

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "OK";
  } catch (e: any) {
    return e?.code ?? `ERR:${e?.message}`;
  }
};

/** Code and message together, for refusals that may surface through the verifier's plain Error. */
const describeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "OK";
  } catch (e: any) {
    return `${e?.code ?? ""} ${e?.message ?? ""}`;
  }
};

const reseal = (signed: any): any => {
  const s: any = structuredClone(signed);
  delete s.contentHash;
  delete s.signedId;
  s.lineage = { ...s.lineage, artifactId: "" };
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  s.lineage.artifactId = s.contentHash;
  s.signedId = `signed-${s.contentHash.slice(0, 16)}`;
  return s;
};

function stateSnapshot(ws: string): string {
  const p = path.join(ws, ".hardkas", "localnet-state.json");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

function receiptFiles(ws: string): string[] {
  const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

describe("Wave 1.4 · signed↔plan binding (Q2-B)", () => {
  let ws: string;
  let sdk: Hardkas;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w14-bind-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  async function planAndSign(amount = "10") {
    const plan: any = await sdk.tx.plan({ from: "alice", to: "bob", amount });
    const { absolutePath } = await sdk.artifacts.write(plan);
    const signed: any = await sdk.tx.sign(plan, "alice");
    return { plan, planPath: absolutePath!, signed };
  }

  it("a signed produced by the SDK is a synthetic authorization bound to its plan; send executes it with the synthetic txId", async () => {
    const { plan, signed } = await planAndSign();
    expect(signed.signedTransaction.format).toBe("synthetic-authorization");
    expect(signed.authorization).toEqual({ kind: "synthetic", planArtifactId: plan.contentHash, signers: [plan.from.address] });
    expect(signed.txId).toBe(`synthetic-${plan.contentHash}`);
    const sent: any = await sdk.tx.send(signed);
    expect(sent.receipt.txId).toBe(`synthetic-${plan.contentHash}`);
    expect(sent.receipt.status).toBe("accepted");
  });

  it("T-C4b · the plan is swapped in the store for a redirected, re-hashed plan: send refuses and the state does not change", async () => {
    const { plan, planPath, signed } = await planAndSign();
    const carol: any = await sdk.accounts.resolve("carol");
    const redirected: any = structuredClone(plan);
    redirected.to = { ...redirected.to, address: carol.address };
    redirected.outputs = redirected.outputs.map((o: any) => (o.address === plan.to.address ? { ...o, address: carol.address } : o));
    delete redirected.contentHash;
    delete redirected.planId;
    finalizeTxPlanIdentity(redirected);
    expect(redirected.contentHash).not.toBe(plan.contentHash);
    fs.writeFileSync(planPath, JSON.stringify(redirected, null, 2)); // the attacker's swap, same file

    const before = stateSnapshot(ws);
    const receiptsBefore = receiptFiles(ws);
    await expect(sdk.tx.send(signed)).rejects.toThrow();
    expect(stateSnapshot(ws)).toBe(before);
    expect(receiptFiles(ws)).toEqual(receiptsBefore);
  });

  it("T-B4 · a redirected + re-hashed plan is a new identity: signing it binds to THAT identity, and it never executes under the original's authorization", async () => {
    const { plan, signed } = await planAndSign();
    const carol: any = await sdk.accounts.resolve("carol");
    const redirected: any = structuredClone(plan);
    redirected.to = { ...redirected.to, address: carol.address };
    redirected.outputs = redirected.outputs.map((o: any) => (o.address === plan.to.address ? { ...o, address: carol.address } : o));
    delete redirected.contentHash;
    delete redirected.planId;
    finalizeTxPlanIdentity(redirected);
    await sdk.artifacts.write(redirected);

    const signedRedirected: any = await sdk.tx.sign(redirected, "alice");
    expect(signedRedirected.authorization.planArtifactId).toBe(redirected.contentHash);
    expect(signedRedirected.lineage.parentArtifactId).toBe(redirected.contentHash);
    expect(signedRedirected.contentHash).not.toBe(signed.contentHash);
    // The original authorization can never be applied to the redirected plan.
    expect(await codeOf(sdk.tx.simulate(signed, { plan: redirected }))).toBe("PARENT_PLAN_MISMATCH");
  });

  it("T-B6 · a wrong signer is refused at authorization time and, if forged, at execution time; it never shares the identity", async () => {
    const { plan, signed } = await planAndSign();
    const bob: any = await sdk.accounts.resolve("bob");
    expect(await codeOf(sdk.tx.sign(plan, "bob"))).toBe("SIGNER_MISMATCH");

    const forged = reseal({ ...signed, authorization: { ...signed.authorization, signers: [bob.address] } });
    expect(forged.contentHash).not.toBe(signed.contentHash);
    const before = stateSnapshot(ws);
    expect(await codeOf(sdk.tx.send(forged))).toBe("SIGNER_MISMATCH");
    expect(stateSnapshot(ws)).toBe(before);
  });

  it("T-B7 · an authorization that names another plan is refused (AUTHORIZATION_PLAN_MISMATCH), whichever field is forged", async () => {
    const { signed } = await planAndSign("10");
    const other: any = await sdk.tx.plan({ from: "alice", to: "bob", amount: "20" });
    await sdk.artifacts.write(other);

    const wrongAuthorization = reseal({ ...signed, authorization: { ...signed.authorization, planArtifactId: other.contentHash } });
    expect(await codeOf(sdk.tx.send(wrongAuthorization))).toBe("AUTHORIZATION_PLAN_MISMATCH");

    const wrongLineage = reseal({
      ...signed,
      lineage: { ...signed.lineage, parentArtifactId: other.contentHash }
    });
    const before = stateSnapshot(ws);
    expect(await codeOf(sdk.tx.send(wrongLineage))).toBe("AUTHORIZATION_PLAN_MISMATCH");
    expect(stateSnapshot(ws)).toBe(before);
  });

  it("IC-6′.5 · a legacy `format: \"simulated\"` signed is unbound: send and simulate refuse with LEGACY_UNBOUND_SIGNED", async () => {
    const { plan, signed } = await planAndSign();
    const legacy: any = structuredClone(signed);
    delete legacy.authorization;
    legacy.signedTransaction = { format: "simulated", payload: `simulated-signed-tx:${plan.planId}` };
    legacy.txId = `simulated-${plan.planId}-tx`;
    const sealed = reseal(legacy);
    expect(await codeOf(sdk.tx.send(sealed))).toBe("LEGACY_UNBOUND_SIGNED");
    expect(await codeOf(sdk.tx.simulate(sealed))).toBe("LEGACY_UNBOUND_SIGNED");
  });

  it("IC-4′.4 · a LEGACY (v4) plan is never executed, even under a well-formed synthetic authorization", async () => {
    const plan: any = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    const legacy: any = structuredClone(plan);
    legacy.hashVersion = 4;
    delete legacy.contentHash;
    delete legacy.planId;
    const firstPass = calculateContentHash(legacy, 4);
    legacy.lineage = { artifactId: "", lineageId: firstPass, parentArtifactId: "", rootArtifactId: firstPass, sequence: 1 };
    legacy.contentHash = calculateContentHash(legacy, 4);
    legacy.lineage.artifactId = legacy.contentHash;
    legacy.planId = `plan-${legacy.contentHash.slice(0, 16)}`;
    await sdk.artifacts.write(legacy);

    // `sign` refuses a legacy plan outright (strict verification of the plan).
    expect(await codeOf(sdk.tx.sign(legacy, "alice"))).not.toBe("OK");

    // A hand-built authorization over the legacy plan is refused at execution.
    const { signed } = await planAndSign();
    const overLegacy = reseal({
      ...signed,
      authorization: { ...signed.authorization, planArtifactId: legacy.contentHash },
      signedTransaction: { format: "synthetic-authorization", payload: legacy.contentHash },
      txId: `synthetic-${legacy.contentHash}`,
      lineage: { artifactId: "", parentArtifactId: legacy.contentHash, lineageId: legacy.lineage.lineageId, rootArtifactId: legacy.lineage.rootArtifactId, sequence: 2 }
    });
    const refusal = await describeOf(sdk.tx.send(overLegacy));
    expect(refusal).not.toBe("OK");
    expect(refusal).toMatch(/PLAN_NOT_FULL|MIGRATION_REQUIRED/);
    expect(receiptFiles(ws)).toEqual([]);
  });

  it("T-DBL · a second send of the same authorization executes nothing and returns the same submission", async () => {
    const { signed } = await planAndSign();
    const first: any = await sdk.tx.send(signed);
    const receiptsAfterFirst = receiptFiles(ws);
    const state = stateSnapshot(ws);
    const second: any = await sdk.tx.send(signed);
    expect(second.receipt.contentHash).toBe(first.receipt.contentHash);
    expect(second.txId).toBe(first.txId);
    expect(receiptFiles(ws)).toEqual(receiptsAfterFirst);
    expect(stateSnapshot(ws)).toBe(state);
  });

  it("multisig · the threshold set is a synthetic authorization bound to the plan; a set that excludes the plan's `from` is refused", async () => {
    const plan: any = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    await sdk.artifacts.write(plan);
    const alice: any = await sdk.accounts.resolve("alice");
    const bob: any = await sdk.accounts.resolve("bob");
    const carol: any = await sdk.accounts.resolve("carol");
    const partial: any = await sdk.tx.sign(plan, "alice", { threshold: 2, requiredSigners: [alice.address, bob.address, carol.address] });
    expect(partial.status).toBe("partially_signed");
    expect(partial.signedTransaction).toBeUndefined();
    const complete: any = await sdk.tx.sign(partial, "bob", { append: true });
    expect(complete.status).toBe("signed");
    expect(complete.signedTransaction.format).toBe("synthetic-authorization");
    expect(complete.authorization).toEqual({
      kind: "synthetic",
      planArtifactId: plan.contentHash,
      signers: [alice.address, bob.address].sort()
    });
    expect(complete.txId).toBe(`synthetic-${plan.contentHash}`);
    expect(JSON.stringify(complete.multisig.signatures)).not.toMatch(/simulated-signature/);
    const sent: any = await sdk.tx.send(complete);
    expect(sent.receipt.txId).toBe(`synthetic-${plan.contentHash}`);

    // Forged set without the spending identity.
    const excluded = reseal({
      ...complete,
      authorization: { ...complete.authorization, signers: [bob.address, carol.address].sort() },
      multisig: {
        ...complete.multisig,
        signatures: complete.multisig.signatures.map((s: any, i: number) => (i === 0 ? { ...s, signer: carol.address } : s))
      }
    });
    expect(await codeOf(sdk.tx.send(excluded))).toBe("SIGNER_MISMATCH");
  });

  it("T-DET · identical inputs in two fresh workspaces yield identical plan, authorization and receipt identities and txIds", async () => {
    const run = async (root: string) => {
      const instance = await Hardkas.create({ cwd: root, autoBootstrap: true, network: "simulated" });
      const plan: any = await instance.tx.plan({ from: "alice", to: "bob", amount: "10" });
      await instance.artifacts.write(plan);
      const signed: any = await instance.tx.sign(plan, "alice");
      const sent: any = await instance.tx.send(signed);
      return { plan: plan.contentHash, signed: signed.contentHash, txId: sent.receipt.txId, receipt: sent.receipt.contentHash };
    };
    const a = await run(ws);
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w14-det-"));
    try {
      const b = await run(other);
      expect(b).toEqual(a);
      expect(a.txId).toBe(`synthetic-${a.plan}`);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });
});
