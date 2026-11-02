import { describe, it, expect } from "vitest";
import canonical from "../../../vitest.config.js";
import simnet from "../../../vitest.simnet.config.js";
import silverc from "../../../vitest.silverc.config.js";
import silverRunner from "../../../vitest.silver-runner.config.js";
import localnet from "../../../vitest.localnet.config.js";
import e2e from "../../../vitest.e2e.config.js";

// REMED-CLOSE: the root .hardkas guard (a listing of the directory before and after the run: no node, Docker or network)
const ROOT_GUARD = "./scripts/vitest-root-hygiene.global-setup.ts";

// T-A06c (AUD-06): the canonical gate is the unit level. Suites that need a
// kaspad, Docker or a network belong to their own level and never run there.
describe("T-A06c: test levels are separated by configuration", () => {
  it("excludes simnet, localnet and e2e suites from the canonical gate", () => {
    const exclude = canonical.test?.exclude ?? [];
    expect(exclude).toContain("**/*.simnet.test.ts");
    expect(exclude).toContain("**/*.localnet.test.ts");
    expect(exclude).toContain("**/*.e2e.test.ts");
    // no global setup that raises a node or reaches Docker: the root .hardkas guard is its only one
    expect(canonical.test?.globalSetup).toEqual([ROOT_GUARD]);
  });

  it("gives simnet suites their own level with run-scoped container cleanup", () => {
    expect(simnet.test?.include).toEqual(["packages/*/test/**/*.simnet.test.ts", "examples/*/test/**/*.simnet.test.ts"]);
    expect(simnet.test?.exclude).toContain("**/.*/**");
    expect(simnet.test?.globalSetup).toEqual([ROOT_GUARD, "./packages/testing/test/simnet-global-setup.ts"]);
    expect(simnet.test?.testTimeout).toBeGreaterThanOrEqual(120000);
  });

  it("gives silverc suites their own level, rooted in the workspace packages and the examples' own tests", () => {
    expect(silverc.test?.include).toEqual(["packages/*/test/**/*.silverc.test.ts", "examples/*/test/**/*.silverc.test.ts"]);
    expect(silverc.test?.exclude).toContain("**/.*/**");
    expect(silverc.test?.globalSetup).toEqual([ROOT_GUARD]);
  });

  it("REMED-CLOSE: every level runs the root .hardkas guard first, so no level can leave anything in the repository root's .hardkas", () => {
    for (const [name, level] of Object.entries({ canonical, simnet, silverc, silverRunner, localnet, e2e })) {
      expect((level.test?.globalSetup as string[] | undefined)?.[0], name).toBe(ROOT_GUARD);
    }
    expect(silverRunner.test?.globalSetup).toEqual([ROOT_GUARD]);
    expect(localnet.test?.globalSetup).toEqual([ROOT_GUARD, "./packages/dev-server/test/global-setup.ts"]);
    expect(e2e.test?.globalSetup).toEqual([ROOT_GUARD]);
  });

  // Control 3: the SilverScript runner level, its examples included, is the only one that opts in to an UNVERIFIED runner
  it("gives SilverScript-runner suites their own level, with the explicit opt-in to an unverified local runner", () => {
    expect(silverRunner.test?.include).toEqual(["packages/*/test/**/*.silver-runner.test.ts", "examples/*/test/**/*.silver-runner.test.ts"]);
    expect(silverRunner.test?.exclude).toContain("**/.*/**");
    expect(silverRunner.test?.env).toEqual({ HARDKAS_SILVER_RUNNER_TRUST: "allow-unverified" });
    const exclude = canonical.test?.exclude ?? [];
    expect(exclude).toContain("**/*.silverc.test.ts");
    expect(exclude).toContain("**/*.silver-runner.test.ts");
    expect((canonical.test as any)?.env?.HARDKAS_SILVER_RUNNER_TRUST).toBeUndefined();
    expect((silverc.test as any)?.env?.HARDKAS_SILVER_RUNNER_TRUST).toBeUndefined();
  });

  it("keeps the other levels disjoint from the canonical gate", () => {
    expect(localnet.test?.include).toEqual(["**/*.localnet.test.ts"]);
    expect(e2e.test?.include).toEqual(["packages/*/test/**/*.e2e.test.ts"]);
  });
});
