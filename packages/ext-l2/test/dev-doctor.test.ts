// Moved from packages/cli/test/dev-commands.test.ts with `dev doctor` (L2-EXT stage 2, D6): the runner is the
// extension's (`l2 doctor`, alias `dev doctor`). Same test, same mocks.
import { describe, it, expect, vi } from "vitest";
import { runDevDoctor } from "../src/runners/dev-doctor-runner.js";

vi.mock("node:fs");

describe("CLI dev namespace", () => {
  it("dev doctor outputs stable JSON envelope when --json is passed", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runDevDoctor({ profile: "local", json: true });

    const output = logSpy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.schema).toBe("hardkas.devDoctor.v1");
    expect(parsed.status).toBeDefined();
    expect(parsed.checks).toBeInstanceOf(Array);
  });
});
