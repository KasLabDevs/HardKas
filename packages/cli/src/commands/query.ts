import { Command } from "commander";
import { handleError, UI } from "../ui.js";
import pc from "picocolors";

export function registerQueryCommands(program: Command) {
  const queryCmd = program.command("query").description("Query and introspect HardKAS artifacts, lineage, and workflows");

  // =========================================================================
  // hardkas query artifacts
  // =========================================================================

  const artifactsCmd = queryCmd.command("artifacts").description(`Query artifact store ${UI.maturity("stable")}`);

  // =========================================================================
  // hardkas query store
  // =========================================================================

  const storeCmd = queryCmd.command("store").description(`Manage query store index ${UI.maturity("stable")}`);

  storeCmd
    .command("doctor")
    .description("Integrity and freshness check of the query store index")
    .option("--migrate", "Apply pending migrations if found", false)
    .option("--wait-lock", "Wait for workspace lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .action(async (options) => {
      const { withLock } = await import("@hardkas/core");
      const { handleLockError } = await import("../ui.js");
      try {
        const action = async () => {
          const engine = await getQueryEngine();
          
          if (options.migrate) {
             console.log("\n  Checking and applying migrations...");
             await engine.backend.migrate();
          }

          const report = await engine.backend.doctor();
          
          console.log("\n  ═══ Query Store Doctor ═══\n");
          console.log(`  Backend:      ${engine.backend.kind()}`);
          console.log(`  Overall:      ${report.ok ? pc.green("✓ HEALTHY") : pc.red("✗ STALE / ISSUES")}`);
          console.log(`  Last Indexed: ${report.lastIndexedAt || "never"}`);
          
          if (report.storeIssues && report.storeIssues.length > 0) {
            console.log("\n  Store Issues:");
            for (const issue of report.storeIssues) {
              const icon = issue.severity === "error" ? pc.red("✗") : pc.yellow("⚠");
              console.log(`    ${icon} [${issue.code}] ${issue.message}`);
              if (issue.suggestion) console.log(`      Suggestion: ${issue.suggestion}`);
            }
          }
          
          if (report.corruptedFiles?.length > 0) {
            console.log("\n  Corrupted Files:");
            for (const f of report.corruptedFiles) console.log(`    ${pc.red("✗")} ${f}`);
          }
          
          if (!report.ok) {
            const cmd = report.storeIssues?.some((i: any) => i.code.includes("MIGRATION")) ? "migrate" : "rebuild";
            console.log(`\n  ${UI.warning("Recommendation:")} Run 'hardkas query store ${cmd}' to fix issues.\n`);
            process.exitCode = 1;
          } else {
            console.log("\n  ✓ Everything looks good.\n");
          }
        };

        if (options.migrate) {
          await withLock({
            rootDir: process.cwd(),
            name: "query-store",
            command: "hardkas query store doctor --migrate",
            wait: options.waitLock,
            timeoutMs: parseInt(options.lockTimeout)
          }, action);
        } else {
          await action();
        }
      } catch (e) { handleLockError(e); process.exitCode = 1; }
    });

  storeCmd
    .command("migrate")
    .description("Apply pending schema migrations to the query store")
    .option("--wait-lock", "Wait for workspace lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .action(async (options) => {
      const { withLock } = await import("@hardkas/core");
      const { handleLockError } = await import("../ui.js");
      try {
        await withLock({
          rootDir: process.cwd(),
          name: "query-store",
          command: "hardkas query store migrate",
          wait: options.waitLock,
          timeoutMs: parseInt(options.lockTimeout)
        }, async () => {
          console.log("\n  Checking for pending migrations...");
          const engine = await getQueryEngine();
          const result = await engine.backend.migrate();
          
          if (result.applied > 0) {
            UI.success(`Applied ${result.applied} migration(s). Store is up to date.`);
          } else {
            UI.info("No pending migrations found. Store is already up to date.");
          }
          console.log("");
        });
      } catch (e) { handleLockError(e); process.exitCode = 1; }
    });

  storeCmd
    .command("sync")
    .alias("index")
    .description("Synchronize the filesystem artifacts with the query store index")
    .option("--strict", "Fail on any corrupted data", false)
    .option("--wait-lock", "Wait for workspace lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .option("--json", "Output as JSON", false)
    .action(async (options) => {
      const { withLock } = await import("@hardkas/core");
      const { handleLockError } = await import("../ui.js");
      try {
        await withLock({
          rootDir: process.cwd(),
          name: "query-store",
          command: "hardkas query store sync",
          wait: options.waitLock,
          timeoutMs: parseInt(options.lockTimeout)
        }, async () => {
          if (!options.json) console.log("\n  Synchronizing query store index...");
          const engine = await getQueryEngine();
          const start = Date.now();
          const result = await engine.backend.sync({ strict: options.strict });
          
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            const elapsed = Date.now() - start;
            console.log(`  ✓ Index synchronized in ${elapsed}ms.`);
            console.log(`\n  Artifacts: ${result.artifacts.indexed}/${result.artifacts.scanned} indexed (${result.artifacts.corrupted} corrupted)`);
            console.log(`  Events:    ${result.events.indexed}/${result.events.scanned} indexed (${result.events.corrupted} corrupted)`);
            
            if (result.issues && result.issues.length > 0) {
              console.log("\n  Issues Found:");
              for (const issue of result.issues.slice(0, 10)) {
                console.log(`    ${issue.severity === "error" ? pc.red("✗") : pc.yellow("⚠")} [${issue.code}] ${issue.message}`);
                if (issue.path) console.log(`      At: ${issue.path}${issue.lineNumber ? ":" + issue.lineNumber : ""}`);
              }
              if (result.issues.length > 10) console.log(`    ... and ${result.issues.length - 10} more.`);
            }

            if (!result.ok) {
               console.log(`\n  ${UI.error("Synchronization encountered corruption.")} Use --strict for fail-fast behavior.`);
               process.exitCode = 1;
            }
            console.log("");
          }
        });
      } catch (e) { handleLockError(e); process.exitCode = 1; }
    });

  storeCmd
    .command("rebuild")
    .description("Force a complete rebuild of the query store index")
    .option("--strict", "Fail on any corrupted data", false)
    .option("--wait-lock", "Wait for workspace lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .option("--json", "Output as JSON", false)
    .action(async (options) => {
      const { withLock } = await import("@hardkas/core");
      const { handleLockError } = await import("../ui.js");
      try {
        await withLock({
          rootDir: process.cwd(),
          name: "query-store",
          command: "hardkas query store rebuild",
          wait: options.waitLock,
          timeoutMs: parseInt(options.lockTimeout)
        }, async () => {
          if (!options.json) console.log("\n  Rebuilding query store index...");
          const engine = await getQueryEngine();
          const start = Date.now();
          const result = await engine.backend.rebuild({ strict: options.strict });
          
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            const elapsed = Date.now() - start;
            console.log(`  ✓ Index rebuilt successfully in ${elapsed}ms.`);
            console.log(`\n  Artifacts: ${result.artifacts.indexed}/${result.artifacts.scanned} indexed (${result.artifacts.corrupted} corrupted)`);
            console.log(`  Events:    ${result.events.indexed}/${result.events.scanned} indexed (${result.events.corrupted} corrupted)`);
            
            if (result.issues && result.issues.length > 0) {
              console.log("\n  Corruption Issues:");
              for (const issue of result.issues.slice(0, 10)) {
                console.log(`    ${issue.severity === "error" ? pc.red("✗") : pc.yellow("⚠")} [${issue.code}] ${issue.message}`);
                if (issue.path) console.log(`      At: ${issue.path}${issue.lineNumber ? ":" + issue.lineNumber : ""}`);
              }
              if (result.issues.length > 10) console.log(`    ... and ${result.issues.length - 10} more.`);
            }
            
            if (!result.ok) {
              console.log(`\n  ${UI.error("Rebuild failed or encountered corruption.")} Use --strict for fail-fast behavior.`);
              process.exitCode = 1;
            }
            console.log("");
          }
        });
      } catch (e) { handleLockError(e); process.exitCode = 1; }
    });

  storeCmd
    .command("sql <query>")
    .description("Run a raw SQL query against the query store")
    .option("--json", "Output as JSON", false)
    .action(async (query: string, options) => {
      try {
        const engine = await getQueryEngine();
        // This requires the backend to expose raw SQL execution, 
        // but for now we'll assume it can or we'll add it.
        if (typeof (engine.backend as any).executeRawSql !== "function") {
           throw new Error("Raw SQL execution not supported by current backend");
        }
        const result = await (engine.backend as any).executeRawSql(query);
        
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          if (result.length === 0) {
            console.log("\n  No results.\n");
          } else {
            console.table(result);
          }
        }
      } catch (e) { handleError(e); process.exitCode = 1; }
    });

  storeCmd
    .command("export")
    .description("Export logical store state to JSON")
    .option("--output <path>", "Output file path")
    .action(async (options) => {
      try {
        const { HardkasStore } = await import("@hardkas/query-store");
        const store = new HardkasStore();
        store.connect({ autoMigrate: true });
        const db = store.getDatabase();
        
        const artifacts = db.prepare("SELECT * FROM artifacts ORDER BY artifact_id ASC").all();
        const events = db.prepare("SELECT * FROM events ORDER BY event_id ASC").all();
        
        const dump = { artifacts, events };
        const json = JSON.stringify(dump, null, 2);
        
        if (options.output) {
          const fs = await import("node:fs");
          fs.writeFileSync(options.output, json);
          UI.success(`Store exported to ${options.output}`);
        } else {
          console.log(json);
        }
        store.disconnect();
      } catch (e) { handleError(e); process.exitCode = 1; }
    });

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
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

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
          printArtifactList(result);
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
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

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
          printInspectResult(result);
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
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

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
          printDiffResult(result);
        }
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  // =========================================================================
  // hardkas query lineage
  // =========================================================================

  const lineageCmd = queryCmd.command("lineage").description(`Traverse artifact lineage ${UI.maturity("stable")}`);

  lineageCmd
    .command("chain <anchor>")
    .description("Reconstruct lineage chain from an artifact (contentHash or artifactId)")
    .option("--direction <dir>", "Traversal direction: ancestors or descendants", "ancestors")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief|full)")
    .option("--why", "Shorthand for --explain full")
    .action(async (anchor, options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

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
          printLineageChain(result);
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
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

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
          printTransitions(result);
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
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

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
          printOrphans(result);
        }
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });
  // =========================================================================
  // hardkas query replay
  // =========================================================================

  const replayCmd = queryCmd.command("replay").description(`Inspect replay history and divergence ${UI.maturity("stable")}`);

  replayCmd
    .command("list")
    .description("List all stored receipts")
    .option("--status <status>", "Filter by status")
    .option("--json", "Output as JSON", false)
    .option("--limit <n>", "Max results", "100")
    .action(async (options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();
        const filters: Array<{ field: string; op: "eq"; value: string }> = [];
        if (options.status) filters.push({ field: "status", op: "eq", value: options.status });

        const request = createQueryRequest({ domain: "replay", op: "list", filters, limit: parseInt(options.limit, 10) });
        const result = await engine.execute(request);

        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printReplayList(result);
        }
      } catch (e) { handleError(e); process.exitCode = 1; }
    });

  replayCmd
    .command("summary <txId>")
    .description("Detailed receipt + trace summary for a transaction")
    .option("--json", "Output as JSON", false)
    .action(async (txId, options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

        const request = createQueryRequest({ domain: "replay", op: "summary", params: { txId } });
        const result = await engine.execute(request);

        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printReplaySummary(result);
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
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

        const request = createQueryRequest({
          domain: "replay", op: "divergences",
          explain: options.explain === true ? "brief" : (options.explain || false)
        });
        const result = await engine.execute(request);

        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printDivergences(result);
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
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

        const request = createQueryRequest({
          domain: "replay", op: "invariants", params: { txId },
          explain: options.explain === true ? "brief" : (options.explain || false)
        });
        const result = await engine.execute(request);

        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printInvariants(result);
        }
      } catch (e) { handleError(e); process.exitCode = 1; }
    });

  // =========================================================================
  // hardkas query dag
  // =========================================================================

  const dagCmd = queryCmd.command("dag").description(`Query simulated DAG state ${UI.maturity("research")}`);

  dagCmd
    .command("conflicts")
    .description("Show double-spend conflict analysis")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief|full)")
    .option("--why", "Shorthand for --explain full")
    .action(async (options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();
        const explain = options.why ? "full" as const : options.explain === true ? "brief" as const : (options.explain || false);
        const request = createQueryRequest({ domain: "dag", op: "conflicts", explain });
        const result = await engine.execute(request);
        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else { printDagConflicts(result); }
      } catch (e) { handleError(e); process.exitCode = 1; }
    });

  dagCmd
    .command("displaced")
    .description("Show displaced transactions")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief|full)")
    .action(async (options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();
        const explain = options.explain === true ? "brief" as const : (options.explain || false);
        const request = createQueryRequest({ domain: "dag", op: "displaced", explain });
        const result = await engine.execute(request);
        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else { printDagDisplaced(result); }
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
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();
        const explain = options.why ? "full" as const : options.explain === true ? "brief" as const : (options.explain || false);
        const request = createQueryRequest({ domain: "dag", op: "history", params: { txId }, explain });
        const result = await engine.execute(request);
        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else { printDagHistory(result); }
      } catch (e) { handleError(e); process.exitCode = 1; }
    });

  dagCmd
    .command("sink-path")
    .description("Show current selected path from genesis to sink")
    .option("--json", "Output as JSON", false)
    .action(async (options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();
        const request = createQueryRequest({ domain: "dag", op: "sink-path" });
        const result = await engine.execute(request);
        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else { printSinkPath(result); }
      } catch (e) { handleError(e); process.exitCode = 1; }
    });

  dagCmd
    .command("anomalies")
    .description("Find transactions or blocks in unexpected states")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief|full)")
    .action(async (options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();
        const explain = options.explain === true ? "brief" as const : (options.explain || false);
        const request = createQueryRequest({ domain: "dag", op: "anomalies", explain });
        const result = await engine.execute(request);
        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else { printDagAnomalies(result); }
      } catch (e) { handleError(e); process.exitCode = 1; }
    });

  // =========================================================================
  // hardkas query events
  // =========================================================================

  queryCmd
    .command("events")
    .description("Query event log")
    .option("--tx <txId>", "Filter events by transaction ID")
    .option("--domain <domain>", "Filter by event domain")
    .option("--kind <kind>", "Filter by event kind")
    .option("--workflow <workflowId>", "Filter by workflow ID")
    .option("--limit <n>", "Max results", "100")
    .option("--json", "Output as deterministic JSON", false)
    .option("--explain [level]", "Attach explain metadata (brief|full)")
    .action(async (options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

        const filters: Array<{ field: string; op: "eq"; value: string }> = [];
        if (options.domain) filters.push({ field: "domain", op: "eq", value: options.domain });
        if (options.kind) filters.push({ field: "kind", op: "eq", value: options.kind });
        if (options.workflow) filters.push({ field: "workflowId", op: "eq", value: options.workflow });

        const params: Record<string, string> = {};
        if (options.tx) params["tx"] = options.tx;

        const request = createQueryRequest({
          domain: "events",
          op: "list",
          filters,
          params,
          limit: parseInt(options.limit, 10),
          explain: options.explain === true ? "brief" : (options.explain || false)
        });

        const result = await engine.execute(request);

        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printEventList(result);
        }
      } catch (e) { handleError(e); process.exitCode = 1; }
    });

  // =========================================================================
  // hardkas query tx
  // =========================================================================

  queryCmd
    .command("tx <txId>")
    .description(`Aggregate all data for a transaction ${UI.maturity("stable")}`)
    .option("--json", "Output as deterministic JSON", false)
    .option("--explain [level]", "Attach explain metadata (brief|full)")
    .action(async (txId, options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

        const request = createQueryRequest({
          domain: "tx",
          op: "aggregate",
          params: { txId },
          explain: options.explain === true ? "brief" : (options.explain || false)
        });

        const result = await engine.execute(request);

        if (options.json) {
          const { serializeQueryResult } = await import("@hardkas/query");
          console.log(serializeQueryResult(result));
        } else {
          printTxAggregate(result);
        }
      } catch (e) { handleError(e); process.exitCode = 1; }
    });
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function printArtifactList(result: any): void {
  console.log(`\n  Artifacts: ${result.total} found (showing ${result.items.length})\n`);
  for (const item of result.items) {
    const hash = item.contentHash ? item.contentHash.slice(0, 12) + "..." : "no-hash";
    const from = item.from?.address ? ` from:${item.from.address.slice(0, 20)}` : "";
    console.log(`  ${item.schema.padEnd(24)} ${item.networkId.padEnd(10)} ${item.mode.padEnd(12)} ${hash}${from}`);
  }
  console.log(`\n  queryHash: ${result.queryHash.slice(0, 16)}...`);
  const backend = result.annotations.backendUsed || "unknown";
  const freshness = result.annotations.freshness ? ` | ${result.annotations.freshness}` : "";
  console.log(`  ${result.annotations.executionMs}ms | backend:${backend}${freshness} | ${result.annotations.filesScanned ?? 0} files scanned\n`);
  printExplain(result.explain);
  printWhy(result.why);
}

