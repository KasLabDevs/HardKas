import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, "../src/index.ts");
const tsx = path.resolve(__dirname, "../../../node_modules/.bin/tsx");

function runHelp(args: string = "") {
  try {
    return execSync(`"${tsx}" "${cliPath}" ${args} --help`, { encoding: "utf8" });
  } catch (e: any) {
    return e.stdout + e.stderr;
  }
}

describe("CLI Help Integrity", () => {
  it("should list all expected top-level command groups", () => {
    const help = runHelp();
    
    const expectedGroups = [
      "init",
      "up",
      "tx",
      "artifact",
      "replay",
      "snapshot",
      "rpc",
      "dag",
      "accounts",
      "l2",
      "node",
      "config",
      "example",
      "dev"
    ];

    expectedGroups.forEach(group => {
      expect(help).toContain(group);
    });
  });

  it("should list expected subcommands for 'tx'", () => {
    const help = runHelp("tx");
    const expected = ["plan", "sign", "send", "receipt", "profile", "verify"];
    expected.forEach(cmd => expect(help).toContain(cmd));
  });

  it("should list expected subcommands for 'artifact'", () => {
    const help = runHelp("artifact");
    const expected = ["verify", "explain", "lineage"];
    expected.forEach(cmd => expect(help).toContain(cmd));
  });

  it("should list expected subcommands for 'rpc'", () => {
    const help = runHelp("rpc");
    const expected = ["info", "health", "doctor", "dag", "utxos", "mempool"];
    expected.forEach(cmd => expect(help).toContain(cmd));
  });

  it("should list expected subcommands for 'dag'", () => {
    const help = runHelp("dag");
    const expected = ["status", "simulate-reorg"];
    expected.forEach(cmd => expect(help).toContain(cmd));
  });

  it("should list expected subcommands for 'accounts'", () => {
    const help = runHelp("accounts");
    const expected = ["list", "real"];
    expected.forEach(cmd => expect(help).toContain(cmd));
  });
});
