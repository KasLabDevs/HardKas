import { describe, it, expect } from "vitest";
import { doctorKaspaNode } from "../src/status";

describe("doctorKaspaNode", () => {
  it("should report binary not found for improbable path", async () => {
    const report = await doctorKaspaNode({
      network: "devnet",
      binaryPath: "/improbable/path/to/kaspad-xyz-123"
    });

    expect(report.binaryFound).toBe(false);
    expect(report.warnings.some(w => w.includes("binary not found"))).toBe(true);
  });

  it("should report data dir not exists for new path", async () => {
    const report = await doctorKaspaNode({
      network: "devnet",
      dataDir: "./non-existent-data-dir-999"
    });

    expect(report.dataDirExists).toBe(false);
    expect(report.warnings.some(w => w.includes("Data dir does not exist"))).toBe(true);
  });
});
