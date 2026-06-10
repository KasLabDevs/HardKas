import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execa } from "execa";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("hardkas dev tx generate", () => {
  let tmpDir: string;
  const cliPath = path.resolve(__dirname, "../src/index.ts");
  const tsx = "node";
  const runArgs = ["--import", "tsx", cliPath];

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dev-tx-gen-test-"));
    const configContent = `
import { defineHardkasConfig } from "@hardkas/sdk";
export default defineHardkasConfig({
  defaultNetwork: "simulated",
  networks: {
    simulated: {
      kind: "simulated",
      description: "Pure local simulation"
    }
  },
  accounts: {
    alice: { kind: "simulated", address: "kaspa:sim_alice" },
    bob: { kind: "simulated", address: "kaspa:sim_bob" }
  }
});
`;
    await fs.writeFile(path.join(tmpDir, "hardkas.config.ts"), configContent, "utf-8");
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should generate 50 mock transactions", async () => {
    const { stdout } = await execa(tsx, [
      ...runArgs,
      "dev",
      "tx",
      "generate",
      "--count",
      "50",
      "--workspace",
      tmpDir,
      "--json"
    ]);
    const result = JSON.parse(stdout);

    expect(result.generated).toBe(50);
    expect(result.successCount).toBe(50);
    expect(result.mode).toBe("simulated");
    expect(result.purpose).toBe("load-test");
    expect(result.securityModel).toBe("mock-fixture");
    expect(result.results.length).toBe(50);
  }, 300000);

  it("should generate 10 mock transactions quickly", async () => {
    const { stdout } = await execa(tsx, [
      ...runArgs,
      "dev",
      "tx",
      "generate",
      "--count",
      "10",
      "--workspace",
      tmpDir,
      "--json"
    ]);
    const result = JSON.parse(stdout);

    expect(result.generated).toBe(10);
    expect(result.successCount).toBe(10);
  }, 120000);
});
