import { Command } from "commander";
import { handleError, UI } from "../ui.js";

export function registerTelemetryCommands(program: Command) {
  const telemetryCmd = program
    .command("telemetry")
    .description(
      "Inspect, verify, and monitor the canonical runtime pressure telemetry stream"
    );

  telemetryCmd
    .command("inspect")
    .description(`Deep introspection of the telemetry stream ${UI.maturity("stable")}`)
    .option("--limit <n>", "Number of recent events to display", "5")
    .action(async (options: { limit: string }) => {
      try {
        const { runTelemetryInspect } = await import("../runners/telemetry-runners.js");
        await runTelemetryInspect(options);
      } catch (e) {
        throw e;
      }
    });

  telemetryCmd
    .command("verify")
    .description(
      `Verify schema integrity conforming to Telemetry Source Contract v1 ${UI.maturity("stable")}`
    )
    .action(async () => {
      try {
        const { runTelemetryVerify } = await import("../runners/telemetry-runners.js");
        await runTelemetryVerify();
      } catch (e) {
        throw e;
      }
    });

  telemetryCmd
    .command("tail")
    .description(`Real-time monitor of the telemetry stream ${UI.maturity("stable")}`)
    .option("-f, --follow", "Keep checking for incoming telemetry events", false)
    .option("-n, --lines <n>", "Number of initial lines to tail", "20")
    .action(async (options: { follow: boolean; lines: string }) => {
      try {
        const { runTelemetryTail } = await import("../runners/telemetry-runners.js");
        await runTelemetryTail(options);
      } catch (e) {
        throw e;
      }
    });
}
