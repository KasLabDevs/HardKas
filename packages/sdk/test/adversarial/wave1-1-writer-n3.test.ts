import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "../../src/index.js";
import { CURRENT_HASH_VERSION, calculateContentHash, verifyArtifactIntegritySync } from "@hardkas/artifacts";

// Wave 1.1 · N3 (IC-1′.3–4): the SDK writer never completes an artifact after it was
// hashed. An artifact without hashVersion is refused (HASH_VERSION_MISSING); an
// artifact whose declared hash does not match its body is refused; and everything
// the simulated lifecycle persists verifies under the current version as written.

const codes = (r: { issues: Array<{ code: string }> }) => r.issues.map((i) => i.code);

function* jsonFiles(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* jsonFiles(full);
    else if (entry.name.endsWith(".json")) yield full;
  }
}

describe("Wave 1.1 · SDK writer (N3) and lifecycle self-consistency", () => {
  let ws: string;
  let sdk: Hardkas;
  beforeAll(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w11-n3-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });
  afterAll(() => fs.rmSync(ws, { recursive: true, force: true }));

  it("T-N3: write() refuses an artifact without hashVersion instead of completing it", async () => {
    const policy: any = {
      schema: "hardkas.policy.v1", hardkasVersion: "0.12.0-rc.23", version: "1.0.0-alpha",
      networkId: "simnet", mode: "simulator", createdAt: "2026-09-25T00:00:00.000Z", decision: "ALLOW", rules: []
    };
    policy.contentHash = calculateContentHash(policy, CURRENT_HASH_VERSION);
    await expect(sdk.artifacts.write(policy)).rejects.toMatchObject({ code: "HASH_VERSION_MISSING" });
    expect([...jsonFiles(path.join(ws, ".hardkas", "artifacts"))].some((f) => fs.readFileSync(f, "utf8").includes(policy.contentHash))).toBe(false);
  });

  it("T-N3: write() refuses an artifact whose body was changed after hashing", async () => {
    const policy: any = {
      schema: "hardkas.policy.v1", hardkasVersion: "0.12.0-rc.23", version: "1.0.0-alpha", hashVersion: CURRENT_HASH_VERSION,
      networkId: "simnet", mode: "simulator", createdAt: "2026-09-25T00:00:00.000Z", decision: "ALLOW", rules: []
    };
    policy.contentHash = calculateContentHash(policy, CURRENT_HASH_VERSION);
    policy.decision = "DENY"; // hash then mutate
    await expect(sdk.artifacts.write(policy)).rejects.toMatchObject({ code: "ARTIFACT_HASH_MISMATCH" });
  });

  it("T-N3: a complete artifact writes, and the file holds exactly the declared identity", async () => {
    const policy: any = {
      schema: "hardkas.policy.v1", hardkasVersion: "0.12.0-rc.23", version: "1.0.0-alpha", hashVersion: CURRENT_HASH_VERSION,
      networkId: "simnet", mode: "simulator", createdAt: "2026-09-25T00:00:00.000Z", decision: "ALLOW", rules: []
    };
    policy.contentHash = calculateContentHash(policy, CURRENT_HASH_VERSION);
    const written = await sdk.artifacts.write(policy);
    const onDisk = JSON.parse(fs.readFileSync(written.absolutePath!, "utf8"));
    expect(onDisk.hashVersion).toBe(CURRENT_HASH_VERSION);
    expect(calculateContentHash(onDisk, onDisk.hashVersion)).toBe(onDisk.contentHash);
    const verified: any = await sdk.artifacts.verify(onDisk, { throwOnInvalid: false });
    expect(verified.valid).toBe(true);
    expect(verified.authScope).toBe("FULL");
  });

  it("every artifact the simulated lifecycle persists verifies strictly as written (plan → sign → send → trace)", async () => {
    const plan: any = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    await sdk.artifacts.write(plan);
    const signed: any = await sdk.tx.sign(plan);
    await sdk.artifacts.write(signed);
    const sent: any = await sdk.tx.send(signed, { persist: true });
    expect(sent.receiptPath).toBeDefined();

    const files = [...jsonFiles(path.join(ws, ".hardkas", "artifacts"))];
    expect(files.length).toBeGreaterThanOrEqual(3);
    const seen: string[] = [];
    for (const file of files) {
      const artifact = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!artifact.contentHash) continue;
      seen.push(artifact.schema);
      expect(artifact.hashVersion, `${path.basename(file)} hashVersion`).toBe(CURRENT_HASH_VERSION);
      expect(calculateContentHash(artifact, artifact.hashVersion), `${path.basename(file)} hash(written) == hash(declared)`).toBe(artifact.contentHash);
      const r: any = verifyArtifactIntegritySync(structuredClone(artifact), { strict: true });
      expect(r.ok, `${path.basename(file)} strict verify: ${codes(r).join(",")}`).toBe(true);
      expect(r.authScope).toBe("FULL");
    }
    expect(seen).toEqual(expect.arrayContaining(["hardkas.txPlan", "hardkas.signedTx", "hardkas.txReceipt"]));
    // In-memory results are the same objects the store holds: no second identity.
    expect(calculateContentHash(plan, plan.hashVersion)).toBe(plan.contentHash);
    expect(calculateContentHash(signed, signed.hashVersion)).toBe(signed.contentHash);
    expect(calculateContentHash(sent.receipt, sent.receipt.hashVersion)).toBe(sent.receipt.contentHash);
  });
});
