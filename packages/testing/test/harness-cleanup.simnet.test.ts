import { describe, it, expect, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KASPAD_REFERENCE_IMAGE } from "@hardkas/core";
import {
  HARDKAS_TEST_RUN_ID_ENV,
  SIMNET_HARNESS_ROLE,
  SIMNET_HARNESS_ROLE_LABEL,
  SIMNET_HARNESS_RUN_LABEL,
  SimnetNodeHarness,
  resolveHarnessRunId,
  sweepHarnessContainers
} from "../src/simnet-node-harness.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const VITEST = path.join(ROOT, "node_modules", "vitest", "vitest.mjs");
const image = process.env.HARDKAS_KASPAD_IMAGE ?? KASPAD_REFERENCE_IMAGE;

function docker(args: string[]): string {
  return execFileSync("docker", args, { encoding: "utf8" }).trim();
}
function containersNamed(name: string): string[] {
  return docker(["ps", "-a", "--filter", `name=^/${name}$`, "--format", "{{.Names}}"]).split(/\r?\n/).filter(Boolean);
}
function containersLabelled(runId: string): string[] {
  return docker(["ps", "-a", "--filter", `label=${SIMNET_HARNESS_RUN_LABEL}=${runId}`, "--format", "{{.Names}}"])
    .split(/\r?\n/)
    .filter(Boolean);
}

// AUD-06 / SEC-J: containers the harness starts must be published on loopback
// only, and none may survive the run, however the run ends.
describe("simnet harness container hygiene (T-A06a / T-A06b)", () => {
  const scratch: string[] = [];
  afterAll(() => {
    for (const name of scratch) spawnSync("docker", ["rm", "-f", name], { stdio: "ignore" });
  });

  it("T-A06b: a started node publishes its RPC port on 127.0.0.1 only and carries the run label", async () => {
    const node = await SimnetNodeHarness.start({ utxoIndex: true });
    expect(node.containerName).toBeDefined();
    scratch.push(node.containerName!);
    try {
      await node.waitUntilReady({ timeoutMs: 150000 });
      const inspected = JSON.parse(docker(["inspect", node.containerName!]))[0];
      const bindings = inspected.HostConfig.PortBindings as Record<string, Array<{ HostIp: string; HostPort: string }>>;
      expect(Object.keys(bindings).length).toBeGreaterThan(0);
      for (const entries of Object.values(bindings)) {
        for (const entry of entries) expect(entry.HostIp).toBe("127.0.0.1");
      }
      expect(inspected.Config.Labels[SIMNET_HARNESS_ROLE_LABEL]).toBe(SIMNET_HARNESS_ROLE);
      expect(inspected.Config.Labels[SIMNET_HARNESS_RUN_LABEL]).toBe(resolveHarnessRunId());
    } finally {
      await node.kill();
    }
    expect(containersNamed(node.containerName!)).toEqual([]);
  }, 180000);

  it("T-A06a (mechanism): the run-label sweep removes this run's containers, created or running, and nothing else", () => {
    const runId = `sweep-${process.pid}-${Date.now()}`;
    const foreign = `hardkas-sweep-foreign-${process.pid}`;
    const created = `hardkas-sweep-created-${process.pid}`;
    const running = `hardkas-sweep-running-${process.pid}`;
    scratch.push(foreign, created, running);
    const labels = (id: string) => ["--label", `${SIMNET_HARNESS_ROLE_LABEL}=${SIMNET_HARNESS_ROLE}`, "--label", `${SIMNET_HARNESS_RUN_LABEL}=${id}`];

    // A container of another run must survive; a "Created" one (AUX-20) and a running one of this run must go.
    docker(["create", "--name", foreign, ...labels(`${runId}-other`), image, "kaspad", "--help"]);
    docker(["create", "--name", created, ...labels(runId), image, "kaspad", "--help"]);
    docker(["run", "-d", "--name", running, ...labels(runId), image, "kaspad", "--simnet", "--reset-db", "--appdir=/tmp/hardkas-sweep-test"]);
    expect(containersLabelled(runId).sort()).toEqual([created, running].sort());

    const result = sweepHarnessContainers(runId);
    expect(result.dockerAvailable).toBe(true);
    expect(result.failed).toEqual([]);
    expect([...result.removed].sort()).toEqual([created, running].sort());
    expect(containersLabelled(runId)).toEqual([]);
    expect(containersNamed(foreign)).toEqual([foreign]);
  }, 120000);

  it("T-A06a (end-to-end): a test that times out while its node is starting leaves no container behind", () => {
    const runId = `timeout-${process.pid}-${Date.now()}`;
    const fixtureOut = path.join(os.tmpdir(), `hardkas-harness-fixture-${process.pid}-${Date.now()}.txt`);
    const child = spawnSync(
      process.execPath,
      [VITEST, "run", "--config", "vitest.simnet.config.ts", "--testTimeout=2000", "packages/testing/test/harness-timeout-fixture.simnet.test.ts"],
      {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 280000,
        env: {
          ...process.env,
          [HARDKAS_TEST_RUN_ID_ENV]: runId,
          HARDKAS_HARNESS_TIMEOUT_FIXTURE: "1",
          HARDKAS_HARNESS_FIXTURE_OUT: fixtureOut
        }
      }
    );
    // The fixture must really have started a container and really have timed out:
    // a passing child, or one that never reached docker, proves nothing.
    expect(child.status, `child stdout:\n${child.stdout}\nstderr:\n${child.stderr}`).not.toBe(0);
    expect(`${child.stdout}${child.stderr}`).toMatch(/Test timed out|timed out/i);
    expect(existsSync(fixtureOut), "fixture did not report the container it started").toBe(true);
    const started = readFileSync(fixtureOut, "utf8").trim();
    rmSync(fixtureOut, { force: true });
    expect(started).toMatch(/^hardkas-simnet-\d+$/);
    scratch.push(started);
    expect(containersNamed(started)).toEqual([]);
    expect(containersLabelled(runId)).toEqual([]);
  }, 300000);
});
