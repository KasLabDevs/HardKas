// The l2 command modules moved from packages/cli with L2-EXT stage 2; same side-effect check as the core's
// command-modules.test.ts, plus the extension entry itself.
import { describe, it, expect, vi } from "vitest";
import { Command } from "commander";

describe("Command Modules Side Effects (l2 extension)", () => {
  it("should not execute program.parse() when importing modules", async () => {
    const parseSpy = vi.spyOn(Command.prototype, "parse");
    const parseAsyncSpy = vi.spyOn(Command.prototype, "parseAsync");

    await import("../src/commands/l2.js");
    await import("../src/commands/local.js");
    await import("../src/commands/metamask.js");
    await import("../src/commands/doctor.js");
    await import("../src/extension.js");

    expect(parseSpy).not.toHaveBeenCalled();
    expect(parseAsyncSpy).not.toHaveBeenCalled();
  });
});
