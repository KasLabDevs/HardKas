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
      ["chaos replay", "--isolate"],
      // ESCALÓN 2 · P19: the ones whose help did not say it, and the --allow-mainnet* flags (mainnet is blocked)
      ["chaos", "--profile"],
      ["test", "--watch"],
      ["node logs", "--follow"],
      ["tx plan", "--wait-lock"],
      ["tx sign", "--lock-timeout"],
      ["tx send", "--wait-lock"],
      ["accounts consolidate", "--allow-mainnet"]
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
    // audit 2026-11-13 B9: `fund --amount` says what each mode does (--treasury transfers exactly that amount), and the Treasury
    // is named for what it is: a public key by design, shared by every HardKAS localnet, used on simnet only
    expect(option("localnet fund", "--amount").description).toMatch(/without --treasury, mine .*with --treasury, transfer exactly this amount/);
    expect(option("localnet fund", "--treasury").description).toMatch(/Transfer exactly --amount KAS.*several.*public by design.*simnet only/);
    expect(command("localnet seed").description()).toMatch(/public by design.*simnet only/);
    expect(option("localnet start", "--seed").description).toMatch(/public by design.*simnet only/);
    // 2026-11-11 (owner): HardKAS never signs on mainnet, so `tx sign` has no flag that suggests it could
    expect(command("tx sign").options.find((o) => o.long === "--allow-mainnet-signing")).toBeUndefined();
    expect(option("tx send", "--allow-unplanned").description).toMatch(/Never on mainnet \(MAINNET_UNPLANNED_SEND_REFUSED\)/);
    // ESCALÓN 2 · P12, P17: a snapshot never declares a consensus validation; -h is the help, the host is -H
    expect(option("localnet snapshot create", "--consensus-validated").description).toMatch(/^Not supported: refused/);
    expect(option("simulator start", "--host").short).toBe("-H");
    expect(option("sandbox", "--host").short).toBe("-H");
    expect(option("simulator start", "--automine").description).toMatch(/on by default/);
    expect(option("tx send", "--yes").description).toMatch(/simulated or simnet/);
    expect(option("tx plan", "--from").description).toMatch(/default: alice/);
    // R4-T: several recipients in one transaction (tx batch --one-transaction, repeated tx plan --to <r>=<kas>)
    expect(option("tx batch", "--one-transaction").description).toMatch(/ONE transaction.*TX_BATCH_MULTIPLE_PAYERS.*TOO_MANY_OUTPUTS.*Without it, each payment is its own transaction/);
    expect(option("tx plan", "--to").description).toMatch(/default: bob.*--to <recipient>=<kas> \(no --amount\).*one transaction/);
    // R4-T (coordinator): the devnet local default is devnet's own endpoint, not the simnet one
    expect(option("tx plan", "--url").description).toMatch(/ws:\/\/127\.0\.0\.1:18210 for simnet and ws:\/\/127\.0\.0\.1:18610 for devnet/);
    expect(option("repair", "--force").description).toMatch(/only reports/);
    // R4-S: `silver test` says whose verdict it gives (the runner's SCRIPT_VM, or a node's with --on-node) and that a case
    // no real transaction reproduces is never a pass; the node-only options say they need --on-node
    expect(command("silver test").description()).toMatch(/SCRIPT_VM.*--on-node.*CONSENSUS_SIMNET.*NOT_REPRODUCIBLE, never a pass/);
    expect(option("silver test", "--on-node").description).toMatch(/real spend the case describes.*NOT_REPRODUCIBLE, never a pass/);
    for (const long of ["--network", "--url", "--from", "--timeout"]) expect(option("silver test", long).description, long).toMatch(/^With --on-node/);
  });

  it("SIM-18 · every simulator subcommand carries the simulator's maturity (experimental), fund and account create included", () => {
    expect(command("simulator fund").description()).toMatch(/synthetic/);
    const leaves = (c: Command, prefix: string): Array<[string, Command]> =>
      c.commands.length === 0 ? [[prefix, c]] : c.commands.flatMap((s) => leaves(s, `${prefix} ${s.name()}`));
    const all = leaves(command("simulator"), "simulator");
    expect(all.map(([p]) => p).sort()).toEqual(["simulator account create", "simulator fund", "simulator start"]);
    for (const [p, c] of all) {
      expect(c.description(), p).toMatch(/experimental/);
      expect(c.description(), p).not.toMatch(/\bstable\b/);
    }
  });

  it("BETA-FIX W2 · every broadcasting command's --yes says it is tx send's confirmation; verify-scripts takes a record; kcc20 transfer never charges a recipient", () => {
    const broadcasters = [
      "tx batch",
      "wallet hd send",
      "escrow fund",
      "escrow release",
      "escrow rescue-v1 broadcast",
      "kcc20 deploy",
      "kcc20 transfer",
      "silver deploy",
      "silver spend",
      "silver covenant genesis",
      "silver covenant transition",
      "silver covenant start",
      "silver covenant advance"
    ];
    for (const path of broadcasters) {
      expect(option(path, "--yes").description, path).toMatch(/^Confirm the broadcast\. Required unless the network is simulated or simnet: .*NOT EXECUTED, exit 3, TX_SEND_CONFIRMATION_REQUIRED/);
    }
    expect(option("tx send", "--yes").description).toMatch(/TX_SEND_CONFIRMATION_REQUIRED/);
    expect(option("silver test", "--yes").description).toMatch(/^With --on-node: confirm the broadcasts.*Required unless the network is simnet.*TX_SEND_CONFIRMATION_REQUIRED/);
    expect(option("zk toccata verify-scripts", "--scripts").description).toMatch(/build-scripts --json.*as 'spend --scripts' takes it.*Not with --redeem-script/);
    expect(option("zk toccata verify-scripts", "--redeem-script").mandatory).toBe(false);
    expect(option("zk toccata verify-scripts", "--redeem-script").description).toMatch(/not with --scripts/);
    expect(option("kcc20 transfer", "--funder").description).toMatch(/never a recipient's output.*token change.*own KAS coins.*KCC20_FEE_SOURCE_REQUIRED/);
    expect(command("wallet hd balance").description()).toMatch(/every address the wallet's index handed out \(zero where emptied\)/);
  });

  it("BETA-FIX W1 · `dev recover-lock` says it archives a STALE lock (evidence kept), what it refuses, and takes a required --pid", () => {
    expect(command("dev recover-lock").description()).toMatch(/Archive a STALE dev-server send-guard lock.*kept as evidence.*Refused when the lock is missing or unreadable, names another pid, or its process is alive/);
    expect(option("dev recover-lock", "--pid").mandatory).toBe(true);
    expect(option("dev recover-lock", "--json").description).toBe("Output as JSON");
  });

  it("BETA-FIX · `localnet reset` says what it stops, what it removes (this workspace's .hardkas/kaspad only), what it refuses and what it keeps", () => {
    expect(command("localnet reset").description()).toMatch(/stop the Docker toccata-v2 node and its miner and remove this workspace's chain data \(\.hardkas\/kaspad\); a running node whose chain is another workspace's is refused; dev accounts, keys and records are kept/);
    expect(option("localnet reset", "--yes").description).toMatch(/required with --json/);
  });
});
