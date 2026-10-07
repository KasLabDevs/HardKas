import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

vi.setConfig({ testTimeout: 30_000 });

// LOCALNET-STOP-PROFILE-1 (reproduced live 2026-10-03): `hardkas localnet stop` without --profile exited 0 — printing
// "Simulated localnet state is managed in-memory.", or nothing at all with --json — while the Docker node kept running
// (`localnet status` still reported it ready). The command defaulted --profile to "simulated", a profile `localnet
// start` refuses and the runner treats as nothing to stop. And with the right profile, the runner swallowed every
// Docker error and reported TOCCATA_NODE_STOPPED even when it could not reach Docker. Invariant pinned here, whatever
// the fix: a `localnet stop` that completes leaves no canonical node running, never claims a stop it did not make,
// and a refusal is a deliberate HardKAS error. Docker is a double: a node container that runs until stopped.

const h = vi.hoisted(() => ({
  nodeRunning: true,
  dockerDown: false,
  calls: [] as string[][],
  // AFTER scenarios (all off for the BEFORE cases above)
  nodeAbsent: false,
  stopIneffective: false,
  stopFails: false,
  minerRunning: false
}));

vi.mock("execa", () => ({
  execa: vi.fn(async (_cmd: string, args: string[]) => {
    h.calls.push([...args]);
    if (h.dockerDown) throw Object.assign(new Error("Cannot connect to the Docker daemon at tcp://127.0.0.1:1"), { exitCode: 1 });
    const name = args[args.length - 1];
    if (args[0] === "stop") {
      if (h.stopFails) throw Object.assign(new Error(`Error response from daemon: cannot stop container: ${name}: permission denied`), { exitCode: 1 });
      if (name === "hardkas-kaspad-toccata-v2" && !h.stopIneffective) h.nodeRunning = false;
      if (name === "hardkas-toccata-miner") h.minerRunning = false;
    }
    if (args[0] === "inspect" || (args[0] === "container" && args[1] === "inspect")) {
      if (name === "hardkas-kaspad-toccata-v2") {
        if (h.nodeAbsent) throw Object.assign(new Error(`Error: No such object: ${name}`), { exitCode: 1, stderr: `Error: No such object: ${name}` });
        return { stdout: h.nodeRunning ? "running" : "exited" };
      }
      return { stdout: h.minerRunning ? "running" : "exited" };
    }
    return { stdout: "" };
  })
}));

import { registerLocalnetCommands } from "../src/commands/localnet.js";
import { setGlobalOutput } from "../src/output.js";

let printed: string[];

beforeEach(() => {
  h.nodeRunning = true;
  h.dockerDown = false;
  h.calls = [];
  h.nodeAbsent = false;
  h.stopIneffective = false;
  h.stopFails = false;
  h.minerRunning = false;
  printed = [];
  setGlobalOutput({ writeLine: (s: string) => printed.push(s), writeJson: (o: unknown) => printed.push(JSON.stringify(o)) } as any);
});

async function stop(flags: string[]) {
  const program = new Command();
  program.exitOverride();
  registerLocalnetCommands(program);
  return program.parseAsync(["localnet", "stop", ...flags], { from: "user" }).then(
    () => ({ ok: true as const }),
    (error: any) => ({ ok: false as const, error })
  );
}
const lastStatus = () => {
  for (const s of [...printed].reverse()) {
    try { const j = JSON.parse(s); if (j?.status) return j.status as string; } catch {}
  }
  return undefined;
};

describe("LOCALNET-STOP-PROFILE-1 · `localnet stop` never reports success while the localnet keeps running", () => {
  for (const [label, flags] of [["--json, no --profile", ["--json"]], ["human, no flags", []]] as const) {
    it(`${label}: either the node is stopped, or the command refuses with a HardKAS error`, async () => {
      const outcome = await stop([...flags]);
      if (outcome.ok) expect(h.nodeRunning).toBe(false);
      else expect(String(outcome.error?.code ?? "")).toMatch(/^LOCALNET_/);
    });
  }

  it("Docker unreachable: it never claims TOCCATA_NODE_STOPPED", async () => {
    h.dockerDown = true;
    const outcome = await stop(["--profile", "toccata-v2", "--json"]);
    if (outcome.ok) expect(lastStatus()).not.toBe("TOCCATA_NODE_STOPPED");
    else expect(String(outcome.error?.code ?? "")).toMatch(/^LOCALNET_/);
  });

  it("control · --profile toccata-v2 stops the node and says so", async () => {
    const outcome = await stop(["--profile", "toccata-v2", "--json"]);
    expect(outcome.ok).toBe(true);
    expect(h.nodeRunning).toBe(false);
    expect(lastStatus()).toBe("TOCCATA_NODE_STOPPED");
  });

  it("control · --toccata stops the node and says so", async () => {
    const outcome = await stop(["--toccata", "--json"]);
    expect(outcome.ok).toBe(true);
    expect(h.nodeRunning).toBe(false);
    expect(lastStatus()).toBe("TOCCATA_NODE_STOPPED");
  });
});

