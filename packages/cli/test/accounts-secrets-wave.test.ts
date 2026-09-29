import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";
import { createTxPlanArtifact } from "@hardkas/artifacts";
import { systemRuntimeContext } from "@hardkas/core";
import { ensureDevAccounts, loadKaspaWasm } from "@hardkas/accounts";
import { TxPlanService } from "@hardkas/tx-builder";

// Accounts lifecycle wave (2026-10-03), reproduced live before any change:
// - an encrypted real account could never sign: the signer only tried the development password
//   ("hardkas-local-dev") and `tx sign` had no way to take the user's;
// - `accounts real generate` without a terminal and without a password source exited 0 having
//   created nothing, left a dead `accounts.lock`, and hung while stdin stayed open (the interactive
//   prompt never settles without a terminal);
// - AUD-20: `--unsafe-plaintext` stored a mainnet private key in clear.
// Without a terminal nothing prompts and nothing half-happens; a real keystore opens only with the
// user's password, given explicitly; the development password belongs to development accounts only;
// plaintext is never written for mainnet. No secret is ever echoed or stored.

// Each case runs the CLI a few times (a few seconds each).
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const USER_PW = "wave-user-pw-5c1e";
const DEV_PW = "hardkas-local-dev";
const ANSI = /\u001b\[/;

const run = (args: string[], cwd: string, env: Record<string, string> = {}, input?: string) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], {
    cwd,
    encoding: "utf8",
    env: childEnv(env),
    timeout: 120_000,
    ...(input !== undefined ? { input } : {})
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};

/** stdin stays an open, silent pipe (an automation tool that never writes to it). */
const runOpenStdin = (args: string[], cwd: string, env: Record<string, string> = {}, timeoutMs = 20_000) =>
  new Promise<{ status: number | null; killed: boolean; out: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: childEnv(env), stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill();
    }, timeoutMs);
    child.on("close", (status) => {
      clearTimeout(timer);
      child.stdin.destroy();
      resolve({ status, killed, out });
    });
  });

const jsonOf = (s: string) => JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
const storeOf = (ws: string) => {
  const p = path.join(ws, ".hardkas", "accounts.real.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
};
const accountIn = (ws: string, name: string) => storeOf(ws)?.accounts?.find((a: any) => a.name === name);
const locksOf = (ws: string) => {
  const d = path.join(ws, ".hardkas", "locks");
  return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith(".lock")) : [];
};
const filesUnder = (root: string): string[] => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
};
const filesContaining = (root: string, needle: string) =>
  filesUnder(root).filter((f) => fs.readFileSync(f).toString("utf8").includes(needle));
const signedArtifacts = (ws: string) =>
  filesUnder(path.join(ws, ".hardkas")).filter((f) => {
    try {
      return JSON.parse(fs.readFileSync(f, "utf8"))?.schema === "hardkas.signedTx";
    } catch {
      return false;
    }
  });

/**
 * A real simnet plan for `from`, built the way `tx plan` builds one: the pinned kaspa-wasm Generator
 * (`TxPlanService.planTransactionUpstream`) prices it over one UTXO of `from`, here held in memory
 * instead of read from a node. Signing needs no node.
 */
