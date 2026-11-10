import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveObserverBackend, RpcObserverBackend, SimulatorObserverBackend } from "../src/observe/backends.js";

// P29: choosing the observer backend printed `[DEBUG] Using SimulatorObserverBackend …` / `[DEBUG] Using
// RpcObserverBackend …` on stdout, inside every `sdk.observe.address(...)` (and so inside the output of a CLI command or
// a user script). The choice is the same; nothing is printed. Unit level: a stub instance, no node, no workspace read.

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src");
const sources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : []));

const stub = (network: string, mode: string, networks: Record<string, unknown> = {}) =>
  ({ network, execution: { mode, domain: "kaspa-l1" }, config: { config: { networks } } }) as any;

afterEach(() => vi.restoreAllMocks());

describe("P29 · the SDK's observer backend selection prints nothing", () => {
  it("picks the same backends as before, without console output", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(resolveObserverBackend(stub("simulated", "simulator"))).toBeInstanceOf(SimulatorObserverBackend);
    expect(resolveObserverBackend(stub("simnet", "localnet"))).toBeInstanceOf(RpcObserverBackend);
    expect(resolveObserverBackend(stub("simnet", "localnet", { simulated: { kind: "simulated" } }), "simulated")).toBeInstanceOf(SimulatorObserverBackend);
    expect(resolveObserverBackend(stub("simnet", "localnet", { simnet: { kind: "kaspa-node" } }), "simnet")).toBeInstanceOf(RpcObserverBackend);
    expect(log).not.toHaveBeenCalled();
  });

  it("no source file of @hardkas/sdk carries a console.log(\"[DEBUG]\")", () => {
    const hits = sources(SRC).filter((f) => /console\.log\(\s*["'`]\[DEBUG\]/.test(fs.readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