// STOP-TRUTH-1 (reviewer, 3-oct): `localnet stop` reports a stop only once it has determined the node is no longer
// running. running → stop → verified down: TOCCATA_NODE_STOPPED; already down or absent: TOCCATA_NODE_ALREADY_STOPPED
// (an idempotent success); Docker unavailable, a failing stop, or a node still up afterwards: an error, exit ≠ 0.
// Human and JSON give the same result; "simulated" is refused.
describe("STOP-TRUTH-1 · a stop is reported only on a verified postcondition", () => {
  it("idempotent: stopping twice is STOPPED, then ALREADY_STOPPED — neither a lie nor an error", async () => {
    const first = await stop(["--json"]);
    expect(first.ok).toBe(true);
    expect(lastStatus()).toBe("TOCCATA_NODE_STOPPED");
    h.calls = [];
    const second = await stop(["--json"]);
    expect(second.ok).toBe(true);
    expect(lastStatus()).toBe("TOCCATA_NODE_ALREADY_STOPPED");
    expect(h.calls.some((a) => a[0] === "stop" && a.includes("hardkas-kaspad-toccata-v2"))).toBe(false);
  });

  it("no container at all: ALREADY_STOPPED, not an error", async () => {
    h.nodeAbsent = true;
    const outcome = await stop(["--json"]);
    expect(outcome.ok).toBe(true);
    expect(lastStatus()).toBe("TOCCATA_NODE_ALREADY_STOPPED");
  });

  it("still running after `docker stop`: an error, never STOPPED", async () => {
    h.stopIneffective = true;
    const outcome = await stop(["--json"]);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.error.code).toBe("LOCALNET_STOP_FAILED");
    expect(lastStatus()).toBeUndefined();
  });

  it("`docker stop` failing: an error, never STOPPED", async () => {
    h.stopFails = true;
    const outcome = await stop(["--json"]);
    expect(outcome.ok ? "" : outcome.error.code).toBe("LOCALNET_STOP_FAILED");
    expect(lastStatus()).toBeUndefined();
  });

  it("Docker unreachable: LOCALNET_DOCKER_UNAVAILABLE, in both output modes", async () => {
    h.dockerDown = true;
    const json = await stop(["--json"]);
    const human = await stop([]);
    expect(json.ok ? "" : json.error.code).toBe("LOCALNET_DOCKER_UNAVAILABLE");
    expect(human.ok ? "" : human.error.code).toBe("LOCALNET_DOCKER_UNAVAILABLE");
  });

  it("--profile simulated is refused before Docker is touched", async () => {
    const outcome = await stop(["--profile", "simulated", "--json"]);
    expect(outcome.ok ? "" : outcome.error.code).toBe("LOCALNET_PROFILE_UNSUPPORTED");
    expect(h.calls).toEqual([]);
  });

  it("human and JSON reach the same result: both stop a running node, both are idempotent", async () => {
    const human = await stop([]);
    expect(human.ok).toBe(true);
    expect(h.nodeRunning).toBe(false);
    expect(printed.join("\n")).toContain("Localnet stopped");
    printed = [];
    h.nodeRunning = true;
    const json = await stop(["--json"]);
    expect(json.ok).toBe(true);
    expect(h.nodeRunning).toBe(false);
    expect(lastStatus()).toBe("TOCCATA_NODE_STOPPED");
    printed = [];
    const humanAgain = await stop([]);
    expect(humanAgain.ok).toBe(true);
    expect(printed.join("\n")).toContain("Localnet already stopped");
  });

  it("a miner still up is stopped and verified too", async () => {
    h.minerRunning = true;
    const outcome = await stop(["--json"]);
    expect(outcome.ok).toBe(true);
    expect(h.minerRunning).toBe(false);
    expect(h.calls.some((a) => a[0] === "stop" && a.includes("hardkas-toccata-miner"))).toBe(true);
  });
});
