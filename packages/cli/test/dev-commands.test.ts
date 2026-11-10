import { describe, it, expect, vi } from "vitest";
import { runDevCreate } from "../src/runners/dev-create-runner.js";
import { runDevInit } from "../src/runners/dev-init-runner.js";
import { collectWorkspaceDoctorChecks, renderWorkspaceDoctorReport } from "../src/runners/workspace-doctor-runner.js";
import fs from "node:fs";
import path from "node:path";

vi.mock("node:fs");

describe("CLI dev namespace", () => {
  it("dev create refuses to overwrite existing non-empty directory", async () => {
    const targetDir = path.resolve(process.cwd(), "existing-dapp");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(["some-file.txt"] as any);

    await expect(runDevCreate("existing-dapp")).rejects.toMatchObject({
      code: "DIR_NOT_EMPTY"
    });
  });

  // ESCALÓN 3 · P1: `dev init` now loads the config it writes with the real loader, which a mocked fs cannot do. The
  // config is checked on a real temp directory in config-commands.test.ts; here, the client stub on the mocks.
  it("dev init writes the client stub (the config is checked for real in config-commands.test.ts)", async () => {
    vi.mocked(fs.existsSync).mockImplementation((p: any) => p.endsWith("package.json") || p.endsWith("hardkas.config.ts"));
    const writeMock = vi.mocked(fs.writeFileSync);

    await runDevInit();

    expect(writeMock).not.toHaveBeenCalledWith(expect.stringContaining("hardkas.config"), expect.anything(), expect.anything());
    expect(writeMock).toHaveBeenCalledWith(
      expect.stringContaining("client.ts"),
      expect.stringContaining("createHardkasClient"),
      "utf-8"
    );
  });

  // `dev doctor` moved to the l2 extension (L2-EXT stage 2): its test is packages/ext-l2/test/dev-doctor.test.ts.
  // NEW-11: its L1 checks stayed in the core as `doctor workspace`; the same envelope test, on the same mocks.
  it("doctor workspace outputs stable JSON envelope when --json is passed", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await collectWorkspaceDoctorChecks({});
    await renderWorkspaceDoctorReport(result, {
      json: true,
      title: "Workspace Doctor",
      failureCode: "WORKSPACE_DOCTOR_FAILED",
      failureMessage: "Workspace doctor checks failed."
    });

    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.schema).toBe("hardkas.devDoctor.v1");
    expect(parsed.status).toBeDefined();
    expect(parsed.checks).toBeInstanceOf(Array);
    expect(parsed.checks.some((c: any) => /L2|Igra|EVM/.test(c.name))).toBe(false);
  });
});
