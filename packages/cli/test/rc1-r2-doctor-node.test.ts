import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { assertHermeticPreloadActive } from "./hermetic-child.js";
import { startFakeNode, runCli, tempDir, type FakeNode } from "./helpers/int9-a-fake-node.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// -----------------------------------------------------------------------------
// RC1-R2 · D4 — `hardkas doctor` diagnoses the workspace's node, in sections, with typed codes.
//   local-config · connectivity · network-identity · sync · capability (payment, silver, covenant)
// Before: doctor asked a node only for a public network (one "Network endpoint" check, sync folded into a warning), probed
// the canonical localnet's RPC in every workspace where its container ran, contacted a declared mainnet endpoint, and a
// public testnet without the payments' opt-in; the JSON had no section, no code and no word on a partial diagnosis.
// Now: the workspace's node (or --url / --network), ONE bounded getServerInfo; mainnet and an unopted public testnet are
// never contacted; no node declared = a partial diagnosis that says so; the exit contract is unchanged (a failed check
// exits 1; warnings and skips exit 0; a --flow asked for and not ready fails).
// Loopback fakes that lie about network, version and sync, one that never answers and a closed port. Docker is
// unreachable on purpose and the canonical ports are denied by the preload: a fallback to them is caught in the log.
// `silver doctor --json` now carries `notSynced` (it was only in the detail text).
// -----------------------------------------------------------------------------

const made: string[] = [];
const fakes: FakeNode[] = [];
const servers: net.Server[] = [];
let logs = "";
let shimPath = "";
const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
const SECTIONS = ["local-config", "connectivity", "network-identity", "sync", "capability"];

const fake = async (label: string, o: Parameters<typeof startFakeNode>[1]) => {
  const f = await startFakeNode(`r2d-${label}`, o);
  fakes.push(f);
  return f;
};

function workspace(label: string, cfg: Record<string, unknown>): string {
  const ws = tempDir(`hk-r2d-${label}-`, made);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  return ws;
}
const ownNode = (network: string, rpcUrl: string, extra: Record<string, unknown> = {}) => ({
  execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network } } },
  networks: { [network]: { kind: network.startsWith("testnet") || network === "mainnet" ? "kaspa-rpc" : "kaspa-node", network, rpcUrl } },
  ...extra
});

async function doctor(name: string, args: string[], cwd: string) {
  const r = await runCli(logs, name, ["doctor", ...args], cwd, { [pathKey]: `${shimPath}${path.delimiter}${process.env[pathKey] ?? ""}` });
  const checks: any[] = r.json?.checks ?? [];
  const by = (re: RegExp) => checks.find((c) => re.test(c.name));
  const loopback = r.dialled.filter((d) => d.startsWith("LOOPBACK_CONNECT") || d.startsWith("REFUSED"));
  const canonical = r.dialled.filter((d) => /:(16110|16210|17110|17210|18110|18210|18211)$/.test(d));
  // the one check this file cannot control is the machine's Node.js major
  const failed = checks.filter((c) => c.status === "fail" && c.name !== "Node.js version").map((c) => `${c.name}:${c.code}`);
  return {
    ...r,
    checks,
    failed,
    loopback,
    canonical,
    connectivity: by(/^Node connectivity$/),
    identity: checks.find((c) => c.section === "network-identity"),
    sync: by(/^Node sync$/),
    payment: by(/^Payment flow$/),
    silver: by(/^Silver flow/),
    covenant: by(/^Covenant flow/)
  };
}

let synced: FakeNode;
beforeAll(async () => {
  assertHermeticPreloadActive();
  logs = tempDir("hk-r2d-logs-", made);
  shimPath = tempDir("hk-r2d-bin-", made);
  fs.writeFileSync(path.join(shimPath, "pnpm.cmd"), "@echo 9.0.0\r\n");
  fs.writeFileSync(path.join(shimPath, "pnpm"), "#!/bin/sh\necho 9.0.0\n");
  fs.chmodSync(path.join(shimPath, "pnpm"), 0o755);
  synced = await fake("synced", { network: "simnet" });
});