function printInspectResult(result: any): void {
  const item = result.items[0];
  if (!item) { console.log("  No artifact found."); return; }
  console.log(`\n  ═══ Artifact Inspection ═══\n`);
  console.log(`  Schema:     ${item.item.schema}`);
  console.log(`  Network:    ${item.item.networkId}`);
  console.log(`  Mode:       ${item.item.mode}`);
  console.log(`  Created:    ${item.item.createdAt}`);
  console.log(`  Hash:       ${item.item.contentHash || "none"}`);
  console.log(`  Integrity:  ${item.integrity.ok ? "✓ VALID" : "✗ INVALID"}`);
  console.log(`  Lineage:    ${item.lineageStatus}`);
  console.log(`  Staleness:  ${item.staleness.classification} (${item.staleness.ageHours}h)`);
  if (item.economics) console.log(`  Economics:  ${item.economics.ok ? "✓" : "✗"} mass=${item.economics.massReported} fee=${item.economics.feeReported}`);
  if (item.integrity.errors.length > 0) { console.log(`\n  Issues:`); for (const err of item.integrity.errors) console.log(`    ✗ ${err}`); }
  console.log("");
  printExplain(result.explain);
  printWhy(result.why);
}

function printDiffResult(result: any): void {
  const diff = result.items[0];
  if (!diff) return;
  console.log(`\n  ═══ Artifact Diff ═══\n`);
  console.log(`  Left:  ${diff.leftSchema} (${diff.leftPath})`);
  console.log(`  Right: ${diff.rightSchema} (${diff.rightPath})`);
  if (diff.identical) { console.log(`\n  ✓ Artifacts are identical.\n`); return; }
  console.log(`\n  ${diff.entries.length} difference(s):\n`);
  for (const entry of diff.entries) {
    const marker = entry.kind === "added" ? "+" : entry.kind === "removed" ? "-" : "~";
    console.log(`  ${marker} ${entry.field}: ${entry.left ?? "(absent)"} → ${entry.right ?? "(absent)"} [${entry.kind}]`);
  }
  console.log("");
}

