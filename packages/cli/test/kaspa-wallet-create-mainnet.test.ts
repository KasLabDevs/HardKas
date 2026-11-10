import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";
import { createCommandOutput, setGlobalOutput } from "../src/output.js";

// -----------------------------------------------------------------------------
// Pre-release round · evasion route (a) of step 4 · MAINNET TOTAL LOCKDOWN: `kaspa wallet create --network mainnet
// --show-private-key` generated and printed a mainnet private key with its `privateKeyEnv` snippet, and its refusal
// without the flag pointed to `accounts real generate`, which no longer takes mainnet (P36). Kaspa's sighash does not
// commit to the network (G6), so a mainnet key could sign a manipulated plan. While mainnet is locked down the command
// refuses every spelling of mainnet (`mainnet`, `mainnet-<n>`, `kaspa`, `kaspa-mainnet`, any case) and every config
// entry that declares one (an alias such as `prod`) with the signing code MAINNET_SIGNING_DISABLED, with or without
// `--show-private-key`, JSON mode included, before the key generator runs: no key, no address, nothing written. No
// HARDKAS_* variable changes that. Controls: simnet and testnet-10 still make and print a key with the flag.
// Throwaway workspaces; no node, no network.
// -----------------------------------------------------------------------------

vi.setConfig({ testTimeout: 240_000, hookTimeout: 120_000 });

const { generate } = vi.hoisted(() => ({
  generate: vi.fn(async () => ({ address: "kaspasim:qtestaddress", publicKey: "02" + "ab".repeat(32), privateKey: "cd".repeat(32) }))
}));
vi.mock("@hardkas/accounts", async (orig) => ({ ...(await orig<any>()), createLocalKaspaWallet: generate }));

const SPELLINGS = ["mainnet", "mainnet-1", "kaspa", "kaspa-mainnet", "MAINNET", "Kaspa-Mainnet-1"];
const HEX64 = /[0-9a-f]{64}/i;
const ADDRESS = /kaspa(sim|test)?:q[0-9a-z]{20,}/;
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe("route (a) · the runner refuses mainnet before the key generator runs", () => {
  beforeEach(() => generate.mockClear());

  it("every spelling, with or without --show-private-key, human or JSON: MAINNET_SIGNING_DISABLED, the generator never called, nothing printed", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const { runKaspaWalletCreate } = await import("../src/runners/kaspa-wallet-runner.js");
    for (const mode of ["human", "json"] as const) {
      setGlobalOutput(createCommandOutput({ mode, stdout: { write: (m: string) => void stdout.push(m) }, stderr: { write: (m: string) => void stderr.push(m) } }));
      for (const network of SPELLINGS) {
        for (const showPrivateKey of [false, true]) {
          await expect(runKaspaWalletCreate("vault", { network, showPrivateKey, json: mode === "json" }), `${network} ${showPrivateKey}`).rejects.toMatchObject({
            code: "MAINNET_SIGNING_DISABLED"
          });
        }
      }
    }
    expect(generate).not.toHaveBeenCalled();
    expect(stdout.join("") + stderr.join("")).toBe("");
  });
});

const listTree = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (/[\\/]locks?([\\/]|$)|\.lock$/.test(p)) continue;
      out.push(path.relative(dir, p).split(path.sep).join("/"));
      if (e.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return out.sort();
};

