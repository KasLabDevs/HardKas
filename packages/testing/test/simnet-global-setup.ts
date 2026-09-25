import { randomBytes } from "node:crypto";
import { HARDKAS_TEST_RUN_ID_ENV, sweepHarnessContainers } from "../src/simnet-node-harness.js";

/**
 * Global setup for the simnet level (vitest.simnet.config.ts).
 *
 * setup(): fixes one run id for this vitest invocation. Workers are forked after
 * global setup, so they inherit the environment and every container the harness
 * starts is labelled with this id. A caller may pre-set the id (the T-A06a
 * end-to-end test does) to observe a run from outside.
 *
 * teardown(): removes every container still carrying the run id, by label. This
 * is the deterministic cleanup AUD-06 requires: it runs in the main process,
 * after all workers are gone, regardless of timeouts or worker crashes, and it
 * never matches containers the harness did not start.
 */
export async function setup(): Promise<void> {
  if (!process.env[HARDKAS_TEST_RUN_ID_ENV]) {
    process.env[HARDKAS_TEST_RUN_ID_ENV] = `vitest-${process.pid}-${randomBytes(4).toString("hex")}`;
  }
  console.log(`[simnet-global-setup] run id ${process.env[HARDKAS_TEST_RUN_ID_ENV]}`);
}

export async function teardown(): Promise<void> {
  const runId = process.env[HARDKAS_TEST_RUN_ID_ENV];
  if (!runId) return;
  const result = sweepHarnessContainers(runId);
  if (!result.dockerAvailable) {
    console.warn(`[simnet-global-setup] docker unavailable: could not sweep containers labelled ${runId}`);
    return;
  }
  console.log(
    `[simnet-global-setup] sweep ${runId}: removed ${result.removed.length} container(s)` +
      (result.removed.length ? ` (${result.removed.join(", ")})` : "")
  );
  if (result.failed.length > 0) {
    throw new Error(
      `[simnet-global-setup] could not remove container(s): ` +
        result.failed.map((f) => `${f.name}: ${f.error}`).join("; ")
    );
  }
}
