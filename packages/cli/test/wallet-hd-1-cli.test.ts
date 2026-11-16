/*
 * WALLET-HD-1 · `hardkas wallet hd …` through the built CLI (packages/cli/dist), in temporary workspaces:
 *   - create / list / address / reveal / import / change-password, secrets only from environment variables;
 *   - nothing secret on stdout unless `reveal --yes`; the wallet file holds no plaintext secret (`security audit`'s
 *     detector finds nothing in it);
 *   - mainnet refused FIRST in every command that would make a key, read or send (MAINNET_SIGNING_DISABLED /
 *     MAINNET_CONNECTION_DISABLED / MAINNET_BROADCAST_DISABLED), before any password is read, with nothing written and
 *     no connection to the loopback DECOY "mainnet node" (counted by the decoy and by the hermetic preload's log).
 * Throwaway wallets; generated phrases are compared as booleans and never printed.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";
import { startDecoy, attemptsIn, type Decoy } from "./helpers/mainnet-decoy.js";
import { findSecretMaterial } from "../src/commands/security.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const made: string[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-hd1-cli-logs-"));
made.push(logs);
let decoy: Decoy;
let n = 0;
const PW = "hd1-cli-password";
const PHRASE_SHAPE = /\b([a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/;

interface Run {
  exit: number | null;
  stdout: string;
  stderr: string;
  log: string;
}

function cli(args: string[], cwd: string, extraEnv: Record<string, string> = {}, stdin?: string): Promise<Run> {
  const log = path.join(logs, `${++n}.net.log`);
  const env = hermeticChildEnv(log, { HK_HD_PW: PW, ...extraEnv });
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 150_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (exit) => {
      clearTimeout(timer);
      resolve({ exit, stdout, stderr, log });
    });
    if (stdin !== undefined) child.stdin.write(stdin);
    child.stdin.end();
  });
}

const docs = (stdout: string): any[] =>
  stdout
    .trim()
    .split(/\r?\n(?=\{)/)
    .map((c) => {
      try {
        return JSON.parse(c);
      } catch {
        return undefined;
      }
    })
    .filter(Boolean);
const ok = (r: Run) => docs(r.stdout).find((d) => d.ok !== false) ?? docs(r.stdout)[0];
const failCode = (r: Run) => docs(r.stdout).find((d) => d.ok === false)?.code;
const brief = (r: Run) => JSON.stringify({ exit: r.exit, stdout: r.stdout.slice(-700), stderr: r.stderr.slice(-400) });

function workspace(label: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-hd1-cli-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    network: { allowPublic: true },
    experimental: true,
    networks: {
      simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:9" },
      mainnet: { kind: "kaspa-rpc", network: "mainnet", rpcUrl: decoy.url, allowMainnet: true },
      prod: { kind: "kaspa-rpc", network: "mainnet", rpcUrl: decoy.url, allowMainnet: true }
    }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  return ws;
}
const walletFiles = (ws: string) => (fs.existsSync(path.join(ws, ".hardkas", "wallets")) ? fs.readdirSync(path.join(ws, ".hardkas", "wallets")).filter((f) => f.endsWith(".json")) : []);

beforeAll(async () => {
  assertHermeticPreloadActive();
  decoy = await startDecoy("mainnet");
});
afterAll(async () => {
  await decoy?.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("WALLET-HD-1 · CLI · create, list, address, reveal, import, change-password", () => {
  const S: Record<string, any> = {};

  it("create: an encrypted wallet, its first receive address, no secret on stdout or in the file", async () => {
    const ws = workspace("a");
    const r = await cli(["wallet", "hd", "create", "--name", "w1", "--password-env", "HK_HD_PW", "--json"], ws);
    expect(r.exit, brief(r)).toBe(0);
    const w = ok(r);
    expect(w).toMatchObject({ name: "w1", network: "simnet", kind: "hd", mnemonicWords: 24, passphraseRequired: false });
    expect(w.walletId).toMatch(/^[0-9a-f]{32}$/);
    expect(w.firstReceiveAddress).toMatch(/^kaspasim:/);
    expect(w.accounts[0].xpub).toMatch(/^ktub/);
    expect("mnemonic" in w).toBe(false);
    expect(PHRASE_SHAPE.test(r.stdout + r.stderr)).toBe(false);
    const files = walletFiles(ws);
    expect(files).toEqual([`${w.walletId}.json`]);
    const text = fs.readFileSync(path.join(ws, ".hardkas", "wallets", files[0]!), "utf8");
    expect(findSecretMaterial(text)).toEqual([]);
    expect(PHRASE_SHAPE.test(text)).toBe(false);
    Object.assign(S, { ws, w });
  });

  it("list (public header only) and address (opened with the password; the index advances)", async () => {
    const { ws, w } = S;
    const l = await cli(["wallet", "hd", "list", "--json"], ws);
    expect(l.exit, brief(l)).toBe(0);
    expect(ok(l).wallets.map((x: any) => [x.name, x.verified])).toEqual([["w1", false]]);
    const a0 = await cli(["wallet", "hd", "address", "w1", "--password-env", "HK_HD_PW", "--json"], ws);
    expect(a0.exit, brief(a0)).toBe(0);
    expect(ok(a0)).toMatchObject({ index: 0, chain: "receive", verified: true, address: w.firstReceiveAddress, path: "m/44'/111111'/0'/0/0" });
    const a1 = await cli(["wallet", "hd", "address", "w1", "--password-env", "HK_HD_PW", "--json"], ws);
    expect(ok(a1).index).toBe(1);
    const c = await cli(["wallet", "hd", "address", "w1", "--change", "--index", "5", "--password-env", "HK_HD_PW", "--json"], ws);
    expect(ok(c)).toMatchObject({ chain: "change", index: 5, path: "m/44'/111111'/0'/1/5" });
    // an HD wallet's address needs the password (non-interactive: refused, nothing shown)
    const none = await cli(["wallet", "hd", "address", "w1", "--json"], ws);
    expect(failCode(none), brief(none)).toBe("KEYSTORE_PASSWORD_REQUIRED");
    const wrong = await cli(["wallet", "hd", "address", "w1", "--password-env", "HK_WRONG", "--json"], ws, { HK_WRONG: "not-the-password" });
    expect(failCode(wrong), brief(wrong)).toBe("HD_WALLET_UNLOCK_FAILED");
  });

  it("reveal needs --yes; with it, the phrase recovers the same wallet in another workspace (import from an environment variable)", async () => {
    const { ws, w } = S;
    const no = await cli(["wallet", "hd", "reveal", "w1", "--password-env", "HK_HD_PW", "--json"], ws);
    expect(failCode(no), brief(no)).toBe("HD_WALLET_REVEAL_CONFIRMATION_REQUIRED");
    expect(no.exit).toBe(2);
    const yes = await cli(["wallet", "hd", "reveal", "w1", "--yes", "--password-env", "HK_HD_PW", "--json"], ws);
    expect(yes.exit, "reveal exit").toBe(0);
    const phrase = String(ok(yes)?.mnemonic ?? "");
    expect(phrase.split(" ").length === 24).toBe(true);
    const ws2 = workspace("b");
    const conflict = await cli(["wallet", "hd", "import", "--name", "r", "--mnemonic-stdin", "--password-stdin", "--json"], ws2, {}, "x\n");
    expect(failCode(conflict), brief(conflict)).toBe("HD_WALLET_STDIN_CONFLICT");
    const missing = await cli(["wallet", "hd", "import", "--name", "r", "--password-env", "HK_HD_PW", "--json"], ws2);
    expect(failCode(missing), brief(missing)).toBe("HD_WALLET_MNEMONIC_REQUIRED");
    const imp = await cli(["wallet", "hd", "import", "--name", "recovered", "--mnemonic-env", "HK_HD_PHRASE", "--password-env", "HK_HD_PW", "--json"], ws2, { HK_HD_PHRASE: phrase });
    expect(imp.exit, "import exit").toBe(0);
    expect(ok(imp).firstReceiveAddress === w.firstReceiveAddress).toBe(true);
    expect(ok(imp).accounts[0].xpub === w.accounts[0].xpub).toBe(true);
    const bad = await cli(["wallet", "hd", "import", "--name", "bad", "--mnemonic-env", "HK_HD_PHRASE", "--password-env", "HK_HD_PW", "--json"], ws2, { HK_HD_PHRASE: "zoo zoo zoo" });
    expect(failCode(bad), brief(bad)).toBe("HD_WALLET_MNEMONIC_INVALID");
    expect(PHRASE_SHAPE.test(bad.stdout + bad.stderr)).toBe(false);
  });

  it("change-password: the old password stops opening the wallet, the new one opens it", async () => {
    const { ws } = S;
    const r = await cli(["wallet", "hd", "change-password", "w1", "--password-env", "HK_HD_PW", "--new-password-env", "HK_NEW", "--json"], ws, { HK_NEW: "a-brand-new-password" });
    expect(r.exit, brief(r)).toBe(0);
    expect(ok(r).passwordChanged).toBe(true);
    const old = await cli(["wallet", "hd", "address", "w1", "--index", "0", "--password-env", "HK_HD_PW", "--json"], ws);
    expect(failCode(old), brief(old)).toBe("HD_WALLET_UNLOCK_FAILED");
    const fresh = await cli(["wallet", "hd", "address", "w1", "--index", "0", "--password-env", "HK_NEW", "--json"], ws, { HK_NEW: "a-brand-new-password" });
    expect(ok(fresh).verified).toBe(true);
  });

  it("watch-only: addresses from an account kpub, marked unverified; it cannot send", async () => {
    const { ws, w } = S;
    const r = await cli(["wallet", "hd", "import-watch-only", "--name", "watch", "--xpub", w.accounts[0].xpub, "--json"], ws);
    expect(r.exit, brief(r)).toBe(0);
    const a = await cli(["wallet", "hd", "address", "watch", "--index", "0", "--json"], ws);
    expect(ok(a)).toMatchObject({ address: w.firstReceiveAddress, verified: false });
    const s = await cli(["wallet", "hd", "send", "watch", "--to", w.firstReceiveAddress, "--amount", "1", "--json"], ws);
    expect(failCode(s), brief(s)).toBe("HD_WALLET_WATCH_ONLY");
  });
});

describe("WALLET-HD-1 · CLI · mainnet refused first, nothing written, nothing contacted", () => {
  it.each(["mainnet", "kaspa", "mainnet-1", "prod"])("create / import / import-watch-only --network %s", async (network) => {
    const ws = workspace("m");
    const c = await cli(["wallet", "hd", "create", "--name", "m", "--network", network, "--password-env", "HK_UNSET", "--json"], ws);
    expect(failCode(c), brief(c)).toBe("MAINNET_SIGNING_DISABLED");
    const i = await cli(["wallet", "hd", "import", "--name", "m", "--network", network, "--mnemonic-env", "HK_UNSET", "--password-env", "HK_UNSET", "--json"], ws);
    expect(failCode(i), brief(i)).toBe("MAINNET_SIGNING_DISABLED");
    const wo = await cli(["wallet", "hd", "import-watch-only", "--name", "m", "--network", network, "--xpub", "kpubx", "--json"], ws);
    expect(failCode(wo), brief(wo)).toBe("MAINNET_CONNECTION_DISABLED");
    expect(walletFiles(ws)).toEqual([]);
    for (const r of [c, i, wo]) {
      expect(attemptsIn(r.log, decoy.port).toPort).toBe(0);
      expect(attemptsIn(r.log).refused).toEqual([]);
    }
    expect(decoy.connections).toBe(0);
  });

  it.each(["mainnet", "prod"])("balance / send of a simnet wallet with --network %s: refused before the password is read", async (network) => {
    const ws = workspace("ms");
    const c = await cli(["wallet", "hd", "create", "--name", "sim", "--password-env", "HK_HD_PW", "--json"], ws);
    expect(c.exit, brief(c)).toBe(0);
    const b = await cli(["wallet", "hd", "balance", "sim", "--network", network, "--password-env", "HK_UNSET", "--json"], ws);
    expect(failCode(b), brief(b)).toBe("MAINNET_CONNECTION_DISABLED");
    const s = await cli(["wallet", "hd", "send", "sim", "--network", network, "--to", ok(c).firstReceiveAddress, "--amount", "1", "--password-env", "HK_UNSET", "--json"], ws);
    expect(failCode(s), brief(s)).toBe("MAINNET_BROADCAST_DISABLED");
    for (const r of [b, s]) {
      expect(attemptsIn(r.log, decoy.port).toPort).toBe(0);
      expect(attemptsIn(r.log).refused).toEqual([]);
    }
    expect(decoy.connections).toBe(0);
    expect(decoy.methods).toEqual([]);
  });
});

describe("WALLET-HD-1 · CLI · help", () => {
  it("wallet hd lists its commands and says mainnet is refused", async () => {
    const ws = workspace("h");
    const r = await cli(["wallet", "hd", "--help"], ws);
    expect(r.exit, brief(r)).toBe(0);
    for (const sub of ["create", "import", "import-watch-only", "list", "address", "balance", "send", "reveal", "change-password"]) {
      expect(r.stdout, sub).toMatch(new RegExp(`\\n\\s+${sub}\\b`));
    }
    expect(r.stdout).toMatch(/Mainnet is refused/);
  });
});
