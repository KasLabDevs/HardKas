import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.setConfig({ testTimeout: 30_000 });

// BETA-FIX · `hardkas localnet reset` (it was only the hidden `node reset`). Docker is a double: the canonical node and
// its miner, a node's /app/data mount, `docker stop`. Invariants: a running node whose chain is another workspace's (or
// whose data folder Docker does not name) is refused before anything is stopped or removed; otherwise node and miner are
// stopped and verified down, then ONLY this workspace's .hardkas/kaspad is removed; --json needs --yes; a Docker that
// cannot answer or a stop that fails removes nothing.

const h = vi.hoisted(() => ({
  ws: "",
  nodeState: "running" as "running" | "exited" | "absent",
  minerState: "exited" as "running" | "exited" | "absent",
  mountSource: undefined as string | undefined,
  dockerDown: false,
  stopFails: false,
  calls: [] as string[][]
}));

vi.mock("execa", () => ({
  execa: vi.fn(async (_cmd: string, args: string[]) => {
    h.calls.push([...args]);
    if (h.dockerDown) throw Object.assign(new Error("Cannot connect to the Docker daemon at tcp://127.0.0.1:1"), { exitCode: 1 });
    const name = args[args.length - 1];
    const stateOf = (n: string) => (n === "hardkas-kaspad-toccata-v2" ? h.nodeState : h.minerState);
    const noSuch = () => Object.assign(new Error(`Error: No such object: ${name}`), { exitCode: 1, stderr: `Error: No such object: ${name}` });
    if (args[0] === "stop") {
      if (h.stopFails) throw Object.assign(new Error(`Error response from daemon: cannot stop container: ${name}: permission denied`), { exitCode: 1 });
      if (name === "hardkas-kaspad-toccata-v2" && h.nodeState === "running") h.nodeState = "exited";
      if (name === "hardkas-toccata-miner" && h.minerState === "running") h.minerState = "exited";
      return { stdout: name };
    }
    if (args[0] === "container" && args[1] === "inspect" && args.includes("{{json .Mounts}}")) {
      if (stateOf(name) === "absent") throw noSuch();
      return { stdout: JSON.stringify(h.mountSource === undefined ? [] : [{ Type: "bind", Source: h.mountSource, Destination: "/app/data" }]) };
    }
    if (args[0] === "inspect") {
      if (stateOf(name) === "absent") throw noSuch();
      return { stdout: stateOf(name) };
    }
    return { stdout: "" };
  })
}));

vi.mock("@hardkas/config", async (importOriginal) => {
  const real: any = await importOriginal();
  return { ...real, loadHardkasConfig: vi.fn(async () => ({ path: path.join(h.ws, "hardkas.config.ts"), cwd: h.ws, config: {} })) };
});

import { registerLocalnetCommands } from "../src/commands/localnet.js";
import { setGlobalOutput } from "../src/output.js";
import { sameLocalnetDataPath } from "../src/runners/localnet-reset-runner.js";

let printed: string[];
const dataDir = () => path.join(h.ws, ".hardkas", "kaspad");

beforeEach(() => {
  h.ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-localnet-reset-"));
  fs.writeFileSync(path.join(h.ws, "hardkas.config.ts"), "export default {};\n");
  fs.mkdirSync(path.join(dataDir(), "datadir2"), { recursive: true });
  fs.writeFileSync(path.join(dataDir(), "datadir2", "chain.db"), "old chain");
  h.nodeState = "running";
  h.minerState = "exited";
  h.mountSource = dataDir();
  h.dockerDown = false;
  h.stopFails = false;
  h.calls = [];
  printed = [];
  setGlobalOutput({ writeLine: (s: string) => printed.push(s), writeJson: (o: unknown) => printed.push(JSON.stringify(o)) } as any);
});

afterEach(() => {
  fs.rmSync(h.ws, { recursive: true, force: true });
});

async function reset(flags: string[]) {
  const program = new Command();
  program.exitOverride();
  registerLocalnetCommands(program);
  return program.parseAsync(["localnet", "reset", ...flags], { from: "user" }).then(
    () => ({ ok: true as const }),
    (error: any) => ({ ok: false as const, error })
  );
}
const lastJson = (): any => {
  for (const s of [...printed].reverse()) {
    try {
      const j = JSON.parse(s);
      if (j?.schema) return j;
    } catch {}
  }
  return undefined;
};
const stopped = (name: string) => h.calls.some((a) => a[0] === "stop" && a.includes(name));