function printLineageChain(result: any): void {
  const chain = result.items[0];
  if (!chain) return;
  console.log(`\n  ═══ Lineage Chain (${chain.direction}) ═══\n`);
  console.log(`  Anchor: ${chain.anchor}`);
  console.log(`  Complete: ${chain.complete ? "✓ yes" : "✗ no (missing ancestors)"}`);
  console.log(`  Nodes: ${chain.nodes.length}\n`);
  for (let i = 0; i < chain.nodes.length; i++) {
    const node = chain.nodes[i];
    const prefix = i === chain.nodes.length - 1 ? "  └─" : "  ├─";
    console.log(`${prefix} ${node.schema} [${node.contentHash.slice(0, 12)}...] ${node.networkId}/${node.mode}`);
  }
  console.log("");
  printExplain(result.explain);
  printWhy(result.why);
}

function printTransitions(result: any): void {
  console.log(`\n  ═══ Lineage Transitions: ${result.total} ═══\n`);
  for (const t of result.items) {
    const marker = t.valid ? "✓" : "✗";
    console.log(`  ${marker} ${t.from.schema} → ${t.to.schema}  [${t.rule}]`);
  }
  console.log("");
  printExplain(result.explain);
  printWhy(result.why);
}

function printOrphans(result: any): void {
  if (result.total === 0) { console.log("\n  ✓ No orphaned artifacts found.\n"); return; }
  console.log(`\n  ═══ Orphaned Artifacts: ${result.total} ═══\n`);
  for (const o of result.items) {
    console.log(`  ✗ ${o.node.schema} [${o.node.contentHash.slice(0, 12)}...]`);
    console.log(`    Missing parent: ${o.missingParentId.slice(0, 16)}...`);
    console.log(`    Reason: ${o.reason}\n`);
  }
  printExplain(result.explain);
  printWhy(result.why);
}

