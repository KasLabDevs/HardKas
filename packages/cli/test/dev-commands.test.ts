import { describe, it, expect, vi } from "vitest";
import { runDevCreate } from "../src/runners/dev-create-runner.js";
import { runDevInit } from "../src/runners/dev-init-runner.js";
import { runDevDoctor } from "../src/runners/dev-doctor-runner.js";
import fs from "node:fs";
import path from "node:path";

vi.mock("node:fs");

describe("CLI dev namespace", () => {
  it("dev create refuses to overwrite existing non-empty directory", async () => {
    const targetDir = path.resolve(process.cwd(), "existing-dapp");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(["some-file.txt"] as any);

    // Reset exitCode
    process.exitCode = 0;
    await runDevCreate("existing-dapp");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0; // cleanup
  });

  it("dev init creates hardkas.config.ts and client.ts", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true); // package.json exists
    vi.mocked(fs.existsSync).mockImplementation((p: any) => p.endsWith("package.json")); // everything else doesn't
    const writeMock = vi.mocked(fs.writeFileSync);

    await runDevInit();

    expect(writeMock).toHaveBeenCalledWith(
      expect.stringContaining("hardkas.config.ts"),
      expect.stringContaining("simulated"),
      "utf-8"
    );
    expect(writeMock).toHaveBeenCalledWith(
      expect.stringContaining("client.ts"),
      expect.stringContaining("createHardkasClient"),
      "utf-8"
    );
  });

  it("dev doctor outputs stable JSON envelope when --json is passed", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runDevDoctor({ profile: "igra", json: true });

    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.schema).toBe("hardkas.devDoctor.v1");
    expect(parsed.status).toBeDefined();
    expect(parsed.checks).toBeInstanceOf(Array);
  });
});
