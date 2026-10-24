import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";
import { networkEvidenceOf } from "../src/runners/test-runner.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 60_000 });

// -----------------------------------------------------------------------------
// TEST-NETWORK-EVIDENCE-2 (2026-10-24). Found certifying the release candidate on Testnet-10: a `hardkas test` run whose
// scenario paid through the workspace's testnet-10 node (wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json) reported
// `networkEvidence.nodeContacts: []` and listed vector-10.kaspa.green:443 under `otherContacts`. A configured endpoint was
// taken from `new URL(rpcUrl).port`, which is "" when the URL names no port (wss: 443), so a public node on its scheme's
// port was never a node. Fixed: every configured rpcUrl is a node endpoint, its host and its port (the scheme's port when
// the URL names none); a port a URL names still counts on any host, as before (TEST-NETWORK-EVIDENCE-1).
// The CLI case dials the loopback address of a wss:// endpoint without a port: nothing leaves the machine.
// -----------------------------------------------------------------------------

const tn10Config = (rpcUrl: string) =>
  `export default ${JSON.stringify(
    {
      execution: { default: "tn", targets: { tn: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
      network: { allowPublic: true },
      experimental: true,
      networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl } }
    },
    null,
    2
  )};\n`;
const DIAL_443 =
  'import { test, expect } from "vitest";\nimport net from "node:net";\n' +
  'test("dials the workspace node on its scheme port", async () => {\n' +
  '  await new Promise<void>((resolve) => { const s = net.connect({ host: "127.0.0.1", port: 443 }); s.on("connect", () => { s.destroy(); resolve(); }); s.on("error", () => resolve()); });\n' +
  '  expect(true).toBe(true);\n});\n';

let ws: string;
let logs: string;
beforeAll(() => {
  assertHermeticPreloadActive();
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tne2-"));
  logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tne2-logs-"));
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.mkdirSync(path.join(ws, "test"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), tn10Config("wss://127.0.0.1/kaspa/testnet-10/wrpc/json"));
  fs.writeFileSync(path.join(ws, "test", "tn10.test.ts"), DIAL_443);
});
afterAll(() => {
  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(logs, { recursive: true, force: true });
});

const contact = (host: string, port: number, file = "test/a.test.ts") => ({ host, port, file: path.join("/ws", file) });

describe("TEST-NETWORK-EVIDENCE-2 · a configured endpoint without a port is a node endpoint on its scheme's port", () => {
  it("E-1 a contact with a configured wss endpoint's host on 443 is a node contact", () => {
    const { network, evidence } = networkEvidenceOf("testnet-10", [contact("vector-10.kaspa.green", 443)], "/ws", [], ["vector-10.kaspa.green:443"]);
    expect(network).toBe("testnet-10");
    expect(evidence.nodeContacts).toEqual([{ endpoint: "vector-10.kaspa.green:443", files: ["test/a.test.ts"] }]);
    expect(evidence.otherContacts).toEqual([]);
  });

  it("E-2 (control) another host on the same port stays an other contact: the scheme's port alone names no node", () => {
    const { evidence } = networkEvidenceOf("testnet-10", [contact("example.org", 443)], "/ws", [], ["vector-10.kaspa.green:443"]);
    expect(evidence.nodeContacts).toEqual([]);
    expect(evidence.otherContacts).toEqual([{ endpoint: "example.org:443", files: ["test/a.test.ts"] }]);
  });

  it("E-3 (control, unchanged) a port a URL names still counts on any host", () => {
    const { evidence } = networkEvidenceOf("testnet-10", [contact("10.0.0.5", 28210)], "/ws", [28210], ["127.0.0.1:28210"]);
    expect(evidence.nodeContacts).toEqual([{ endpoint: "10.0.0.5:28210", files: ["test/a.test.ts"] }]);
  });

  it("E-4 `hardkas test` in a testnet-10 workspace whose rpcUrl is wss://<host>/path reports that node as a node contact", () => {
    const r = spawnSync(process.execPath, [cliDist, "test", "test/tn10.test.ts", "--json"], {
      cwd: ws,
      encoding: "utf8",
      env: hermeticChildEnv(path.join(logs, "e4.net.log"), { HARDKAS_HERMETIC_DENY_PORTS: "16210,17210,18210" }),
      timeout: 200_000
    });
    let doc: any;
    try {
      doc = JSON.parse((r.stdout ?? "").trim());
    } catch {
      doc = undefined;
    }
    const brief = `exit ${r.status}\nstdout: ${(r.stdout ?? "").slice(0, 2000)}\nstderr: ${(r.stderr ?? "").slice(0, 900)}`;
    expect(doc?.ok, brief).toBe(true);
    expect(doc?.result?.network, brief).toBe("testnet-10");
    expect(doc?.result?.networkEvidence?.nodeContacts, brief).toEqual([{ endpoint: "127.0.0.1:443", files: ["test/tn10.test.ts"] }]);
    expect(doc?.result?.networkEvidence?.otherContacts, brief).toEqual([]);
  });
});
