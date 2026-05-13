import { Command } from "commander";
import { handleError } from "../../ui.js";
import { printDagConflicts, printDagDisplaced, printDagHistory, printSinkPath, printDagAnomalies } from "./ui-helpers.js";

export function registerDagQueryCommands(queryCmd: Command) {
  const dagCmd = queryCmd.command("dag").description("Query simulated DAG state (deterministic-light-model, NOT GHOSTDAG)");

  dagCmd
    .command("conflicts")
    .description("Show double-spend conflict analysis")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief|full)")
    .option("--why", "Shorthand for --explain full")
    .action(async (options) => {
      try {
        const { QueryEngine, createQueryRequest } = await import("@hardkas/query");
        const engine = await QueryEngine.create({ artifactDir: process.cwd() });
        const explain = options.why ? "full" as const : options.explain === true ? "brief" as const : (options.explain || false);
        const request = createQueryRequest({ domain: "dag", op: "conflicts", explain });
        const result = await engine.execute(request);
        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else { printDagConflicts(result as any); }
      } catch (e) { handleError(e); process.exitCode = 1; }
    });

  dagCmd
    .command("displaced")
    .description("Show displaced transactions")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief|full)")
    .action(async (options) => {
      try {
        const { QueryEngine, createQueryRequest } = await import("@hardkas/query");
        const engine = await QueryEngine.create({ artifactDir: process.cwd() });
        const explain = options.explain === true ? "brief" as const : (options.explain || false);
        const request = createQueryRequest({ domain: "dag", op: "displaced", explain });
        const result = await engine.execute(request);
        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else { printDagDisplaced(result as any); }
      } catch (e) { handleError(e); process.exitCode = 1; }
    });

  dagCmd
    .command("history <txId>")
    .description("Full lifecycle of a transaction through the DAG")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief|full)")
    .option("--why", "Shorthand for --explain full")
    .action(async (txId, options) => {
      try {
        const { QueryEngine, createQueryRequest } = await import("@hardkas/query");
        const engine = await QueryEngine.create({ artifactDir: process.cwd() });
        const explain = options.why ? "full" as const : options.explain === true ? "brief" as const : (options.explain || false);
        const request = createQueryRequest({ domain: "dag", op: "history", params: { txId }, explain });
        const result = await engine.execute(request);
        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else { printDagHistory(result as any); }
      } catch (e) { handleError(e); process.exitCode = 1; }
    });

  dagCmd
    .command("sink-path")
    .description("Show current selected path from genesis to sink")
    .option("--json", "Output as JSON", false)
    .action(async (options) => {
      try {
        const { QueryEngine, createQueryRequest } = await import("@hardkas/query");
        const engine = await QueryEngine.create({ artifactDir: process.cwd() });
        const request = createQueryRequest({ domain: "dag", op: "sink-path" });
        const result = await engine.execute(request);
        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else { printSinkPath(result as any); }
      } catch (e) { handleError(e); process.exitCode = 1; }
    });

  dagCmd
    .command("anomalies")
    .description("Find transactions or blocks in unexpected states")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief|full)")
    .action(async (options) => {
      try {
        const { QueryEngine, createQueryRequest } = await import("@hardkas/query");
        const engine = await QueryEngine.create({ artifactDir: process.cwd() });
        const explain = options.explain === true ? "brief" as const : (options.explain || false);
        const request = createQueryRequest({ domain: "dag", op: "anomalies", explain });
        const result = await engine.execute(request);
        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else { printDagAnomalies(result as any); }
      } catch (e) { handleError(e); process.exitCode = 1; }
    });
}
