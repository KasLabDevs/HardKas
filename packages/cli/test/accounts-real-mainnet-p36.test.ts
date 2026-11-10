import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";
import { loadKaspaWasm } from "@hardkas/accounts";

// -----------------------------------------------------------------------------
// ESCALÓN 4 · P36 · MAINNET TOTAL LOCKDOWN: `accounts real generate` and `accounts real import` made and stored mainnet
// keys (`--network mainnet`, `--network MAINNET` or `kaspa`, which the key generator lowercases into a mainnet address, a
// mainnet `kaspa:` address on import). Kaspa's sighash does not commit to the network (G6), so a mainnet key in the
// store could sign a manipulated plan. While mainnet is locked down both refuse every spelling of mainnet, every config
// entry that declares it (an alias such as `prod`) and, on import, a mainnet address, with the signing code
// MAINNET_SIGNING_DISABLED, before any key or password is read and before anything is written. No HARDKAS_* variable
// changes that. Existing accounts are untouched. Throwaway workspaces and keys; no node, no network.
// -----------------------------------------------------------------------------

vi.setConfig({ testTimeout: 240_000, hookTimeout: 120_000 });

const PW = "p36-throwaway-password";
const SPELLINGS = ["mainnet", "mainnet-1", "kaspa", "kaspa-mainnet", "MAINNET"];

const run = (args: string[], cwd: string, env: Record<string, string> = {}) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, encoding: "utf8", env: childEnv({ HK_P36_PW: PW, ...env }), timeout: 120_000, input: "" });
  const stdout = r.stdout ?? "";
  // the one JSON document on stdout: an object (an envelope) or, for a generate that succeeded, an array
  const starts = [stdout.indexOf("{"), stdout.indexOf("[")].filter((i) => i >= 0);
  const end = Math.max(stdout.lastIndexOf("}"), stdout.lastIndexOf("]"));
  let json: any;
  try {
    json = starts.length > 0 ? JSON.parse(stdout.slice(Math.min(...starts), end + 1)) : undefined;
  } catch {
    json = undefined;
  }
  return { status: r.status, stdout, all: `${stdout}\n${r.stderr ?? ""}`, json };
};
const brief = (r: { status: number | null; all: string }) => JSON.stringify({ status: r.status, out: r.all.slice(-900) });

