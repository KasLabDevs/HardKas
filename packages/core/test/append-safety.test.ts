import { describe, it, expect } from "vitest";
import { AppendCoordinator } from "../src/append-coordinator.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

describe("Append Safety & Tail Corruption Recovery", () => {
  it("should perform coordinated appends atomically", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-append-test-"));
    const logFile = path.join(tempDir, "test.jsonl");

    // Write a few lines using AppendCoordinator
    const line1 = JSON.stringify({ event: "foo", val: 1 });
    const line2 = JSON.stringify({ event: "bar", val: 2 });

    AppendCoordinator.appendAtomic(logFile, line1, tempDir);
    AppendCoordinator.appendAtomic(logFile, line2, tempDir);

    expect(fs.existsSync(logFile)).toBe(true);
    const content = fs.readFileSync(logFile, "utf-8").trim();
    const lines = content.split("\n");

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual({ event: "foo", val: 1 });
    expect(JSON.parse(lines[1]!)).toEqual({ event: "bar", val: 2 });

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should detect and repair a corrupted trailing line", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-corruption-test-"));
    const logFile = path.join(tempDir, "test.jsonl");

    // 1. Write clean lines
    const line1 = JSON.stringify({ event: "foo" });
    const line2 = JSON.stringify({ event: "bar" });
    fs.writeFileSync(logFile, `${line1}\n${line2}\n`);

    // 2. Append half-written JSON (corrupted tail)
    fs.appendFileSync(logFile, `{"event": "broken", `); // malformed line

    // 3. Scan and repair
    const repairResult = AppendCoordinator.recoverCorruptedTail(logFile);
    expect(repairResult.repaired).toBe(true);
    expect(repairResult.linesDiscarded).toBe(20);

    // 4. Verify repaired file contents
    const content = fs.readFileSync(logFile, "utf-8").trim();
    const lines = content.split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual({ event: "foo" });
    expect(JSON.parse(lines[1]!)).toEqual({ event: "bar" });

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
