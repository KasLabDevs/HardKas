import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { Command } from "commander";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";
import { buildHardkasProgram } from "../src/program.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 60_000 });

// -----------------------------------------------------------------------------
// CLTV + ECDSA spends · the built CLI (packages/cli/dist), before anything connects:
//   * `tx plan|send --lock-time-daa <n> | --lock-time-ms <t>`: one kind, checked against Kaspa's threshold
//     (LOCK_TIME_INVALID), refused in signed-artifact mode (LOCK_TIME_OPTION_SHORTCUT_ONLY), mainnet refused first;
//   * `accounts real generate|import --ecdsa`: an ECDSA account records its scheme; the address must be the key's
//     address under the scheme asked for (ACCOUNT_KEY_SCHEME_MISMATCH otherwise); mainnet refused first.
// The workspace's node is a closed loopback port: a command that connected anywhere is caught by its own log.
// -----------------------------------------------------------------------------

let ws = "";
let logs = "";
let k: any;
const PW = "cltv-ecdsa-cli-password";

beforeAll(async () => {
  assertHermeticPreloadActive();
  const core: any = await import("@hardkas/core");
  k = core.loadManagedKaspaWasmSync();
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cltv-ecdsa-cli-"));
  logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cltv-ecdsa-cli-logs-"));
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(
    path.join(ws, "hardkas.config.ts"),
    `export default ${JSON.stringify(
      {
        execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
        networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:9" } }
      },
      null,
      2
    )};\n`
  );
});

afterAll(() => {
  for (const d of [ws, logs]) if (d) fs.rmSync(d, { recursive: true, force: true });
});

function hk(name: string, args: string[], env: Record<string, string> = {}) {
  const log = path.join(logs, `${name}.net.log`);
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd: ws, env: { ...hermeticChildEnv(log), ...env }, encoding: "utf8", timeout: 170_000 });
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  const dialled = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean) : [];
  return { status: r.status, json, dialled, out: `${r.stdout}\n${r.stderr}`, brief: `exit ${r.status}\n${r.stdout.slice(0, 2000)}\n${r.stderr.slice(0, 1500)}` };
}

const addr = (key: string, ecdsa = false) => {
  const pub = new k.PrivateKey(key).toPublicKey();
  return String((ecdsa ? pub.toAddressECDSA("simnet") : pub.toAddress("simnet")).toString());
};

describe("CLTV · tx plan / tx send lock-time options", () => {
  const bob = () => addr("6666".padStart(64, "0"));

  it("LOCK_TIME_INVALID before anything connects: both kinds, a score at the threshold, a time below it, not a number", () => {
    const cases: Array<[string, string[]]> = [
      ["both", ["--lock-time-daa", "5", "--lock-time-ms", "600000000000"]],
      ["daa-at-threshold", ["--lock-time-daa", "500000000000"]],
      ["ms-below", ["--lock-time-ms", "5"]],
      ["nan", ["--lock-time-daa", "soon"]],
      ["zero", ["--lock-time-daa", "0"]]
    ];
    for (const [name, extra] of cases) {
      const r = hk(`lt-${name}`, ["tx", "plan", "--from", bob(), "--to", bob(), "--amount", "1", ...extra, "--json"]);
      expect(r.status, `${name}: ${r.brief}`).not.toBe(0);
      expect(r.out, `${name}: ${r.brief}`).toMatch(/LOCK_TIME_INVALID/);
      expect(r.dialled, `${name}: ${r.brief}`).toEqual([]);
    }
  });

  it("tx send <signed> with a lock-time option: LOCK_TIME_OPTION_SHORTCUT_ONLY, exit 2, nothing read or contacted", () => {
    const r = hk("send-signed", ["tx", "send", path.join(ws, "absent.signed.json"), "--lock-time-daa", "5", "--json"]);
    expect(r.status, r.brief).toBe(2);
    expect(r.out, r.brief).toMatch(/LOCK_TIME_OPTION_SHORTCUT_ONLY/);
    expect(r.dialled, r.brief).toEqual([]);
  });

  it("mainnet is refused first, with a valid lock time, nothing contacted (tx plan and tx send)", () => {
    const plan = hk("mainnet-plan", ["tx", "plan", "--network", "mainnet", "--from", bob(), "--to", bob(), "--amount", "1", "--lock-time-daa", "5", "--json"]);
    expect(plan.status, plan.brief).not.toBe(0);
    expect(plan.out, plan.brief).toMatch(/MAINNET_/);
    expect(plan.dialled, plan.brief).toEqual([]);
    const send = hk("mainnet-send", ["tx", "send", "--network", "mainnet", "--from", bob(), "--to", bob(), "--amount", "1", "--lock-time-daa", "5", "--yes", "--json"]);
    expect(send.status, send.brief).not.toBe(0);
    expect(send.out, send.brief).toMatch(/MAINNET_/);
    expect(send.dialled, send.brief).toEqual([]);
  });
});