function printReplayList(result: any): void {
  console.log(`\n  ═══ Replay History: ${result.total} receipt(s) ═══\n`);
  for (const r of result.items) {
    const trace = r.hasTrace ? `trace:${r.traceEventCount}ev` : "no-trace";
    console.log(`  ${r.txId.slice(0, 20).padEnd(22)} ${r.status.padEnd(10)} ${r.amountSompi.padEnd(12)} fee:${r.feeSompi} ${trace}`);
  }
  console.log("");
}

function printReplaySummary(result: any): void {
  const s = result.items[0];
  if (!s) return;
  console.log(`\n  ═══ Replay Summary: ${s.txId} ═══\n`);
  console.log(`  Status:     ${s.status}`);
  console.log(`  From:       ${s.from}`);
  console.log(`  To:         ${s.to}`);
  console.log(`  Amount:     ${s.amountSompi} sompi`);
  console.log(`  Fee:        ${s.feeSompi} sompi`);
  console.log(`  DAA Score:  ${s.daaScore}`);
  console.log(`  UTXOs:      ${s.spentUtxoCount} spent, ${s.createdUtxoCount} created`);
  console.log(`  Trace:      ${s.hasTrace ? `yes (${s.traceEventCount} events)` : "none"}`);
  if (s.preStateHash) console.log(`  Pre-state:  ${s.preStateHash.slice(0, 16)}...`);
  if (s.postStateHash) console.log(`  Post-state: ${s.postStateHash.slice(0, 16)}...`);
  console.log("");
}

