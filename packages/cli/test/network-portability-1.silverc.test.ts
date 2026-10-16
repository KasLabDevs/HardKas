import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { cliDist, repoRoot } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// HARDKAS-NETWORK-PORTABILITY-1 · Stage A · C7 (silverc level: needs the pinned silverc in HARDKAS_HOME).
// `silver compile` used to record `networkId: simnet` and a kaspasim: P2SH address whatever the workspace, with no way
// to say otherwise. A compile record now names the network it was compiled for (the workspace's network, or
// --network), and that network is part of its identity: the compiled artifact, the bytecode and the locking script are
// the same on every network (the compiler and its parameters do not depend on it); only the address and the declared
// network differ. Deploy and spend stay canonical-simnet-only and refuse a record compiled for another network — this
// proves nothing about deploying on testnet-10. Mainnet stays refused. No network is contacted.
// -----------------------------------------------------------------------------

const FIXTURE = path.join(repoRoot, "fixtures", "toccata-v2", "silver", "p2sh-signed-release");
const made: string[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-np7-netlogs-"));
made.push(logs);

async function run(name: string, args: string[], cwd: string) {
  const log = path.join(logs, `${name}.net.log`);
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: hermeticChildEnv(log) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  const dialled = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean) : [];
  return { exit: r.status, json, dialled, out: r.stdout + r.stderr, brief: `exit ${r.status}\n${r.stdout.slice(-1500)}\n${r.stderr.slice(0, 1500)}` };
}

function workspace(label: string, network: "simnet" | "testnet-10"): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-np7-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg =
    network === "simnet"
      ? { execution: { default: "localnet", targets: { localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } } } }
      : {
          execution: { default: "tn", targets: { tn: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
          network: { allowPublic: true },
          experimental: true,
          networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: "ws://127.0.0.1:1" } }
        };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  fs.copyFileSync(path.join(FIXTURE, "contract.sil"), path.join(ws, "contract.sil"));
  fs.copyFileSync(path.join(FIXTURE, "contract.constructor-args.json"), path.join(ws, "ctor.json"));
  return ws;
}
const compile = (name: string, ws: string, extra: string[] = []) => run(name, ["silver", "compile", "contract.sil", "--args", "ctor.json", ...extra, "--json"], ws);

