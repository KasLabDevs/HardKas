import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

vi.setConfig({ testTimeout: 30_000 });

/*
 * HK-05 / SIM-10 (audit 6-nov-2026): with HARDKAS_SIMULATOR=1 the uncommitted branch made the localnet runners fake
 * Docker: `toccataContainerState` answered "running" without asking, so `localnet stop` ran a real `docker stop` of the
 * canonical node and then always failed its postcondition (LOCALNET_STOP_FAILED); `fund` POSTed `kaspasim_fund` to a
 * literal 127.0.0.1:18210 and swallowed every error; the miner was a fiction. The runners now ignore the variable.
 * Docker is a double (as in localnet-stop-profile.test.ts).
 */

const h = vi.hoisted(() => ({ nodeAbsent: false, nodeRunning: true, calls: [] as string[][] }));

vi.mock("execa", () => ({
  execa: vi.fn(async (_cmd: string, args: string[]) => {
    h.calls.push([...args]);
    const name = args[args.length - 1];
    if (args[0] === "stop" && name === "hardkas-kaspad-toccata-v2") h.nodeRunning = false;
    if (args[0] === "inspect") {
      if (name === "hardkas-kaspad-toccata-v2") {
        if (h.nodeAbsent) throw Object.assign(new Error(`Error: No such object: ${name}`), { exitCode: 1, stderr: `Error: No such object: ${name}` });
        return { stdout: h.nodeRunning ? "running" : "exited" };
      }
      return { stdout: "exited" };
    }
    return { stdout: "" };
  })
}));

import { registerLocalnetCommands } from "../src/commands/localnet.js";
import { setGlobalOutput } from "../src/output.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let printed: string[];

beforeEach(() => {
  h.nodeAbsent = false;
  h.nodeRunning = true;
  h.calls = [];
  printed = [];
  process.env.HARDKAS_SIMULATOR = "1";
  process.env.HARDKAS_ALLOW_SIMULATOR_NODE = "1";
  setGlobalOutput({ writeLine: (s: string) => printed.push(s), writeJson: (o: unknown) => printed.push(JSON.stringify(o)) } as any);
});
afterEach(() => {
  delete process.env.HARDKAS_SIMULATOR;
  delete process.env.HARDKAS_ALLOW_SIMULATOR_NODE;
});

async function stop() {
  const program = new Command();
  program.exitOverride();
  registerLocalnetCommands(program);
  return program.parseAsync(["localnet", "stop", "--json"], { from: "user" }).then(
    () => ({ ok: true as const }),
    (error: any) => ({ ok: false as const, error })
  );
}

describe("HK-05 · the localnet runners have no simulator mode", () => {
  it("no CLI source reads HARDKAS_SIMULATOR or HARDKAS_ALLOW_SIMULATOR_NODE", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.ts$/.test(e.name) && /HARDKAS_(SIMULATOR|ALLOW_SIMULATOR_NODE)\b/.test(fs.readFileSync(full, "utf8"))) offenders.push(full);
      }
    };
    walk(path.join(HERE, "../src"));
    expect(offenders).toEqual([]);
  });

  it("canonical container absent, variable set: stop reports it already stopped and runs no `docker stop`", async () => {
    h.nodeAbsent = true;
    const r = await stop();
    expect(r.ok).toBe(true);
    expect(printed.join("\n")).toMatch(/TOCCATA_NODE_ALREADY_STOPPED/);
    expect(h.calls.some((a) => a[0] === "stop")).toBe(false);
  });

  it("canonical container running, variable set: the stop is the real one and its postcondition holds (no LOCALNET_STOP_FAILED)", async () => {
    const r = await stop();
    expect(r.ok).toBe(true);
    expect(printed.join("\n")).toMatch(/TOCCATA_NODE_STOPPED/);
    expect(h.nodeRunning).toBe(false);
  });
});
