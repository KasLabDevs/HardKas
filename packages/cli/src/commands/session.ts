import { Command } from "commander";
import { UI } from "../ui.js";

export function registerSessionCommands(program: Command) {
  const sessionCmd = program
    .command("session")
    .description("L1/L2 developer identity linkage and sessions");

  sessionCmd
    .command("create <name>")
    .description(`Create a new L1/L2 session linkage ${UI.maturity("alpha")}`)
    .requiredOption("--l1 <wallet>", "Name of the Kaspa L1 wallet")
    .requiredOption("--l2 <account>", "Name of the Igra L2 account")
    .action(async (name: string, options: any) => {
      const { runSessionCreate } = await import("../runners/session-runner.js");
      await runSessionCreate(name, options);
    });

  sessionCmd
    .command("list")
    .description(`List all configured sessions ${UI.maturity("alpha")}`)
    .action(async () => {
      const { runSessionList } = await import("../runners/session-runner.js");
      await runSessionList();
    });

  sessionCmd
    .command("status")
    .description(`Show active session linkage ${UI.maturity("alpha")}`)
    .action(async () => {
      const { runSessionStatus } = await import("../runners/session-runner.js");
      await runSessionStatus();
    });

  sessionCmd
    .command("use <name>")
    .description(`Set the active session ${UI.maturity("alpha")}`)
    .action(async (name: string) => {
      const { runSessionUse } = await import("../runners/session-runner.js");
      await runSessionUse(name);
    });
}