beforeAll(() => assertHermeticPreloadActive());
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("C7 · a SilverScript compile record names the network it was compiled for", () => {
  let sim: any;
  let tn: any;
  let wsTn = "";

  it("NP-7a (contract) simnet workspace: networkId simnet, kaspasim: address — as before", async () => {
    const r = await compile("NP-7a", workspace("sim", "simnet"));
    expect(r.exit, r.brief).toBe(0);
    sim = r.json;
    expect(sim.networkId).toBe("simnet");
    expect(sim.contracts[0].address).toMatch(/^kaspasim:p/);
  });

  it("NP-7b testnet-10 workspace: networkId testnet-10, kaspatest: address; same artifact, bytecode and locking script as simnet", async () => {
    wsTn = workspace("tn", "testnet-10");
    const r = await compile("NP-7b", wsTn);
    expect(r.exit, r.brief).toBe(0);
    tn = r.json;
    expect(tn.networkId).toBe("testnet-10");
    expect(tn.contracts[0].address).toMatch(/^kaspatest:p/);
    // the compiler and its parameters do not depend on the network
    expect(tn.artifactJson).toBe(sim.artifactJson);
    expect(tn.provenance).toEqual(sim.provenance);
    expect(tn.contracts[0].lockingScript).toEqual(sim.contracts[0].lockingScript);
    expect(tn.contracts[0].entries).toEqual(sim.contracts[0].entries);
    // the address encodes the same script hash under the network's prefix
    expect(tn.contracts[0].address.split(":")[1].slice(0, 6)).toBe(sim.contracts[0].address.split(":")[1].slice(0, 6));
    // the network is part of the record's identity
    expect(tn.contentHash).not.toBe(sim.contentHash);
    expect(r.dialled).toEqual([]);
  });

  it("NP-7c an explicit --network wins over the workspace; mainnet is refused", async () => {
    const ws = workspace("tn2", "testnet-10");
    const asSim = await compile("NP-7c-sim", ws, ["--network", "simnet"]);
    expect(asSim.json?.networkId, asSim.brief).toBe("simnet");
    const main = await compile("NP-7c-main", ws, ["--network", "mainnet"]);
    expect(main.exit, main.brief).toBe(2);
    expect(main.out).toMatch(/SILVERSCRIPT_MAINNET_NOT_ENABLED/);
  });

  it("NP-7d `silver verify` reproduces a testnet-10 record and checks its addresses against its network", async () => {
    const ok = await run("NP-7d-ok", ["silver", "verify", path.relative(wsTn, tn.recordPath), "--args", "ctor.json", "--json"], wsTn);
    expect(ok.json?.reproduced, ok.brief).toBe(true);
    // a record whose address does not belong to its declared network (identity recomputed after the edit, so only the
    // address/network coherence check can catch it)
    const { calculateContentHash } = await import("@hardkas/artifacts");
    const forged = JSON.parse(fs.readFileSync(tn.recordPath, "utf8"));
    forged.contracts[0].address = sim.contracts[0].address;
    delete forged.contentHash;
    forged.contentHash = calculateContentHash(forged, forged.hashVersion);
    const forgedPath = path.join(wsTn, "forged.json");
    fs.writeFileSync(forgedPath, JSON.stringify(forged, null, 2));
    const bad = await run("NP-7d-bad", ["silver", "verify", "forged.json", "--args", "ctor.json", "--json"], wsTn);
    expect(bad.exit, bad.brief).not.toBe(0);
    expect(bad.out).toMatch(/address .*does not belong to|not the address of/i);
  });

  it("NP-7e deploy stays canonical-simnet-only: a testnet-10 compile record is refused before any key or node is used", async () => {
    const r = await run("NP-7e", ["silver", "deploy", path.relative(wsTn, tn.recordPath), "--from", "alice", "--amount", "1", "--json"], wsTn);
    expect(r.exit, r.brief).toBe(2);
    expect(r.out).toMatch(/SILVER_NETWORK_NOT_SUPPORTED/);
    expect(r.dialled).toEqual([]);
  });

  it("NP-7f spend refuses, before any key or node, a deploy record of another network — or one whose compile record is", async () => {
    const { ARTIFACT_VERSION, CURRENT_HASH_VERSION, calculateContentHash } = await import("@hardkas/artifacts");
    const seal = (draft: Record<string, unknown>) => {
      const d: Record<string, unknown> = { ...draft, version: ARTIFACT_VERSION, mode: "localnet", hashVersion: CURRENT_HASH_VERSION };
      return { ...d, contentHash: calculateContentHash(d, CURRENT_HASH_VERSION) };
    };
    const deployDraft = (networkId: string) => ({
      schema: "hardkas.silverDeploy.v1",
      hardkasVersion: tn.hardkasVersion,
      createdAt: new Date().toISOString(),
      networkId,
      capability: "silver.p2sh.deploy-spend.v1",
      compileRecord: { path: path.relative(wsTn, tn.recordPath).replace(/\\/g, "/"), contentHash: tn.contentHash, artifactSha256: tn.provenance.artifactSha256 },
      contract: tn.contracts[0].name,
      lockingScript: tn.contracts[0].lockingScript,
      address: tn.contracts[0].address,
      txId: "ab".repeat(32),
      outpoint: { transactionId: "ab".repeat(32), index: 0 },
      valueSompi: "100000000",
      feeSompi: "2036",
      status: "confirmed",
      node: { verified: true }
    });
    for (const [label, networkId] of [["tn-deploy", "testnet-10"], ["sim-deploy-tn-compile", "simnet"]] as const) {
      const file = `${label}.json`;
      fs.writeFileSync(path.join(wsTn, file), JSON.stringify(seal(deployDraft(networkId)), null, 2));
      fs.writeFileSync(path.join(wsTn, "spend-args.json"), JSON.stringify([{ kind: "signature", account: "alice" }]));
      const r = await run(`NP-7f-${label}`, ["silver", "spend", file, "--entry", "release", "--to", sim.contracts[0].address, "--args", "spend-args.json", "--json"], wsTn);
      expect(r.exit, r.brief).toBe(2);
      expect(r.out, label).toMatch(/SILVER_NETWORK_NOT_SUPPORTED/);
      expect(r.dialled, label).toEqual([]);
    }
  });
});