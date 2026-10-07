import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Hardkas } from "../src/index.js";
import { startFakeWrpcNode, type FakeWrpcNode } from "../../kaspa-rpc/test/helpers/fake-wrpc-node.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// RESOURCE-LIFECYCLE-1 (R0B) · RL-I1: an SDK instance releases, in close(), exactly the resources it created itself,
// marked as its own when it created them (never inferred from a type or a state). RL-I2: a client handed to it, or
// assigned to `sdk.rpc` afterwards (the CLI runners do), is its caller's and close() never touches it. close() is
// idempotent and never throws, so it fits a finally.

const FIXTURE_ADDRESS = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";

describe("RESOURCE-LIFECYCLE-1 · Hardkas.close()", () => {
  let node: FakeWrpcNode;
  let parent: string;
  let ws: string;

  beforeAll(async () => {
    node = await startFakeWrpcNode();
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r0b-sdk-"));
    ws = path.join(parent, "ws");
    fs.mkdirSync(path.join(ws, ".hardkas"), { recursive: true });
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default {\n  networks: {\n    simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "${node.url}" }\n  }\n};\n`);
  });

  afterAll(async () => {
    await node?.close();
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it("RL-I1: close() releases the client the instance created, once per call, and is idempotent", async () => {
    const sdk = await Hardkas.open({ cwd: ws, network: "simnet" });
    const own = vi.spyOn(sdk.rpc, "close");
    await sdk.close();
    await sdk.close();
    expect(own).toHaveBeenCalledTimes(2);
  });

  it("RL-I1: a simulated instance releases the provider open() created for it", async () => {
    const sim = path.join(parent, "sim");
    fs.mkdirSync(sim);
    const sdk = await Hardkas.open({ cwd: sim, network: "simulated", autoBootstrap: true });
    const own = vi.spyOn(sdk.rpc, "close");
    await sdk.close();
    expect(own).toHaveBeenCalledTimes(1);
  });

  it("RL-I2: a client passed to the instance is its caller's: close() never closes it", async () => {
    const injected = { close: vi.fn(async () => {}) };
    const config = { cwd: ws, config: { defaultNetwork: "simnet", networks: { simnet: { kind: "kaspa-rpc", rpcUrl: node.url } } } };
    const sdk = new (Hardkas as any)(config, { mode: "developer" }, injected);
    await sdk.close();
    expect(injected.close).not.toHaveBeenCalled();
  });

  it("RL-I2: a client assigned to sdk.rpc afterwards is its assigner's; close() releases only the instance's own", async () => {
    const sdk = await Hardkas.open({ cwd: ws, network: "simnet" });
    const own = vi.spyOn(sdk.rpc, "close");
    const swapped = { close: vi.fn(async () => {}) };
    (sdk as any).rpc = swapped;
    await sdk.close();
    expect({ own: own.mock.calls.length, swapped: swapped.close.mock.calls.length }).toEqual({ own: 1, swapped: 0 });
  });

  it("close() never throws, even when releasing its own client fails", async () => {
    const sdk = await Hardkas.open({ cwd: ws, network: "simnet" });
    vi.spyOn(sdk.rpc, "close").mockRejectedValue(new Error("release failed"));
    await expect(sdk.close()).resolves.toBeUndefined();
  });

  // Direct SDK use with the real pinned kaspa-wasm against the fake node: each case runs in a child process that does
  // its work and RETURNS; it must then end by itself.
  describe("a process that closed its SDK ends by itself (real kaspa-wasm, fake node)", () => {
    const dist = fileURLToPath(new URL("../dist/index.js", import.meta.url));
    let script: string;

    beforeAll(() => {
      script = path.join(parent, "case.mjs");
      fs.writeFileSync(
        script,
        [
          `import { pathToFileURL } from "node:url";`,
          `const [dist, ws, kase, address] = process.argv.slice(2);`,
          `const { Hardkas } = await import(pathToFileURL(dist).href);`,
          `const sdk = await Hardkas.open({ cwd: ws, network: "simnet" });`,
          `const outcome = (p) => p.then(() => "ok", (e) => String(e?.code ?? e?.name));`,
          `if (kase === "fund-wait") {`,
          `  // the SDK side of localnet fund: wait for spendable funding on the instance's own client`,
          `  console.log("wait", await outcome(sdk.utxos.waitForSpendableFunding({ address, minSpendableSompi: 1n, timeoutMs: 1500, pollIntervalMs: 200 })));`,
          `} else {`,
          `  console.log("request", await outcome(sdk.rpc.getBlockDagInfo()));`,
          `}`,
          `if (kase !== "no-close") await sdk.close();`,
          `console.log("returned");`
        ].join("\n")
      );
    });

    const run = (kase: string, killAfterMs: number) =>
      new Promise<{ killed: boolean; exit: number | null; out: string }>((resolve) => {
        const env: NodeJS.ProcessEnv = {};
        for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("VITEST") && k !== "NODE_ENV") env[k] = v;
        const child = spawn(process.execPath, [script, dist, ws, kase, FIXTURE_ADDRESS], { env, windowsHide: true });
        let out = "";
        child.stdout.on("data", (d) => (out += d));
        child.stderr.on("data", (d) => (out += d));
        let killed = false;
        const timer = setTimeout(() => {
          killed = true;
          child.kill();
        }, killAfterMs);
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve({ killed, exit: killed ? null : code, out: out.trim() });
        });
      });

    it("the harness sees a leak: an SDK used and never closed keeps the process alive (the caller owns the instance)", async () => {
      const before = node.connections();
      const r = await run("no-close", 8_000);
      expect(r.killed, r.out).toBe(true);
      expect(node.connections()).toBeGreaterThan(before);
    });

    it("Hardkas.open → a request on its own client → sdk.close(): the process ends by itself", async () => {
      const r = await run("request", 20_000);
      expect({ killed: r.killed, exit: r.exit, returned: r.out.includes("returned") }, r.out).toEqual({ killed: false, exit: 0, returned: true });
    });

    it("localnet fund's SDK path (waitForSpendableFunding fails on the fake node) → sdk.close(): the process ends by itself", async () => {
      const r = await run("fund-wait", 20_000);
      expect({ killed: r.killed, exit: r.exit, returned: r.out.includes("returned") }, r.out).toEqual({ killed: false, exit: 0, returned: true });
    });
  });
});
