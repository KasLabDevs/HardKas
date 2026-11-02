import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";
import { installL2Extension, removeProject, cliIn } from "./helpers/installed-l2.js";
import { foundryReferenceFor, isMusl } from "../src/toolchains/foundry.js";
import { readProcessIdentity, normalizeExecutable } from "../../node-orchestrator/src/process-identity.js";
import { childEnv, cliDist, repoRoot } from "../../cli/test/first-contact-helpers.js";

// L2-EXT stage 4 · `hardkas l2 node` with the REAL Anvil (Foundry v1.8.6, installed offline from the pinned asset into
// a private HARDKAS_HOME). vitest.foundry.config.ts only. Every CLI run carries the hermetic preload.

const ASSETS = process.env.HARDKAS_FOUNDRY_ASSETS;
if (!ASSETS) throw new Error("HARDKAS_FOUNDRY_ASSETS is not set");
const ref = foundryReferenceFor(process.platform, process.arch, isMusl());
if (!ref) throw new Error(`no Foundry pin for ${process.platform}-${process.arch}`);
const ASSET = path.join(ASSETS, `${process.platform}-${process.arch}`, ref.assetName);
const PRELOAD = path.join(repoRoot, "scripts", "hermetic", "no-network-preload.cjs").split(path.sep).join("/");
const RECORDER = pathToFileURL(path.join(repoRoot, "packages", "cli", "test", "fixtures", "module-recorder.mjs")).href;

let parent: string;
let ws: string;
let home: string;
let anvilBin: string;
let links: string[] = [];
const external: ChildProcess[] = [];

