import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 60_000 });

// -----------------------------------------------------------------------------
// TEST-NETWORK-EVIDENCE-1 (2026-10-22). Found running the demo D:\prueba\hardkas-demo on the release candidate: `hardkas test` recorded
// `network: "simulated"` for a run whose test/counter-real-node.test.ts drove a real rusty-kaspad on 127.0.0.1:18210. The
// run report took the network from the request (the workspace's simulator target), never from what the test files did.
// Fixed: the runner observes the TCP connections its test files make (an observer the run injects into them; one line
// per attempt in .hardkas/runs/<id>/net-contacts.jsonl — the fact) and derives the label from it: a simulated run that
// contacted a Kaspa node endpoint is reported `network: "mixed"`, with the endpoints and the files that contacted them
// (`networkEvidence`); other local connections are listed apart and change nothing.
// Every run is `hardkas test` as a real process on the built dist, in its own workspace; the node port is denied by the
// hermetic preload, so the "node" test only ATTEMPTS a connection (enough for the fact: an attempt is a contact).
// -----------------------------------------------------------------------------

const scaffold =
  'export default { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } }, network: { allowPublic: false } };\n';
const SIM = 'import { test, expect } from "vitest";\ntest("simulator only", () => { expect(1 + 1).toBe(2); });\n';
const NODE =
  'import { test, expect } from "vitest";\nimport net from "node:net";\n' +
  'test("dials a Kaspa node endpoint", async () => {\n' +
  '  await new Promise<void>((resolve) => { const s = net.connect({ host: "127.0.0.1", port: 18210 }); s.on("connect", () => { s.destroy(); resolve(); }); s.on("error", () => resolve()); });\n' +
  '  expect(true).toBe(true);\n});\n';
const LOCAL =
  'import { test, expect } from "vitest";\nimport net from "node:net";\n' +
  'test("talks to its own local server", async () => {\n' +
  '  const server = net.createServer((c) => c.end());\n' +
  '  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));\n' +
  '  const port = (server.address() as any).port;\n' +
  '  await new Promise<void>((resolve) => { const s = net.connect({ host: "127.0.0.1", port }); s.on("close", () => resolve()); s.on("error", () => resolve()); });\n' +
  '  await new Promise<void>((r) => server.close(() => r()));\n' +
  '  expect(port).toBeGreaterThan(0);\n});\n';

let ws: string;
let logs: string;
beforeAll(() => {
  assertHermeticPreloadActive();
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tne1-"));
  logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tne1-logs-"));
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.mkdirSync(path.join(ws, "test"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), scaffold);
  fs.writeFileSync(path.join(ws, "test", "sim.test.ts"), SIM);
  fs.writeFileSync(path.join(ws, "test", "node.test.ts"), NODE);
  fs.writeFileSync(path.join(ws, "test", "local.test.ts"), LOCAL);
});
afterAll(() => {
  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(logs, { recursive: true, force: true });
});

function hkTest(name: string, args: string[]) {
  const r = spawnSync(process.execPath, [cliDist, "test", ...args], {
    cwd: ws,
    encoding: "utf8",
    env: hermeticChildEnv(path.join(logs, `${name}.net.log`), { HARDKAS_HERMETIC_DENY_PORTS: "16210,17210,18210" }),
    timeout: 200_000
  });
  let doc: any;
  try {
    doc = JSON.parse((r.stdout ?? "").trim());
  } catch {
    doc = undefined;
  }
  const brief = `exit ${r.status}\nstdout: ${(r.stdout ?? "").slice(0, 2000)}\nstderr: ${(r.stderr ?? "").slice(0, 900)}`;
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", doc, result: doc?.result, brief };
}
const runFileOf = (result: any) => path.join(ws, ".hardkas", "runs", result.testRunId, "test-results.json");

describe("TEST-NETWORK-EVIDENCE-1 · `hardkas test` reports the network its test files actually used", () => {
  it("N-1 control: a simulator-only run stays `network: \"simulated\"` with no node contact", () => {
    const r = hkTest("n1", ["test/sim.test.ts", "--json"]);
    expect(r.doc?.ok, r.brief).toBe(true);
    expect(r.result?.network, r.brief).toBe("simulated");
    expect(r.result?.networkEvidence?.nodeContacts ?? [], r.brief).toEqual([]);
  });

  it("N-2 a run whose file dials a Kaspa node endpoint is `network: \"mixed\"`, naming the endpoint and the file", () => {
    const r = hkTest("n2", ["test/sim.test.ts", "test/node.test.ts", "--json"]);
    expect(r.doc?.ok, r.brief).toBe(true);
    expect(r.result?.network, r.brief).toBe("mixed");
    expect(r.result?.networkEvidence?.requested, r.brief).toBe("simulated");
    expect(r.result?.networkEvidence?.nodeContacts, r.brief).toEqual([{ endpoint: "127.0.0.1:18210", files: ["test/node.test.ts"] }]);
  });

  it("N-3 the report on disk says the same, and the observed fact is kept next to it (net-contacts.jsonl)", () => {
    const r = hkTest("n3", ["test/node.test.ts", "--json"]);
    const onDisk = JSON.parse(fs.readFileSync(runFileOf(r.result), "utf8"));
    expect(onDisk.network, r.brief).toBe("mixed");
    expect(onDisk.networkEvidence, r.brief).toEqual(r.result.networkEvidence);
    const facts = fs.readFileSync(path.join(path.dirname(runFileOf(r.result)), "net-contacts.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(facts.some((f: any) => f.port === 18210 && f.host === "127.0.0.1" && String(f.file).replace(/\\/g, "/").endsWith("test/node.test.ts")), r.brief).toBe(true);
  });

  it("N-4 a test's own local server is listed apart and does not turn the run into a node run", () => {
    const r = hkTest("n4", ["test/local.test.ts", "--json"]);
    expect(r.result?.network, r.brief).toBe("simulated");
    expect(r.result?.networkEvidence?.nodeContacts, r.brief).toEqual([]);
    expect(r.result?.networkEvidence?.otherContacts?.length, r.brief).toBeGreaterThan(0);
  });

  it("N-5 the human report says it too: the node endpoint, the file and the `mixed` label (a warning: on stderr, like every CLI warning)", () => {
    const r = hkTest("n5", ["test/node.test.ts"]);
    const report = `${r.stdout}\n${r.stderr}`;
    expect(r.status, r.brief).toBe(0);
    expect(report, r.brief).toMatch(/mixed/);
    expect(report, r.brief).toMatch(/127\.0\.0\.1:18210/);
    expect(report, r.brief).toMatch(/test\/node\.test\.ts/);
  });
});
