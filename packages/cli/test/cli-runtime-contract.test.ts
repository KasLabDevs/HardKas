import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createCommandOutput, setGlobalOutput } from "../src/output.js";
import { errorCodeOf, exitCodeOf, handleError, handleLockError, recordFailure } from "../src/ui.js";
import { HardkasCliError, HardkasExitCode } from "../src/cli-errors.js";
import { cliDist, childEnv } from "./first-contact-helpers.js";

// -----------------------------------------------------------------------------
// CLI-RUNTIME-CONTRACT-1 (2026-10-05). One contract for success / error / exit code:
//   A) an error before the main operation completed: exit ≠ 0, no JSON that claims success, the
//      typed code preserved, no false success line;
//   B) a real success: exit 0, no error envelope;
//   C) an irreversible operation completed + a later auxiliary failure: stated explicitly as a
//      partial outcome (tx send --track, fixed by JSON-PAPERCUTS and not redesigned here);
//   D) a typed HardKAS error keeps its code and context; UNKNOWN_ERROR only when there is none;
//   E) human and JSON output derive from the same execution truth.
// Root cause of the false successes: `handleError`/`handleLockError` rendered an error and returned,
// `main()` then exited with `process.exitCode ?? 0`; the renderer now records the failure once.
// -----------------------------------------------------------------------------

