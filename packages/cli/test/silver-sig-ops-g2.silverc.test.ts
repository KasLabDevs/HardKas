import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ARTIFACT_VERSION, CURRENT_HASH_VERSION, calculateContentHash } from "@hardkas/artifacts";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";
import { runCli, startFakeNode, tempDir, type FakeNode } from "./helpers/int9-a-fake-node.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// -----------------------------------------------------------------------------
// G2 / G7 a / G7 f (kaspa-agent-notes cross-check) · silverc level (the pinned silverc compiles the contracts here); a
// loopback fake node, never the canonical ports. A node's mempool refuses every spend of a P2SH input whose redeem script
// counts more than 15 signature operations (proven on rusty-kaspad 2.1.0 simnet, v0 and v1:
// packages/testing/test/p2sh-sig-op-limit-g2.simnet.test.ts), so:
//  - G2: `silver deploy` refuses such a contract (SILVER_SIG_OPS_ABOVE_STANDARD, exit 2) before any key is read or any node
//    contacted — with --tx-version 1 too; 15 passes the check;
//  - G7 f: a deploy whose P2SH address already holds outputs warns (count and amount) before funding;
//  - G7 a: `silver spend` without --sig-op-count warns when the static count is above the declared one (both numbers).
// -----------------------------------------------------------------------------

const PW = "g2-sig-ops-password";
const CHECK = "        require(checkSig(s, owner));";
const contract = (name: string, heavy: number) =>
  `pragma silverscript ^0.1.0;\n\ncontract ${name}(pubkey owner) {\n    entry cheap(sig s) {\n${CHECK}\n    }\n\n    entry heavy(sig s) {\n${Array.from({ length: heavy }, () => CHECK).join("\n")}\n    }\n}\n`;

const made: string[] = [];
const utxos: Array<{ address: string; transactionId: string; index: number; amount: string; blockDaaScore: string }> = [];
let fake: FakeNode;
let logs = "";
let ws = "";
let compile16: any;
let compile15: any;

const run = (name: string, args: string[]) => runCli(logs, name, args, ws, { G2_PW: PW });

function cliSync(label: string, args: string[], cwd: string) {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, encoding: "utf8", env: hermeticChildEnv(path.join(logs, `${label}.net.log`), { G2_PW: PW }), timeout: 120_000 });
  expect(r.status, `${label}\n${r.stdout}\n${r.stderr}`).toBe(0);
  // the first JSON document of stdout (a command may print more after it)
  const start = r.stdout.indexOf("{");
  for (let end = r.stdout.indexOf("\n}", start); end >= 0; end = r.stdout.indexOf("\n}", end + 1)) {
    try {
      return JSON.parse(r.stdout.slice(start, end + 2));
    } catch {
      // not the end of the first document yet
    }
  }
  return JSON.parse(r.stdout.slice(start));
}

/** A sealed deploy record of `compiled` (as `silver deploy` writes one), at outpoint `txid`:0. */
function deployRecord(compiled: any, txid: string): string {
  const draft: Record<string, unknown> = {
    schema: "hardkas.silverDeploy.v1",
    hardkasVersion: compiled.hardkasVersion,
    createdAt: "2026-11-14T00:00:00.000Z",
    networkId: "simnet",
    capability: "silver.p2sh.deploy-spend.v1",
    compileRecord: { path: compiled.recordPath, contentHash: compiled.contentHash, artifactSha256: compiled.provenance.artifactSha256 },
    contract: compiled.contracts[0].name,
    lockingScript: compiled.contracts[0].lockingScript,
    address: compiled.contracts[0].address,
    txId: txid,
    outpoint: { transactionId: txid, index: 0 },
    valueSompi: "100000000",
    feeSompi: "2036",
    status: "confirmed",
    node: { verified: true },
    version: ARTIFACT_VERSION,
    mode: "rpc",
    hashVersion: CURRENT_HASH_VERSION
  };
  const file = path.join(ws, `deploy-${compiled.contracts[0].name}.json`);
  fs.writeFileSync(file, JSON.stringify({ ...draft, contentHash: calculateContentHash(draft, CURRENT_HASH_VERSION) }, null, 2));
  return file;
}

beforeAll(async () => {
  assertHermeticPreloadActive();
  logs = tempDir("hk-g2-logs-", made);
  fake = await startFakeNode("g2", { network: "simnet", utxos });
  const parent = tempDir("hk-g2-", made);
  const init = spawnSync(process.execPath, [cliDist, "init", "g2", "--network", "simnet", "--skip-toolchain", "--json"], { cwd: parent, encoding: "utf8", env: hermeticChildEnv(path.join(logs, "init.net.log")), timeout: 120_000 });
  expect(init.status, `${init.stdout}\n${init.stderr}`).toBe(0);
  ws = path.join(parent, "g2");
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: fake.url } }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  const gen = spawnSync(process.execPath, [cliDist, "accounts", "real", "generate", "--name", "funder", "--network", "simnet", "--password-env", "G2_PW", "--json"], {
    cwd: ws,
    encoding: "utf8",
    env: hermeticChildEnv(path.join(logs, "gen.net.log"), { G2_PW: PW }),
    timeout: 120_000
  });
  expect(gen.status, `${gen.stdout}\n${gen.stderr}`).toBe(0);
  fs.writeFileSync(path.join(ws, "heavy16.sil"), contract("Heavy16", 15));
  fs.writeFileSync(path.join(ws, "heavy15.sil"), contract("Heavy15", 14));
  fs.writeFileSync(path.join(ws, "ctor.json"), JSON.stringify([{ kind: "bytes", value: Array.from({ length: 32 }, () => 17) }]));
  fs.writeFileSync(path.join(ws, "args.json"), JSON.stringify([{ kind: "signature", account: "funder" }]));
  compile16 = cliSync("compile16", ["silver", "compile", "heavy16.sil", "--args", "ctor.json", "--out", "heavy16.compile.json", "--json"], ws);
  compile15 = cliSync("compile15", ["silver", "compile", "heavy15.sil", "--args", "ctor.json", "--out", "heavy15.compile.json", "--json"], ws);
});

