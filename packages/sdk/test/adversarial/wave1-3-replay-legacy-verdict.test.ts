import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../../src/index.js";
import { calculateContentHash } from "@hardkas/artifacts";

// Wave 1.3 · Closure Pack IC-4′.4 / IC-1′.7 (T-N7):
//   a replay verdict (pass/fail) is a decision path: it never accepts
//   `authScope: "LEGACY"`. A legacy (hashVersion ≤ 4) receipt can still be
//   replayed for evidence with its own (legacy) state digests, but the SDK
//   reports the scope instead of a pass.

describe("Wave 1.3 · replay verdict never accepts a legacy receipt", () => {
  let ws: string;
  let sdk: Hardkas;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w13-replay-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("a current receipt replays with a verdict; its v4 twin yields REPLAY_LEGACY_AUTH_SCOPE, never passed", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    await sdk.artifacts.write(plan);
    const signed: any = await sdk.tx.sign(plan, "alice");
    await sdk.artifacts.write(signed);
    const sent: any = await sdk.tx.send(signed, { persist: true });
    const receiptPath: string = sent.receiptPath;
    expect(fs.existsSync(receiptPath)).toBe(true);

    const current = await sdk.replay.verify({ path: receiptPath });
    expect(current.code).not.toBe("REPLAY_LEGACY_AUTH_SCOPE");
    expect(typeof current.passed).toBe("boolean");

    // The same receipt as rc.22 would have written it: v4, status outside the hash.
    const legacy: any = structuredClone(sent.receipt);
    legacy.hashVersion = 4;
    delete legacy.contentHash;
    legacy.contentHash = calculateContentHash(legacy, 4);
    legacy.lineage.artifactId = legacy.contentHash;
    const legacyPath = path.join(ws, "legacy-receipt.json");
    fs.writeFileSync(legacyPath, JSON.stringify(legacy, null, 2));

    const verdict = await sdk.replay.verify({ path: legacyPath });
    expect(verdict.passed).toBe(false);
    expect(verdict.code).toBe("REPLAY_LEGACY_AUTH_SCOPE");
    expect(verdict.error).toMatch(/hashVersion 4/);
    expect(verdict.error).toMatch(/migrate/);
  });
});