describe("CLI-RUNTIME-CONTRACT-1 · the renderer is the one owner of the failure", () => {
  let stdout: string[];
  let stderr: string[];
  let savedExitCode: number | string | undefined;

  const jsonMode = () =>
    setGlobalOutput(
      createCommandOutput({
        mode: "json",
        stdout: { write: (s: string) => void stdout.push(s) },
        stderr: { write: (s: string) => void stderr.push(s) }
      })
    );
  const humanMode = () =>
    setGlobalOutput(
      createCommandOutput({
        mode: "human",
        stdout: { write: (s: string) => void stdout.push(s) },
        stderr: { write: (s: string) => void stderr.push(s) }
      })
    );

  beforeEach(() => {
    stdout = [];
    stderr = [];
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = savedExitCode as any;
    setGlobalOutput(createCommandOutput({ mode: "human" }));
  });

  it("errorCodeOf: `.code`, a leading `CODE:` or a leading `[CODE]`; UNKNOWN_ERROR only without any", () => {
    expect(errorCodeOf(new Error("[DOCKER_UNAVAILABLE] Docker is not available. Details: x"))).toBe("DOCKER_UNAVAILABLE");
    expect(errorCodeOf(new Error("NODE_RESET_FAILED: docker is not running"))).toBe("NODE_RESET_FAILED");
    expect(errorCodeOf(Object.assign(new Error("[OTHER] y"), { code: "REAL_CODE" }))).toBe("REAL_CODE");
    expect(errorCodeOf(new Error("[not a code] y"))).toBe("UNKNOWN_ERROR");
    expect(errorCodeOf(new Error("Command failed"))).toBe("UNKNOWN_ERROR");
    expect(errorCodeOf("a string")).toBe("UNKNOWN_ERROR");
  });

  it("exitCodeOf: the error's own exit code, POLICY_DENIED for that code, else RUNTIME_FAILURE", () => {
    expect(exitCodeOf(new HardkasCliError("X", "x", { exitCode: HardkasExitCode.USAGE_ERROR }))).toBe(2);
    expect(exitCodeOf(new HardkasCliError("X", "x"))).toBe(1);
    expect(exitCodeOf(new Error("POLICY_DENIED: no"))).toBe(3);
    expect(exitCodeOf(new Error("anything"))).toBe(1);
    expect(exitCodeOf({ message: "chaos", exitCode: 40 })).toBe(40);
  });

  it("handleError records the failure in process.exitCode (never back to 0) and renders a typed error once", () => {
    humanMode();
    const e = new HardkasCliError("DOCKER_UNAVAILABLE", "Docker is not available", { exitCode: HardkasExitCode.RUNTIME_FAILURE });
    handleError(e);
    expect(process.exitCode).toBe(1);
    expect(stderr.join("")).toContain("[DOCKER_UNAVAILABLE] Docker is not available");
    const renderedOnce = stderr.length;
    handleError(e); // a second handler on the way out (main) must not print it again
    expect(stderr.length).toBe(renderedOnce);
    expect(process.exitCode).toBe(1);
  });

  it("recordFailure keeps the first nonzero exit code and takes a usage error's own", () => {
    recordFailure(new HardkasCliError("USAGE", "u", { exitCode: HardkasExitCode.USAGE_ERROR }));
    expect(process.exitCode).toBe(2);
    recordFailure(new Error("later"));
    expect(process.exitCode).toBe(2);
  });

  it("JSON mode: a swallowed typed error still yields exactly one envelope with its code", () => {
    jsonMode();
    const e = new HardkasCliError("NODE_CONTAINER_NOT_FOUND", "no container", { exitCode: 1 });
    handleError(e);
    handleError(e);
    const docs = stdout.join("").trim().split(/\n(?=\{)/);
    expect(docs).toHaveLength(1);
    expect(JSON.parse(docs[0]!)).toMatchObject({ ok: false, code: "NODE_CONTAINER_NOT_FOUND", message: "no container", mode: "cli" });
    expect(stderr.join("")).not.toMatch(/\{/);
    expect(process.exitCode).toBe(1);
  });

  it("JSON mode: a bracket-coded plain error is not UNKNOWN_ERROR", () => {
    jsonMode();
    handleError(new Error("[DOCKER_UNAVAILABLE] Docker is not available. Details: error during connect"));
    expect(JSON.parse(stdout.join(""))).toMatchObject({ ok: false, code: "DOCKER_UNAVAILABLE" });
    expect(process.exitCode).toBe(1);
  });

  it("handleLockError records the failure for a lock conflict too", () => {
    humanMode();
    const e = Object.assign(new Error("LOCK_HELD: busy"), { code: "LOCK_HELD", cause: { name: "node", pid: 1, command: "x", createdAt: "now" } });
    handleLockError(e);
    expect(process.exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/locked by another HardKAS process/);
  });

  it("the secret divergence of a replay report is rendered without `undefined` values", () => {
    humanMode();
    const e = Object.assign(new Error("Replay verification failed"), {
      code: "REPLAY_DIVERGED",
      report: { errors: ["differs"], divergences: [{ path: "/receipt/rpcUrl", secret: true }, { path: "/plan/amountSompi", expected: "1", actual: "2" }] }
    });
    handleError(e);
    // the text as read, whatever the terminal: picocolors colours the values when the environment allows it (CI=true)
    const text = stderr.join("").replace(/\u001b\[[0-9;]*m/g, "");
    expect(text).not.toMatch(/undefined/);
    expect(text).toMatch(/\/receipt\/rpcUrl/);
    expect(text).toMatch(/secret/i);
    expect(text).toMatch(/Expected: "1"/);
  });
});

// -----------------------------------------------------------------------------
// Real processes on the built CLI. Docker "unavailable" = the docker CLI is installed but the daemon
// endpoint refuses connections (DOCKER_HOST=tcp://127.0.0.1:1): the same classification as a missing
// Docker, without touching the machine's real containers.
// -----------------------------------------------------------------------------

const DOCKER_DOWN = { DOCKER_HOST: "tcp://127.0.0.1:1" };

function run(args: string[], cwd: string, env: Record<string, string> = {}) {
  const e = childEnv(env);
  delete e.HARDKAS_ALLOW_SIMULATED_NODE;
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: e, encoding: "utf8", timeout: 180_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}
const single = (stdout: string) => JSON.parse(stdout.trim());

describe("CLI-RUNTIME-CONTRACT-1 · node commands never claim what Docker could not do", () => {
  let ws: string;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-crc1-node-"));
    const r = run(["init", "--skip-toolchain", "--json"], ws);
    expect(r.status, r.all).toBe(0);
  }, 120_000);

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("node stop: Docker unavailable is an error, never 'Node stopped' (both modes)", () => {
    const h = run(["node", "stop"], ws, DOCKER_DOWN);
    expect(h.status, h.all).not.toBe(0);
    expect(h.all).not.toMatch(/Node stopped/);
    expect(h.all).toMatch(/DOCKER_UNAVAILABLE/);

    const j = run(["node", "stop", "--json"], ws, DOCKER_DOWN);
    expect(j.status, j.all).not.toBe(0);
    expect(single(j.stdout)).toMatchObject({ ok: false, code: "DOCKER_UNAVAILABLE" });
  }, 120_000);

  it("node start / restart: the typed DOCKER_UNAVAILABLE reaches the envelope and the exit code", () => {
    for (const cmd of ["start", "restart"]) {
      const j = run(["node", cmd, "--json"], ws, DOCKER_DOWN);
      expect(j.status, j.all).not.toBe(0);
      expect(single(j.stdout)).toMatchObject({ ok: false, code: "DOCKER_UNAVAILABLE" });
      expect(j.all).not.toMatch(/started successfully/);
    }
    const h = run(["node", "start"], ws, DOCKER_DOWN);
    expect(h.status, h.all).not.toBe(0);
    expect(h.all).toMatch(/\[DOCKER_UNAVAILABLE\]/);
    expect(h.all).not.toMatch(/UNKNOWN_ERROR/);
  }, 180_000);

  it("node status: Docker unavailable is not reported as 'available: true, no container'", () => {
    const j = run(["node", "status", "--json"], ws, DOCKER_DOWN);
    expect(j.status, j.all).not.toBe(0);
    expect(single(j.stdout)).toMatchObject({ ok: false, code: "DOCKER_UNAVAILABLE" });
    expect(j.stdout).not.toMatch(/"available": true/);
  }, 120_000);

  it("node logs: a typed error and a nonzero exit", () => {
    const j = run(["node", "logs", "--json"], ws, DOCKER_DOWN);
    expect(j.status, j.all).not.toBe(0);
    const env = single(j.stdout);
    expect(env.ok).toBe(false);
    expect(env.code).toBe("DOCKER_UNAVAILABLE");
  }, 120_000);

  it("node reset: with Docker unavailable nothing is deleted and the exit is nonzero", () => {
    const marker = path.join(ws, ".hardkas", "kaspad", "marker.txt");
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, "chain data\n");
    const j = run(["node", "reset", "--yes", "--json"], ws, DOCKER_DOWN);
    expect(j.status, j.all).not.toBe(0);
    expect(single(j.stdout)).toMatchObject({ ok: false, code: "DOCKER_UNAVAILABLE" });
    expect(fs.existsSync(marker), "the chain data survives an impossible reset").toBe(true);
  }, 120_000);
});

