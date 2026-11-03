import { describe, it, expect } from "vitest";
import net from "node:net";
import { buildHardkasProgram } from "../src/program.js";
import * as cliPublic from "../src/public.js";

// -----------------------------------------------------------------------------
// SA-2 / DASHBOARD-RETIREMENT: Security test verifying that the legacy standalone
// dashboard and its Express server (port 3333) have been completely removed and
// cannot be accidentally exposed or started.
// -----------------------------------------------------------------------------

const LEGACY_PORT = 3333;

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
  });
}

describe("SA-2 · retired dashboard server is completely inaccessible and unexposed", () => {
  it("runDashboard is NOT exported by @hardkas/cli/public", () => {
    expect((cliPublic as Record<string, unknown>).runDashboard).toBeUndefined();
  });

  it("the hardkas CLI does not register a 'dashboard' command", () => {
    const program = buildHardkasProgram();
    const cmd = program.commands.find((c) => c.name() === "dashboard");
    expect(cmd).toBeUndefined();
  });

  it("legacy port 3333 is closed and no dashboard server is running", async () => {
    const open = await portOpen(LEGACY_PORT);
    expect(open).toBe(false);
  });
});