/** Every file under a directory (relative paths with their bytes), to prove nothing was written or changed. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (!/\.lock$|[\\/]locks[\\/]/.test(p)) out[path.relative(dir, p)] = fs.readFileSync(p, "hex");
    }
  };
  walk(dir);
  return out;
}

function expectRefused(r: ReturnType<typeof run>, ws: string, before: Record<string, string>) {
  expect(r.json?.code, brief(r)).toBe("MAINNET_SIGNING_DISABLED");
  expect(r.json?.ok, brief(r)).toBe(false);
  expect(r.status, brief(r)).not.toBe(0);
  expect(r.all, "no mainnet address printed").not.toMatch(/kaspa:q[0-9a-z]{20,}/);
  expect(snapshot(ws), "nothing written or changed in the workspace").toEqual(before);
}

let ws = "";
beforeEach(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-p36-"));
  fs.writeFileSync(
    path.join(ws, "hardkas.config.ts"),
    `export default ${JSON.stringify({ networks: { prod: { kind: "kaspa-rpc", network: "kaspa-mainnet", rpcUrl: "ws://127.0.0.1:9" } } }, null, 2)};\n`
  );
});
afterEach(() => {
  fs.rmSync(ws, { recursive: true, force: true });
});

describe("P36 · accounts real generate makes no mainnet key while mainnet is locked down", () => {
  it("every spelling of mainnet, encrypted or plaintext: MAINNET_SIGNING_DISABLED, nothing written", () => {
    const before = snapshot(ws);
    for (const net of SPELLINGS) {
      expectRefused(run(["accounts", "real", "generate", "--name", "m", "--network", net, "--password-env", "HK_P36_PW", "--json"], ws), ws, before);
      expectRefused(run(["accounts", "real", "generate", "--name", "m", "--network", net, "--unsafe-plaintext", "--yes", "--json"], ws), ws, before);
    }
  });

  it("a config entry that declares mainnet (an alias such as `prod`) is refused the same way", () => {
    const before = snapshot(ws);
    expectRefused(run(["accounts", "real", "generate", "--name", "m", "--network", "prod", "--password-env", "HK_P36_PW", "--json"], ws), ws, before);
  });

  it("no HARDKAS_* variable lifts it, and none moves the default network to mainnet", () => {
    const before = snapshot(ws);
    const lax = { HARDKAS_NETWORK: "testnet-10", HARDKAS_EXPERIMENTAL: "1", HARDKAS_ALLOW_UNVERIFIED_NODE: "1", HARDKAS_DEV_SERVER_AUTOSIGN: "1" };
    expectRefused(run(["accounts", "real", "generate", "--name", "m", "--network", "kaspa", "--password-env", "HK_P36_PW", "--json"], ws, lax), ws, before);
    const def = run(["accounts", "real", "generate", "--name", "d", "--password-env", "HK_P36_PW", "--json"], ws, { HARDKAS_NETWORK: "mainnet" });
    expect(def.status, brief(def)).toBe(0);
    expect(def.json?.[0]?.address, brief(def)).toMatch(/^kaspasim:/);
  });

  it("existing accounts and keystores are untouched by a refused generate", () => {
    const g = run(["accounts", "real", "generate", "--name", "keep", "--network", "simnet", "--password-env", "HK_P36_PW", "--json"], ws);
    expect(g.status, brief(g)).toBe(0);
    const before = snapshot(ws);
    expect(Object.keys(before).some((p) => p.endsWith(path.join("keystore", "keep.json")))).toBe(true);
    expectRefused(run(["accounts", "real", "generate", "--name", "other", "--network", "mainnet", "--password-env", "HK_P36_PW", "--json"], ws), ws, before);
  });

  it("control: simnet and testnet-10 still generate encrypted accounts", () => {
    const s = run(["accounts", "real", "generate", "--name", "s", "--network", "simnet", "--password-env", "HK_P36_PW", "--json"], ws);
    expect(s.status, brief(s)).toBe(0);
    expect(s.json?.[0]).toMatchObject({ name: "s", network: "simnet", storage: "encrypted-keystore" });
    const t = run(["accounts", "real", "generate", "--name", "t", "--network", "testnet-10", "--password-env", "HK_P36_PW", "--json"], ws);
    expect(t.status, brief(t)).toBe(0);
    expect(t.json?.[0]).toMatchObject({ name: "t", network: "testnet-10", storage: "encrypted-keystore" });
    expect(t.json?.[0]?.address).toMatch(/^kaspatest:/);
  });
});

describe("P36 · accounts real import takes no mainnet key while mainnet is locked down", () => {
  let k: any;
  let mainKey = "";
  let mainAddress = "";
  let simAddress = "";
  let testAddress = "";
  beforeEach(async () => {
    k = k ?? (await loadKaspaWasm());
    mainKey = crypto.randomBytes(32).toString("hex");
    const kp = new k.PrivateKey(mainKey).toKeypair();
    mainAddress = kp.toAddress("mainnet").toString();
    simAddress = kp.toAddress("simnet").toString();
    testAddress = kp.toAddress("testnet-10").toString();
  });
  const imp = (name: string, address: string, extra: string[] = [], env: Record<string, string> = {}) =>
    run(["accounts", "real", "import", "--name", name, "--address", address, "--private-key-env", "HK_P36_KEY", "--password-env", "HK_P36_PW", ...extra, "--json"], ws, { HK_P36_KEY: mainKey, ...env });

  it("a mainnet address (no --network: it names mainnet by itself), encrypted or plaintext: refused, the key written nowhere", () => {
    const before = snapshot(ws);
    for (const extra of [[], ["--unsafe-plaintext", "--yes"]]) {
      const r = imp("m", mainAddress, extra);
      expectRefused(r, ws, before);
      expect(r.all).not.toContain(mainKey);
    }
    // an upper-case spelling of the same address
    expectRefused(imp("m", mainAddress.toUpperCase()), ws, before);
  });

  it("every --network spelling of mainnet, a config alias declaring it, or another network given for a mainnet address", () => {
    const before = snapshot(ws);
    for (const net of SPELLINGS) expectRefused(imp("m", simAddress, ["--network", net]), ws, before);
    expectRefused(imp("m", simAddress, ["--network", "prod"]), ws, before);
    expectRefused(imp("m", mainAddress, ["--network", "testnet-10"]), ws, before);
    expectRefused(run(["accounts", "real", "import", "--fixture", "alice", "--network", "kaspa", "--json"], ws), ws, before);
  });

  it("no HARDKAS_* variable lifts it", () => {
    const before = snapshot(ws);
    expectRefused(imp("m", mainAddress, [], { HARDKAS_NETWORK: "simnet", HARDKAS_EXPERIMENTAL: "1", HARDKAS_ALLOW_UNVERIFIED_NODE: "1" }), ws, before);
  });

  it("control: a simnet address and a testnet address with --network testnet-10 still import, encrypted", () => {
    const s = imp("sim", simAddress);
    expect(s.status, brief(s)).toBe(0);
    const t = imp("tn", testAddress, ["--network", "testnet-10"]);
    expect(t.status, brief(t)).toBe(0);
    const store = JSON.parse(fs.readFileSync(path.join(ws, ".hardkas", "accounts.real.json"), "utf8"));
    expect(store.accounts.map((a: any) => [a.name, a.network])).toEqual([["sim", "simnet"], ["tn", "testnet-10"]]);
    expect(JSON.stringify(store)).not.toContain(mainKey);
  });
});
