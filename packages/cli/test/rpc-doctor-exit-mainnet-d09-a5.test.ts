import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { buildHardkasProgram } from "../src/program.js";
import { runRpcDoctor } from "../src/runners/rpc-doctor-runner.js";
import { startFakeNode, type FakeNode } from "./helpers/int9-a-fake-node.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// D-09 (rc2 audit) · `hardkas rpc doctor --endpoints ws://127.0.0.1:1` printed ❌ and exited 0: scripts could not trust
// it. Now it exits 1 (RPC_DOCTOR_NOT_READY) when any endpoint asked for is not ready; the report is unchanged.
// A5 (rc2 audit) · it probed an EVM endpoint with a raw eth_chainId and printed "ready" for a mainnet chain. Now a chain
// id that is always mainnet (1, 38833: @hardkas/l2's KNOWN_MAINNET_CHAIN_IDS) is refused after that one identity answer,
// and an endpoint the config declares as a mainnet is refused before any contact. Loopback fakes only.

let fake: FakeNode;
let dir = "";
const evm = { server: undefined as http.Server | undefined, url: "", chainId: "0x1", methods: [] as string[] };

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-d09-a5-"));
  fake = await startFakeNode("d09", { network: "simnet" });
  evm.server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += String(d)));
    req.on("end", () => {
      const method = (() => {
        try {
          return String(JSON.parse(body).method);
        } catch {
          return "?";
        }
      })();
      evm.methods.push(method);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: evm.chainId }));
    });
  });
  await new Promise<void>((r) => evm.server!.listen(0, "127.0.0.1", () => r()));
  evm.url = `http://127.0.0.1:${(evm.server!.address() as AddressInfo).port}/rpc`;
});
afterAll(async () => {
  await fake?.close();
  await new Promise<void>((r) => (evm.server ? evm.server.close(() => r()) : r()));
  fs.rmSync(dir, { recursive: true, force: true });
});
afterEach(() => {
  process.exitCode = undefined;
  evm.methods = [];
});

async function doctor(...endpoints: string[]): Promise<number | undefined> {
  process.exitCode = undefined;
  await buildHardkasProgram().parseAsync(["rpc", "doctor", "--endpoints", ...endpoints], { from: "user" });
  const code = typeof process.exitCode === "number" ? process.exitCode : undefined;
  process.exitCode = undefined;
  return code;
}

describe("D-09 · rpc doctor exits 1 when an endpoint is not ready", () => {
  it("a closed port → exit 1", async () => {
    expect(await doctor("ws://127.0.0.1:1")).toBe(1);
  });

  it("a node that answers → exit 0; one ready and one closed → exit 1", async () => {
    expect(await doctor(fake.url)).toBeUndefined();
    expect(await doctor(fake.url, "ws://127.0.0.1:1")).toBe(1);
  });
});

describe("A5 · rpc doctor never reports an EVM mainnet as ready", () => {
  for (const [name, chainId] of [
    ["Ethereum mainnet", "0x1"],
    ["Igra mainnet", "0x97b1"]
  ] as const) {
    it(`${name} (${chainId}) → mainnet_refused after the single eth_chainId, exit 1`, async () => {
      evm.chainId = chainId;
      const [r] = await runRpcDoctor({ endpoints: [evm.url] });
      expect({ status: r!.health.status, rpcReachable: r!.health.rpcReachable, methods: evm.methods }).toEqual({
        status: "mainnet_refused",
        rpcReachable: false,
        methods: ["eth_chainId"]
      });
      expect(r!.health.error).toMatch(/MAINNET_CONNECTION_DISABLED/);
      evm.methods = [];
      expect(await doctor(evm.url)).toBe(1);
    });
  }

  it("a testnet chain id is still probed and reported ready", async () => {
    evm.chainId = "0x7a69";
    const [r] = await runRpcDoctor({ endpoints: [evm.url] });
    expect(r!.health.status).toBe("ready");
  });

  it("an endpoint the config declares as a mainnet (chain id, environment or network) is refused before any contact", async () => {
    evm.chainId = "0x7a69";
    const config = path.join(dir, "hardkas.config.ts");
    fs.writeFileSync(
      config,
      `export default ${JSON.stringify({ networks: { "igra-main": { kind: "igra-rpc", chainId: 38833, rpcUrl: evm.url }, "l1-prod": { kind: "kaspa-rpc", network: "mainnet", rpcUrl: fake.url } } }, null, 2)};\n`
    );
    const before = fake.methods.length;
    const results = await runRpcDoctor({ endpoints: [evm.url, fake.url], config });
    expect(results.map((r) => [r.health.status, r.health.tcpReachable])).toEqual([
      ["mainnet_refused", false],
      ["mainnet_refused", false]
    ]);
    expect({ evm: evm.methods, l1: fake.methods.length - before }).toEqual({ evm: [], l1: 0 });
  });
});
