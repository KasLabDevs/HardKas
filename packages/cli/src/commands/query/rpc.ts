import { Command } from "commander";
import { handleError } from "../../ui.js";
import {
  printRpcHealthTimeline,
  printRpcDegradations,
  printRpcCorrelation
} from "./ui-helpers.js";
import { getQueryEngine } from "./engine-factory.js";

export function registerRpcQueryCommands(queryCmd: Command) {
  const rpcCmd = queryCmd
    .command("rpc")
    .description("Query RPC observability and health timeline");

  rpcCmd
    .command("health-timeline")
    .description("Confidence score and health state over time")
    .option("--since <time>", "ISO timestamp to start from")
    .option("--json", "Output as JSON", false)
    .option("--limit <number>", "Max events to return", "100")
    .action(async (options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();
        const limit = parseInt(options.limit, 10) || 100;
        const request = createQueryRequest({
          domain: "rpc" as unknown as any,
          op: "health-timeline",
          params: { since: options.since },
          limit
        });
        const result = await engine.execute(request);
        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printRpcHealthTimeline(
            result as unknown as Parameters<typeof printRpcHealthTimeline>[0]
          );
        }
      } catch (e) {
        throw e;
      }
    });

  rpcCmd
    .command("degradations")
    .description("Identify degradation periods")
    .option("--since <time>", "ISO timestamp to start from")
    .option("--json", "Output as JSON", false)
    .option("--limit <number>", "Max events to return", "100")
    .action(async (options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();
        const limit = parseInt(options.limit, 10) || 100;
        const request = createQueryRequest({
          domain: "rpc" as unknown as any,
          op: "degradations",
          params: { since: options.since },
          limit
        });
        const result = await engine.execute(request);
        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printRpcDegradations(
            result as unknown as Parameters<typeof printRpcDegradations>[0]
          );
        }
      } catch (e) {
        throw e;
      }
    });

  rpcCmd
    .command("correlate <txId>")
    .description("Show RPC state when a transaction was submitted")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief|full)")
    .action(async (txId, options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();
        const explain =
          options.explain === true ? ("brief" as const) : options.explain || false;
        const request = createQueryRequest({
          domain: "rpc" as unknown as any,
          op: "correlate",
          params: { txId },
          explain
        });
        const result = await engine.execute(request);
        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printRpcCorrelation(
            result as unknown as Parameters<typeof printRpcCorrelation>[0]
          );
        }
      } catch (e) {
        throw e;
      }
    });
}
