import { describe, it, expect, vi, beforeEach } from "vitest";import { writeArtifact } from "./io.js";import { writeFileAtomic } from "@hardkas/core";import fs from "node:fs/promises";import path from "node:path";import { HardkasSchemas } from "@hardkas/core";vi.mock("@hardkas/core", async (importOriginal) => {  const actual = await importOriginal<typeof import("@hardkas/core")>();  return {    ...actual,    writeFileAtomic: vi.fn()  };});vi.mock("node:fs/promises", () => ({  default: {    stat: vi.fn()  }}));describe("writeArtifact", () => {  beforeEach(() => {    vi.clearAllMocks();  });  it("writes to exact file when a normal file path is provided", async () => {    (fs.stat as any).mockRejectedValue(new Error("ENOENT"));    await writeArtifact("plan.json", { planId: "123", schema: HardkasSchemas.TxPlan });    expect(writeFileAtomic).toHaveBeenCalledWith(      "plan.json",      expect.stringContaining("123")    );  });  it("auto-generates filename when an existing directory path is provided", async () => {    (fs.stat as any).mockResolvedValue({ isDirectory: () => true });    await writeArtifact("somedir", { planId: "123", schema: HardkasSchemas.TxPlan });    expect(writeFileAtomic).toHaveBeenCalledWith(      path.join("somedir", "txPlan-123.json"),      expect.stringContaining("123")    );  });  it("auto-generates filename when a non-existing path ending with a slash is provided", async () => {
    (fs.stat as any).mockRejectedValue(new Error("ENOENT"));
    await writeArtifact("somedir/", { planId: "123", schema: HardkasSchemas.TxPlan });
    expect(writeFileAtomic).toHaveBeenCalledWith(
      path.join("somedir/", "txPlan-123.json"),
      expect.stringContaining("123")
    );
  });

  it("regression: custom path writes to exact path and not to ProjectArtifactStore implicitly", async () => {
    (fs.stat as any).mockRejectedValue(new Error("ENOENT"));
    const customPath = "/tmp/payment-lab/evidence/foo.json";
    await writeArtifact(customPath, { planId: "456", schema: HardkasSchemas.TxPlan });
    expect(writeFileAtomic).toHaveBeenCalledWith(
      customPath,
      expect.stringContaining("456")
    );
    expect(writeFileAtomic).not.toHaveBeenCalledWith(
      expect.stringContaining(".hardkas"),
      expect.any(String)
    );
  });
});