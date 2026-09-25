import { describe, it, expect } from "vitest";
import canonical from "../../../vitest.config.js";
import simnet from "../../../vitest.simnet.config.js";
import silverc from "../../../vitest.silverc.config.js";
import localnet from "../../../vitest.localnet.config.js";
import e2e from "../../../vitest.e2e.config.js";

// T-A06c (AUD-06): the canonical gate is the unit level. Suites that need a
// kaspad, Docker or a network belong to their own level and never run there.
describe("T-A06c: test levels are separated by configuration", () => {
  it("excludes simnet, localnet and e2e suites from the canonical gate", () => {
    const exclude = canonical.test?.exclude ?? [];
    expect(exclude).toContain("**/*.simnet.test.ts");
    expect(exclude).toContain("**/*.localnet.test.ts");
    expect(exclude).toContain("**/*.e2e.test.ts");
    expect(canonical.test?.globalSetup).toBeUndefined();
  });

  it("gives simnet suites their own level with run-scoped container cleanup", () => {
    expect(simnet.test?.include).toEqual(["packages/*/test/**/*.simnet.test.ts"]);
    expect(simnet.test?.exclude).toContain("**/.*/**");
    expect(simnet.test?.globalSetup).toEqual(["./packages/testing/test/simnet-global-setup.ts"]);
    expect(simnet.test?.testTimeout).toBeGreaterThanOrEqual(120000);
  });

  it("gives silverc suites their own level, rooted in the workspace packages", () => {
    expect(silverc.test?.include).toEqual(["packages/*/test/**/*.silverc.test.ts"]);
    expect(silverc.test?.exclude).toContain("**/.*/**");
    expect(silverc.test?.globalSetup).toBeUndefined();
  });

  it("keeps the other levels disjoint from the canonical gate", () => {
    expect(localnet.test?.include).toEqual(["**/*.localnet.test.ts"]);
    expect(e2e.test?.include).toEqual(["packages/*/test/**/*.e2e.test.ts"]);
  });
});
