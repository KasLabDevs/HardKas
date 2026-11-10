// ESCALÓN 2 · P11 · `artifact create` wraps a payload under a free <type> label and validates nothing. It wrote a fixed
// `schemaValid: true`; the artifact now says `schemaValidation: "NOT_VALIDATED"`, also for a payload that matches no
// schema at all. (artifact-create.e2e.test.ts runs the same through the CLI at the e2e level.)
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runArtifactCreate } from "../src/runners/artifact-create-runner.js";

let dir = "";
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-p11-artifact-create-"));
});
afterAll(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("ESCALÓN 2 · P11 · artifact create never claims a schema validation it did not run", () => {
  it("a payload that fits no schema: schemaValidation NOT_VALIDATED, no schemaValid field", async () => {
    fs.writeFileSync(path.join(dir, "payload.json"), JSON.stringify({ anything: "goes", n: 1 }));
    vi.spyOn(console, "log").mockImplementation(() => {});
    await runArtifactCreate({ type: "hardkas.txPlan", input: "payload.json", out: "out.json", json: true, workspaceRoot: dir });
    const written = JSON.parse(fs.readFileSync(path.join(dir, "out.json"), "utf8"));
    expect(written).not.toHaveProperty("schemaValid");
    expect(written.schemaValidation).toBe("NOT_VALIDATED");
    expect(written.type).toBe("hardkas.txPlan");
    expect(written.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
