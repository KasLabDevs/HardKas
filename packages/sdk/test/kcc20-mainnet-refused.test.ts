import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { Hardkas } from "../src/index.js";

// -----------------------------------------------------------------------------
// R3-A3 · sdk.kcc20 refuses mainnet before any key is read or any node is contacted: deploy and transfer
// MAINNET_SIGNING_DISABLED, the reads (holdings, balance) MAINNET_CONNECTION_DISABLED — for the network by name and for an
// alias whose config entry declares mainnet. The "mainnet node" is a loopback listener that counts TCP connections; the key
// resolver counts every call. Nothing is funded, nothing real is touched.
// -----------------------------------------------------------------------------

const made: string[] = [];
const servers: net.Server[] = [];

async function counter(): Promise<{ url: string; connections: () => number }> {
  let connections = 0;
  const server = net.createServer((s) => {
    connections++;
    s.destroy();
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as net.AddressInfo).port;
  return { url: `ws://127.0.0.1:${port}`, connections: () => connections };
}

function workspace(key: string, declared: string, url: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r3-kcc20-mlk-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg = {
    execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: key } } },
    networks: { [key]: { kind: "kaspa-rpc", network: declared, rpcUrl: url, allowMainnet: true } },
    experimental: true,
    network: { allowPublic: true }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg)};\n`);
  return ws;
}

afterAll(async () => {
  for (const s of servers) await new Promise<void>((r) => s.close(() => r()));
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const settle = (p: Promise<unknown>) => p.then(() => ({ code: "RESOLVED" }), (e: any) => ({ code: String(e?.code ?? "UNCODED"), message: String(e?.message ?? e) }));

describe("R3-A3 · sdk.kcc20 on mainnet: refused first, nothing read, nothing contacted", () => {
  for (const [key, declared] of [["mainnet", "mainnet"], ["prod", "mainnet"]] as const) {
    it(`network '${key}' (declares ${declared})`, async () => {
      const node = await counter();
      const sdk = await Hardkas.open({ cwd: workspace(key, declared, node.url) });
      const calls: string[] = [];
      const keys = {
        publicKeyOf: (a: string) => {
          calls.push(`public:${a}`);
          return "11".repeat(32);
        },
        privateKeyOf: async (a: string) => {
          calls.push(`private:${a}`);
          return "11".repeat(32);
        }
      };
      const program = { compileRecord: { contentHash: "00".repeat(32), artifactSha256: "00".repeat(32) }, constructorArgs: [] };
      const covenantId = "ab".repeat(32);
      try {
        const deploy = await settle(sdk.kcc20.planDeploy({ program, holders: [{ owner: "22".repeat(32), amount: 1n }], funder: "alice" }, { keys }));
        const deployAll = await settle(sdk.kcc20.deploy({ program, holders: [{ owner: "22".repeat(32), amount: 1n }], funder: "alice" }, { keys }));
        const transfer = await settle(sdk.kcc20.planTransfer({ covenantId, from: "alice", to: [{ owner: "22".repeat(32), amount: 1n }] }, { keys }));
        const transferAll = await settle(sdk.kcc20.transfer({ covenantId, from: "alice", to: [{ owner: "22".repeat(32), amount: 1n }] }, { keys }));
        const sign = await settle(sdk.kcc20.sign({ networkId: declared, txVersion: 1 }, { keys }));
        const holdings = await settle(sdk.kcc20.holdings(covenantId));
        const balance = await settle(sdk.kcc20.balance(covenantId, "22".repeat(32)));
        expect([deploy.code, deployAll.code, transfer.code, transferAll.code, sign.code]).toEqual(Array(5).fill("MAINNET_SIGNING_DISABLED"));
        expect([holdings.code, balance.code]).toEqual(["MAINNET_CONNECTION_DISABLED", "MAINNET_CONNECTION_DISABLED"]);
        expect(calls, "no key was asked for").toEqual([]);
        expect(node.connections(), "the mainnet endpoint was never contacted").toBe(0);
      } finally {
        await sdk.close();
      }
    });
  }
});