function printDivergences(result: any): void {
  if (result.total === 0) { console.log("\n  ✓ No replay divergences detected.\n"); return; }
  console.log(`\n  ═══ Replay Divergences: ${result.total} ═══\n`);
  for (const d of result.items) {
    console.log(`  ✗ [${d.kind}] tx:${d.txId.slice(0, 16)}...`);
    console.log(`    Field:    ${d.field}`);
    console.log(`    Expected: ${d.expected.slice(0, 60)}`);
    console.log(`    Actual:   ${d.actual.slice(0, 60)}\n`);
  }
  printExplain(result.explain);
  printWhy(result.why);
}

function printInvariants(result: any): void {
  const inv = result.items[0];
  if (!inv) return;
  const allOk = inv.planIntegrity && inv.receiptReproducible && inv.stateTransitionValid && inv.utxoConservation;
  console.log(`\n  ═══ Replay Invariants: ${inv.txId} ═══\n`);
  console.log(`  Plan integrity:     ${inv.planIntegrity ? "✓" : "✗"}`);
  console.log(`  Receipt reproducible: ${inv.receiptReproducible ? "✓" : "✗"}`);
  console.log(`  State transition:   ${inv.stateTransitionValid ? "✓" : "✗"}`);
  console.log(`  UTXO conservation:  ${inv.utxoConservation ? "✓" : "✗"}`);
  console.log(`  Overall:            ${allOk ? "✓ ALL PASS" : "✗ VIOLATIONS FOUND"}`);
  if (inv.issues.length > 0) { console.log(`\n  Issues:`); for (const i of inv.issues) console.log(`    ✗ ${i}`); }
  console.log("");
  printExplain(result.explain);
  printWhy(result.why);
}

