import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { writeFileAtomic, writeFileAtomicSync } from "../src/fs.js";

describe("writeFileAtomic Invariant Tests", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-atomic-test-"));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe("Async writeFileAtomic", () => {
    it("should write a new file successfully", async () => {
      const target = path.join(testDir, "new.txt");
      await writeFileAtomic(target, "hello");
      expect(fs.readFileSync(target, "utf-8")).toBe("hello");
    });

    it("should survive an interrupted write (old file survives)", async () => {
      const target = path.join(testDir, "survive.txt");
      fs.writeFileSync(target, "original content");

      // Mock fs.writeSync to throw mid-way
      const spy = vi.spyOn(fs, "writeSync").mockImplementationOnce(() => {
        throw new Error("Disk Full Simulation");
      });

      await expect(writeFileAtomic(target, "new content")).rejects.toThrow(/Failed to write file atomically/);
      
      // Original file MUST still be there and intact
      expect(fs.readFileSync(target, "utf-8")).toBe("original content");
      
      spy.mockRestore();
    });

    it("should never leave partial temp files as canonical if rename fails", async () => {
      const target = path.join(testDir, "partial.txt");
      
      // Mock fs.renameSync to fail
      const spy = vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
        throw new Error("Access Denied Simulation");
      });

      await expect(writeFileAtomic(target, "content")).rejects.toThrow(/Failed to write file atomically/);
      
      expect(fs.existsSync(target)).toBe(false);
      
      spy.mockRestore();
    });

    it("should cleanup temp files in all cases", async () => {
      const target = path.join(testDir, "cleanup.txt");
      
      // Successful case
      await writeFileAtomic(target, "success");
      const filesAfterSuccess = fs.readdirSync(testDir);
      expect(filesAfterSuccess).toHaveLength(1); // Only the target file
      expect(filesAfterSuccess[0]).toBe("cleanup.txt");

      // Failure case
      const spy = vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
        throw new Error("Cleanup Test Error");
      });
      
      await expect(writeFileAtomic(target, "fail")).rejects.toThrow();
      const filesAfterFailure = fs.readdirSync(testDir);
      expect(filesAfterFailure).toHaveLength(1); // Still only the previous target file
      expect(filesAfterFailure[0]).toBe("cleanup.txt");
      
      spy.mockRestore();
    });
  });

  describe("Sync writeFileAtomicSync", () => {
    it("should write a new file successfully", () => {
      const target = path.join(testDir, "new_sync.txt");
      writeFileAtomicSync(target, "hello sync");
      expect(fs.readFileSync(target, "utf-8")).toBe("hello sync");
    });

    it("should survive an interrupted write (old file survives)", () => {
      const target = path.join(testDir, "survive_sync.txt");
      fs.writeFileSync(target, "original sync");

      const spy = vi.spyOn(fs, "writeSync").mockImplementationOnce(() => {
        throw new Error("Sync Disk Full");
      });

      expect(() => writeFileAtomicSync(target, "new sync")).toThrow(/Failed to write file atomically/);
      expect(fs.readFileSync(target, "utf-8")).toBe("original sync");
      
      spy.mockRestore();
    });

    it("should cleanup temp files in all cases", () => {
      const target = path.join(testDir, "cleanup_sync.txt");
      
      writeFileAtomicSync(target, "success");
      expect(fs.readdirSync(testDir)).toHaveLength(1);

      const spy = vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
        throw new Error("Sync Cleanup Error");
      });
      
      expect(() => writeFileAtomicSync(target, "fail")).toThrow();
      expect(fs.readdirSync(testDir)).toHaveLength(1);
      
      spy.mockRestore();
    });
  });
});