describe("route (a) · the built CLI: kaspa wallet create makes no mainnet key while mainnet is locked down", () => {
  let ws = "";
  const run = (args: string[], env: Record<string, string> = {}) => {
    const r = spawnSync(process.execPath, [cliDist, ...args], { cwd: ws, encoding: "utf8", env: childEnv(env), input: "", timeout: 120_000 });
    return { status: r.status, stdout: r.stdout ?? "", all: stripAnsi(`${r.stdout ?? ""}\n${r.stderr ?? ""}`) };
  };
  const brief = (r: { status: number | null; all: string }) => JSON.stringify({ status: r.status, out: r.all.slice(-900) });
  const snapshot = () => ({
    ws: listTree(ws),
    home: process.env.HARDKAS_HOME && fs.existsSync(process.env.HARDKAS_HOME) ? listTree(process.env.HARDKAS_HOME) : []
  });
  // the typed code is in the JSON envelope; the human output carries the policy's own text (as `accounts real generate`)
  const expectRefused = (r: ReturnType<typeof run>, before: ReturnType<typeof snapshot>) => {
    expect(r.status, brief(r)).not.toBe(0);
    if (/^\s*\{/.test(r.stdout)) expect(JSON.parse(r.stdout.trim()), brief(r)).toMatchObject({ ok: false, code: "MAINNET_SIGNING_DISABLED" });
    else expect(r.all, brief(r)).toMatch(/Mainnet signing is disabled in HardKAS \(kaspa wallet create: no mainnet key is made while mainnet is locked down\)/);
    expect(r.all, "no private key printed").not.toMatch(HEX64);
    expect(r.all, "no address printed: nothing was generated").not.toMatch(ADDRESS);
    expect(r.all, "no config snippet").not.toMatch(/privateKeyEnv|_PRIVATE_KEY=/);
    expect(snapshot(), "nothing written in the workspace or HARDKAS_HOME").toEqual(before);
  };

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-wcm-"));
    fs.writeFileSync(
      path.join(ws, "hardkas.config.ts"),
      `export default ${JSON.stringify({ networks: { prod: { kind: "kaspa-rpc", network: "kaspa-mainnet", rpcUrl: "ws://127.0.0.1:9" } } }, null, 2)};\n`
    );
  });
  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("every spelling of mainnet, with --show-private-key and without it, human and --json: refused, nothing generated or written", () => {
    const before = snapshot();
    for (const net of SPELLINGS) {
      for (const extra of [["--show-private-key"], [], ["--show-private-key", "--json"]]) {
        expectRefused(run(["kaspa", "wallet", "create", "vault", "--network", net, ...extra]), before);
      }
    }
  });

  it("--json: one envelope { ok: false, code: MAINNET_SIGNING_DISABLED }, with or without --show-private-key", () => {
    const before = snapshot();
    for (const extra of [["--show-private-key"], []]) {
      const r = run(["kaspa", "wallet", "create", "vault", "--network", "kaspa-mainnet", ...extra, "--json"]);
      expectRefused(r, before);
      expect(r.status, brief(r)).toBe(1);
      const doc = JSON.parse(r.stdout.trim());
      expect(doc, brief(r)).toMatchObject({ ok: false, code: "MAINNET_SIGNING_DISABLED" });
    }
  });

  it("a config entry that declares mainnet (an alias such as `prod`) is refused the same way", () => {
    const before = snapshot();
    expectRefused(run(["kaspa", "wallet", "create", "vault", "--network", "prod", "--show-private-key"]), before);
    expectRefused(run(["kaspa", "wallet", "create", "vault", "--network", "prod", "--show-private-key", "--json"]), before);
  });

  it("no HARDKAS_* variable lifts it", () => {
    const before = snapshot();
    const lax = { HARDKAS_NETWORK: "testnet-10", HARDKAS_EXPERIMENTAL: "1", HARDKAS_ALLOW_UNVERIFIED_NODE: "1", HARDKAS_DEV_SERVER_AUTOSIGN: "1" };
    expectRefused(run(["kaspa", "wallet", "create", "vault", "--network", "mainnet", "--show-private-key"], lax), before);
    expectRefused(run(["kaspa", "wallet", "create", "vault", "--network", "mainnet", "--show-private-key", "--json"], lax), before);
  });

  it("control: simnet (the default) and testnet-10 still make and print a key with --show-private-key, and write nothing", () => {
    const before = snapshot();
    for (const [args, prefix] of [
      [[], /^kaspasim:q/],
      [["--network", "testnet-10"], /^kaspatest:q/]
    ] as Array<[string[], RegExp]>) {
      const r = run(["kaspa", "wallet", "create", "vault", ...args, "--show-private-key"]);
      expect(r.status, brief(r)).toBe(0);
      expect(/Address:\s+(\S+)/.exec(r.all)?.[1], brief(r)).toMatch(prefix);
      expect(r.all.match(/[0-9a-f]{64}/gi) ?? [], "the key is printed exactly once").toHaveLength(1);
    }
    expect(snapshot()).toEqual(before);
  });
});