function printDagConflicts(result: any): void {
  console.log("\n  ⚠ DAG model: deterministic-light-model (NOT GHOSTDAG)\n");
  if (result.total === 0) { console.log("  ✓ No conflicts detected.\n"); return; }
  console.log(`  ═══ DAG Conflicts: ${result.total} ═══\n`);
  for (const c of result.items) {
    console.log(`  CONFLICT: outpoint ${c.outpoint}`);
    console.log(`    ├─ WINNER: ${c.winnerTxId.slice(0, 24)}...`);
    for (const l of c.loserTxIds) console.log(`    └─ LOSER:  ${l.slice(0, 24)}...`);
    console.log("");
  }
  printExplain(result.explain);
  printWhy(result.why);
}

function printDagDisplaced(result: any): void {
  console.log("\n  ⚠ DAG model: deterministic-light-model (NOT GHOSTDAG)\n");
  if (result.total === 0) { console.log("  ✓ No displaced transactions.\n"); return; }
  console.log(`  ═══ Displaced Transactions: ${result.total} ═══\n`);
  for (const d of result.items) {
    const status = d.currentlyAccepted ? "re-accepted" : "displaced";
    console.log(`  ✗ ${d.txId.slice(0, 24)}... [${status}]`);
    console.log(`    ${d.reason}\n`);
  }
  printExplain(result.explain);
  printWhy(result.why);
}