async function realPlan(ws: string, from: { name: string; address: string }, toAddress: string): Promise<string> {
  const k: any = await loadKaspaWasm();
  const spk = k.payToAddressScript(from.address);
  const packed = Number(spk.version).toString(16).padStart(4, "0") + String(spk.script);
  const amount = 100_000_000n;
  const utxo = { outpoint: { transactionId: "ab".repeat(32), index: 0 }, address: from.address, amountSompi: 2_000_000_000n, scriptPublicKey: packed, isCoinbase: false, blockDaaScore: 1n };
  const service = new TxPlanService({ getUtxos: async () => [utxo as any], getVirtualDaaScore: async () => 100_000n });
  const result = await service.planTransactionUpstream({ fromAddress: from.address, toAddress, amountSompi: amount, feeRate: 100n, networkId: "simnet" });
  const plan = createTxPlanArtifact({
    networkId: "simnet" as any,
    mode: "localnet" as any,
    from: { input: from.name, address: from.address, accountName: from.name },
    to: { input: toAddress, address: toAddress },
    amountSompi: amount,
    plan: result.plan,
    rpcUrl: "ws://127.0.0.1:18210",
    ctx: {
      ...systemRuntimeContext,
      utxoSelection: result.utxoSelection,
      ...(result.plannerAuthority ? { plannerAuthority: result.plannerAuthority } : {}),
      ...(result.plannerAuthorityDetail ? { plannerAuthorityDetail: result.plannerAuthorityDetail } : {})
    } as any
  });
  const file = path.join(ws, `plan-${from.name}.json`);
  fs.writeFileSync(file, JSON.stringify(plan, null, 2));
  return file;
}

describe("Accounts wave · encrypted real accounts sign with the user's password, given explicitly", () => {
  let ws: string;
  let dest: string;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-acc-wave-"));
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {};");
    expect(run(["accounts", "real", "generate", "--name", "dest", "--unsafe-plaintext", "--yes", "--json"], ws).status).toBe(0);
    dest = accountIn(ws, "dest").address;
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  async function encrypted(name: string, password: string) {
    const g = run(["accounts", "real", "generate", "--name", name, "--password-env", "HK_WAVE_PW", "--json"], ws, { HK_WAVE_PW: password });
    expect(g.status, g.all).toBe(0);
    const acc = accountIn(ws, name);
    return { plan: await realPlan(ws, { name, address: acc.address }, dest), address: acc.address };
  }

  it("--password-env: signs; the password appears in no output and no file", async () => {
    const { plan } = await encrypted("encuser", USER_PW);
    const r = run(["tx", "sign", plan, "--account", "encuser", "--password-env", "HK_WAVE_PW", "--json"], ws, { HK_WAVE_PW: USER_PW });
    expect(r.status, r.all).toBe(0);
    const signed = jsonOf(r.stdout);
    expect(signed.schema).toBe("hardkas.signedTx");
    expect(signed.status).toBe("signed");
    expect(signed.txId).toMatch(/^[0-9a-f]{64}$/);
    expect(r.all).not.toContain(USER_PW);
    expect(filesContaining(ws, USER_PW)).toEqual([]);
    expect(locksOf(ws)).toEqual([]);
  });

  it("--password-stdin: signs, and the password is not echoed", async () => {
    const { plan } = await encrypted("encuser", USER_PW);
    const r = run(["tx", "sign", plan, "--account", "encuser", "--password-stdin", "--json"], ws, {}, USER_PW + "\n");
    expect(r.status, r.all).toBe(0);
    expect(jsonOf(r.stdout).status).toBe("signed");
    expect(r.all).not.toContain(USER_PW);
    expect(filesContaining(ws, USER_PW)).toEqual([]);
  });

  it("a wrong password fails with KEYSTORE_PASSWORD_INVALID: nothing signed, the attempt not echoed", async () => {
    const { plan } = await encrypted("encuser", USER_PW);
    const wrong = "not-the-password-71b";
    const r = run(["tx", "sign", plan, "--account", "encuser", "--password-env", "HK_WAVE_PW", "--json"], ws, { HK_WAVE_PW: wrong });
    expect(r.status, r.all).not.toBe(0);
    const err = jsonOf(r.stdout);
    expect(err.ok).toBe(false);
    expect(err.code).toBe("KEYSTORE_PASSWORD_INVALID");
    expect(r.all).not.toContain("DEV_ACCOUNT_KEY_UNAVAILABLE");
    expect(r.all).not.toContain(wrong);
    expect(signedArtifacts(ws)).toEqual([]);
    expect(locksOf(ws)).toEqual([]);
  });

  it("no password and no terminal: KEYSTORE_PASSWORD_REQUIRED at once, no prompt, nothing signed, no lock", async () => {
    const { plan } = await encrypted("encuser", USER_PW);
    const r = run(["tx", "sign", plan, "--account", "encuser", "--json"], ws);
    expect(r.status, r.all).not.toBe(0);
    expect(r.all).not.toMatch(ANSI);
    expect(r.all).not.toMatch(/Enter (the )?password/i);
    const err = jsonOf(r.stdout);
    expect(err.code).toBe("KEYSTORE_PASSWORD_REQUIRED");
    expect(err.message).toMatch(/--password-env/);
    expect(err.message).toMatch(/--password-stdin/);
    expect(signedArtifacts(ws)).toEqual([]);
    expect(locksOf(ws)).toEqual([]);
  });

  it("a real account encrypted with the development password is not unlocked silently; given explicitly it signs", async () => {
    const { plan } = await encrypted("encdev", DEV_PW);
    const silent = run(["tx", "sign", plan, "--account", "encdev", "--json"], ws);
    expect(silent.status, silent.all).not.toBe(0);
    expect(jsonOf(silent.stdout).code).toBe("KEYSTORE_PASSWORD_REQUIRED");
    expect(signedArtifacts(ws)).toEqual([]);

    const explicit = run(["tx", "sign", plan, "--account", "encdev", "--password-env", "HK_WAVE_PW", "--json"], ws, { HK_WAVE_PW: DEV_PW });
    expect(explicit.status, explicit.all).toBe(0);
    expect(jsonOf(explicit.stdout).status).toBe("signed");
  });

  it("control · development accounts (.hardkas/dev-accounts) still sign with no password at all", async () => {
    await ensureDevAccounts(ws);
    const ks = JSON.parse(fs.readFileSync(path.join(ws, ".hardkas", "dev-accounts", "alice.json"), "utf8"));
    const address = ks.metadata?.address ?? ks.payload?.address;
    expect(address).toMatch(/^kaspasim:/);
    const plan = await realPlan(ws, { name: "alice", address }, dest);
    const r = run(["tx", "sign", plan, "--account", "alice", "--json"], ws);
    expect(r.status, r.all).toBe(0);
    expect(jsonOf(r.stdout).status).toBe("signed");
  });
});

