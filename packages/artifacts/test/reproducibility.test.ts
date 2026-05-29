import { systemRuntimeContext } from "@hardkas/core";
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateContentHash } from "../src/canonical.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Reproducibility Corpus", () => {
  it("should generate the exact expected hash across all platforms", async () => {
    const fixturePath = path.join(__dirname, "corpus", "tx-plan.fixture.json");
    const content = await fs.readFile(fixturePath, "utf-8");
    const parsed = JSON.parse(content);

    // We expect this exact hash string. If canonicalization or hash generation
    // diverges across OSes (due to sorting, locale, etc), this will fail.
    const hash = calculateContentHash(parsed);

    // The expected hash was pre-calculated on a reference machine.
    // Hash is SHA-256 in hex format.
    const expectedHash =
      "f17e8dd16b8056ce8ed9d32729ab4e5564042669756b6b27b242cb252735e874";

    // Test the stable hash calculation
    expect(hash).toBe(expectedHash);
  });

  it("should generate deterministic workflowId", async () => {
    const fixturePath = path.join(__dirname, "corpus", "tx-plan.fixture.json");
    const content = await fs.readFile(fixturePath, "utf-8");
    const parsed = JSON.parse(content);

    const hash = calculateContentHash(parsed);
    // workflowId is derived from the first 16 chars of the hash
    const expectedWorkflowId = "wf_" + hash.slice(0, 16);

    expect(expectedWorkflowId).toBe("wf_f17e8dd16b8056ce");
  });
});