function printDagHistory(result: any): void {
  console.log("\n  ⚠ DAG model: deterministic-light-model (NOT GHOSTDAG)\n");
  if (result.total === 0) { console.log("  ✗ Transaction not found in DAG.\n"); return; }
  console.log(`  ═══ DAG Tx History ═══\n`);
  for (const e of result.items) {
    const status = e.accepted ? "ACCEPTED" : e.displaced ? "DISPLACED" : "UNKNOWN";
    const sinkPath = e.inSinkPath ? "IN sink path" : "NOT in sink path";
    console.log(`  ${status.padEnd(10)} block:${e.blockId.slice(0, 12)}... daa:${e.daaScore} ${sinkPath}`);
  }
  console.log("");
  printExplain(result.explain);
  printWhy(result.why);
}

function printSinkPath(result: any): void {
  console.log("\n  ⚠ DAG model: deterministic-light-model (NOT GHOSTDAG)\n");
  const sp = result.items[0];
  if (!sp) { console.log("  No sink path available.\n"); return; }
  console.log(`  ═══ Sink Path (depth: ${sp.depth}) ═══\n`);
  console.log(`  Sink: ${sp.sink}\n`);
  for (let i = 0; i < sp.nodes.length; i++) {
    const n = sp.nodes[i];
    const prefix = i === sp.nodes.length - 1 ? "  └─" : "  ├─";
    const genesis = n.isGenesis ? " [GENESIS]" : "";
    console.log(`${prefix} ${n.blockId.slice(0, 16)}... daa:${n.daaScore} txs:${n.acceptedTxCount}${genesis}`);
  }
  console.log("");
}

