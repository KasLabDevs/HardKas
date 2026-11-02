import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { pathToFileURL } from "node:url";
import { installL2Extension, removeProject, cliIn } from "./helpers/installed-l2.js";
import { foundryReferenceFor, isMusl } from "../src/toolchains/foundry.js";
import { solcReferenceFor } from "../src/toolchains/solc.js";
import { repoRoot } from "../../cli/test/first-contact-helpers.js";

// L2-EXT stage 6 · deploy / call / send / test against the REAL local Anvil HardKAS starts, with the real pinned forge
// and solc (vitest.foundry.config.ts; HARDKAS_FOUNDRY_ASSETS and HARDKAS_SOLC_ASSETS). Offline: every CLI run carries
// the hermetic preload, and only loopback connections are allowed.

const FOUNDRY_ASSETS = process.env.HARDKAS_FOUNDRY_ASSETS;
const SOLC_ASSETS = process.env.HARDKAS_SOLC_ASSETS;
if (!FOUNDRY_ASSETS || !SOLC_ASSETS) throw new Error("HARDKAS_FOUNDRY_ASSETS and HARDKAS_SOLC_ASSETS must point to the verified release assets");
const key = `${process.platform}-${process.arch}`;
const foundry = foundryReferenceFor(process.platform, process.arch, isMusl())!;
const solc = solcReferenceFor(process.platform, process.arch, isMusl())!;
const PRELOAD = path.join(repoRoot, "scripts", "hermetic", "no-network-preload.cjs").split(path.sep).join("/");
const RECORDER = pathToFileURL(path.join(repoRoot, "packages", "cli", "test", "fixtures", "module-recorder.mjs")).href;

let parent: string;
let home: string;
let ws: string;
let project: string;
let links: string[] = [];
let projectLinks: string[] = [];
let port: number;

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

