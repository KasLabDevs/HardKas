import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hardkas } from "../src/index.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Simulated Send Parity", () => {
  let tmpDir: string;
  let sdk: Hardkas;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-sim-send-"));
    sdk = await Hardkas.create({
      cwd: tmpDir,
      autoBootstrap: true,
      network: "simulated"
    });
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("send(signed, { persist: true }) -> artifact exists on disk", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "5" });
    const signed = await sdk.tx.sign(plan, "alice", { persist: false });
    
    const result = await sdk.tx.send(signed, { persist: true });
    
    expect(result.mode).toBe("simulated");
    expect(result.simulated).toBe(true);
    expect(result.submitted).toBe(false);
    expect(result.txId).toBeTruthy();
    expect(result.artifactId).toBeTruthy();
    expect(result.receiptPath).toBeTruthy();
    
    // txId and artifactId must not be identical if it's the real contentHash
    expect(result.txId).not.toBe(result.artifactId);
    
    // Verify file exists
    expect(fs.existsSync(result.receiptPath!)).toBe(true);
  });

  it("send(signed, { persist: false }) -> no disk write and no crash", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "5" });
    const signed = await sdk.tx.sign(plan, "alice", { persist: false });
    
    const result = await sdk.tx.send(signed, { persist: false });
    
    expect(result.mode).toBe("simulated");
    expect(result.simulated).toBe(true);
    expect(result.submitted).toBe(false);
    expect(result.receiptPath).toBeUndefined();
  });
});
