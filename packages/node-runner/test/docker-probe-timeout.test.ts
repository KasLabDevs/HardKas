import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import {
  DockerKaspadRunner,
  DOCKER_PROBE_TIMEOUT_MS,
  NODE_ERROR_DOCKER_UNAVAILABLE,
  isDockerUnavailableError
} from "../src/docker-kaspad-runner";

vi.mock("execa", () => ({ execa: vi.fn() }));

// -----------------------------------------------------------------------------
// DOCKER-PROBE-TIMEOUT-1 (2026-11-20). A hung Docker Desktop made the read-only Docker checks wait forever. The runner's
// checks (`docker inspect` in status(), `docker version` in start()) now carry DOCKER_PROBE_TIMEOUT_MS, and a check that
// did not answer in time is the typed DOCKER_UNAVAILABLE.
// -----------------------------------------------------------------------------

/** What execa 9 rejects with when `timeout` ends a command. */
function timedOutError(command: string): Error {
  return Object.assign(new Error(`Command timed out after ${DOCKER_PROBE_TIMEOUT_MS} milliseconds: ${command}`), {
    timedOut: true,
    shortMessage: `Command timed out after ${DOCKER_PROBE_TIMEOUT_MS} milliseconds: ${command}`
  });
}

let dir = "";
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-docker-probe-timeout-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  vi.mocked(execa).mockReset();
});

describe("DOCKER-PROBE-TIMEOUT-1 · the runner's Docker checks have a time limit", () => {
  it("the limit is 20 s, and a check that did not answer within it is Docker unavailable", () => {
    expect(DOCKER_PROBE_TIMEOUT_MS).toBe(20_000);
    expect(isDockerUnavailableError(timedOutError("docker inspect x"))).toBe(true);
    // (control) a container that does not exist is still not "Docker unavailable"
    expect(isDockerUnavailableError(Object.assign(new Error("Error: No such object: x"), { stderr: "Error: No such object: x" }))).toBe(false);
  });

  it("status() asks `docker inspect` with the limit, and a timeout is DOCKER_UNAVAILABLE", async () => {
    vi.mocked(execa).mockRejectedValueOnce(timedOutError("docker inspect --format {{.State.Status}} hardkas-kaspad"));
    const runner = new DockerKaspadRunner({ cwd: dir });
    await expect(runner.status()).rejects.toMatchObject({ code: NODE_ERROR_DOCKER_UNAVAILABLE });
    const call = vi.mocked(execa).mock.calls[0] as unknown as [string, string[], { timeout?: number } | undefined];
    expect(call[0]).toBe("docker");
    expect(call[1][0]).toBe("inspect");
    expect(call[2]).toEqual({ timeout: DOCKER_PROBE_TIMEOUT_MS });
  });

  it("start() asks `docker version` with the limit, and a timeout is DOCKER_UNAVAILABLE", async () => {
    vi.mocked(execa).mockResolvedValueOnce({ stdout: "" } as any); // status(): inspect answers, the container is not running
    vi.mocked(execa).mockRejectedValueOnce(timedOutError("docker version"));
    const runner = new DockerKaspadRunner({ cwd: dir });
    await expect(runner.start()).rejects.toMatchObject({ code: NODE_ERROR_DOCKER_UNAVAILABLE });
    const version = vi.mocked(execa).mock.calls.find((c) => (c[1] as string[] | undefined)?.[0] === "version") as unknown as
      | [string, string[], { timeout?: number }]
      | undefined;
    expect(version?.[2]).toEqual({ timeout: DOCKER_PROBE_TIMEOUT_MS });
  });
});
