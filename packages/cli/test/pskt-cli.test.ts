import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { startFakeNode, type FakeNode } from "./helpers/int9-a-fake-node.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

describe("hardkas pskt CLI flow", () => {
  // SURFACE-TRUTH-1B (ST-C): the CLI with the test double registered by this test's own entry point; the product
  // registers none (NODE_ENV=test no longer adds one).
  const cliPath = resolve(__dirname, "helpers/pskt-cli-with-test-double.ts");
  const tsxBin = resolve(__dirname, "../../../node_modules/.bin/tsx");
  const actualTsx = existsSync(tsxBin) ? tsxBin : "npx tsx";
  // Outside the repository: a run that dies before cleanup must not leave files a commit can pick up.
  let tempDir: string;
  // A1 (rc2 audit): `pskt sign` signs only for the signer's own network (here the workspace's, simnet) and only inputs
  // its node lists as unspent; the node is a loopback fake that lists the plan's one input at the key's address. The
  // CLI runs asynchronously so the fake (in this process) can answer it.
  let fake: FakeNode;
  const KEY = "11".repeat(32);
  const OUTPOINT = "ab".repeat(32);

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "hardkas-pskt-cli-"));
    const k: any = loadManagedKaspaWasmSync();
    const address = new k.PrivateKey(KEY).toPublicKey().toAddress("simnet");
    const script = "0000" + String(k.payToAddressScript(address).script);
    fake = await startFakeNode("pskt-cli", {
      network: "simnet",
      utxos: [{ address: String(address.toString()), transactionId: OUTPOINT, index: 0, amount: "100000000", blockDaaScore: "1" }]
    });
    writeFileSync(
      resolve(tempDir, "hardkas.config.ts"),
      `export default ${JSON.stringify({ defaultNetwork: "simnet", networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: fake.url } } }, null, 2)};\n`
    );
    // Write a dummy TxPlan (one input of the key, which the fake node lists)
    writeFileSync(resolve(tempDir, "plan.json"), JSON.stringify({
      kind: "hardkas-tx-plan",
      version: 1,
      planId: "test-plan",
      networkId: "simnet",
      inputs: [{ outpoint: { transactionId: OUTPOINT, index: 0 }, amountSompi: "100000000", scriptPublicKey: script }],
      outputs: []
    }));
  });

  afterAll(async () => {
    await fake?.close();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  async function runHardkas(args: string, env: any = {}): Promise<{ ok: boolean; stdout: string; stderr?: string }> {
    const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((done) => {
      const child = spawn(`${actualTsx} ${cliPath} pskt ${args}`, {
        env: { ...process.env, NODE_OPTIONS: "--no-warnings", NODE_ENV: "test", HARDKAS_EXPERIMENTAL: "1", ...env },
        cwd: tempDir,
        shell: true,
        windowsHide: true
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += String(d)));
      child.stderr.on("data", (d) => (stderr += String(d)));
      child.on("close", (status) => done({ status, stdout, stderr }));
    });
    if (r.status === 0) return { ok: true, stdout: r.stdout };
    console.error(`runHardkas failed for args: ${args}`);
    console.error(`stdout: ${r.stdout}`);
    console.error(`stderr: ${r.stderr}`);
    return { ok: false, stdout: r.stdout, stderr: r.stderr };
  }

  describe("Capabilities and Gating", () => {
    it("reports unsupported capabilities for kaspa-wasm-local", async () => {
      const result = await runHardkas("capabilities --adapter kaspa-wasm-local --json");
      expect(result.ok).toBe(true);
      const caps = JSON.parse(result.stdout);
      expect(caps.operations.export).toBe(false);
      expect(caps.operations.sign).toBe(false);
    });

    it("fails with PSKT_OPERATION_UNSUPPORTED when using default adapter", async () => {
      const result = await runHardkas("export --plan plan.json --out sess.json --adapter kaspa-wasm-local --json");
      expect(result.ok).toBe(false);
      expect(result.stdout).toContain("PSKT_OPERATION_UNSUPPORTED");
    });

    it("reports supported capabilities for test-fake-adapter", async () => {
      const result = await runHardkas("capabilities --adapter test-fake-adapter --json");
      expect(result.ok).toBe(true);
      const caps = JSON.parse(result.stdout);
      expect(caps.operations.export).toBe(true);
      expect(caps.operations.sign).toBe(true);
    });
  });

  describe("End-to-End Fake Flow", () => {
    it("exports a session", async () => {
      const res = await runHardkas("export --plan plan.json --adapter test-fake-adapter --out session-0.json --json");
      expect(res.ok).toBe(true);
      expect(existsSync(resolve(tempDir, "session-0.json"))).toBe(true);
    });

    it("inspects the exported session", async () => {
      const res = await runHardkas("inspect session-0.json --json");
      expect(res.ok).toBe(true);
      const meta = JSON.parse(res.stdout);
      expect(meta.planId).toBe("test-plan");
      expect(meta.revision).toBe(0);
      expect(meta.runtimeBinding.adapterId).toBe("test-fake-adapter");
    });

    it("verifies the exported session", async () => {
      const res = await runHardkas("verify session-0.json --json");
      expect(res.ok).toBe(true);
      const verify = JSON.parse(res.stdout);
      expect(verify.valid).toBe(true);
      expect(verify.integrity).toBe("PASS");
    });

    it("signs the session", async () => {
      // TX-09: the command now reads one 32-byte key (64 hex) and signs named inputs (it used to pass `privateKey` and
      // `inputIndexes: []`, which no real adapter accepts); the test double accepts any key
      writeFileSync(resolve(tempDir, "key.txt"), "11".repeat(32));
      const res = await runHardkas("sign session-0.json --private-key-file key.txt --inputs 0 --out session-1.json --json");
      expect(res.ok).toBe(true);
      
      const inspect = await runHardkas("inspect session-1.json --json");
      const meta = JSON.parse(inspect.stdout);
      expect(meta.revision).toBe(1);
    });

    it("creates a conflicting signature session-2", async () => {
      writeFileSync(resolve(tempDir, "key2.txt"), "22".repeat(32));
      const res = await runHardkas("sign session-0.json --private-key-file key2.txt --inputs 0 --out session-2.json --json");
      expect(res.ok).toBe(true);
    });

    it("merges session-1 and session-2", async () => {
      const res = await runHardkas("merge session-1.json session-2.json --out session-merged.json --json");
      expect(res.ok).toBe(true);

      const inspect = await runHardkas("inspect session-merged.json --json");
      const meta = JSON.parse(inspect.stdout);
      expect(meta.revision).toBe(2);
    });

    it("finalizes the merged session", async () => {
      const res = await runHardkas("finalize session-merged.json --out session-finalized.json --json");
      expect(res.ok).toBe(true);
    });

    it("extracts the Kaspa transaction", async () => {
      const res = await runHardkas("extract session-finalized.json --out tx.json --json");
      expect(res.ok).toBe(true);
      expect(existsSync(resolve(tempDir, "tx.json"))).toBe(true);
      const tx = require(resolve(tempDir, "tx.json"));
      expect(tx.kind).toBe("hardkas-transaction");
      expect(tx.txId).toBe("fake-tx-id");
    });

    it("refuses to overwrite without --force", async () => {
      const res = await runHardkas("extract session-finalized.json --out tx.json --json");
      expect(res.ok).toBe(false);
      expect(res.stdout).toContain("already exists");
      expect(res.stdout).toContain("Use --force to overwrite");
    });

    it("overwrites with --force", async () => {
      const res = await runHardkas("extract session-finalized.json --out tx.json --force --json");
      expect(res.ok).toBe(true);
    });
  });
});
