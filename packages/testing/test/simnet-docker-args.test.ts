import { describe, it, expect } from "vitest";
import {
  HARDKAS_TEST_RUN_ID_ENV,
  SIMNET_HARNESS_ROLE,
  SIMNET_HARNESS_ROLE_LABEL,
  SIMNET_HARNESS_RUN_LABEL,
  buildSimnetDockerRunArgs,
  resolveHarnessRunId
} from "../src/simnet-node-harness.js";

// T-A06b (unit half): the docker invocation the harness builds. The L3 half
// (harness-cleanup.simnet.test.ts) checks the same properties on a real container.
describe("T-A06b: simnet harness docker run arguments", () => {
  const spec = { containerName: "hardkas-simnet-41234", rpcPort: 41234, image: "kaspa/test:1", runId: "run-abc" };

  it("publishes the RPC port on the loopback interface only", () => {
    const args = buildSimnetDockerRunArgs(spec);
    const publish = args.filter((_, i) => args[i - 1] === "-p");
    expect(publish).toEqual(["127.0.0.1:41234:41234"]);
    expect(args).not.toContain("41234:41234");
  });

  it("labels the container with the harness role and the run id", () => {
    const args = buildSimnetDockerRunArgs(spec);
    const labels = args.filter((_, i) => args[i - 1] === "--label");
    expect(labels).toContain(`${SIMNET_HARNESS_ROLE_LABEL}=${SIMNET_HARNESS_ROLE}`);
    expect(labels).toContain(`${SIMNET_HARNESS_RUN_LABEL}=run-abc`);
  });

  it("keeps the container named, auto-removed, and kaspad listening on all container interfaces", () => {
    const args = buildSimnetDockerRunArgs(spec);
    expect(args.slice(0, 2)).toEqual(["run", "--rm"]);
    expect(args[args.indexOf("--name") + 1]).toBe("hardkas-simnet-41234");
    const image = args.indexOf("kaspa/test:1");
    expect(image).toBeGreaterThan(0);
    expect(args.slice(image + 1)).toEqual([
      "kaspad",
      "--simnet",
      "--rpclisten-json=0.0.0.0:41234",
      "--enable-unsynced-mining",
      "--reset-db"
    ]);
  });

  it("appends index flags only when requested", () => {
    expect(buildSimnetDockerRunArgs({ ...spec, utxoIndex: true, txIndex: true }).slice(-2)).toEqual(["--utxoindex", "--txindex"]);
    expect(buildSimnetDockerRunArgs({ ...spec, utxoIndex: true })).toContain("--utxoindex");
    expect(buildSimnetDockerRunArgs(spec)).not.toContain("--utxoindex");
  });

  it("takes the run id from the environment and otherwise derives one per process", () => {
    expect(resolveHarnessRunId({ [HARDKAS_TEST_RUN_ID_ENV]: "from-env" })).toBe("from-env");
    expect(resolveHarnessRunId({})).toBe(`pid-${process.pid}`);
    expect(resolveHarnessRunId({ [HARDKAS_TEST_RUN_ID_ENV]: "  " })).toBe(`pid-${process.pid}`);
  });
});