describe("Accounts wave · `accounts real generate` without a terminal fails closed", () => {
  let ws: string;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-acc-wave-gen-"));
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {};");
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const nothingWritten = (name: string) => {
    expect(fs.existsSync(path.join(ws, ".hardkas", "keystore", `${name}.json`))).toBe(false);
    expect(fs.existsSync(path.join(ws, ".hardkas", "accounts.real.json"))).toBe(false);
    expect(locksOf(ws)).toEqual([]);
  };

  it("no password source: exit != 0 with KEYSTORE_PASSWORD_REQUIRED; no keystore, no store, no lock", () => {
    const r = run(["accounts", "real", "generate", "--name", "enc1"], ws);
    expect(r.status, r.all).not.toBe(0);
    expect(r.all).toMatch(/KEYSTORE_PASSWORD_REQUIRED/);
    expect(r.all).not.toMatch(/Enter password/i);
    nothingWritten("enc1");
  });

  it("--json: a JSON error, never a prompt", () => {
    const r = run(["accounts", "real", "generate", "--name", "enc2", "--json"], ws);
    expect(r.status, r.all).not.toBe(0);
    expect(r.stdout).not.toMatch(ANSI);
    const err = jsonOf(r.stdout);
    expect(err.ok).toBe(false);
    expect(err.code).toBe("KEYSTORE_PASSWORD_REQUIRED");
    nothingWritten("enc2");
  });

  it("stdin left open (automation): fails at once instead of hanging", async () => {
    const r = await runOpenStdin(["accounts", "real", "generate", "--name", "enc3", "--json"], ws);
    expect(r.killed, r.out).toBe(false);
    expect(r.status, r.out).not.toBe(0);
    expect(r.out).toMatch(/KEYSTORE_PASSWORD_REQUIRED/);
    nothingWritten("enc3");
  });

  it("--password-env naming an unset variable: KEYSTORE_PASSWORD_REQUIRED, never a fallback prompt", () => {
    const r = run(["accounts", "real", "generate", "--name", "enc4", "--password-env", "HK_WAVE_UNSET_VAR", "--json"], ws);
    expect(r.status, r.all).not.toBe(0);
    expect(jsonOf(r.stdout).code).toBe("KEYSTORE_PASSWORD_REQUIRED");
    expect(r.stdout).toMatch(/HK_WAVE_UNSET_VAR/);
    nothingWritten("enc4");
  });

  it("control · --password-env and --password-stdin still create encrypted accounts and release the lock", () => {
    const a = run(["accounts", "real", "generate", "--name", "encA", "--password-env", "HK_WAVE_PW", "--json"], ws, { HK_WAVE_PW: USER_PW });
    expect(a.status, a.all).toBe(0);
    const b = run(["accounts", "real", "generate", "--name", "encB", "--password-stdin", "--json"], ws, {}, USER_PW + "\n");
    expect(b.status, b.all).toBe(0);
    expect(accountIn(ws, "encA")?.keystoreRef).toBe(".hardkas/keystore/encA.json");
    expect(accountIn(ws, "encB")?.keystoreRef).toBe(".hardkas/keystore/encB.json");
    expect(locksOf(ws)).toEqual([]);
    expect(filesContaining(ws, USER_PW)).toEqual([]);
  });
});

