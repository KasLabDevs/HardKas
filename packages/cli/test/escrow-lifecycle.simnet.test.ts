// ESCROW-LIFECYCLE-1 · the v2 escrow lifecycle through the built CLI against a real rusty-kaspad (simnet level).
//
// Three workspaces, three people: the creator (buyer, an encrypted account), the seller and the arbiter (each an
// encrypted account in a workspace of their own). Every command is the built CLI (packages/cli/dist/index.js) in its own
// process under the hermetic preload (loopback only; the canonical node ports refused), pointed at the harness node
// through a relay that counts submitTransaction requests. For each escrow: create → fund → prepare → sign ×2 (in the
// signers' own workspaces, with the release request file) → release → reconcile, and the node's own UTXO set is the
// oracle of what was paid:
//   A · EscrowFull, mutualRelease (buyer + seller), 1 KAS, default 50/50, funding and release waited for;
//   B · EscrowFull, releaseToSeller (seller + arbiter: the arbiter branch), 0.1 KAS at the default fee budget, funding
//       and release confirmed through `escrow reconcile`, the two signatures in two request files;
//   C · EscrowSplit, executeSplit (buyer + arbiter), 0.6 / 0.4 KAS, the buyer signing in the record;
//   D · EscrowFull, releaseToSeller, 5 KAS to one output: a release whose compute mass is its mass.
// Level variables (simnet only): HARDKAS_HOME with the pinned kaspa-wasm and silverc; optionally the harness's own.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mineBlocks, fundTestAccount, startIsolatedSimnet, stopIsolatedSimnet, type IsolatedSimnetSession } from "@hardkas/testing";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv } from "./hermetic-child.js";
import { startCountingWsProxy, type CountingWsProxy } from "./helpers/counting-ws-proxy.js";

vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 });

const PW_ENV = "HK_ESCROW_LIFECYCLE_PW";
const PASSWORD = `escrow-lifecycle-${crypto.randomBytes(12).toString("hex")}`;
const DENIED_PORTS = "16110,16210,17110,17210,18110,18210,18211";

interface Run {
  label: string;
  code: number | null;
  stdout: string;
  stderr: string;
  json: any;
  log: string;
}

let session: IsolatedSimnetSession;
let relay: CountingWsProxy;
const submits = () => relay.count("submitTransaction");
let parent = "";
let logDir = "";
const ws: Record<"creator" | "seller" | "arbiter", string> = { creator: "", seller: "", arbiter: "" };
const addr: Record<string, string> = {};
const runs: Run[] = [];

async function hk(label: string, args: string[], cwd: string): Promise<Run> {
  const log = path.join(logDir, `${String(runs.length).padStart(3, "0")}-${label.replace(/[^\w.-]+/g, "_")}.log`);
  fs.writeFileSync(log, "");
  const env = hermeticChildEnv(log, { [PW_ENV]: PASSWORD, HARDKAS_HERMETIC_DENY_PORTS: DENIED_PORTS });
  const r = await new Promise<Run>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      let json: any;
      for (const chunk of stdout.trim().split(/\r?\n(?=\{)/)) {
        try {
          json = json ?? JSON.parse(chunk);
        } catch {
          /* a human line */
        }
      }
      resolve({ label, code, stdout, stderr, json, log });
    });
    child.stdin.end();
  });
  runs.push(r);
  return r;
}

const brief = (r: Run) => `${r.label}: exit ${r.code}\n${r.stdout.slice(0, 4000)}\n${r.stderr.slice(0, 2000)}`;

function ok(r: Run): any {
  expect(r.code, brief(r)).toBe(0);
  expect(r.json?.ok, brief(r)).toBe(true);
  return r.json;
}