describe("BETA-FIX · hardkas localnet reset", () => {
  it("this workspace's running localnet: node stopped and verified, its chain data removed, the record says so", async () => {
    const out = await reset(["--yes", "--json"]);
    expect(out.ok, out.ok ? "" : String(out.error?.message)).toBe(true);
    expect(h.nodeState).toBe("exited");
    expect(fs.existsSync(dataDir())).toBe(false);
    expect(fs.existsSync(path.join(h.ws, "hardkas.config.ts"))).toBe(true);
    const r = lastJson();
    expect(r).toMatchObject({ schema: "hardkas.localnetReset.v1", ok: true, status: "LOCALNET_RESET", dataRemoved: true, node: { container: "hardkas-kaspad-toccata-v2", wasRunning: true, state: "exited" } });
    expect(r.dataDir).toBe(dataDir());
  });

  it("a running node whose chain is another workspace's: refused before anything is stopped or removed", async () => {
    h.mountSource = path.join(os.tmpdir(), "some-other-workspace", ".hardkas", "kaspad");
    const out = await reset(["--yes", "--json"]);
    expect(out.ok ? "" : out.error.code).toBe("LOCALNET_RESET_OTHER_WORKSPACE");
    expect(stopped("hardkas-kaspad-toccata-v2")).toBe(false);
    expect(h.nodeState).toBe("running");
    expect(fs.existsSync(path.join(dataDir(), "datadir2", "chain.db"))).toBe(true);
  });

  it("a running node whose data folder Docker does not name: refused, nothing stopped or removed", async () => {
    h.mountSource = undefined;
    const out = await reset(["--yes", "--json"]);
    expect(out.ok ? "" : out.error.code).toBe("LOCALNET_RESET_DATA_UNVERIFIED");
    expect(stopped("hardkas-kaspad-toccata-v2")).toBe(false);
    expect(fs.existsSync(dataDir())).toBe(true);
  });

  it("no node container: the leftover chain data is removed, nothing is stopped", async () => {
    h.nodeState = "absent";
    h.minerState = "absent";
    const out = await reset(["--yes", "--json"]);
    expect(out.ok).toBe(true);
    expect(fs.existsSync(dataDir())).toBe(false);
    expect(h.calls.some((a) => a[0] === "stop")).toBe(false);
    expect(lastJson()).toMatchObject({ dataRemoved: true, node: { wasRunning: false, state: "absent" } });
  });

  it("a stopped node of another workspace: only this workspace's data is removed, that node is left alone", async () => {
    h.nodeState = "exited";
    h.mountSource = path.join(os.tmpdir(), "some-other-workspace", ".hardkas", "kaspad");
    const out = await reset(["--yes", "--json"]);
    expect(out.ok).toBe(true);
    expect(fs.existsSync(dataDir())).toBe(false);
    expect(stopped("hardkas-kaspad-toccata-v2")).toBe(false);
  });

  it("nothing to remove: ok, dataRemoved false", async () => {
    fs.rmSync(dataDir(), { recursive: true, force: true });
    const out = await reset(["--yes", "--json"]);
    expect(out.ok).toBe(true);
    expect(lastJson()).toMatchObject({ dataRemoved: false });
  });

  it("--json without --yes: a usage error, Docker never asked, nothing removed", async () => {
    const out = await reset(["--json"]);
    expect(out.ok ? "" : out.error.code).toBe("INTERACTIVE_PROMPT_IN_JSON_MODE");
    expect(h.calls).toEqual([]);
    expect(fs.existsSync(dataDir())).toBe(true);
  });

  it("Docker unreachable: LOCALNET_DOCKER_UNAVAILABLE, the chain data stays", async () => {
    h.dockerDown = true;
    const out = await reset(["--yes", "--json"]);
    expect(out.ok ? "" : out.error.code).toBe("LOCALNET_DOCKER_UNAVAILABLE");
    expect(fs.existsSync(path.join(dataDir(), "datadir2", "chain.db"))).toBe(true);
  });

  it("`docker stop` failing: LOCALNET_STOP_FAILED, the chain data stays", async () => {
    h.stopFails = true;
    const out = await reset(["--yes", "--json"]);
    expect(out.ok ? "" : out.error.code).toBe("LOCALNET_STOP_FAILED");
    expect(fs.existsSync(path.join(dataDir(), "datadir2", "chain.db"))).toBe(true);
  });

  it("a miner still up is stopped and verified too", async () => {
    h.minerState = "running";
    const out = await reset(["--yes", "--json"]);
    expect(out.ok).toBe(true);
    expect(h.minerState).toBe("exited");
    expect(stopped("hardkas-toccata-miner")).toBe(true);
    expect(lastJson()).toMatchObject({ miner: { container: "hardkas-toccata-miner", wasRunning: true, state: "exited" } });
  });

  it("sameLocalnetDataPath: Docker Desktop's spellings of a Windows folder are the same folder; POSIX paths compare exactly", () => {
    expect(sameLocalnetDataPath("C:\\Users\\dev\\app\\.hardkas\\kaspad", "/run/desktop/mnt/host/c/Users/dev/app/.hardkas/kaspad", "win32")).toBe(true);
    expect(sameLocalnetDataPath("C:\\Users\\dev\\app\\.hardkas\\kaspad", "/host_mnt/c/Users/dev/app/.hardkas/kaspad/", "win32")).toBe(true);
    expect(sameLocalnetDataPath("C:\\Users\\dev\\app\\.hardkas\\kaspad", "c:/users/dev/app/.hardkas/kaspad", "win32")).toBe(true);
    expect(sameLocalnetDataPath("C:\\Users\\dev\\app\\.hardkas\\kaspad", "/run/desktop/mnt/host/c/Users/dev/other/.hardkas/kaspad", "win32")).toBe(false);
    expect(sameLocalnetDataPath("/home/dev/app/.hardkas/kaspad", "/home/dev/app/.hardkas/kaspad/", "linux")).toBe(true);
    expect(sameLocalnetDataPath("/home/dev/app/.hardkas/kaspad", "/home/dev/App/.hardkas/kaspad", "linux")).toBe(false);
    expect(sameLocalnetDataPath("/mnt/d/app/.hardkas/kaspad", "d:/app/.hardkas/kaspad", "linux")).toBe(false);
  });
});
