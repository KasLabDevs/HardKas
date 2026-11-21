import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// DOCKER-PROBE-TIMEOUT-1 (2026-11-20). A hung Docker Desktop (its `docker-ai` CLI plugin stopped answering) made
// `hardkas doctor` wait on `docker info` for five hours: the check had no time limit. A Docker that does not answer
// within DOCKER_PROBE_TIMEOUT_MS (20 s) is now unreachable, and the report says that it did not answer.
// The `docker` on PATH is a shim that never answers; `pnpm` is a shim so the runtime checks do not depend on the machine.
// -----------------------------------------------------------------------------

const made: string[] = [];
const tmp = (prefix: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
};

/**
 * A `docker` that never answers, for Windows (docker.cmd) and POSIX (docker). It starts no child of its own, so the
 * time limit's kill ends it whole: on Windows a child (a `ping`) would inherit the output pipe and keep it open after
 * the kill, and the test would measure the child's life instead of the limit.
 */
function hangingDockerAndPnpm(): string {
  const dir = tmp("hk-dpt-bin-");
  fs.writeFileSync(path.join(dir, "docker.cmd"), "@for /l %%i in (1,1,2147483647) do @rem\r\n");
  fs.writeFileSync(path.join(dir, "docker"), "#!/bin/sh\nexec sleep 300\n");
  fs.chmodSync(path.join(dir, "docker"), 0o755);
  fs.writeFileSync(path.join(dir, "pnpm.cmd"), "@echo 9.0.0\r\n");
  fs.writeFileSync(path.join(dir, "pnpm"), "#!/bin/sh\necho 9.0.0\n");
  fs.chmodSync(path.join(dir, "pnpm"), 0o755);
  return dir;
}

/** A workspace whose default target is the managed localnet: the one that needs Docker. */
function localnetWorkspace(): string {
  const ws = tmp("hk-dpt-ws-");
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg = { execution: { default: "local", targets: { local: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } } } };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  return ws;
}

const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
let bin: string;
let logs: string;

beforeAll(() => {
  assertHermeticPreloadActive();
  bin = hangingDockerAndPnpm();
  logs = tmp("hk-dpt-logs-");
});
afterAll(() => {
  for (const d of made) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      // best effort: a directory Windows still holds stays in the OS temp folder
    }
  }
});

describe("DOCKER-PROBE-TIMEOUT-1 · hardkas doctor with a Docker that never answers", () => {
  it("finishes, reports Docker unreachable because it did not answer, and exits 1 in a localnet workspace", async () => {
    const env = hermeticChildEnv(path.join(logs, "doctor.net.log"), {
      HARDKAS_HERMETIC_DENY_PORTS: "16210,17210,18210",
      [pathKey]: `${bin}${path.delimiter}${process.env[pathKey] ?? ""}`
    });
    const started = Date.now();
    const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn(process.execPath, [cliDist, "doctor", "--json"], { cwd: localnetWorkspace(), env });
      let stdout = "";
      let stderr = "";
      // far above the 20 s limit; before the fix the child never ended and this timer killed it
      const timer = setTimeout(() => child.kill(), 90_000);
      child.stdout.on("data", (d) => (stdout += String(d)));
      child.stderr.on("data", (d) => (stderr += String(d)));
      child.on("close", (status) => {
        clearTimeout(timer);
        resolve({ status, stdout, stderr });
      });
    });
    const elapsed = Date.now() - started;
    const brief = `exit ${r.status} after ${elapsed} ms\n${r.stdout.slice(-2500)}\n${r.stderr.slice(0, 1500)}`;
    let json: any;
    try {
      json = JSON.parse(r.stdout);
    } catch {
      json = undefined;
    }
    expect(json, brief).toBeDefined();
    const docker = json.checks.find((c: any) => c.name === "Docker daemon");
    expect(docker, brief).toMatchObject({ status: "fail", code: "DOCKER_UNREACHABLE" });
    expect(docker.message, brief).toBe("Not reachable ('docker info' did not answer within 20 s)");
    expect(docker.suggestion, brief).toBe("Docker is not answering: restart Docker.");
    expect(r.status, brief).toBe(1);
    // the 20 s limit, not the 90 s kill, ended the wait (the rest is the CLI's own start and checks)
    expect(elapsed, brief).toBeGreaterThanOrEqual(20_000);
    expect(elapsed, brief).toBeLessThan(45_000);
  });
});
