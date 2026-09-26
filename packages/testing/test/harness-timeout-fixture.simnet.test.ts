import { test } from "vitest";
import { writeFileSync } from "node:fs";
import { SimnetNodeHarness } from "../src/simnet-node-harness.js";

// Fixture for T-A06a (harness-cleanup.simnet.test.ts), not a regression on its
// own: it is only enabled when that test spawns a child vitest with
// HARDKAS_HARNESS_TIMEOUT_FIXTURE=1 and a test timeout shorter than the node's
// start-up, so the test times out while the container is running. The name of
// the container it started is written to HARDKAS_HARNESS_FIXTURE_OUT so the
// parent can prove a container really existed before checking it is gone.
const ENABLED = process.env.HARDKAS_HARNESS_TIMEOUT_FIXTURE === "1";

test.runIf(ENABLED)("fixture: a harness start that outlives the test timeout", async () => {
  const node = await SimnetNodeHarness.start({ utxoIndex: true });
  const out = process.env.HARDKAS_HARNESS_FIXTURE_OUT;
  if (out) writeFileSync(out, node.containerName ?? "", "utf8");
  await node.waitUntilReady({ timeoutMs: 120000 });
  // Even if the node came up before the timeout, keep the container alive past it.
  await new Promise((resolve) => setTimeout(resolve, 60000));
  await node.kill();
});
