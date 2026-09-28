import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";

// Demo-ready · E27 — `hardkas init` announced `Created: test/payment.scenario.ts` while it wrote
// `test/payment.test.ts`. Every "Created:" line init prints must name a file it created.

describe("Demo-ready · E27 · init announces what it creates", () => {
  it("every `Created: <path>` line names a file that exists, and the test file is payment.test.ts", () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-demo-ready-e27-"));
    try {
      const r = spawnSync(process.execPath, [cliDist, "init", "."], { cwd: ws, env: { ...childEnv(), NO_COLOR: "1" }, encoding: "utf8" });
      expect(r.status).toBe(0);
      const announced = [...`${r.stdout}\n${r.stderr}`.matchAll(/Created: (\S+)/g)].map((m) => m[1]!);
      expect(announced.length).toBeGreaterThanOrEqual(4);
      const missing = announced.filter((p) => !fs.existsSync(path.join(ws, p)));
      expect(missing).toEqual([]);
      expect(announced).toContain("test/payment.test.ts");
      expect(fs.existsSync(path.join(ws, "test", "payment.test.ts"))).toBe(true);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });
});
