import { describe, test, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { AppendCoordinator } from "../src/append-coordinator.js";

describe("AppendCoordinator Tail Recovery Safety Tests", () => {
  let tmpDir: string;
  let testFile: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-tail-safety-"));
    testFile = path.join(tmpDir, "events.jsonl");
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("valid JSONL record larger than 4KB and 64KB survives recovery completely untouched", () => {
    // Generate a valid JSON line of ~100KB
    const largeObj = {
      id: "large-event",
      data: "a".repeat(100 * 1024), // 100KB
      schema: "hardkas.event"
    };
    const line = JSON.stringify(largeObj) + "\n";
    fs.writeFileSync(testFile, line, "utf-8");

    const sizeBefore = fs.statSync(testFile).size;
    const recovery = AppendCoordinator.recoverCorruptedTail(testFile);

    expect(recovery.repaired).toBe(false);
    expect(recovery.linesDiscarded).toBe(0);
    expect(fs.statSync(testFile).size).toBe(sizeBefore);

    // Make sure we can read and parse it back
    const content = fs.readFileSync(testFile, "utf-8");
    const parsed = JSON.parse(content.trim());
    expect(parsed.id).toBe("large-event");
    expect(parsed.data.length).toBe(100 * 1024);
  });

  test("corrupted partial tail written after a large valid line is correctly repaired and truncated exactly", () => {
    // Large valid line
    const largeObj = {
      id: "large-event-2",
      data: "b".repeat(80 * 1024), // 80KB
      schema: "hardkas.event"
    };
    const line = JSON.stringify(largeObj) + "\n";

    // Write valid line and then a partial corrupted line
    fs.writeFileSync(testFile, line, "utf-8");
    const validSize = fs.statSync(testFile).size;

    // hardkas-append-allow
    fs.appendFileSync(testFile, '{"broken": "yes", \n'); // malformed and incomplete

    const recovery = AppendCoordinator.recoverCorruptedTail(testFile);

    expect(recovery.repaired).toBe(true);
    expect(recovery.linesDiscarded).toBeGreaterThan(0);
    expect(fs.statSync(testFile).size).toBe(validSize); // exactly truncated back to valid size!

    // Verify valid line still parses cleanly
    const content = fs.readFileSync(testFile, "utf-8");
    const parsed = JSON.parse(content.trim());
    expect(parsed.id).toBe("large-event-2");
  });

  test("file only containing newlines or whitespaces is safely truncated to 0", () => {
    fs.writeFileSync(testFile, "\n   \n\n  \n", "utf-8");
    const recovery = AppendCoordinator.recoverCorruptedTail(testFile);
    expect(recovery.repaired).toBe(true);
    expect(fs.statSync(testFile).size).toBe(0);
  });
});
