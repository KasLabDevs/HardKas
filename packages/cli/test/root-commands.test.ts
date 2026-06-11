import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Root Operational Commands", () => {
  let tmpDir: string;
  let bin: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-root-tests-"));
    // Write minimal config
    fs.writeFileSync(
      path.join(tmpDir, "hardkas.config.js"),
      `
      module.exports = { default: { network: "simulated" } };
    `
    );

    // Set up workflow
    fs.mkdirSync(path.join(tmpDir, "examples/workflows"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "examples/workflows/demo-transfer.json"),
      JSON.stringify({
        steps: [{ type: "network.switch", args: { network: "simulated" } }]
      })
    );

    // Find the CLI binary
    bin = path.resolve(__dirname, "../dist/index.js");
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function run(args: string[]): { stdout: string; stderr: string; status: number } {
    try {
      const output = execSync(`node ${bin} ${args.join(" ")}`, {
        cwd: tmpDir,
        encoding: "utf-8",
        stdio: "pipe"
      });
      return { stdout: output, stderr: "", status: 0 };
    } catch (e: unknown) {
      return {
        stdout: ((e as any).stdout)?.toString() || "",
        stderr: ((e as any).stderr)?.toString() || "",
        status: e.status || 1
      };
    }
  }

  it("hardkas doctor --json emits parseable deterministic JSON", () => {
    const res = run(["doctor", "--json"]);
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.summary).toBeDefined();
    expect(parsed.checks).toBeInstanceOf(Array);
  });

  it("workflow run resolves implicit name and emits JSON", () => {
    const res = run(["workflow", "run", "demo-transfer", "--dry-run", "--json"]);
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.status).toBe("completed");
    expect(parsed.workflowId).toBeDefined();
  });

  it("hardkas rebuild --from-artifacts --json returns success on empty workspace", () => {
    const res = run(["rebuild", "--from-artifacts", "--json"]);
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.artifacts.indexed).toBeDefined();
  });

  it("hardkas rebuild without --from-artifacts fails with usage error", () => {
    const res = run(["rebuild"]);
    // USAGE_ERROR is mapped to exit code 2
    expect(res.status).toBe(2);
  });

  it("hardkas verify --deep --json validates the workspace", () => {
    const res = run(["verify", "--deep", "--json"]);
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    // Should pass since it's an empty workspace or has no corruptions
    expect(parsed.ok).toBe(true);
  });
});
