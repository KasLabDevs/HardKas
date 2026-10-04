import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readJsonFile, readJsonFileSync, stripBom } from "../src/index.js";

// PAPERCUTS-1 · the one reader for JSON files a user can hand to HardKAS: a leading UTF-8 BOM is not content.
// (New helpers: this file has no BEFORE run; the BEFORE evidence is in the callers' tests.)

describe("readJsonFile · BOM-safe JSON reads", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-read-json-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("stripBom removes exactly one leading BOM and nothing else", () => {
    expect(stripBom("﻿{}")).toBe("{}");
    expect(stripBom("{}")).toBe("{}");
    expect(stripBom("{\"a\":\"﻿\"}")).toBe("{\"a\":\"﻿\"}");
  });

  it("reads JSON with and without a BOM, sync and async", async () => {
    fs.writeFileSync(path.join(dir, "a.json"), "﻿{\"x\":1}");
    fs.writeFileSync(path.join(dir, "b.json"), "{\"x\":2}");
    expect(await readJsonFile(path.join(dir, "a.json"))).toEqual({ x: 1 });
    expect(readJsonFileSync(path.join(dir, "b.json"))).toEqual({ x: 2 });
  });

  it("keeps the errors: a missing file is ENOENT, invalid JSON is a SyntaxError", async () => {
    await expect(readJsonFile(path.join(dir, "missing.json"))).rejects.toMatchObject({ code: "ENOENT" });
    fs.writeFileSync(path.join(dir, "bad.json"), "﻿{ nope");
    expect(() => readJsonFileSync(path.join(dir, "bad.json"))).toThrow(SyntaxError);
  });
});
