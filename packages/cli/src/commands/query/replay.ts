import { Command } from "commander";
import { handleError } from "../../ui.js";
import { printReplayList, printReplaySummary, printDivergences, printInvariants } from "./ui-helpers.js";

export function registerReplayQueryCommands(queryCmd: Command) {
  const replayCmd = queryCmd.command("replay").description("Inspect replay history and divergence");

  replayCmd
    .command("list")
    .description("List all stored receipts")
    .option("--status <status>", "Filter by status")
    .option("--json", "Output as JSON", false)
    .option("--limit <n>", "Max results", "100")
    .action(async (options) => {
      try {
        const { QueryEngine, createQueryRequest } = await import("@hardkas/query");
        const engine = await QueryEngine.create({ artifactDir: process.cwd() });
        const filters: Array<{ field: string; op: "eq"; value: string }> = [];
        if (options.status) filters.push({ field: "status", op: "eq", value: options.status });

        const request = createQueryRequest({ domain: "replay", op: "list", filters, limit: parseInt(options.limit, 10) });
        const result = await engine.execute(request);

        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printReplayList(result as any);
        }
      } catch (e) { handleError(e); process.exitCode = 1; }
    });

  replayCmd
    .command("summary <txId>")
    .description("Detailed receipt + trace summary for a transaction")
    .option("--json", "Output as JSON", false)
    .action(async (txId, options) => {
      try {
        const { QueryEngine, createQueryRequest } = await import("@hardkas/query");
        const engine = await QueryEngine.create({ artifactDir: process.cwd() });

        const request = createQueryRequest({ domain: "replay", op: "summary", params: { txId } });
        const result = await engine.execute(request);

        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printReplaySummary(result as any);
        }
      } catch (e) { handleError(e); process.exitCode = 1; }
    });

  replayCmd
    .command("divergences")
    .description("Detect receipts with replay divergence indicators")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief|full)")
    .action(async (options) => {
      try {
        const { QueryEngine, createQueryRequest } = await import("@hardkas/query");
        const engine = await QueryEngine.create({ artifactDir: process.cwd() });

        const request = createQueryRequest({
          domain: "replay", op: "divergences",
          explain: options.explain === true ? "brief" : (options.explain || false)
        });
        const result = await engine.execute(request);

        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printDivergences(result as any);
        }
      } catch (e) { handleError(e); process.exitCode = 1; }
    });

  replayCmd
    .command("invariants <txId>")
    .description("Check replay invariants for a specific transaction")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief|full)")
    .action(async (txId, options) => {
      try {
        const { QueryEngine, createQueryRequest } = await import("@hardkas/query");
        const engine = await QueryEngine.create({ artifactDir: process.cwd() });

        const request = createQueryRequest({
          domain: "replay", op: "invariants", params: { txId },
          explain: options.explain === true ? "brief" : (options.explain || false)
        });
        const result = await engine.execute(request);

        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printInvariants(result as any);
        }
      } catch (e) { handleError(e); process.exitCode = 1; }
    });
}
