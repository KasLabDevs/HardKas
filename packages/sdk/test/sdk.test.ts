import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { Hardkas } from "../src/index.js";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

vi.mock("@hardkas/kaspa-rpc", async () => {
  const actual = await vi.importActual("@hardkas/kaspa-rpc");
  return {
    ...(actual as any),
    JsonWrpcKaspaClient: vi.fn().mockImplementation(() => ({
      getInfo: vi.fn().mockResolvedValue({ networkId: "simnet", virtualDaaScore: 100n }),
      healthCheck: vi
        .fn()
        .mockResolvedValue({ status: "healthy", info: { networkId: "simnet" } })
    }))
  };
});

describe("Hardkas SDK", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-sdk-"));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with default config", async () => {
    expect(Hardkas).toBeDefined();
  });

  it("should have modular sub-facades", async () => {
    const sdk = await Hardkas.open({ cwd: tmpDir });
    expect(sdk.accounts).toBeDefined();
    expect(sdk.tx).toBeDefined();
    expect(sdk.l2).toBeDefined();
    expect(sdk.rpc).toBeDefined();
  });
});