function hk(args: string[], name: string, cwd = project) {
  const netLog = path.join(parent, `${name}.net.log`);
  const r = cliIn(cwd, args, name, { HARDKAS_HOME: home, HARDKAS_HERMETIC_LOG: netLog, NODE_OPTIONS: `--require="${PRELOAD}" --import=${RECORDER}` });
  const refused = fs.existsSync(netLog) ? fs.readFileSync(netLog, "utf8").split(/\r?\n/).filter((l) => /REFUSED/.test(l)) : [];
  const envelope = r.stdout
    .split(/\r?\n(?=\{)/)
    .map((c) => {
      try {
        return JSON.parse(c);
      } catch {
        return undefined;
      }
    })
    .find((d) => d && typeof d.ok === "boolean");
  return { ...r, refused, envelope };
}
const ok = (r: ReturnType<typeof hk>) => {
  expect(r.envelope?.ok, r.stdout + r.stderr).toBe(true);
  expect(r.refused).toEqual([]);
  return r.envelope.result;
};
const fails = (r: ReturnType<typeof hk>, code: string) => {
  expect({ status: r.status === 0 ? 0 : "nonzero", code: r.envelope?.code }, r.stdout + r.stderr).toEqual({ status: "nonzero", code });
  expect(r.refused).toEqual([]);
  return r.envelope;
};
/** One JSON-RPC call (Anvil rejects a request without the JSON content type as "Invalid request"). */
const rpc = async (p: number, method: string, signal?: AbortSignal) => {
  const res = await fetch(`http://127.0.0.1:${p}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
    ...(signal ? { signal } : {})
  });
  return ((await res.json()) as any).result as string | undefined;
};
/** The node's block number; never NaN (a comparison of two NaN would prove nothing). */
const blockNumber = async (p = port) => {
  const n = Number.parseInt(String(await rpc(p, "eth_blockNumber")), 16);
  expect(Number.isInteger(n), `eth_blockNumber on ${p}`).toBe(true);
  return n;
};

beforeAll(async () => {
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-l2-dev-real-"));
  home = path.join(parent, "home");
  fs.mkdirSync(home);
  ws = path.join(parent, "ws");
  fs.mkdirSync(ws);
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {};\n");
  links = installL2Extension(ws);
  for (const [id, asset] of [
    ["foundry", path.join(FOUNDRY_ASSETS, key, foundry.assetName)],
    ["solc", path.join(SOLC_ASSETS, key, solc.assetName)]
  ] as const) {
    const r = hk(["toolchain", "install", id, "--from-file", asset, "--json"], `install-${id}`, ws);
    if (r.json?.status !== "TOOLCHAIN_INSTALLED") throw new Error(`${id} install failed: ${r.stdout}${r.stderr}`);
  }
  if (hk(["create", "l2-evm", "app", "--json"], "create", ws).json?.ok !== true) throw new Error("create failed");
  project = path.join(ws, "app");
  projectLinks = installL2Extension(project);
  port = await freePort();
}, 600_000);

afterAll(() => {
  if (!parent) return;
  try {
    hk(["l2", "node", "stop", "--json"], "final-stop");
  } catch {
    /* best effort */
  }
  for (const l of projectLinks) fs.rmSync(l, { force: true });
  removeProject(ws, links);
  fs.rmSync(parent, { recursive: true, force: true });
});

describe("hardkas l2 dev · the real local Anvil", () => {
  it("before the node runs: deploy refuses with L2_NODE_NOT_RUNNING naming `hardkas l2 node start`", { timeout: 300_000 }, () => {
    ok(hk(["l2", "compile", "--json"], "compile"));
    const e = fails(hk(["l2", "dev", "deploy", "Counter", "--json"], "deploy-no-node"), "L2_NODE_NOT_RUNNING");
    expect(e.message).toContain("hardkas l2 node start");
  });

  it("l2 test: the template's Solidity tests pass offline (including the revert test)", { timeout: 300_000 }, () => {
    const r = ok(hk(["l2", "test", "--json"], "test"));
    expect(r.summary).toMatch(/3 tests passed|3 passed/);
  });

  it("start → deploy (receipt, gas, event-less) → call → send (event decoded) → call", { timeout: 300_000 }, async () => {
    ok(hk(["l2", "node", "start", "--port", String(port), "--accounts", "3", "--json"], "node-start"));
    const d = ok(hk(["l2", "dev", "deploy", "Counter", "--json"], "deploy"));
    expect(d).toMatchObject({ contract: "src/Counter.sol:Counter", status: "success" });
    expect(d.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(Number(d.gasUsed)).toBeGreaterThan(21000);
    expect(ok(hk(["l2", "dev", "call", "Counter", "number", "--json"], "call-0")).result).toBe("0");
    const s = ok(hk(["l2", "dev", "send", "Counter", "increment", "--json"], "send-inc"));
    expect(s.events).toEqual([{ address: expect.stringMatching(new RegExp(d.address, "i")), event: "NumberChanged", args: { value: "1" } }]);
    expect(Number(s.gasUsed)).toBeGreaterThan(0);
    expect(ok(hk(["l2", "dev", "call", "Counter", "number", "--json"], "call-1")).result).toBe("1");
    ok(hk(["l2", "dev", "send", "Counter", "setNumber", "--args", "[42]", "--from", "1", "--json"], "send-set"));
    expect(ok(hk(["l2", "dev", "call", "Counter", "number", "--json"], "call-42")).result).toBe("42");
  });

  it("a revert caught by the estimate: L2_EXECUTION_REVERTED CounterUnderflow(), and no transaction was sent", { timeout: 300_000 }, async () => {
    ok(hk(["l2", "dev", "send", "Counter", "setNumber", "--args", "[0]", "--json"], "set-0"));
    const before = await blockNumber();
    const e = fails(hk(["l2", "dev", "send", "Counter", "decrement", "--json"], "dec-revert"), "L2_EXECUTION_REVERTED");
    expect(e.message).toContain("CounterUnderflow()");
    expect(await blockNumber()).toBe(before);
  });

  it("a revert mined (explicit --gas-limit skips the estimate): L2_TX_REVERTED, the block advanced, state unchanged", { timeout: 300_000 }, async () => {
    const before = await blockNumber();
    fails(hk(["l2", "dev", "send", "Counter", "decrement", "--gas-limit", "100000", "--json"], "dec-mined"), "L2_TX_REVERTED");
    expect(await blockNumber()).toBe(before + 1);
    expect(ok(hk(["l2", "dev", "call", "Counter", "number", "--json"], "call-after-revert")).result).toBe("0");
  });

  it("a sender that is not a node account: L2_ACCOUNT_NOT_LOCAL, nothing sent", { timeout: 300_000 }, async () => {
    const before = await blockNumber();
    fails(hk(["l2", "dev", "send", "Counter", "increment", "--from", "0x1111111111111111111111111111111111111111", "--json"], "foreign-from"), "L2_ACCOUNT_NOT_LOCAL");
    expect(await blockNumber()).toBe(before);
  });

  it("no way to aim it elsewhere: --url, --network and --chain-id are unknown options; RPC env variables are ignored", { timeout: 300_000 }, async () => {
    for (const extra of [["--url", "https://galleon-testnet.igralabs.com:8545"], ["--network", "igra-galleon"], ["--chain-id", "38836"]]) {
      const r = hk(["l2", "dev", "send", "Counter", "increment", ...extra, "--json"], `opt-${extra[0]!.slice(2)}`);
      expect(r.status).not.toBe(0);
      expect(r.stdout + r.stderr).toMatch(/unknown option/i);
    }
    const before = await blockNumber();
    const r = cliIn(project, ["l2", "dev", "send", "Counter", "increment", "--json"], "env-rpc", {
      HARDKAS_HOME: home,
      ETH_RPC_URL: "https://galleon-testnet.igralabs.com:8545",
      FOUNDRY_ETH_RPC_URL: "https://rpc.igralabs.com:8545",
      NODE_OPTIONS: `--require="${PRELOAD}"`
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(await blockNumber()).toBe(before + 1);
  });

  it("node stopped: L2_NODE_NOT_RUNNING; restarted: the old deployment is L2_DEPLOYMENT_STALE", { timeout: 300_000 }, () => {
    ok(hk(["l2", "node", "stop", "--json"], "stop"));
    fails(hk(["l2", "dev", "call", "Counter", "number", "--json"], "call-stopped"), "L2_NODE_NOT_RUNNING");
    ok(hk(["l2", "node", "start", "--port", String(port), "--json"], "restart"));
    fails(hk(["l2", "dev", "call", "Counter", "number", "--json"], "call-stale"), "L2_DEPLOYMENT_STALE");
    ok(hk(["l2", "dev", "deploy", "Counter", "--json"], "redeploy"));
    expect(ok(hk(["l2", "dev", "call", "Counter", "number", "--json"], "call-redeployed")).result).toBe("0");
    ok(hk(["l2", "node", "stop", "--json"], "stop-2"));
  });

  // F-03 (independent audit, E2E-ADV-01): the verified anvil started by someone else on 0.0.0.0, plus a record written
  // for it by hand. Neither the record's claims nor the matching identity make it "ours".
  it("F-03 · a forged record for an anvil HardKAS did not start (0.0.0.0): never used, never stopped", { timeout: 300_000 }, async () => {
    const { spawn } = await import("node:child_process");
    const { readProcessIdentity } = await import("@hardkas/node-orchestrator");
    const { anvilStateDir, ANVIL_PROCESS_ID } = await import("../src/node/anvil.js");
    const { getToolchainInstallDir } = await import("@hardkas/core");
    const bin = path.join(getToolchainInstallDir(foundry, home), foundry.entry);
    const p = await freePort();
    const realArgs = ["--host", "0.0.0.0", "--port", String(p), "--chain-id", "31337", "--accounts", "1"];
    const foreign = spawn(bin, realArgs, { stdio: "ignore", windowsHide: true });
    try {
      for (let i = 0; i < 100 && (await rpc(p, "eth_chainId").catch(() => undefined)) !== "0x7a69"; i++) await new Promise((r) => setTimeout(r, 200));
      const identity = await readProcessIdentity(foreign.pid!);
      expect(identity).toBeDefined();
      const dir = anvilStateDir(project);
      fs.mkdirSync(dir, { recursive: true });
      const write = (args: string[]) =>
        fs.writeFileSync(
          path.join(dir, "process.json"),
          JSON.stringify({ schema: "hardkas.process.v1", id: ANVIL_PROCESS_ID, pid: foreign.pid, startedAt: new Date().toISOString(), identity, binaryPath: bin, binarySha256: foundry.files[foundry.entry]!.sha256, args, logFile: path.join(dir, "x.log"), port: p })
        );
      // (a) the record claims 127.0.0.1: the real command line says otherwise → foreign
      write(["--host", "127.0.0.1", "--port", String(p), "--chain-id", "31337", "--accounts", "1"]);
      expect(ok(hk(["l2", "node", "status", "--json"], "forged-status")).state).toBe("foreign_process");
      fails(hk(["l2", "dev", "deploy", "Counter", "--json"], "forged-deploy"), "L2_NODE_NOT_RUNNING");
      expect(ok(hk(["l2", "node", "stop", "--json"], "forged-stop")).result).toBe("foreign_process");
      expect(foreign.exitCode).toBeNull();
      // (b) the record copies the real 0.0.0.0 arguments: identity and argv match, but it is not bound to 127.0.0.1
      write(realArgs);
      const e = fails(hk(["l2", "dev", "deploy", "Counter", "--json"], "copied-deploy"), "L2_NODE_NOT_VERIFIED");
      expect(e.message).toMatch(/--host 0\.0\.0\.0|0\.0\.0\.0/);
      expect(await blockNumber(p)).toBe(0);
      fails(hk(["l2", "node", "stop", "--json"], "copied-stop"), "L2_NODE_NOT_VERIFIED");
      expect(foreign.exitCode).toBeNull();
      expect(await rpc(p, "eth_chainId")).toBe("0x7a69");
    } finally {
      foreign.kill();
      fs.rmSync(path.join(anvilStateDir(project), "process.json"), { force: true });
    }
  });

  // R2 (R1-OBS-1): the verified anvil with HardKAS's arguments PLUS an extra flag, started by the manager (so its record
  // is its real argv): `l2 dev` refuses it before any write, and `l2 node stop` (same rule) stops nothing
  it("R1-OBS-1 · the verified anvil with an extra flag (--no-mining): l2 dev refuses before writing; l2 node stop stops nothing", { timeout: 300_000 }, async () => {
    const { startManagedProcess, stopManagedProcess } = await import("@hardkas/node-orchestrator");
    const { anvilStateDir, ANVIL_PROCESS_ID, anvilArgs } = await import("../src/node/anvil.js");
    const { getToolchainInstallDir } = await import("@hardkas/core");
    const bin = path.join(getToolchainInstallDir(foundry, home), foundry.entry);
    const p = await freePort();
    const spec = {
      id: ANVIL_PROCESS_ID,
      binaryPath: bin,
      args: [...anvilArgs(p, 1), "--no-mining"],
      stateDir: anvilStateDir(project),
      verifyBinary: () => ({ ok: true, sha256: foundry.files[foundry.entry]!.sha256, problems: [] }),
      port: p,
      readiness: async (signal: AbortSignal) => (await rpc(p, "eth_chainId", signal).catch(() => undefined)) === "0x7a69",
      readinessTimeoutMs: 60_000
    };
    const { record } = await startManagedProcess(spec);
    try {
      expect(ok(hk(["l2", "node", "status", "--json"], "extra-status")).state).toBe("running");
      const e = fails(hk(["l2", "dev", "deploy", "Counter", "--json"], "extra-deploy"), "L2_NODE_NOT_VERIFIED");
      expect(e.message).toContain("--no-mining");
      expect(await blockNumber(p)).toBe(0);
      fails(hk(["l2", "node", "stop", "--json"], "extra-stop"), "L2_NODE_NOT_VERIFIED");
      expect(await rpc(p, "eth_chainId")).toBe("0x7a69");
    } finally {
      await stopManagedProcess(spec);
    }
    let gone = false;
    for (let i = 0; i < 50 && !gone; i++) {
      try {
        process.kill(record.pid, 0);
        await new Promise((r) => setTimeout(r, 100));
      } catch {
        gone = true;
      }
    }
    expect(gone).toBe(true);
  });

  // F-02 (independent audit, E2E-ADV-06c): a project that enables FFI cannot make `l2 test` run commands
  it("F-02 · ffi = true: l2 test refuses (L2_FFI_NOT_ALLOWED) and vm.ffi never runs; env tricks do not bypass it; --allow-ffi is explicit", { timeout: 300_000 }, async () => {
    if (hk(["create", "l2-evm", "ffi-app", "--json"], "create-ffi", ws).json?.ok !== true) throw new Error("create ffi-app failed");
    const app = path.join(ws, "ffi-app");
    const appLinks = installL2Extension(app);
    const marker = path.join(parent, "ffi-marker.txt");
    const cmd = process.platform === "win32" ? ["cmd", "/c", `echo ran> ${marker}`] : ["sh", "-c", `echo ran > '${marker}'`];
    fs.writeFileSync(
      path.join(app, "test", "Ffi.t.sol"),
      `// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
interface Vm { function ffi(string[] calldata) external returns (bytes memory); }
contract FfiTest {
    Vm constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    function test_Ffi() public {
        string[] memory c = new string[](${cmd.length});
${cmd.map((s, i) => `        c[${i}] = ${JSON.stringify(s)};`).join("\n")}
        vm.ffi(c);
    }
}
`
    );
    const toml = path.join(app, "foundry.toml");
    const original = fs.readFileSync(toml, "utf8");
    try {
      // (1) ffi = true in the default profile
      fs.writeFileSync(toml, original + "ffi = true\n");
      const e = fails(hk(["l2", "test", "--json"], "ffi-refused", app), "L2_FFI_NOT_ALLOWED");
      expect(e.message).toContain("--allow-ffi");
      expect(fs.existsSync(marker)).toBe(false);
      // (2) ffi only in another profile, selected through the environment: forge test runs the default profile (the
      // environment's FOUNDRY_* are dropped), so FFI stays disabled: the test fails, nothing runs
      fs.writeFileSync(toml, original + "\n[profile.ci]\nffi = true\n");
      const r = cliIn(app, ["l2", "test", "--json"], "ffi-profile-env", { HARDKAS_HOME: home, FOUNDRY_PROFILE: "ci", FOUNDRY_FFI: "true", NODE_OPTIONS: `--require="${PRELOAD}"` });
      expect(r.status).not.toBe(0);
      expect(r.stdout + r.stderr).toMatch(/FFI is disabled|L2_TEST_FAILED/);
      expect(fs.existsSync(marker)).toBe(false);
      // (3) the explicit opt-in: then (and only then) forge runs it
      fs.writeFileSync(toml, original + "ffi = true\n");
      ok(hk(["l2", "test", "--allow-ffi", "--json"], "ffi-allowed", app));
      expect(fs.existsSync(marker)).toBe(true);
    } finally {
      fs.writeFileSync(toml, original);
      fs.rmSync(marker, { force: true });
      for (const l of appLinks) fs.rmSync(l, { force: true });
    }
  });

  // Since the F-03 remediation the real command line (--chain-id 38836) refuses it before any request is made, as
  // L2_NODE_NOT_VERIFIED; L2_WRONG_CHAIN (a node whose command line says 31337 but answers another chain id) is covered
  // by dev-local.test.ts.
  it("the verified anvil, started by HardKAS's manager but with another chain id: refused from its real command line, nothing sent", { timeout: 300_000 }, async () => {
    const { startManagedProcess, stopManagedProcess } = await import("@hardkas/node-orchestrator");
    const { anvilStateDir, ANVIL_PROCESS_ID } = await import("../src/node/anvil.js");
    const { getToolchainInstallDir } = await import("@hardkas/core");
    const bin = path.join(getToolchainInstallDir(foundry, home), foundry.entry);
    const otherPort = await freePort();
    const spec = {
      id: ANVIL_PROCESS_ID,
      binaryPath: bin,
      args: ["--host", "127.0.0.1", "--port", String(otherPort), "--chain-id", "38836", "--accounts", "1"],
      stateDir: anvilStateDir(project),
      verifyBinary: () => ({ ok: true, sha256: foundry.files[foundry.entry]!.sha256, problems: [] }),
      port: otherPort,
      readiness: async (signal: AbortSignal) => {
        try {
          return (await rpc(otherPort, "eth_chainId", signal)) === "0x97b4";
        } catch {
          return false;
        }
      },
      readinessTimeoutMs: 60_000
    };
    await startManagedProcess(spec);
    try {
      const e = fails(hk(["l2", "dev", "deploy", "Counter", "--json"], "deploy-wrong-chain"), "L2_NODE_NOT_VERIFIED");
      expect(e.message).toContain('"--chain-id","38836"');
      expect(await blockNumber(otherPort)).toBe(0);
    } finally {
      await stopManagedProcess(spec);
    }
  });
});
