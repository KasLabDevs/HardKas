import { describe, it, expect } from "vitest";
import { execa } from "execa";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, "../dist/index.js");

describe("CLI Surface Hardening", () => {
  it("should not leak deprecated or experimental commands in the public help menu", { timeout: 30000 }, async () => {
    const { stdout } = await execa("node", [cliPath, "--help"]);

    // Extract the commands section
    const commandsMatch = stdout.match(/Commands:\n([\s\S]*)/);
    expect(commandsMatch).toBeTruthy();

    const commandsSection = commandsMatch![1];

    // Parse the command names (first word on each line that starts with spaces)
    const topLevelCommands = commandsSection
      .split("\n")
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.length > 0 &&
          !line.startsWith("-") &&
          !line.includes("Options:") &&
          !line.includes("display help")
      )
      .map((line) => line.split(" ")[0]);

    const hiddenCommands = [
      "new",
      "snapshot", // snapshot must not be top-level
      "faucet",
      "networks",
      "l2",
      "bridge",
      "metamask",
      "session",
      "capabilities"
    ];

    for (const cmd of hiddenCommands) {
      expect(topLevelCommands).not.toContain(cmd);
    }
  });

  it("should have snapshot successfully nested under localnet", { timeout: 30000 }, async () => {
    const { stdout } = await execa("node", [cliPath, "localnet", "--help"]);
    expect(stdout).toContain("snapshot");
  });

  it(
    "should completely reject physically deleted legacy aliases",
    { timeout: 60000 },
    async () => {
      const deletedCommands = ["new", "snapshot", "faucet", "networks"];

      for (const cmd of deletedCommands) {
        const { stderr, exitCode } = await execa("node", [cliPath, cmd], {
          reject: false
        });
        expect(exitCode).toBe(1);
        expect(stderr).toContain(`error: unknown command '${cmd}'`);
      }
    }
  );
});