afterAll(async () => {
  await fake?.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const nodeDials = (dialled: string[]) => dialled.filter((d) => d.endsWith(`:${fake.port}`) || /:(16110|16210|17110|17210|18110|18210|18211)$/.test(d));

describe("G2 · silver deploy refuses a redeem script above 15 signature operations, before funding", () => {
  it("G2-C1 16 operations (1 + 15 in two entries): SILVER_SIG_OPS_ABOVE_STANDARD, exit 2, naming 16 and 15; no key, no node, nothing funded — v0 and --tx-version 1", async () => {
    for (const extra of [[], ["--tx-version", "1"]]) {
      const before = fake.methods.length;
      const r = await run(`deploy16-${extra.length}`, ["silver", "deploy", compile16.recordPath, "--from", "funder", "--password-env", "G2_PW", "--amount", "1", ...extra, "--json"]);
      expect(r.status, r.brief).toBe(2);
      expect(r.code, r.brief).toBe("SILVER_SIG_OPS_ABOVE_STANDARD");
      expect(r.all, r.brief).toMatch(/counts 16 signature operations/);
      expect(r.all, r.brief).toMatch(/above 15/);
      expect(r.all, r.brief).toMatch(/Nothing was funded/);
      expect(fake.methods.slice(before), r.brief).toEqual([]);
      expect(nodeDials(r.dialled), r.brief).toEqual([]);
    }
  });

  it("G2-C3 silver covenant genesis refuses the same contract the same way (a covenant output is a P2SH input of every transition)", async () => {
    const before = fake.methods.length;
    const r = await run("genesis16", ["silver", "covenant", "genesis", compile16.recordPath, "--from", "funder", "--password-env", "G2_PW", "--amount", "1", "--json"]);
    expect(r.status, r.brief).toBe(2);
    expect(r.code, r.brief).toBe("SILVER_SIG_OPS_ABOVE_STANDARD");
    expect(r.all, r.brief).toMatch(/counts 16 signature operations/);
    expect(fake.methods.slice(before), r.brief).toEqual([]);
    expect(nodeDials(r.dialled), r.brief).toEqual([]);
  });

  it("G2-C2 + G7 f 15 operations pass the check; coins already at the contract's address are named (count, sompi) before funding; nothing is submitted", async () => {
    const address = compile15.contracts[0].address;
    utxos.push(
      { address, transactionId: "c1".repeat(32), index: 0, amount: "100000000", blockDaaScore: "10" },
      { address, transactionId: "c2".repeat(32), index: 1, amount: "200000000", blockDaaScore: "11" }
    );
    const before = fake.methods.length;
    const r = await run("deploy15", ["silver", "deploy", compile15.recordPath, "--from", "funder", "--password-env", "G2_PW", "--amount", "1", "--json"]);
    expect(r.code, r.brief).not.toBe("SILVER_SIG_OPS_ABOVE_STANDARD");
    expect(r.all, r.brief).toMatch(new RegExp(`warning: ${address} already holds 2 output\\(s\\), 300000000 sompi in all`));
    const asked = fake.methods.slice(before);
    expect(asked, r.brief).toContain("getUtxosByAddresses");
    expect(asked, r.brief).not.toContain("submitTransaction");
    // the funder has no coins on the fake: the funding itself fails after the warning, as it did before
    expect(r.status, r.brief).not.toBe(0);
  });
});

describe("G7 a · silver spend warns when the redeem script counts more signature operations than the spend declares", () => {
  it("G7a-1 without --sig-op-count: 15 static vs 1 declared is named; 16 adds the mempool refusal; with --sig-op-count no warning", async () => {
    const txid15 = "d1".repeat(32);
    const txid16 = "d2".repeat(32);
    utxos.push(
      { address: compile15.contracts[0].address, transactionId: txid15, index: 0, amount: "100000000", blockDaaScore: "12" },
      { address: compile16.contracts[0].address, transactionId: txid16, index: 0, amount: "100000000", blockDaaScore: "12" }
    );
    const to = compile15.contracts[0].address;
    const spend = (label: string, record: string, extra: string[] = []) =>
      run(label, ["silver", "spend", record, "--entry", "cheap", "--args", "args.json", "--to", to, "--password-env", "G2_PW", ...extra, "--json"]);

    const r15 = await spend("spend15", deployRecord(compile15, txid15));
    expect(r15.all, r15.brief).toMatch(/warning: Heavy15's redeem script counts 15 signature operations \(all its entries\); this spend declares 1/);
    expect(r15.all, r15.brief).toMatch(/--sig-op-count/);
    expect(r15.all, r15.brief).not.toMatch(/refuses every spend of this contract/);

    const r16 = await spend("spend16", deployRecord(compile16, txid16));
    expect(r16.all, r16.brief).toMatch(/warning: Heavy16's redeem script counts 16 signature operations/);
    expect(r16.all, r16.brief).toMatch(/Above 15, a node's mempool refuses every spend of this contract/);

    const explicit = await spend("spend15-explicit", deployRecord(compile15, txid15), ["--sig-op-count", "1"]);
    expect(explicit.all, explicit.brief).not.toMatch(/redeem script counts/);
    for (const r of [r15, r16, explicit]) expect(fake.methods, r.brief).not.toContain("submitTransaction");
  });
});
