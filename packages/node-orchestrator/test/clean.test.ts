import { describe, it, expect } from "vitest";
import { cleanKaspaNodeData } from "../src/process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

describe("cleanKaspaNodeData", () => {
  it("should delete dataDir if not running", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-clean-test-"));
    const dataDir = path.join(tempDir, "nodes", "devnet");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "dummy.txt"), "hello");

    expect(fs.existsSync(dataDir)).toBe(true);

    await cleanKaspaNodeData({
      network: "devnet",
      dataDir: dataDir
    });

    expect(fs.existsSync(dataDir)).toBe(false);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
