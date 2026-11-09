// MAINNET TOTAL LOCKDOWN · what must NOT change, against a real rusty-kaspad v2.1.0 (simnet level).
//
// The lockdown adds one identity read (getServerInfo) to every connection and refuses mainnet everywhere; a simnet
// node must keep working exactly as before. The built CLI (packages/cli/dist) in its own processes, under the hermetic
// preload (loopback allowed and logged, the canonical node ports refused): a payment plan → sign → send → wait
// (CONFIRMED) and an `artifact verify --url` of its submission record that reaches the network level from the node.
// Then, on the same real node, the lockdown itself: `--network mainnet --url <this node>` is refused before any
// connection (the node's port never appears in the command's log), and a raw `--url` to it still reads (it says simnet).
// The node is the harness's (own container per run id, free port in HARDKAS_TEST_SIMNET_PORT_RANGE, labels, data root).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mineBlocks, fundTestAccount, startIsolatedSimnet, stopIsolatedSimnet, type IsolatedSimnetSession } from "@hardkas/testing";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 });

const PW_ENV = "HK_MLU_PW";
const PASSWORD = `mlu-${crypto.randomBytes(12).toString("hex")}`;
const DENIED_PORTS = "16110,16210,17110,17210,18110,18210,18211";

let session: IsolatedSimnetSession;
let ws = "";
let logDir = "";
let n = 0;
const accounts: Record<string, string> = {};
const evidence: Array<Record<string, unknown>> = [];

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
  json: any;
  log: string;
}

async function hk(label: string, args: string[]): Promise<Run> {
  const log = path.join(logDir, `${String(++n).padStart(2, "0")}-${label}.log`);
  fs.writeFileSync(log, "");
  const env = hermeticChildEnv(log, { [PW_ENV]: PASSWORD, HARDKAS_HERMETIC_DENY_PORTS: DENIED_PORTS });
  const r = await new Promise<Run>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd: ws, env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      let json: any;
      try {
        json = JSON.parse(stdout.trim().split(/\r?\n(?=\{)/)[0] ?? "");
      } catch {
        json = undefined;
      }
      resolve({ code, stdout, stderr, json, log });
    });
  });
  evidence.push({ label, args, code: r.code, json: r.json ?? r.stdout.slice(0, 1500), stderr: r.stderr.slice(0, 800) });
  return r;
}
const brief = (r: Run) => `exit ${r.code}\n${r.stdout.slice(0, 3000)}\n${r.stderr.slice(0, 1500)}`;
const portOf = (url: string) => Number(new URL(url).port);
const dialled = (r: Run, port: number) => fs.readFileSync(r.log, "utf8").split(/\r?\n/).filter((l) => new RegExp(`\\t[^\\t]*:${port}\\t`).test(l));