function backgroundMiner(intervalMs = 400): () => Promise<void> {
  let on = true;
  const loop = (async () => {
    while (on) {
      try {
        await mineBlocks(session, 1);
      } catch {
        /* a failed template round is retried */
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  })();
  return async () => {
    on = false;
    await loop;
  };
}

async function withMiner<T>(fn: () => Promise<T>): Promise<T> {
  const stop = backgroundMiner();
  try {
    return await fn();
  } finally {
    await stop();
  }
}

function writeConfig(dir: string) {
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: relay.url } }
  };
  fs.writeFileSync(path.join(dir, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
}

async function workspace(role: "creator" | "seller" | "arbiter", account: string) {
  const init = await hk(`init-${role}`, ["init", role, "--network", "simnet", "--skip-toolchain", "--json"], parent);
  expect(init.code, brief(init)).toBe(0);
  ws[role] = path.join(parent, role);
  writeConfig(ws[role]);
  const g = await hk(`generate-${account}`, ["accounts", "real", "generate", "--name", account, "--network", "simnet", "--password-env", PW_ENV, "--json"], ws[role]);
  expect(g.code, brief(g)).toBe(0);
  const list = await hk(`list-${role}`, ["accounts", "list", "--json"], ws[role]);
  const m = new RegExp(`"name"\\s*:\\s*"${account}"[\\s\\S]*?"address"\\s*:\\s*"(kaspasim:[a-z0-9]+)"`).exec(list.stdout);
  expect(m, `address of ${account}\n${list.stdout.slice(0, 3000)}`).not.toBeNull();
  addr[account] = m![1]!;
}

/** The node's unspent outputs of transaction `txId` at `address`: [index, sompi]. */
async function paid(txId: string, address: string): Promise<Array<[number, string]>> {
  const utxos = await session.rpc.getUtxosByAddress(address);
  return utxos.filter((u: any) => u.outpoint.transactionId === txId).map((u: any) => [Number(u.outpoint.index), String(u.amountSompi)] as [number, string]);
}

async function untilTrue(what: string, check: () => Promise<boolean>, timeoutMs = 180_000) {
  const end = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/** A copy of a release request in another workspace (it travels between people as a file). */
function handOver(from: string, to: string, name: string): string {
  fs.copyFileSync(from, path.join(to, name));
  return name;
}

beforeAll(async () => {
  session = await startIsolatedSimnet({ persistData: true });
  relay = await startCountingWsProxy(session.rpcUrl, 0);
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-escrow-lifecycle-"));
  logDir = path.join(parent, "connection-logs");
  fs.mkdirSync(logDir, { recursive: true });
  await workspace("creator", "buyer");
  await workspace("seller", "seller");
  await workspace("arbiter", "arbiter");
  await fundTestAccount(session, addr.buyer!, 1_000_000_000n);
  // past coinbase maturity (and the planners' margin)
  await mineBlocks(session, 30);
});

afterAll(async () => {
  try {
    fs.writeFileSync(path.join(parent || os.tmpdir(), "escrow-lifecycle-trace.json"), JSON.stringify({ rpcUrl: session?.rpcUrl, runs: runs.map((r) => ({ label: r.label, code: r.code, json: r.json, stderr: r.stderr.slice(0, 2000) })) }, null, 2));
  } catch {
    /* the trace is a diagnostic */
  }
  if (relay) await relay.close();
  if (session) await stopIsolatedSimnet(session);
});

describe("ESCROW-LIFECYCLE-1 · hardkas escrow against a real rusty-kaspad (simnet)", () => {
  it("A · EscrowFull mutualRelease: create → fund (wait) → prepare → buyer signs → seller signs in their workspace → release (wait) → reconcile; the node pays 50/50", async () => {
    const created = ok(await hk("A-create", ["escrow", "create", "--buyer", "buyer", "--seller", addr.seller!, "--arbiter", addr.arbiter!, "--amount", "1", "--json"], ws.creator));
    const id = String(created.id);
    expect(created.contract).toBe("EscrowFull");
    expect(created.fundingSompi).toBe("102000000");
    const before = submits();
    const funded = ok(await withMiner(() => hk("A-fund", ["escrow", "fund", id, "--from", "buyer", "--password-env", PW_ENV, "--wait", "--timeout", "180", "--json"], ws.creator)));
    expect(funded.status, JSON.stringify(funded)).toBe("confirmed");
    expect(submits() - before, "one submitTransaction for the funding").toBe(1);
    expect(await paid(funded.txId, created.address)).toEqual([[0, "102000000"]]);
    // a second funding is refused, nothing sent
    const again = await hk("A-fund-again", ["escrow", "fund", id, "--from", "buyer", "--password-env", PW_ENV, "--json"], ws.creator);
    expect(again.code, brief(again)).not.toBe(0);
    expect(again.json?.code, brief(again)).toBe("ESCROW_ALREADY_FUNDED");
    expect(submits() - before).toBe(1);

    const prepared = ok(await hk("A-prepare", ["escrow", "prepare", id, "--branch", "mutualRelease", "--out", "A.request.json", "--json"], ws.creator));
    expect(prepared.request.requiredSigners).toEqual(["buyer", "seller"]);
    expect(prepared.request.feeSompi).toBe("2000000");
    ok(await hk("A-sign-buyer", ["escrow", "sign", "A.request.json", "--role", "buyer", "--account", "buyer", "--password-env", PW_ENV, "--json"], ws.creator));
    const file = handOver(path.join(ws.creator, "A.request.json"), ws.seller, "A.request.json");
    // the seller cannot sign as the buyer: their key is not the buyer's
    const wrong = await hk("A-sign-wrong-role", ["escrow", "sign", file, "--role", "buyer", "--account", "seller", "--password-env", PW_ENV, "--json"], ws.seller);
    expect(wrong.json?.code, brief(wrong)).toBe("ESCROW_SIGNER_NOT_FOUND");
    const sellerSigned = ok(await hk("A-sign-seller", ["escrow", "sign", file, "--role", "seller", "--account", "seller", "--password-env", PW_ENV, "--json"], ws.seller));
    expect(sellerSigned.signatures.sort()).toEqual(["buyer", "seller"]);

    const sent0 = submits();
    const released = ok(
      await withMiner(() =>
        hk("A-release", ["escrow", "release", id, "--signatures", path.join(ws.seller, file), "--wait", "--timeout", "180", "--json"], ws.creator)
      )
    );
    expect({ status: released.status, state: released.state }, JSON.stringify(released)).toEqual({ status: "confirmed", state: "RELEASED" });
    expect(submits() - sent0, "one submitTransaction for the release").toBe(1);
    expect(await paid(released.txId, addr.buyer!)).toEqual([[0, "50000000"]]);
    expect(await paid(released.txId, addr.seller!)).toEqual([[1, "50000000"]]);
    const reconciled = ok(await hk("A-reconcile", ["escrow", "reconcile", id, "--json"], ws.creator));
    expect(reconciled.state).toBe("RELEASED");
    const twice = await hk("A-release-again", ["escrow", "release", id, "--json"], ws.creator);
    expect(twice.json?.code, brief(twice)).toBe("ESCROW_ALREADY_RELEASED");
    expect(submits() - sent0).toBe(1);
    const status = ok(await hk("A-status", ["escrow", "status", id, "--json"], ws.creator));
    expect(status.escrow.release).toMatchObject({ transactionId: released.txId, status: "confirmed" });
  });

  it("B · EscrowFull releaseToSeller (the arbiter branch), 0.1 KAS at the default fee budget: funding and release confirmed by reconcile; seller and arbiter sign separate copies", async () => {
    const created = ok(await hk("B-create", ["escrow", "create", "--buyer", "buyer", "--seller", addr.seller!, "--arbiter", addr.arbiter!, "--amount", "0.1", "--json"], ws.creator));
    const id = String(created.id);
    expect(created.fundingSompi).toBe("12000000");
    const funded = ok(await hk("B-fund", ["escrow", "fund", id, "--from", "buyer", "--password-env", PW_ENV, "--json"], ws.creator));
    expect(funded.status).toBe("broadcast");
    await withMiner(() =>
      untilTrue("the funding confirmed by reconcile", async () => {
        const r = await hk("B-reconcile-funding", ["escrow", "reconcile", id, "--json"], ws.creator);
        return r.json?.escrow?.funding?.status === "confirmed";
      })
    );
    const prepared = ok(await hk("B-prepare", ["escrow", "prepare", id, "--branch", "releaseToSeller", "--out", "B.request.json", "--json"], ws.creator));
    expect(prepared.request.requiredSigners).toEqual(["seller", "arbiter"]);
    expect(prepared.request.outputs).toEqual([expect.objectContaining({ address: addr.seller, amountSompi: "10000000" })]);
    const forSeller = handOver(path.join(ws.creator, "B.request.json"), ws.seller, "B.request.json");
    const forArbiter = handOver(path.join(ws.creator, "B.request.json"), ws.arbiter, "B.request.json");
    // a request whose draft was edited (the release paid to another address) is refused before anything is signed
    const tampered = JSON.parse(fs.readFileSync(path.join(ws.arbiter, forArbiter), "utf8"));
    tampered.draft.outputs[0].valueSompi = "11000000";
    fs.writeFileSync(path.join(ws.arbiter, "B.tampered.json"), JSON.stringify(tampered));
    const refused = await hk("B-sign-tampered", ["escrow", "sign", "B.tampered.json", "--role", "arbiter", "--account", "arbiter", "--password-env", PW_ENV, "--json"], ws.arbiter);
    expect(refused.json?.code, brief(refused)).toBe("ESCROW_REQUEST_MISMATCH");
    ok(await hk("B-sign-seller", ["escrow", "sign", forSeller, "--role", "seller", "--account", "seller", "--password-env", PW_ENV, "--json"], ws.seller));
    ok(await hk("B-sign-arbiter", ["escrow", "sign", forArbiter, "--role", "arbiter", "--account", "arbiter", "--password-env", PW_ENV, "--json"], ws.arbiter));
    const sent0 = submits();
    const released = ok(
      await hk("B-release", ["escrow", "release", id, "--signatures", path.join(ws.seller, forSeller), path.join(ws.arbiter, forArbiter), "--json"], ws.creator)
    );
    expect(released.status).toBe("broadcast");
    expect(submits() - sent0).toBe(1);
    // sent and not reconciled: never sent again
    const pending = await hk("B-release-pending", ["escrow", "release", id, "--json"], ws.creator);
    expect(pending.json?.code, brief(pending)).toBe("ESCROW_RELEASE_PENDING");
    await withMiner(() =>
      untilTrue("the release confirmed by reconcile", async () => {
        const r = await hk("B-reconcile-release", ["escrow", "reconcile", id, "--json"], ws.creator);
        return r.json?.state === "RELEASED";
      })
    );
    expect(submits() - sent0, "reconcile sends nothing").toBe(1);
    expect(await paid(released.txId, addr.seller!)).toEqual([[0, "10000000"]]);
  });

  it("C · EscrowSplit executeSplit (buyer + arbiter), 0.6 / 0.4 KAS: the buyer signs in the record, the arbiter in their workspace; the node pays both allocations", async () => {
    const created = ok(
      await hk("C-create", ["escrow", "create", "--buyer", "buyer", "--seller", addr.seller!, "--arbiter", addr.arbiter!, "--buyer-amount", "0.6", "--seller-amount", "0.4", "--json"], ws.creator)
    );
    const id = String(created.id);
    expect(created.contract).toBe("EscrowSplit");
    expect(created.fundingSompi).toBe("102000000");
    ok(await withMiner(() => hk("C-fund", ["escrow", "fund", id, "--from", "buyer", "--password-env", PW_ENV, "--wait", "--timeout", "180", "--json"], ws.creator)));
    const prepared = ok(await hk("C-prepare", ["escrow", "prepare", id, "--branch", "executeSplit", "--out", "C.request.json", "--json"], ws.creator));
    expect(prepared.request.requiredSigners).toEqual(["buyer", "arbiter"]);
    const signedHere = ok(await hk("C-sign-buyer-record", ["escrow", "sign", id, "--role", "buyer", "--account", "buyer", "--password-env", PW_ENV, "--json"], ws.creator));
    expect(signedHere.state).toBe("PARTIALLY_SIGNED");
    const file = handOver(path.join(ws.creator, "C.request.json"), ws.arbiter, "C.request.json");
    ok(await hk("C-sign-arbiter", ["escrow", "sign", file, "--role", "arbiter", "--account", "arbiter", "--password-env", PW_ENV, "--json"], ws.arbiter));
    const released = ok(
      await withMiner(() => hk("C-release", ["escrow", "release", id, "--signatures", path.join(ws.arbiter, file), "--wait", "--timeout", "180", "--json"], ws.creator))
    );
    expect(released.state, JSON.stringify(released)).toBe("RELEASED");
    expect(await paid(released.txId, addr.buyer!)).toEqual([[0, "60000000"]]);
    expect(await paid(released.txId, addr.seller!)).toEqual([[1, "40000000"]]);
  });

  it("D · EscrowFull releaseToSeller of 5 KAS to one output (compute mass outweighs storage mass): sent once, accepted, the node pays the seller", async () => {
    // A release whose compute mass is its mass (one large output) used to be refused by the send's economic check
    // before anything was sent ("Mass mismatch"): its plan stated the draft's real P2SH mass, the check recomputes the
    // SDK's figure. A, B and C have small outputs, whose storage mass is the mass either way.
    const created = ok(await hk("D-create", ["escrow", "create", "--buyer", "buyer", "--seller", addr.seller!, "--arbiter", addr.arbiter!, "--amount", "5", "--json"], ws.creator));
    const id = String(created.id);
    expect(created.fundingSompi).toBe("502000000");
    ok(await withMiner(() => hk("D-fund", ["escrow", "fund", id, "--from", "buyer", "--password-env", PW_ENV, "--wait", "--timeout", "180", "--json"], ws.creator)));
    const prepared = ok(await hk("D-prepare", ["escrow", "prepare", id, "--branch", "releaseToSeller", "--out", "D.request.json", "--json"], ws.creator));
    expect(prepared.request.outputs).toEqual([expect.objectContaining({ address: addr.seller, amountSompi: "500000000" })]);
    const forSeller = handOver(path.join(ws.creator, "D.request.json"), ws.seller, "D.request.json");
    const forArbiter = handOver(path.join(ws.creator, "D.request.json"), ws.arbiter, "D.request.json");
    ok(await hk("D-sign-seller", ["escrow", "sign", forSeller, "--role", "seller", "--account", "seller", "--password-env", PW_ENV, "--json"], ws.seller));
    ok(await hk("D-sign-arbiter", ["escrow", "sign", forArbiter, "--role", "arbiter", "--account", "arbiter", "--password-env", PW_ENV, "--json"], ws.arbiter));
    const sent0 = submits();
    const released = ok(
      await withMiner(() =>
        hk("D-release", ["escrow", "release", id, "--signatures", path.join(ws.seller, forSeller), path.join(ws.arbiter, forArbiter), "--wait", "--timeout", "180", "--json"], ws.creator)
      )
    );
    expect({ status: released.status, state: released.state }, JSON.stringify(released)).toEqual({ status: "confirmed", state: "RELEASED" });
    expect(submits() - sent0, "one submitTransaction for the release").toBe(1);
    expect(await paid(released.txId, addr.seller!)).toEqual([[0, "500000000"]]);
  });

  it("every connection any command made went to the harness node through the counting relay; nothing else was attempted", () => {
    const port = `(?:${new URL(session.rpcUrl).port}|${relay.port})`;
    const offending = runs.flatMap((r) =>
      fs
        .readFileSync(r.log, "utf8")
        .split("\n")
        .filter(Boolean)
        .filter((line) => {
          const [, kind, target] = line.split("\t");
          return kind !== "LOOPBACK_CONNECT" || !new RegExp(`(^|[^0-9])${port}$`).test(String(target));
        })
        .map((line) => ({ run: r.label, line }))
    );
    expect(offending, JSON.stringify(offending.slice(0, 20), null, 1)).toEqual([]);
  });
});
