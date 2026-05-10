import { Command } from "commander";
import { handleError } from "../../ui.js";
import { printArtifactList, printInspectResult, printDiffResult } from "./ui-helpers.js";

export function registerArtifactQueryCommands(queryCmd: Command) {
  const artifactsCmd = queryCmd.command("artifacts").description("Query artifact store");

  artifactsCmd
    .command("list")
    .description("List artifacts matching filters")
    .option("--schema <schema>", "Filter by artifact schema (e.g. txPlan, signedTx)")
    .option("--network <network>", "Filter by network ID")
    .option("--mode <mode>", "Filter by mode (simulated/real)")
    .option("--from <address>", "Filter by sender address")
    .option("--to <address>", "Filter by recipient address")
    .option("--sort <field:dir>", "Sort field and direction (e.g. createdAt:desc)")
    .option("--limit <n>", "Max results", "100")
    .option("--json", "Output as deterministic JSON", false)
    .option("--explain [level]", "Attach explain chains (brief|full)")
    .action(async (options) => {
      try {
        const { QueryEngine, createQueryRequest } = await import("@hardkas/query");
        const engine = await QueryEngine.create({ artifactDir: process.cwd() });

        const filters: Array<{ field: string; op: "eq"; value: string }> = [];
        if (options.schema) filters.push({ field: "schema", op: "eq", value: `hardkas.${options.schema}` });
        if (options.network) filters.push({ field: "networkId", op: "eq", value: options.network });
        if (options.mode) filters.push({ field: "mode", op: "eq", value: options.mode });
        if (options.from) filters.push({ field: "from.address", op: "eq", value: options.from });
        if (options.to) filters.push({ field: "to.address", op: "eq", value: options.to });

        let sort: { field: string; direction: "asc" | "desc" } | undefined;
        if (options.sort) {
          const [field, dir] = options.sort.split(":");
          sort = { field: field!, direction: (dir === "asc" ? "asc" : "desc") };
        }

        const request = createQueryRequest({
          domain: "artifacts",
          op: "list",
          filters,
          sort,
          limit: parseInt(options.limit, 10),
          explain: options.explain === true ? "brief" : (options.explain || false)
        });

        const result = await engine.execute(request);

        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printArtifactList(result as any);
        }
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  artifactsCmd
    .command("inspect <target>")
    .description("Deep structural analysis of an artifact (path or contentHash)")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief|full)")
    .action(async (target, options) => {
      try {
        const { QueryEngine, createQueryRequest } = await import("@hardkas/query");
        const engine = await QueryEngine.create({ artifactDir: process.cwd() });

        const request = createQueryRequest({
          domain: "artifacts",
          op: "inspect",
          params: { target },
          explain: options.explain === true ? "brief" : (options.explain || false)
        });

        const result = await engine.execute(request);

        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printInspectResult(result as any);
        }
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  artifactsCmd
    .command("diff <left> <right>")
    .description("Semantic diff between two artifacts")
    .option("--json", "Output as JSON", false)
    .action(async (left, right, options) => {
      try {
        const { QueryEngine, createQueryRequest } = await import("@hardkas/query");
        const engine = await QueryEngine.create({ artifactDir: process.cwd() });

        const request = createQueryRequest({
          domain: "artifacts",
          op: "diff",
          params: { left, right }
        });

        const result = await engine.execute(request);

        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printDiffResult(result as any);
        }
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  artifactsCmd
    .command("verify <target>")
    .description("Full structural and semantic verification")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief|full)")
    .action(async (target, options) => {
      try {
        const { QueryEngine, createQueryRequest } = await import("@hardkas/query");
        const engine = await QueryEngine.create({ artifactDir: process.cwd() });

        const request = createQueryRequest({
          domain: "artifacts",
          op: "verify",
          params: { target },
          explain: options.explain === true ? "brief" : (options.explain || false)
        });

        const result = await engine.execute(request);

        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printInspectResult(result as any); // verify returns a similar structure to inspect
        }
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });
}