function find(obj: unknown, key: string): any {
  if (!obj || typeof obj !== "object") return undefined;
  if (key in (obj as any) && (obj as any)[key] !== undefined && (obj as any)[key] !== null) return (obj as any)[key];
  for (const v of Object.values(obj as any)) {
    const hit = find(v, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function storeFiles(re: RegExp): string[] {
  const root = path.join(ws, ".hardkas", "artifacts");
  return fs.existsSync(root) ? fs.readdirSync(root, { recursive: true }).map(String).filter((f) => re.test(f) && f.endsWith(".json")).map((f) => path.join(root, f)) : [];
}

async function withMiner<T>(fn: () => Promise<T>): Promise<T> {
  let on = true;
  const loop = (async () => {
    while (on) {
      try {
        await mineBlocks(session, 1);
      } catch {
        /* retried */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  })();
  try {
    return await fn();
  } finally {
    on = false;
    await loop;
  }
}

beforeAll(async () => {
  session = await startIsolatedSimnet({ persistData: true });
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-mlu-"));
  logDir = path.join(parent, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  ws = path.join(parent, "app");
  fs.mkdirSync(path.join(ws, ".hardkas"), { recursive: true });
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: session.rpcUrl } }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
});

/** The harness's container for this node (named after its host port), as Docker reports it: the evidence of the oracle. */
function containerEvidence(): Record<string, unknown> {
  const name = `hardkas-simnet-${portOf(session.rpcUrl)}`;
  const r = spawnSync("docker", ["inspect", name, "--format", "{{json .Config.Image}} {{json .Image}} {{json .Config.Labels}} {{json .State.Status}}"], { encoding: "utf8", windowsHide: true });
  return { name, inspect: (r.stdout || r.stderr || "").trim() };
}

afterAll(async () => {
  const out = process.env.HARDKAS_TEST_MLU_EVIDENCE;
  if (out && session) fs.writeFileSync(out, JSON.stringify({ rpcUrl: session.rpcUrl, container: containerEvidence(), accounts, evidence }, null, 2));
  if (session) await stopIsolatedSimnet(session);
});

describe("MAINNET TOTAL LOCKDOWN · a real rusty-kaspad simnet works as before", () => {
  const pay: Record<string, any> = {};

  it("payment: plan → sign → send → wait CONFIRMED (the extra identity read changes nothing)", async () => {
    for (const name of ["a1", "a2"]) {
      const g = await hk(`generate-${name}`, ["accounts", "real", "generate", "--name", name, "--network", "simnet", "--password-env", PW_ENV, "--json"]);
      expect(g.code, brief(g)).toBe(0);
      accounts[name] = String(find(g.json, "address"));
      expect(accounts[name], brief(g)).toMatch(/^kaspasim:/);
    }
    await fundTestAccount(session, accounts.a1!, 1_000_000_000n);
    await mineBlocks(session, 20);
    const plan = await hk("plan", ["tx", "plan", "--from", "a1", "--to", accounts.a2!, "--amount", "1", "--out", "plan.json", "--json"]);
    expect(plan.code, brief(plan)).toBe(0);
    const sign = await hk("sign", ["tx", "sign", "plan.json", "--account", "a1", "--out", "signed.json", "--password-env", PW_ENV, "--json"]);
    expect(sign.code, brief(sign)).toBe(0);
    const send = await hk("send", ["tx", "send", "signed.json", "--yes", "--json"]);
    expect(send.code, brief(send)).toBe(0);
    expect(send.json?.outcome, brief(send)).toBe("submitted");
    pay.txId = String(find(send.json, "txId"));
    const wait = await withMiner(() => hk("wait", ["tx", "wait", pay.txId, "--timeout", "180", "--json"]));
    expect(wait.code, brief(wait)).toBe(0);
    expect(wait.json?.state, brief(wait)).toBe("CONFIRMED");
    const atA2 = (await session.rpc.getUtxosByAddress(accounts.a2!)).filter((u: any) => u.outpoint.transactionId === pay.txId);
    expect(atA2.map((u: any) => String(u.amountSompi))).toEqual(["100000000"]);
  });

  it("artifact verify --url of the submission record: integrity verified and the network level observed on this node", async () => {
    const [submission] = storeFiles(/txSubmission-/);
    expect(submission, "the send recorded its submission").toBeTruthy();
    const r = await hk("verify", ["artifact", "verify", submission!, "--url", session.rpcUrl, "--json"]);
    expect(r.code, brief(r)).toBe(0);
    const levels = find(r.json, "levels");
    expect(levels?.integrity, brief(r)).toBe("INTEGRITY_VERIFIED");
    expect(levels?.network?.level, brief(r)).toBe("NETWORK_OBSERVED");
    expect(dialled(r, portOf(session.rpcUrl)).length, brief(r)).toBeGreaterThan(0);
  });

  it("the lockdown on the same real node: --network mainnet --url is refused with zero connections; a raw --url still reads it", async () => {
    const port = portOf(session.rpcUrl);
    for (const [label, args] of [
      ["rpc-info-mainnet", ["rpc", "info", "--network", "mainnet", "--url", session.rpcUrl, "--json"]],
      ["balance-mainnet", ["accounts", "balance", accounts.a2!, "--network", "mainnet", "--url", session.rpcUrl, "--json"]],
      ["doctor-mainnet", ["doctor", "--network", "mainnet", "--url", session.rpcUrl, "--json"]]
    ] as const) {
      const r = await hk(label, [...args]);
      expect(r.stdout + r.stderr, brief(r)).toMatch(/MAINNET_CONNECTION_DISABLED/);
      expect(dialled(r, port), brief(r)).toEqual([]);
    }
    const raw = await hk("rpc-info-raw", ["rpc", "info", "--url", session.rpcUrl, "--json"]);
    expect(raw.code, brief(raw)).toBe(0);
    expect(raw.json?.info?.networkId, brief(raw)).toBe("simnet");
  });
});
