import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "@hardkas/sdk";
import { repoRoot, runCli, codeBlockAfter } from "./first-contact-helpers.js";

// First contact · small fixes a newcomer sees on the first screen:
//   - `accounts real generate` printed "Generated 1 real dev account(s, { cwd })";
//   - `accounts list` labelled plaintext-key accounts "(encrypted)" right under the
//     warning that their keys are stored in plaintext;
//   - the quickstart's SDK example exited 0 on failure and never said the SDK needs
//     an ES module project.

describe("First contact · CLI texts tell the truth about accounts", () => {
  let ws: string;

  beforeAll(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-fc-small-"));
    await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterAll(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("generate prints a clean summary and list labels a plaintext key as plaintext, never as encrypted", () => {
    const gen = runCli(["accounts", "real", "generate", "--name", "ana", "--unsafe-plaintext", "--yes"], ws);
    expect(gen.status, gen.out).toBe(0);
    expect(gen.out).toMatch(/Generated 1 real dev account\(s\)\s*$/m);
    expect(gen.out).not.toMatch(/\{ cwd \}/);

    const list = runCli(["accounts", "list"], ws);
    expect(list.status, list.out).toBe(0);
    const line = list.stdout.split(/\r?\n/).find((l) => /^ana\d*\s/.test(l));
    expect(line, list.stdout).toBeDefined();
    expect(line).toMatch(/\(plaintext key\)/);
    expect(line).not.toMatch(/\(encrypted\)/);
  });
});

describe("First contact · the quickstart SDK example is honest about failure and module type", () => {
  const quickstart = path.join(repoRoot, "docs", "start", "quickstart.md");

  it("the example sets a non-zero exit code when it fails", () => {
    const code = codeBlockAfter(quickstart, "## 4. SDK Workflow");
    expect(code).toMatch(/process\.exitCode = 1/);
    expect(code).not.toMatch(/\.catch\(console\.error\)/);
  });

  it("the guide says the SDK needs an ES module project", () => {
    expect(fs.readFileSync(quickstart, "utf8")).toMatch(/"type": "module"/);
  });
});