function printDagAnomalies(result: any): void {
  console.log("\n  ⚠ DAG model: deterministic-light-model (NOT GHOSTDAG)\n");
  if (result.total === 0) { console.log("  ✓ No DAG anomalies detected.\n"); return; }
  console.log(`  ═══ DAG Anomalies: ${result.total} ═══\n`);
  for (const a of result.items) {
    console.log(`  ✗ [${a.kind}] ${a.description}\n`);
  }
  if (result.explain) printExplain(result.explain);
}

function printExplain(explain: any): void {
  if (!explain) return;
  console.log("  ─── Explain: Technical Diagnostics ───\n");
  console.log(`  Backend:      ${explain.backend}`);
  console.log(`  Freshness:    ${explain.freshness}`);
  console.log(`  Rows Read:    ${explain.rowsRead}`);
  console.log(`  Files Scan:   ${explain.scannedFiles}`);
  if (explain.executionPlan && explain.executionPlan.length > 0) {
    console.log(`  Plan:         ${explain.executionPlan.join(" → ")}`);
  }
  if (explain.warnings && explain.warnings.length > 0) {
    console.log(`  Warnings:`);
    for (const w of explain.warnings) console.log(`    ⚠ ${w}`);
  }
  console.log("");
}

function printWhy(why: any[]): void {
  if (!why || why.length === 0) return;
  console.log("  ─── Why: Causal Analysis ───\n");
  for (const block of why) {
    console.log(`  Q: ${block.question}`);
    console.log(`  A: ${block.answer}`);
    for (const step of block.causalChain) {
      console.log(`    ${step.order}. ${step.assertion}`);
      console.log(`       Evidence: ${step.evidence}`);
      if (step.rule) console.log(`       Rule:     ${step.rule}`);
    }
    if (block.evidence && block.evidence.length > 0) {
      console.log(`  Evidence Refs: ${block.evidence.map((e: any) => `${e.type}:${e.value.slice(0, 12)}...`).join(", ")}`);
    }
    console.log("");
  }
}

function printEventList(result: any): void {
  console.log(`\n  ═══ Events: ${result.total} found (showing ${result.items.length}) ═══\n`);
  for (const event of result.items) {
    const txTag = event.txId ? ` tx:${event.txId.slice(0, 16)}...` : "";
    console.log(`  ${event.timestamp.slice(0, 19).padEnd(20)} ${event.kind.padEnd(28)} ${event.domain.padEnd(12)}${txTag}`);
  }
  console.log(`\n  queryHash: ${result.queryHash.slice(0, 16)}...`);
  console.log(`  ${result.annotations.executionMs}ms\n`);
  printExplain(result.explain);
  printWhy(result.why);
}

function printTxAggregate(result: any): void {
  const agg = result.items[0];
  if (!agg) { console.log("  No data found for this transaction."); return; }

  console.log(`\n  ═══ Transaction: ${agg.txId} ═══\n`);
  console.log(`  Complete: ${agg.complete ? "✓ yes" : "✗ partial"}`);

  if (agg.artifacts.length > 0) {
    console.log(`\n  Artifacts (${agg.artifacts.length}):`);
    for (const a of agg.artifacts) {
      const hash = a.contentHash ? a.contentHash.slice(0, 12) + "..." : "no-hash";
      console.log(`    ${a.role.padEnd(10)} ${a.schema.padEnd(24)} ${hash}`);
    }
  }

  if (agg.events.length > 0) {
    console.log(`\n  Events (${agg.events.length}):`);
    for (const e of agg.events) {
      console.log(`    ${e.timestamp.slice(0, 19).padEnd(20)} ${e.kind}`);
    }
  }

  if (agg.warnings.length > 0) {
    console.log(`\n  Warnings:`);
    for (const w of agg.warnings) {
      console.log(`    ⚠ ${w}`);
    }
  }

  console.log("");
  if (result.explain) printExplain(result.explain);
}

/**
 * Shared helper to initialize the QueryEngine with the best available backend.
 */
async function getQueryEngine() {
  const { QueryEngine } = await import("@hardkas/query");
  return QueryEngine.create({
    artifactDir: process.cwd()
  });
}