const env = (name: string) => ({ HARDKAS_HOME: home, HARDKAS_HERMETIC_LOG: path.join(parent, `${name}.net.log`), NODE_OPTIONS: `--require="${PRELOAD}" --import=${RECORDER}` });
const run = (args: string[], name: string) => {
  const r = cliIn(ws, args, name, env(name));
  const net = path.join(parent, `${name}.net.log`);
  const refused = fs.existsSync(net) ? fs.readFileSync(net, "utf8").split(/\r?\n/).filter((l) => /REFUSED/.test(l)) : [];
  const envelope = (() => {
    for (const chunk of r.stdout.split(/\r?\n(?=\{)/)) {
      try {
        const d = JSON.parse(chunk);
        if (d?.ok === false) return d;
      } catch {
        /* not JSON */
      }
    }
    return undefined;
  })();
  return { ...r, refused, envelope };
};
const cliAsync = (args: string[], name: string) =>
  new Promise<{ status: number | null; stdout: string }>((resolve) => {
    const c = spawn(process.execPath, [cliDist, ...args], {
      cwd: ws,
      env: childEnv({ ...env(name), HARDKAS_MODULE_LOG: path.join(parent, `${name}.modules.log`) }),
      windowsHide: true
    });
    let stdout = "";
    c.stdout!.on("data", (d) => (stdout += d));
    c.stderr!.on("data", (d) => (stdout += d));
    c.on("exit", (status) => resolve({ status, stdout }));
  });
const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e?.code === "EPERM";
  }
};
const chainId = async (port: number) => {
  try {
    const r = await fetch(`http://127.0.0.1:${port}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), signal: AbortSignal.timeout(2000) });
    return Number.parseInt(((await r.json()) as any).result, 16);
  } catch {
    return undefined;
  }
};
/** An Anvil HardKAS did NOT start (same verified binary, launched directly). */
async function externalAnvil(port: number, chain = 31337): Promise<ChildProcess> {
  const c = spawn(anvilBin, ["--host", "127.0.0.1", "--port", String(port), "--chain-id", String(chain)], { stdio: "ignore", windowsHide: true });
  external.push(c);
  for (let i = 0; i < 100 && (await chainId(port)) !== chain; i++) await new Promise((r) => setTimeout(r, 100));
  return c;
}
const nodeCheck = (name: string) => run(["doctor", "l2", "--json"], name).json?.extensions?.[0]?.checks;
const recordFile = () => path.join(ws, ".hardkas", "processes", "l2-anvil", "process.json");

beforeAll(() => {
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-anvil-node-"));
  ws = path.join(parent, "project");
  home = path.join(parent, "home");
  fs.mkdirSync(ws);
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {};\n");
  links = installL2Extension(ws);
  const r = run(["toolchain", "install", "foundry", "--from-file", ASSET, "--json"], "install");
  if (r.json?.status !== "TOOLCHAIN_INSTALLED") throw new Error(`foundry install failed: ${r.stdout}${r.stderr}`);
  anvilBin = path.join(home, "toolchains", "foundry", ref.version, ref.entry);
}, 600_000);

afterAll(async () => {
  try {
    run(["l2", "node", "stop", "--json"], "final-stop");
  } catch {
    /* best effort */
  }
  for (const c of external) if (c.exitCode === null) c.kill();
  await new Promise((r) => setTimeout(r, 500));
  if (parent) {
    removeProject(ws, links);
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

describe("hardkas l2 node · the real Anvil", () => {
  it("start → status (running, answering 31337) → logs → doctor l2 → stop; only loopback; no network", { timeout: 300_000 }, async () => {
    const port = await freePort();
    const s = run(["l2", "node", "start", "--port", String(port), "--json"], "start");
    expect(s.json?.result, s.stdout + s.stderr).toMatchObject({ rpcUrl: `http://127.0.0.1:${port}`, chainId: 31337, port });
    const pid = s.json.result.pid as number;
    // the running process is the verified binary, as the OS reports it
    expect((await readProcessIdentity(pid))?.executable).toBe(normalizeExecutable(fs.realpathSync(anvilBin)));
    expect(run(["l2", "node", "status", "--json"], "status").json?.result).toMatchObject({ state: "running", pid, responding: true, chainId: 31337 });
    expect(run(["l2", "node", "logs", "--tail", "40"], "logs").stdout).toContain(`127.0.0.1:${port}`);
    const checks = nodeCheck("doctor-running");
    expect(checks.find((c: any) => c.id === "l2.foundry")).toMatchObject({ ok: true });
    expect(checks.find((c: any) => c.id === "l2.node")).toMatchObject({ ok: true });
    expect(run(["l2", "node", "start", "--port", String(port), "--json"], "start-again").envelope?.code).toBe("PROCESS_ALREADY_RUNNING");
    const stop = run(["l2", "node", "stop", "--json"], "stop");
    expect(stop.json?.result).toMatchObject({ result: "stopped", pid });
    expect(alive(pid)).toBe(false);
    expect(await chainId(port)).toBeUndefined();
    expect(run(["l2", "node", "status", "--json"], "status-after").json?.result?.state).toBe("not_running");
    expect([s, stop].flatMap((r) => r.refused)).toEqual([]);
  });

  it("two `l2 node start` at once (two CLI processes): exactly one Anvil; the other refuses", { timeout: 300_000 }, async () => {
    const port = await freePort();
    const [a, b] = await Promise.all([cliAsync(["l2", "node", "start", "--port", String(port), "--json"], "conc-a"), cliAsync(["l2", "node", "start", "--port", String(port), "--json"], "conc-b")]);
    const statuses = [a.status, b.status].sort();
    expect(statuses, a.stdout + b.stdout).toEqual([0, 1]);
    const loser = a.status === 0 ? b.stdout : a.stdout;
    expect(loser).toMatch(/PROCESS_ALREADY_RUNNING|PROCESS_PORT_IN_USE|PROCESS_LOCKED/);
    expect(await chainId(port)).toBe(31337);
    expect(run(["l2", "node", "stop", "--json"], "conc-stop").json?.result?.result).toBe("stopped");
  });

  it("a recorded PID that now belongs to an Anvil HardKAS did not start: stop leaves it running (foreign_process)", { timeout: 300_000 }, async () => {
    const port = await freePort();
    const ext = await externalAnvil(port);
    const real = (await readProcessIdentity(ext.pid!))!;
    fs.mkdirSync(path.dirname(recordFile()), { recursive: true });
    fs.writeFileSync(
      recordFile(),
      JSON.stringify({ schema: "hardkas.process.v1", id: "l2-anvil", pid: ext.pid, startedAt: "x", identity: { ...real, startTime: "2001-01-01T00:00:00.0000000Z" }, binaryPath: anvilBin, binarySha256: "x", args: [], logFile: "x", port })
    );
    expect(run(["l2", "node", "status", "--json"], "foreign-status").json?.result?.state).toBe("foreign_process");
    expect(run(["l2", "node", "stop", "--json"], "foreign-stop").json?.result?.result).toBe("foreign_process");
    expect(alive(ext.pid!)).toBe(true);
    expect(await chainId(port)).toBe(31337);
    ext.kill();
  });

  it("the port is taken by an Anvil HardKAS did not start: start refuses (PROCESS_PORT_IN_USE); doctor names it (and a wrong chain id)", { timeout: 300_000 }, async () => {
    const port = await freePort();
    const ext = await externalAnvil(port);
    expect(run(["l2", "node", "start", "--port", String(port), "--json"], "busy-start").envelope?.code).toBe("PROCESS_PORT_IN_USE");
    expect(alive(ext.pid!)).toBe(true);
    ext.kill();
    // doctor looks at the default port when HardKAS runs no node there
    if (await new Promise<boolean>((r) => { const s = net.createServer(); s.once("error", () => r(false)); s.listen(8545, "127.0.0.1", () => s.close(() => r(true))); })) {
      const same = await externalAnvil(8545, 31337);
      expect(nodeCheck("doctor-external").find((c: any) => c.id === "l2.node")?.detail).toContain("an EVM node HardKAS did not start (chain id 31337)");
      same.kill();
      await new Promise((r) => setTimeout(r, 500));
      const wrong = await externalAnvil(8545, 1);
      expect(nodeCheck("doctor-wrong-chain").find((c: any) => c.id === "l2.node")?.detail).toContain("with chain id 1 (expected 31337)");
      wrong.kill();
    }
  });

  it("Anvil killed outside HardKAS: stale_record; doctor says so; stop clears it", { timeout: 300_000 }, async () => {
    const port = await freePort();
    const s = run(["l2", "node", "start", "--port", String(port), "--json"], "stale-start");
    const pid = s.json.result.pid as number;
    process.kill(pid);
    for (let i = 0; i < 50 && alive(pid); i++) await new Promise((r) => setTimeout(r, 100));
    expect(run(["l2", "node", "status", "--json"], "stale-status").json?.result?.state).toBe("stale_record");
    expect(nodeCheck("doctor-stale").find((c: any) => c.id === "l2.node")?.detail).toContain("leftover record");
    expect(run(["l2", "node", "stop", "--json"], "stale-stop").json?.result?.result).toBe("stale_record");
    expect(fs.existsSync(recordFile())).toBe(false);
  });

  it("an altered anvil binary: start refuses (TOOLCHAIN_VERIFY_FAILED), doctor reports it; a forced reinstall repairs it", { timeout: 600_000 }, async () => {
    const bytes = fs.readFileSync(anvilBin);
    bytes[bytes.length - 100] ^= 0x01;
    fs.writeFileSync(anvilBin, bytes);
    const port = await freePort();
    expect(run(["l2", "node", "start", "--port", String(port), "--json"], "altered-start").envelope?.code).toBe("TOOLCHAIN_VERIFY_FAILED");
    expect(await chainId(port)).toBeUndefined();
    expect(nodeCheck("doctor-altered").find((c: any) => c.id === "l2.foundry")).toMatchObject({ ok: false, fix: "hardkas toolchain install foundry --force" });
    expect(run(["toolchain", "install", "foundry", "--from-file", ASSET, "--force", "--json"], "reinstall").json?.status).toBe("TOOLCHAIN_INSTALLED");
    expect(nodeCheck("doctor-repaired").find((c: any) => c.id === "l2.foundry")).toMatchObject({ ok: true });
  });
});