describe("CLI-RUNTIME-CONTRACT-1 · wrappers keep the original error; verdicts are typed", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-crc1-wrap-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("dev init outside a Node project: NOT_NODE_PROJECT with its message, not 'Dev init failed'", () => {
    const r = run(["dev", "init"], dir);
    expect(r.status, r.all).not.toBe(0);
    expect(r.all).toMatch(/NOT_NODE_PROJECT/);
    expect(r.all).toMatch(/No package\.json found/);
    expect(r.all).not.toMatch(/Dev init failed/);
  }, 120_000);

  it("why / explain with two targets: a usage error with the LOOKUP_USAGE code, exit 2", () => {
    // `why` has --json; `explain` is human-only, so its usage error is checked in human mode.
    const j = run(["why", "--plan", "a".repeat(64), "--signed", "b".repeat(64), "--json"], dir);
    expect(j.status, j.all).toBe(2);
    expect(single(j.stdout)).toMatchObject({ ok: false, code: "LOOKUP_USAGE" });
    for (const cmd of ["why", "explain"]) {
      const h = run([cmd, "--plan", "a".repeat(64), "--signed", "b".repeat(64)], dir);
      expect(h.status, h.all).toBe(2);
      expect(h.all).toMatch(/LOOKUP_USAGE/);
      expect(h.all).not.toMatch(/Command failed/);
    }
  }, 120_000);

  it("rpc info on a dead endpoint: one envelope, ok:false with a code, exit 1", () => {
    const j = run(["rpc", "info", "--url", "ws://127.0.0.1:1", "--json"], dir);
    expect(j.status, j.all).toBe(1);
    const env = single(j.stdout);
    expect(env.ok).toBe(false);
    expect(env.code).toBe("RPC_INFO_UNAVAILABLE");
    expect(j.all).not.toMatch(/Command failed/);
  }, 120_000);

  it("replay diff of unknown artifacts: the original error, not 'Command failed'", () => {
    const r = run(["init", "--skip-toolchain", "--json"], dir);
    expect(r.status, r.all).toBe(0);
    const j = run(["replay", "diff", "a".repeat(64), "b".repeat(64), "--json"], dir);
    expect(j.status, j.all).not.toBe(0);
    const env = single(j.stdout);
    expect(env.ok).toBe(false);
    expect(env.message).not.toBe("Command failed");
  }, 120_000);

  it("control: a real success keeps exit 0 and no error envelope", () => {
    const r = run(["lock", "list", "--json"], dir);
    expect(r.status, r.all).toBe(0);
    expect(single(r.stdout).ok).toBe(true);
  }, 120_000);
});
