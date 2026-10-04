import { describe, it, expect } from "vitest";
import type { Command, Option } from "commander";
import { buildHardkasProgram } from "../src/program.js";

// The --help text is the source of the generated CLI reference (docs/reference/cli.md),
// so it has to say what each command really does. These pins record help texts that
// were corrected against the code; when a behavior changes, update the text and the pin.

const program = buildHardkasProgram({ forDocs: true });

function command(path: string): Command {
  let cur: Command = program;
  for (const name of path.split(" ")) {
    const next = cur.commands.find((c) => c.name() === name);
    if (!next) throw new Error(`command not found: ${path}`);
    cur = next;
  }
  return cur;
}

function option(path: string, long: string): Option {
  const found = command(path).options.find((o) => o.long === long);
  if (!found) throw new Error(`option not found: ${path} ${long}`);
  return found;
}

describe("--help says what the CLI does", () => {
  it("marks the options that have no effect", () => {
    const noEffect: Array<[string, string]> = [
      ["init", "--template"],
      ["init", "--accounts"],
      ["test", "--mass-report"],
      ["test", "--mass-snapshot"],
      ["test", "--mass-compare"],
      ["localnet start", "--detached"],
      ["chaos", "--isolate"],
      ["chaos replay", "--isolate"]
    ];
    for (const [path, long] of noEffect) expect(option(path, long).description).toMatch(/no effect/i);

    const noJson: Array<[string, string]> = [
      ["localnet fork", "--json"],
      ["session create", "--json"]
    ];
    for (const [path, long] of noJson) expect(option(path, long).description).toMatch(/not implemented yet/i);
    // JSON-PAPERCUTS #39: `deploy track --json` prints the record now, so its help no longer disclaims it.
    expect(option("deploy track", "--json").description).toBe("Output as JSON");
  });

  it("does not advertise defaults that the code does not apply", () => {
    expect(option("init", "--template").defaultValue).toBeUndefined();
    expect(option("init", "--accounts").defaultValue).toBeUndefined();
    // "simulated" was rejected with LOCALNET_PROFILE_REQUIRED; toccata-v2 is the only profile.
    expect(option("localnet start", "--profile").defaultValue).toBeUndefined();
  });

  it("points the kaspa commands at the canonical localnet wRPC endpoint", () => {
    for (const path of ["kaspa doctor", "kaspa wallet balance", "kaspa wallet send"]) {
      expect(option(path, "--rpc-url").defaultValue).toBe("ws://127.0.0.1:18210");
    }
  });

  it("states the real scope of commands that were overstated", () => {
    expect(command("console").description()).toMatch(/simulator harness/);
    expect(command("run").description()).toMatch(/not the SDK/);
    expect(command("test").description()).not.toMatch(/localnet/);
    expect(command("rebuild").description()).toMatch(/SQLite query store/);
    expect(option("rebuild", "--from-artifacts").description).toMatch(/localnet state is not rebuilt/);
    expect(command("accounts real session-open").description()).toMatch(/nothing is recorded/);
    expect(command("kaspa wallet create").description()).toMatch(/nothing is saved/);
    expect(command("localnet fork").description()).toMatch(/current UTXOs/);
    expect(option("localnet fork", "--at-daa-score").description).toMatch(/label/);
    expect(option("tx sign", "--allow-mainnet-signing").description).toMatch(/stays refused/);
    expect(option("tx send", "--yes").description).toMatch(/simulated or simnet/);
    expect(option("tx plan", "--from").description).toMatch(/default: alice/);
    expect(option("repair", "--force").description).toMatch(/only reports/);
  });
});