describe("Accounts wave · AUD-20 · plaintext is never written for mainnet", () => {
  let ws: string;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-acc-wave-main-"));
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {};");
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("generate --network mainnet --unsafe-plaintext: PLAINTEXT_MAINNET_FORBIDDEN before anything is written", () => {
    const r = run(["accounts", "real", "generate", "--name", "mainplain", "--network", "mainnet", "--unsafe-plaintext", "--yes", "--json"], ws);
    expect(r.status, r.all).not.toBe(0);
    expect(jsonOf(r.stdout).code).toBe("PLAINTEXT_MAINNET_FORBIDDEN");
    expect(accountIn(ws, "mainplain")).toBeUndefined();
    expect(filesContaining(ws, '"privateKey"')).toEqual([]);
  });

  it("import of a mainnet key with --unsafe-plaintext: refused the same way, the key written nowhere", async () => {
    const k: any = await loadKaspaWasm();
    const key = crypto.randomBytes(32).toString("hex");
    const address = new k.PrivateKey(key).toKeypair().toAddress("mainnet").toString();
    expect(address).toMatch(/^kaspa:/);
    const r = run(
      ["accounts", "real", "import", "--name", "mainimport", "--address", address, "--private-key-env", "HK_WAVE_KEY", "--unsafe-plaintext", "--yes", "--json"],
      ws,
      { HK_WAVE_KEY: key }
    );
    expect(r.status, r.all).not.toBe(0);
    expect(jsonOf(r.stdout).code).toBe("PLAINTEXT_MAINNET_FORBIDDEN");
    expect(accountIn(ws, "mainimport")).toBeUndefined();
    expect(filesContaining(ws, key)).toEqual([]);
    expect(r.all).not.toContain(key);
  });

  it("control · plaintext on simnet, asked for explicitly, still works", () => {
    const r = run(["accounts", "real", "generate", "--name", "simplain", "--unsafe-plaintext", "--yes", "--json"], ws);
    expect(r.status, r.all).toBe(0);
    expect(accountIn(ws, "simplain")?.privateKey).toMatch(/^[0-9a-f]{64}$/);
  });
});
