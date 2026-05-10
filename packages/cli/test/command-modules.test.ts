import { describe, it, expect, vi } from "vitest";
import { Command } from "commander";

describe("Command Modules Side Effects", () => {
  it("should not execute program.parse() when importing modules", async () => {
    // We mock Command to detect if parse/parseAsync is called
    const parseSpy = vi.spyOn(Command.prototype, "parse");
    const parseAsyncSpy = vi.spyOn(Command.prototype, "parseAsync");

    // Import all modules
    await import("../src/commands/init.js");
    await import("../src/commands/tx.js");
    await import("../src/commands/artifact.js");
    await import("../src/commands/replay.js");
    await import("../src/commands/snapshot.js");
    await import("../src/commands/rpc.js");
    await import("../src/commands/dag.js");
    await import("../src/commands/accounts.js");
    await import("../src/commands/l2.js");
    await import("../src/commands/node.js");
    await import("../src/commands/config.js");
    await import("../src/commands/misc.js");

    expect(parseSpy).not.toHaveBeenCalled();
    expect(parseAsyncSpy).not.toHaveBeenCalled();
  });
});