afterAll(async () => {
  for (const f of fakes) await f.close();
  for (const s of servers) await new Promise<void>((r) => s.close(() => r()));
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("RC1-R2 D4 · the report: sections, typed codes, a stable document", () => {
  it("D4-1 a workspace that declares its own simnet node: five sections, every check typed; the node answers, proves simnet, is synced and can carry a payment", async () => {
    const before = synced.methods.length;
    const r = await doctor("d4-1", ["--json"], workspace("d4-1", ownNode("simnet", synced.url)));
    expect(r.json, r.brief).toBeDefined();
    expect(Object.keys(r.json).sort(), r.brief).toEqual(["checks", "diagnosis", "node", "schema", "sections", "summary", "timestamp", "version"]);
    expect(r.json.schema).toBe("hardkas.doctor.v1");
    expect(r.json.sections.map((s: any) => s.id)).toEqual(SECTIONS);
    for (const c of r.checks) {
      expect(SECTIONS, JSON.stringify(c)).toContain(c.section);
      expect(c.code, JSON.stringify(c)).toMatch(/^[A-Z][A-Z0-9_]+$/);
      expect(["pass", "fail", "warn", "skip"]).toContain(c.status);
    }
    expect(r.connectivity, r.brief).toMatchObject({ section: "connectivity", code: "NODE_REACHABLE", status: "pass" });
    expect(r.identity, r.brief).toMatchObject({ name: "Network endpoint (simnet)", code: "NETWORK_IDENTITY_VERIFIED", status: "pass" });
    expect(r.sync, r.brief).toMatchObject({ code: "NODE_SYNCED", status: "pass" });
    expect(r.payment, r.brief).toMatchObject({ section: "capability", code: "FLOW_READY", status: "pass" });
    expect(r.json.diagnosis, r.brief).toMatchObject({ scope: "full" });
    expect(r.json.node, r.brief).toMatchObject({ source: "workspace", network: "simnet", url: synced.url, managed: false, contacted: true, timeoutMs: 8000 });
    expect(r.json.node.identity, r.brief).toMatchObject({ schema: "hardkas.networkIdentity.v1", networkId: "simnet", nodeType: "rusty-kaspad", trust: "node-endpoint", sync: "synced" });
    // the workspace's own node needs no local Docker: the daemon check does not fail it
    expect(r.checks.find((c) => c.name === "Docker daemon"), r.brief).toMatchObject({ status: "skip", code: "DOCKER_NOT_NEEDED" });
    expect(r.failed, r.brief).toEqual([]);
    expect(r.status, r.brief).toBe(r.checks.some((c) => c.status === "fail") ? 1 : 0);
    // one identity question, nothing else; never the canonical localnet
    expect(synced.methods.slice(before).filter((m) => m !== "getServerInfo"), r.brief).toEqual([]);
    expect(r.canonical, r.brief).toEqual([]);
  });

  it("D4-2 the human report prints the sections in order and each check's code", async () => {
    const r = await doctor("d4-2", [], workspace("d4-2", ownNode("simnet", synced.url)));
    const order = ["Local configuration", "Connectivity", "Network identity", "Synchronization", "Capability for the flow"].map((t) => r.all.indexOf(t));
    expect(order.every((i) => i >= 0), r.brief).toBe(true);
    expect([...order].sort((a, b) => a - b), r.brief).toEqual(order);
    expect(r.all, r.brief).toMatch(/Node sync: .*\[NODE_SYNCED\]/);
    expect(r.all, r.brief).not.toMatch(/Partial diagnosis/);
  });
});

describe("RC1-R2 D4 · nodes that lie, do not answer or are not synced", () => {
  it("D4-3 a node that says another network: identity FAILS (NODE_NETWORK_MISMATCH), sync is not checked, exit 1, partial", async () => {
    const liar = await fake("other-net", { network: "devnet" });
    const r = await doctor("d4-3", ["--json"], workspace("d4-3", ownNode("simnet", liar.url)));
    expect(r.identity, r.brief).toMatchObject({ code: "NODE_NETWORK_MISMATCH", status: "fail" });
    expect(r.identity.message).toMatch(/serves devnet, not simnet/);
    expect(r.sync, r.brief).toMatchObject({ code: "NODE_NOT_CHECKED", status: "skip" });
    expect(r.payment, r.brief).toMatchObject({ code: "NODE_NETWORK_MISMATCH", status: "warn" });
    expect(r.json.diagnosis, r.brief).toMatchObject({ scope: "partial", code: "NODE_NETWORK_MISMATCH" });
    expect(r.status, r.brief).toBe(1);
    expect(liar.methods.filter((m) => m !== "getServerInfo"), r.brief).toEqual([]);
  });

  it("D4-4 a node that says another version: identity WARNS (NODE_VERSION_UNEXPECTED); payments can use it, Silver and covenants cannot", async () => {
    const liar = await fake("other-version", { network: "simnet", serverVersion: "2.0.0" });
    const r = await doctor("d4-4", ["--json"], workspace("d4-4", ownNode("simnet", liar.url)));
    expect(r.identity, r.brief).toMatchObject({ code: "NODE_VERSION_UNEXPECTED", status: "warn" });
    expect(r.sync, r.brief).toMatchObject({ code: "NODE_SYNCED", status: "pass" });
    expect(r.payment, r.brief).toMatchObject({ code: "FLOW_READY", status: "pass" });
    expect(r.silver, r.brief).toMatchObject({ code: "NODE_IDENTITY_UNVERIFIED", status: "warn" });
    expect(r.covenant, r.brief).toMatchObject({ code: "NODE_IDENTITY_UNVERIFIED", status: "warn" });
    expect(r.failed, r.brief).toEqual([]);
  });

  it("D4-5 the HardKAS simulator behind a node endpoint: identity FAILS (NODE_IS_SIMULATOR)", async () => {
    const sim = await fake("simulator", { network: "simnet", serverVersion: "2.1.0-kaspa-simulator" });
    const r = await doctor("d4-5", ["--json"], workspace("d4-5", ownNode("simnet", sim.url)));
    expect(r.identity, r.brief).toMatchObject({ code: "NODE_IS_SIMULATOR", status: "fail" });
    expect(r.status, r.brief).toBe(1);
  });

  it("D4-6 a node that says it is not synced: sync WARNS (NODE_NOT_SYNCED), exit 0; with --flow payment the flow FAILS, exit 1", async () => {
    const unsynced = await fake("unsynced", { network: "simnet", isSynced: false });
    const ws = workspace("d4-6", ownNode("simnet", unsynced.url));
    const r = await doctor("d4-6", ["--json"], ws);
    expect(r.identity, r.brief).toMatchObject({ code: "NETWORK_IDENTITY_VERIFIED", status: "pass" });
    expect(r.sync, r.brief).toMatchObject({ code: "NODE_NOT_SYNCED", status: "warn" });
    expect(r.payment, r.brief).toMatchObject({ code: "NODE_NOT_SYNCED", status: "warn" });
    expect(r.json.diagnosis.scope, r.brief).toBe("full");
    expect(r.failed, r.brief).toEqual([]);
    const f = await doctor("d4-6-flow", ["--json", "--flow", "payment"], ws);
    expect(f.payment, f.brief).toMatchObject({ code: "NODE_NOT_SYNCED", status: "fail" });
    expect(f.silver, f.brief).toBeUndefined();
    expect(f.status, f.brief).toBe(1);
  });

  it("D4-7 a node that does not say whether it is synced (an answer the official client cannot read): its identity is unknown, FAILS, never assumed", async () => {
    const quiet = await fake("no-sync-field", { network: "simnet", isSynced: undefined });
    const started = Date.now();
    const r = await doctor("d4-7", ["--json"], workspace("d4-7", ownNode("simnet", quiet.url)));
    expect(Date.now() - started, r.brief).toBeLessThan(60_000);
    expect(r.connectivity, r.brief).toMatchObject({ code: "NODE_REACHABLE", status: "pass" });
    expect(r.identity, r.brief).toMatchObject({ code: "NODE_NETWORK_UNKNOWN", status: "fail" });
    expect(r.sync?.status, r.brief).toBe("skip");
    expect(r.json.diagnosis, r.brief).toMatchObject({ scope: "partial", code: "NODE_NETWORK_UNKNOWN" });
  });

  it("D4-8 nothing listens on the declared endpoint: connectivity WARNS (NODE_UNREACHABLE), partial, exit 0; --flow payment FAILS", async () => {
    const closed = net.createServer();
    await new Promise<void>((r) => closed.listen(0, "127.0.0.1", () => r()));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((r) => closed.close(() => r()));
    const ws = workspace("d4-8", ownNode("simnet", `ws://127.0.0.1:${port}`));
    const r = await doctor("d4-8", ["--json", "--timeout", "3000"], ws);
    expect(r.connectivity, r.brief).toMatchObject({ code: "NODE_UNREACHABLE", status: "warn" });
    expect(r.identity, r.brief).toMatchObject({ code: "NODE_NOT_CHECKED", status: "skip" });
    expect(r.json.diagnosis, r.brief).toMatchObject({ scope: "partial", code: "NODE_UNREACHABLE" });
    expect(r.failed, r.brief).toEqual([]);
    const f = await doctor("d4-8-flow", ["--json", "--timeout", "3000", "--flow", "payment"], ws);
    expect(f.payment, f.brief).toMatchObject({ code: "NODE_UNREACHABLE", status: "fail" });
    expect(f.status, f.brief).toBe(1);
  });

  it("D4-9 a node that accepts the connection and never answers: bounded by --timeout (NODE_TIMEOUT), never a hang", async () => {
    const silent = net.createServer((socket) => socket.on("data", () => {}));
    servers.push(silent);
    await new Promise<void>((r) => silent.listen(0, "127.0.0.1", () => r()));
    const port = (silent.address() as AddressInfo).port;
    const started = Date.now();
    const r = await doctor("d4-9", ["--json", "--timeout", "1500"], workspace("d4-9", ownNode("simnet", `ws://127.0.0.1:${port}`)));
    const elapsed = Date.now() - started;
    expect(r.connectivity, r.brief).toMatchObject({ code: "NODE_TIMEOUT", status: "warn" });
    expect(r.connectivity.details, r.brief).toMatchObject({ timeoutMs: 1500 });
    expect(elapsed, r.brief).toBeLessThan(45_000);
  });
});

describe("RC1-R2 D4 · what is never contacted", () => {
  // MAINNET TOTAL LOCKDOWN: the skip's code is the one every layer uses for a refused mainnet connection,
  // MAINNET_CONNECTION_DISABLED (it was doctor's own MAINNET_NOT_CONTACTED); the behaviour is unchanged
  it("D4-10 mainnet (workspace or --network): refused without connecting — SKIP MAINNET_CONNECTION_DISABLED, payments FAIL only when asked for", async () => {
    const mainnetNode = await fake("mainnet", { network: "mainnet" });
    const ws = workspace("d4-10", ownNode("mainnet", mainnetNode.url, { network: { allowPublic: true }, experimental: true }));
    const r = await doctor("d4-10", ["--json"], ws);
    expect(r.connectivity, r.brief).toMatchObject({ code: "MAINNET_CONNECTION_DISABLED", status: "skip" });
    expect(r.payment, r.brief).toMatchObject({ code: "MAINNET_TRANSACTIONS_DISABLED", status: "warn" });
    expect(r.json.diagnosis, r.brief).toMatchObject({ scope: "partial", code: "MAINNET_CONNECTION_DISABLED" });
    const f = await doctor("d4-10-flow", ["--json", "--network", "mainnet", "--url", mainnetNode.url, "--flow", "payment"], ws);
    expect(f.payment, f.brief).toMatchObject({ code: "MAINNET_TRANSACTIONS_DISABLED", status: "fail" });
    expect(f.status, f.brief).toBe(1);
    for (const x of [r, f]) expect(x.loopback, x.brief).toEqual([]);
    expect(mainnetNode.methods).toEqual([]);
  });

  it("D4-11 a public testnet without the payments' opt-in: SKIP PUBLIC_NETWORK_BLOCKED, nothing contacted", async () => {
    const tn = await fake("tn10", { network: "testnet-10" });
    const r = await doctor("d4-11", ["--json"], workspace("d4-11", ownNode("testnet-10", tn.url)));
    expect(r.connectivity, r.brief).toMatchObject({ code: "PUBLIC_NETWORK_BLOCKED", status: "skip" });
    expect(r.payment, r.brief).toMatchObject({ code: "PUBLIC_NETWORK_BLOCKED", status: "warn" });
    expect(r.loopback, r.brief).toEqual([]);
    expect(tn.methods).toEqual([]);
  });

  it("D4-12 (control) the same testnet with the opt-in: its node is checked", async () => {
    const tn = await fake("tn10-optin", { network: "testnet-10" });
    const r = await doctor("d4-12", ["--json"], workspace("d4-12", ownNode("testnet-10", tn.url, { network: { allowPublic: true }, experimental: true })));
    expect(r.identity, r.brief).toMatchObject({ name: "Network endpoint (testnet-10)", code: "NETWORK_IDENTITY_VERIFIED", status: "pass" });
    expect(tn.methods).toContain("getServerInfo");
  });

  it("D4-13 a simulator workspace: no node, a PARTIAL diagnosis that says so, zero connections; payments run on the simulator", async () => {
    const ws = workspace("d4-13", { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } } });
    const r = await doctor("d4-13", ["--json"], ws);
    expect(r.connectivity, r.brief).toMatchObject({ code: "NO_NODE_CONFIGURED", status: "skip" });
    expect(r.json.diagnosis, r.brief).toMatchObject({ scope: "partial", code: "NO_NODE_CONFIGURED" });
    expect(r.json.node, r.brief).toMatchObject({ source: "none", contacted: false });
    expect(r.payment, r.brief).toMatchObject({ code: "FLOW_SIMULATED", status: "pass" });
    expect(r.silver, r.brief).toMatchObject({ code: "NO_NODE_CONFIGURED", status: "skip" });
    expect(r.loopback, r.brief).toEqual([]);
    const h = await doctor("d4-13-human", [], ws);
    expect(h.all, h.brief).toMatch(/Partial diagnosis \[NO_NODE_CONFIGURED\]/);
  });

  it("D4-14 a simnet workspace on the managed localnet with Docker down: SKIP DOCKER_UNAVAILABLE, the canonical ports never dialled", async () => {
    const ws = workspace("d4-14", { execution: { default: "localnet", targets: { localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } } } });
    const r = await doctor("d4-14", ["--json"], ws);
    expect(r.json.node, r.brief).toMatchObject({ managed: true, contacted: false });
    expect(r.connectivity, r.brief).toMatchObject({ code: "DOCKER_UNAVAILABLE", status: "skip" });
    expect(r.identity?.name, r.brief).toBe("Managed localnet (simnet)");
    expect(r.canonical, r.brief).toEqual([]);
    expect(r.loopback, r.brief).toEqual([]);
  });

  it("D4-15 --network/--url check that node from any workspace; --url alone, with no network to prove, is a usage error (nothing contacted)", async () => {
    const sim = workspace("d4-15", { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } } });
    const r = await doctor("d4-15", ["--json", "--network", "simnet", "--url", synced.url], sim);
    expect(r.json.node, r.brief).toMatchObject({ source: "explicit-network", network: "simnet", url: synced.url, contacted: true });
    expect(r.sync, r.brief).toMatchObject({ code: "NODE_SYNCED" });
    const u = await doctor("d4-15-url-only", ["--json", "--url", synced.url], sim);
    expect(u.status, u.brief).toBe(2);
    expect(u.json?.code ?? u.code, u.brief).toBe("DOCTOR_NETWORK_REQUIRED");
    expect(u.loopback, u.brief).toEqual([]);
  });

  it("D4-16 invalid --flow and --timeout are usage errors before anything runs", async () => {
    const ws = workspace("d4-16", ownNode("simnet", synced.url));
    const a = await doctor("d4-16-flow", ["--json", "--flow", "bridge"], ws);
    expect({ status: a.status, code: a.json?.code ?? a.code }, a.brief).toEqual({ status: 2, code: "DOCTOR_FLOW_INVALID" });
    const b = await doctor("d4-16-timeout", ["--json", "--timeout", "5"], ws);
    expect({ status: b.status, code: b.json?.code ?? b.code }, b.brief).toEqual({ status: 2, code: "DOCTOR_TIMEOUT_INVALID" });
    for (const x of [a, b]) expect(x.loopback, x.brief).toEqual([]);
  });

  it("D4-17 `ci verify` checks the same workspace offline: its node is not contacted", async () => {
    const before = synced.methods.length;
    const r = await runCli(logs, "d4-17", ["ci", "verify"], workspace("d4-17", ownNode("simnet", synced.url)), { [pathKey]: `${shimPath}${path.delimiter}${process.env[pathKey] ?? ""}` });
    expect(r.dialled.filter((d) => d.startsWith("LOOPBACK_CONNECT")), r.brief).toEqual([]);
    expect(synced.methods.length, r.brief).toBe(before);
  });
});

describe("RC1-R2 · `silver doctor --json` carries notSynced", () => {
  it("SD-1 an unsynced node: node.notSynced true and code NODE_NOT_SYNCED; a synced one: notSynced false", async () => {
    const unsynced = await fake("silver-unsynced", { network: "simnet", isSynced: false });
    const bare = tempDir("hk-r2d-bare-", made);
    const u = await runCli(logs, "sd-1-unsynced", ["silver", "doctor", "--url", unsynced.url, "--network", "simnet", "--json"], bare);
    expect(u.status, u.brief).toBe(0);
    expect(u.json?.node, u.brief).toMatchObject({ ok: false, notSynced: true, code: "NODE_NOT_SYNCED", verification: "endpoint" });
    const s = await runCli(logs, "sd-1-synced", ["silver", "doctor", "--url", synced.url, "--network", "simnet", "--json"], bare);
    expect(s.json?.node, s.brief).toMatchObject({ ok: true, notSynced: false, serverVersion: "2.1.0" });
    expect(s.json?.node?.code, s.brief).toBeUndefined();
  });
});
