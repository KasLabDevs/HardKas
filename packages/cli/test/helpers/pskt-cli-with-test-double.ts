// SURFACE-TRUTH-1B (ST-C): the entry point of the PSKT CLI orchestration test. It registers the test double in this
// process, then runs the CLI exactly as `src/index.ts` does. The product never registers a double.
import { pskt } from "@hardkas/sdk";
import { TestFakeAdapter } from "./pskt-test-double.js";

if (!pskt.adapterRegistry.has("test-fake-adapter")) {
  pskt.adapterRegistry.register(new TestFakeAdapter());
}

await import("../../src/index.js");
