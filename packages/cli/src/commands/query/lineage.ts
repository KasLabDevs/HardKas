import { Command } from "commander";
import { handleError } from "../../ui.js";
import { printLineageChain, printTransitions, printOrphans } from "./ui-helpers.js";

export function registerLineageQueryCommands(queryCmd: Command) {
  const lineageCmd = queryCmd.command("lineage").description("Traverse artifact lineage");

  lineageCmd
    .command("chain <anchor>")
    .description("Reconstruct lineage chain from an artifact (contentHash or artifactId)")
    .option("--direction <dir>", "Traversal direction: ancestors or descendants", "ancestors")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief|full)")
    .option("--why", "Shorthand for --explain full")
    .action(async (anchor, options) => {
      try {
        const { QueryEngine, createQueryRequest } = await import("@hardkas/query");
        const engine = await QueryEngine.create({ artifactDir: process.cwd() });

        const explain = options.why ? "full" as const
          : options.explain === true ? "brief" as const
          : (options.explain || false);

        const request = createQueryRequest({
          domain: "lineage",
          op: "chain",
          params: { anchor, direction: options.direction },
          explain
        });

        const result = await engine.execute(request);

        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printLineageChain(result as any);
        }
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  lineageCmd
    .command("transitions")
    .description("List all lineage transitions")
    .option("--root <hash>", "Filter by root artifact ID")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief|full)")
    .option("--why", "Shorthand for --explain full")
    .action(async (options) => {
      try {
        const { QueryEngine, createQueryRequest } = await import("@hardkas/query");
        const engine = await QueryEngine.create({ artifactDir: process.cwd() });

        const explain = options.why ? "full" as const
          : options.explain === true ? "brief" as const
          : (options.explain || false);

        const request = createQueryRequest({
          domain: "lineage",
          op: "transitions",
          params: options.root ? { root: options.root } : {},
          explain
        });

        const result = await engine.execute(request);

        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printTransitions(result as any);
        }
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  lineageCmd
    .command("orphans")
    .description("Find artifacts with broken lineage references")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief|full)")
    .action(async (options) => {
      try {
        const { QueryEngine, createQueryRequest } = await import("@hardkas/query");
        const engine = await QueryEngine.create({ artifactDir: process.cwd() });

        const request = createQueryRequest({
          domain: "lineage",
          op: "orphans",
          explain: options.explain === true ? "brief" : (options.explain || false)
        });

        const result = await engine.execute(request);

        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printOrphans(result as any);
        }
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });
}