describe("ECDSA spends · accounts real generate|import --ecdsa", () => {
  it("generate --ecdsa: an ECDSA address (version 1), recorded with keyScheme ecdsa in the store and the keystore's metadata; no key printed", () => {
    const r = hk("gen-ecdsa", ["accounts", "real", "generate", "--name", "ecdsa1", "--ecdsa", "--network", "simnet", "--password-env", "HK_CLI_PW", "--json"], { HK_CLI_PW: PW });
    expect(r.status, r.brief).toBe(0);
    const [made] = r.json;
    expect(made).toMatchObject({ name: "ecdsa1", keyScheme: "ecdsa", storage: "encrypted-keystore" });
    const k2: any = k;
    // the address is an ECDSA P2PK address: its script is 21 <33-byte key> ab
    expect(String(k2.payToAddressScript(new k2.Address(made.address)).script)).toMatch(/^21(02|03)[0-9a-f]{64}ab$/);
    const store = JSON.parse(fs.readFileSync(path.join(ws, ".hardkas", "accounts.real.json"), "utf8"));
    expect(store.accounts.find((a: any) => a.name === "ecdsa1")).toMatchObject({ address: made.address, keyScheme: "ecdsa" });
    const keystore = JSON.parse(fs.readFileSync(path.join(ws, made.keystore), "utf8"));
    expect(keystore.metadata).toMatchObject({ address: made.address, keyScheme: "ecdsa" });
    expect(r.out).not.toMatch(/[0-9a-f]{64}"?\s*,?\s*"?privateKey/i);
  });

  it("import --ecdsa: the key's ECDSA address is imported; its Schnorr address with --ecdsa, or its ECDSA address without, is ACCOUNT_KEY_SCHEME_MISMATCH", () => {
    const key = "7a".repeat(32);
    const env = { HK_CLI_KEY: key, HK_CLI_PW: PW };
    const bad1 = hk("imp-ecdsa-on-schnorr", ["accounts", "real", "import", "--name", "s1", "--address", addr(key), "--ecdsa", "--private-key-env", "HK_CLI_KEY", "--password-env", "HK_CLI_PW", "--json"], env);
    expect(bad1.status, bad1.brief).not.toBe(0);
    expect(bad1.out, bad1.brief).toMatch(/ACCOUNT_KEY_SCHEME_MISMATCH/);
    const bad2 = hk("imp-ecdsa-no-flag", ["accounts", "real", "import", "--name", "e0", "--address", addr(key, true), "--private-key-env", "HK_CLI_KEY", "--password-env", "HK_CLI_PW", "--json"], env);
    expect(bad2.status, bad2.brief).not.toBe(0);
    expect(bad2.out, bad2.brief).toMatch(/ACCOUNT_KEY_SCHEME_MISMATCH/);
    const ok = hk("imp-ecdsa", ["accounts", "real", "import", "--name", "e1", "--address", addr(key, true), "--ecdsa", "--private-key-env", "HK_CLI_KEY", "--password-env", "HK_CLI_PW", "--json"], env);
    expect(ok.status, ok.brief).toBe(0);
    const store = JSON.parse(fs.readFileSync(path.join(ws, ".hardkas", "accounts.real.json"), "utf8"));
    expect(store.accounts.find((a: any) => a.name === "e1")).toMatchObject({ address: addr(key, true), keyScheme: "ecdsa" });
    expect(store.accounts.find((a: any) => a.name === "s1")).toBeUndefined();
    expect(ok.out).not.toContain(key);
  });

  it("mainnet is refused first: generate --ecdsa --network mainnet, nothing written", () => {
    const r = hk("gen-mainnet", ["accounts", "real", "generate", "--name", "m1", "--ecdsa", "--network", "mainnet", "--password-env", "HK_CLI_PW", "--json"], { HK_CLI_PW: PW });
    expect(r.status, r.brief).not.toBe(0);
    expect(r.out, r.brief).toMatch(/MAINNET_SIGNING_DISABLED/);
    const store = fs.existsSync(path.join(ws, ".hardkas", "accounts.real.json")) ? JSON.parse(fs.readFileSync(path.join(ws, ".hardkas", "accounts.real.json"), "utf8")) : { accounts: [] };
    expect(store.accounts.find((a: any) => a.name === "m1")).toBeUndefined();
  });
});

describe("CLTV + ECDSA · help texts", () => {
  const program = buildHardkasProgram({ forDocs: true });
  const command = (p: string): Command => p.split(" ").reduce((c: Command, n) => c.commands.find((x) => x.name() === n)!, program);
  const opt = (p: string, long: string) => command(p).options.find((o) => o.long === long)?.description ?? "";
  it("says what the options do", () => {
    expect(opt("tx plan", "--lock-time-daa")).toMatch(/DAA score .*LOCK_TIME_NOT_REACHED/);
    expect(opt("tx plan", "--lock-time-ms")).toMatch(/milliseconds .*past median time/);
    expect(opt("tx plan", "--confirm-distant-lock-time")).toMatch(/LOCK_TIME_DISTANT_UNCONFIRMED/);
    expect(opt("tx send", "--lock-time-daa")).toMatch(/^Shortcut mode: /);
    expect(opt("accounts real generate", "--ecdsa")).toMatch(/ECDSA P2PK address.*RFC 6979, low-S/);
    expect(opt("accounts real import", "--ecdsa")).toMatch(/ACCOUNT_KEY_SCHEME_MISMATCH/);
  });
});
