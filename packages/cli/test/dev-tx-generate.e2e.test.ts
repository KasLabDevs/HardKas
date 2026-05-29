import { describe, it, expect } from "vitest";
import { execa } from "execa";
import path from "node:path";

describe("hardkas dev tx generate", () => {
  const cliPath = path.resolve(__dirname, "../src/index.ts");
  const tsx = "npx";
  const runArgs = ["tsx", cliPath];

  it("should generate 50 mock transactions", async () => {
    const { stdout } = await execa(tsx, [...runArgs, "dev", "tx", "generate", "--count", "50", "--json"]);
    const result = JSON.parse(stdout);

    expect(result.generated).toBe(50);
    expect(result.successCount).toBe(50);
    expect(result.mode).toBe("simulated");
    expect(result.purpose).toBe("load-test");
    expect(result.securityModel).toBe("mock-fixture");
    expect(result.results.length).toBe(50);
  }, 120000); // Allow longer time for 50 txs

  it("should generate 10 mock transactions quickly", async () => {
    const { stdout } = await execa(tsx, [...runArgs, "dev", "tx", "generate", "--count", "10", "--json"]);
    const result = JSON.parse(stdout);

    expect(result.generated).toBe(10);
    expect(result.successCount).toBe(10);
  }, 30000);
});
