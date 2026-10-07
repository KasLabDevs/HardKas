import { Command } from "commander";
import { handleError, UI } from "../ui.js";
import pc from "picocolors";
import { getQueryEngine, queryStorePath } from "./query/engine-factory.js";
import { invocationWorkspaceRoot } from "../workspace-root.js";

export function registerQueryCommands(program: Command) {
  const queryCmd = program
    .command("query")
    .description("Query and introspect HardKAS artifacts, lineage, and workflows");

  // =========================================================================
  // hardkas query artifacts
  // =========================================================================

  const artifactsCmd = queryCmd
    .command("artifacts")
    .description(`Query artifact store ${UI.maturity("stable")}`);

  // =========================================================================
  // hardkas query store
  // =========================================================================

  const storeCmd = queryCmd
    .command("store")
    .description(`Manage query store index ${UI.maturity("stable")}`);

  // WORKSPACE-AUTHORITY-1 · the query store (.hardkas/store.db) is a projection DERIVED from the workspace's artifacts
  // and event ledger (WA-I1). Observing it never creates or migrates it (WA-I3); it is healthy only when it is proven
  // built from exactly the workspace's current state (WA-I2); rebuilding it is an explicit write that really builds it.

  storeCmd
    .command("doctor")
    .description("Integrity and freshness check of the query store index")
    .option("--migrate", "Apply pending migrations if found", false)
    .option("--wait-lock", "With --migrate: wait for the query-store lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .action(async (options) => {
      const { withLock } = await import("@hardkas/core");
      const root = invocationWorkspaceRoot();
      const dbPath = queryStorePath(root);
      try {
        const action = async () => {
          const { HardkasStore, HardkasIndexer, readProjectionStatus } = await import("@hardkas/query-store");
          const fs = await import("node:fs");

          if (options.migrate && fs.existsSync(dbPath)) {
            console.log("\n  Checking and applying migrations...");
            const writable = new HardkasStore({ dbPath });
            writable.connect();
            try {
              writable.migrate();
            } finally {
              writable.disconnect();
            }
          }

          const status = readProjectionStatus(root, dbPath);
          console.log("\n  ═══ Query Store Doctor ═══\n");
          console.log(`  Projection:   ${dbPath}`);
          console.log(`  State:        ${status.state} (${status.reason})`);

          if (status.state === "absent") {
            console.log("\n  There is no projection: the query commands read the workspace directly. Nothing to check.\n");
            return;
          }

          let ok = status.state === "fresh";
          let report: any = null;
          let storeIssues: any[] = [];
          if (status.state === "fresh") {
            const store = HardkasStore.openExisting(dbPath)!;
            try {
              report = new HardkasIndexer(store.getDatabase(), { cwd: root }).doctor();
              storeIssues = store.checkHealth().issues;
              ok = report.ok && storeIssues.length === 0;
            } finally {
              store.disconnect();
            }
          }

          console.log(
            `  Overall:      ${ok ? pc.green("✓ HEALTHY") : pc.red(status.state === "fresh" ? "✗ ISSUES" : `✗ ${status.state.toUpperCase()}`)}`
          );
          console.log(`  Last Indexed: ${report?.lastIndexedAt || status.indexedAt || "never"}`);

          if (storeIssues.length > 0) {
            console.log("\n  Store Issues:");
            for (const issue of storeIssues) {
              const icon = issue.severity === "error" ? pc.red("✗") : pc.yellow("⚠");
              console.log(`    ${icon} [${issue.code}] ${issue.message}`);
              if (issue.suggestion) console.log(`      Suggestion: ${issue.suggestion}`);
            }
          }

          if (report?.corruptedFiles?.length > 0) {
            console.log("\n  Corrupted Files:");
            for (const f of report.corruptedFiles) console.log(`    ${pc.red("✗")} ${f}`);
          }

          if (!ok) {
            const cmd = storeIssues.some((i: any) => i.code.includes("MIGRATION")) ? "migrate" : "rebuild";
            console.log(`\n  Recommendation: Run 'hardkas query store ${cmd}' to fix issues.\n`);
            // CLI-RUNTIME-CONTRACT-1: the verdict is typed (was an untyped "Command failed").
            const { HardkasCliError } = await import("../cli-errors.js");
            throw new HardkasCliError(
              "QUERY_STORE_UNHEALTHY",
              status.state === "fresh"
                ? `The query store has issues; run 'hardkas query store ${cmd}' to fix them.`
                : `The query store is ${status.state} (${status.reason}); run 'hardkas query store rebuild'.`,
              { exitCode: 1 }
            );
          } else {
            console.log("\n  ✓ Everything looks good.\n");
          }
        };

        if (options.migrate) {
          await withLock(
            {
              rootDir: root,
              name: "query-store",
              command: "hardkas query store doctor --migrate",
              wait: options.waitLock,
              timeoutMs: parseInt(options.lockTimeout)
            },
            action
          );
        } else {
          await action();
        }
      } catch (e) {
        throw e;
      }
    });

  storeCmd
    .command("migrate")
    .description("Apply pending schema migrations to the query store")
    .option("--wait-lock", "Wait for the query-store lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .action(async (options) => {
      const { withLock } = await import("@hardkas/core");
      const root = invocationWorkspaceRoot();
      const dbPath = queryStorePath(root);
      try {
        await withLock(
          {
            rootDir: root,
            name: "query-store",
            command: "hardkas query store migrate",
            wait: options.waitLock,
            timeoutMs: parseInt(options.lockTimeout)
          },
          async () => {
            console.log("\n  Checking for pending migrations...");
            const fs = await import("node:fs");
            if (!fs.existsSync(dbPath)) {
              UI.info("There is no query store to migrate (the query commands read the workspace directly).");
              console.log("");
              return;
            }
            const { HardkasStore } = await import("@hardkas/query-store");
            const store = new HardkasStore({ dbPath });
            store.connect();
            let result: { applied: number };
            try {
              result = store.migrate();
            } finally {
              store.disconnect();
            }

            if (result.applied > 0) {
              UI.success(`Applied ${result.applied} migration(s). Store is up to date.`);
            } else {
              UI.info("No pending migrations found. Store is already up to date.");
            }
            console.log("");
          }
        );
      } catch (e) {
        throw e;
      }
    });

  storeCmd
    .command("sync")
    .alias("index")
    .description("Index new artifacts into the SQLite query store (needs .hardkas/store.db: run 'query store rebuild' first)")
    .option("--strict", "Fail on any corrupted data", false)
    .option("--wait-lock", "Wait for the query-store lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .option("--json", "Output as JSON", false)
    .action(async (options) => {
      const { withLock } = await import("@hardkas/core");
      const root = invocationWorkspaceRoot();
      const dbPath = queryStorePath(root);
      try {
        await withLock(
          {
            rootDir: root,
            name: "query-store",
            command: "hardkas query store sync",
            wait: options.waitLock,
            timeoutMs: parseInt(options.lockTimeout)
          },
          async () => {
            const fs = await import("node:fs");
            if (!fs.existsSync(dbPath)) {
              const { HardkasCliError } = await import("../cli-errors.js");
              throw new HardkasCliError(
                "QUERY_STORE_ABSENT",
                `There is no query store to sync at ${dbPath}; build it with 'hardkas query store rebuild'. Nothing was written.`,
                { exitCode: 1 }
              );
            }
            if (!options.json) console.log("\n  Synchronizing query store index...");
            const { HardkasStore, HardkasIndexer } = await import("@hardkas/query-store");
            const start = Date.now();
            const store = new HardkasStore({ dbPath });
            store.connect({ autoMigrate: true });
            let result: any;
            try {
              result = await new HardkasIndexer(store.getDatabase(), { cwd: root, strict: options.strict }).sync();
            } finally {
              store.disconnect();
            }

            if (!result.ok) {
              const { HardkasCliError } = await import("../cli-errors.js");
              throw new HardkasCliError("SYNC_CORRUPTION", "Synchronization encountered corruption. Use --strict for fail-fast behavior.");
            }

            if (options.json) {
              const { getOutput } = await import("../output.js");
              getOutput().writeJson({ ok: true, command: "query store sync", mode: "cli", result });
            } else {
              const elapsed = Date.now() - start;
              console.log(`  ✓ Index synchronized in ${elapsed}ms.`);
              console.log(
                `\n  Artifacts: ${result.artifacts.indexed}/${result.artifacts.scanned} indexed (${result.artifacts.corrupted} corrupted)`
              );
              console.log(
                `  Events:    ${result.events.indexed}/${result.events.scanned} indexed (${result.events.corrupted} corrupted)`
              );

              if (result.issues && result.issues.length > 0) {
                console.log("\n  Issues Found:");
                for (const issue of result.issues.slice(0, 10)) {
                  console.log(
                    `    ${issue.severity === "error" ? pc.red("✗") : pc.yellow("⚠")} [${issue.code}] ${issue.message}`
                  );
                  if (issue.path)
                    console.log(
                      `      At: ${issue.path}${issue.lineNumber ? ":" + issue.lineNumber : ""}`
                    );
                }
                if (result.issues.length > 10)
                  console.log(`    ... and ${result.issues.length - 10} more.`);
              }

              console.log("");
            }
          }
        );
      } catch (e) {
        throw e;
      }
    });

  storeCmd
    .command("rebuild")
    .description("Force a complete rebuild of the query store index")
    .option("--backend <type>", "sqlite (the default) builds .hardkas/store.db from the workspace; filesystem keeps no index, so it has nothing to rebuild")
    .option("--strict", "Fail on any corrupted data", false)
    .option("--wait-lock", "Wait for the query-store lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .option("--json", "Output as JSON", false)
    .action(async (options) => {
      if (options.json) UI.setJsonMode(true);
      if (options.backend !== undefined && options.backend !== "sqlite") {
        const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
        throw new HardkasCliError(
          "QUERY_STORE_REBUILD_UNSUPPORTED",
          `'--backend ${options.backend}' keeps no index, so there is nothing to rebuild: the query commands read the workspace directly. Run 'hardkas query store rebuild' (sqlite) to build .hardkas/store.db. Nothing was written.`,
          { exitCode: HardkasExitCode.USAGE_ERROR }
        );
      }
      const { withLock } = await import("@hardkas/core");
      const root = invocationWorkspaceRoot();
      const dbPath = queryStorePath(root);
      try {
        await withLock(
          {
            rootDir: root,
            name: "query-store",
            command: "hardkas query store rebuild",
            wait: options.waitLock,
            timeoutMs: parseInt(options.lockTimeout)
          },
          async () => {
            if (!options.json) UI.logHuman("\n  Rebuilding query store index...");
            const { HardkasStore, HardkasIndexer } = await import("@hardkas/query-store");
            const start = Date.now();
            // an explicit write: the projection is created (and migrated) here, then built from the workspace
            const store = new HardkasStore({ dbPath });
            store.connect({ autoMigrate: true });
            let result: any;
            try {
              result = await new HardkasIndexer(store.getDatabase(), { cwd: root, strict: options.strict }).rebuild();
            } finally {
              store.disconnect();
            }

            if (!result.ok) {
              const { HardkasCliError } = await import("../cli-errors.js");
              throw new HardkasCliError("REBUILD_CORRUPTION", "Rebuild failed or encountered corruption. Use --strict for fail-fast behavior.");
            }

            if (options.json) {
              const { getOutput } = await import("../output.js");
              getOutput().writeJson({ ok: true, command: "query store rebuild", mode: "cli", result });
            } else {
              const elapsed = Date.now() - start;
              UI.logHuman(`  ✓ Index rebuilt successfully in ${elapsed}ms.`);
              UI.logHuman(
                `\n  Artifacts: ${result.artifacts.indexed}/${result.artifacts.scanned} indexed (${result.artifacts.corrupted} corrupted)`
              );
              UI.logHuman(
                `  Events:    ${result.events.indexed}/${result.events.scanned} indexed (${result.events.corrupted} corrupted)`
              );

              if (result.issues && result.issues.length > 0) {
                UI.logHuman("\n  Corruption Issues:");
                for (const issue of result.issues.slice(0, 10)) {
                  UI.logHuman(
                    `    ${issue.severity === "error" ? pc.red("✗") : pc.yellow("⚠")} [${issue.code}] ${issue.message}`
                  );
                  if (issue.path)
                    UI.logHuman(
                      `      At: ${issue.path}${issue.lineNumber ? ":" + issue.lineNumber : ""}`
                    );
                }
                if (result.issues.length > 10)
                  UI.logHuman(`    ... and ${result.issues.length - 10} more.`);
              }

              UI.logHuman("");
            }
          }
        );
      } catch (e) {
        throw e;
      }
    });

  storeCmd
    .command("sql <query>")
    .description("Run a raw SQL query against the query store")
    .option("--json", "Output as JSON", false)
    .option("--unsafe-write", "Allow mutating SQL (DANGEROUS)", false)
    .option("--yes", "Confirm mutating SQL (DANGEROUS)", false)
    .action(async (query: string, options) => {
      try {
        // SQL exists only on the projection: this is an explicit request for it, answered even when it is stale, and the
        // answer says so (WORKSPACE-AUTHORITY-1, B2). It never creates the projection.
        const { openProjectionForCommand } = await import("./query/projection-access.js");
        const { store, status } = await openProjectionForCommand("query store sql");
        const { SqliteQueryBackend } = await import("@hardkas/query-store");
        let result: any[];
        try {
          result = await new SqliteQueryBackend(store).executeRawSql(query, {
            unsafeWrite: options.unsafeWrite,
            yes: options.yes
          });
        } finally {
          store.disconnect();
        }

        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query store sql", mode: "cli", projection: status, result });
        } else {
          if (result.length === 0) {
            console.log("\n  No results.\n");
          } else {
            console.table(result);
          }
        }
      } catch (e) {
        throw e;
      }
    });

  storeCmd
    .command("export")
    .description("Export logical store state to JSON")
    .option("--output <path>", "Output file path")
    .action(async (options) => {
      try {
        // an explicit request for the projection's content: never creates it, and says when it is stale (B2)
        const { openProjectionForCommand } = await import("./query/projection-access.js");
        const { store, status } = await openProjectionForCommand("query store export");
        let dump: { artifacts: unknown[]; events: unknown[] };
        try {
          const db = store.getDatabase();
          const artifacts = db
            .prepare("SELECT * FROM artifacts ORDER BY artifact_id ASC")
            .all();
          const events = db.prepare("SELECT * FROM events ORDER BY event_id ASC").all();
          dump = { artifacts, events };
        } finally {
          store.disconnect();
        }
        const json = JSON.stringify(dump, null, 2);

        if (options.output) {
          const fs = await import("node:fs");
          // an --output inside the artifact store goes through the store's gate (ARTIFACT-MUTATION-1)
          const { writeFileRespectingStore } = await import("@hardkas/artifacts");
          await writeFileRespectingStore(options.output, json, () => fs.writeFileSync(options.output, json));
          UI.success(`Store exported to ${options.output}`);
        } else {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query store export", mode: "cli", projection: status, result: dump });
        }
      } catch (e) {
        throw e;
      }
    });

  artifactsCmd
    .command("list")
    .alias("ls")
    .description("List artifacts matching filters")
    .option("--schema <schema>", "Filter by artifact schema (e.g. txPlan, signedTx)")
    .option("--network <network>", "Filter by network ID")
    .option("--mode <mode>", "Filter by mode: simulator, localnet or rpc")
    .option("--from <address>", "Filter by sender address")
    .option("--to <address>", "Filter by recipient address")
    .option("--sort <field:dir>", "Sort field and direction (e.g. createdAt:desc)")
    .option("--limit <n>", "Max results", "100")
    .option("--json", "Output as deterministic JSON", false)
    .option("--explain [level]", "Attach explain chains (brief and full currently give the same output)")
    .action(async (options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

        const filters: Array<{ field: string; op: "eq"; value: string }> = [];
        if (options.schema)
          filters.push({ field: "schema", op: "eq", value: `hardkas.${options.schema}` });
        if (options.network)
          filters.push({ field: "networkId", op: "eq", value: options.network });
        if (options.mode) filters.push({ field: "mode", op: "eq", value: options.mode });
        if (options.from)
          filters.push({ field: "from.address", op: "eq", value: options.from });
        if (options.to)
          filters.push({ field: "to.address", op: "eq", value: options.to });

        let sort: { field: string; direction: "asc" | "desc" } | undefined;
        if (options.sort) {
          const [field, dir] = options.sort.split(":");
          sort = { field: field!, direction: dir === "asc" ? "asc" : "desc" };
        }

        const request = createQueryRequest({
          domain: "artifacts",
          op: "list",
          filters,
          sort,
          limit: parseInt(options.limit, 10),
          explain: options.explain === true ? "brief" : options.explain || false
        });

        const result = await engine.execute(request);

        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query artifacts list", mode: "cli", result });
        } else {
          printArtifactList(result);
        }
      } catch (e) {
        throw e;
      }
    });

  artifactsCmd
    .command("inspect <target>")
    .description("Deep structural analysis of an artifact (path or contentHash)")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief and full currently give the same output)")
    .action(async (target, options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

        const request = createQueryRequest({
          domain: "artifacts",
          op: "inspect",
          params: { target },
          explain: options.explain === true ? "brief" : options.explain || false
        });

        const result = await engine.execute(request);

        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query artifacts inspect", mode: "cli", result });
        } else {
          printInspectResult(result);
        }
      } catch (e) {
        throw e;
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
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query artifacts diff", mode: "cli", result });
        } else {
          printDiffResult(result);
        }
      } catch (e) {
        throw e;
      }
    });

  // =========================================================================
  // hardkas query lineage
  // =========================================================================

  const lineageCmd = queryCmd
    .command("lineage")
    .description(`Traverse artifact lineage ${UI.maturity("stable")}`);

  lineageCmd
    .command("chain <anchor>")
    .description("Reconstruct lineage chain from an artifact (contentHash or artifactId)")
    .option(
      "--direction <dir>",
      "Traversal direction: ancestors or descendants",
      "ancestors"
    )
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief and full currently give the same output)")
    .option("--why", "Shorthand for --explain full")
    .action(async (anchor, options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

        const explain = options.why
          ? ("full" as const)
          : options.explain === true
            ? ("brief" as const)
            : options.explain || false;

        const request = createQueryRequest({
          domain: "lineage",
          op: "chain",
          params: { anchor, direction: options.direction },
          explain
        });

        const result = await engine.execute(request);

        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query lineage chain", mode: "cli", result });
        } else {
          printLineageChain(result);
        }
      } catch (e) {
        throw e;
      }
    });

  lineageCmd
    .command("transitions")
    .description("List all lineage transitions")
    .option("--root <hash>", "Filter by root artifact ID")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief and full currently give the same output)")
    .option("--why", "Shorthand for --explain full")
    .action(async (options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

        const explain = options.why
          ? ("full" as const)
          : options.explain === true
            ? ("brief" as const)
            : options.explain || false;

        const request = createQueryRequest({
          domain: "lineage",
          op: "transitions",
          params: options.root ? { root: options.root } : {},
          explain
        });

        const result = await engine.execute(request);

        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query lineage transitions", mode: "cli", result });
        } else {
          printTransitions(result);
        }
      } catch (e) {
        throw e;
      }
    });

  lineageCmd
    .command("orphans")
    .description("Find artifacts with broken lineage references")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief and full currently give the same output)")
    .action(async (options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

        const request = createQueryRequest({
          domain: "lineage",
          op: "orphans",
          explain: options.explain === true ? "brief" : options.explain || false
        });

        const result = await engine.execute(request);

        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query lineage orphans", mode: "cli", result });
        } else {
          printOrphans(result);
        }
      } catch (e) {
        throw e;
      }
    });
  // =========================================================================
  // hardkas query replay
  // =========================================================================

  const replayCmd = queryCmd
    .command("replay")
    .description(`Inspect replay history and divergence ${UI.maturity("stable")}`);

  replayCmd
    .command("list")
    .alias("ls")
    .description("List all stored receipts")
    .option("--status <status>", "Filter by status")
    .option("--json", "Output as JSON", false)
    .option("--limit <n>", "Max results", "100")
    .action(async (options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();
        const filters: Array<{ field: string; op: "eq"; value: string }> = [];
        if (options.status)
          filters.push({ field: "status", op: "eq", value: options.status });

        const request = createQueryRequest({
          domain: "replay",
          op: "list",
          filters,
          limit: parseInt(options.limit, 10)
        });
        const result = await engine.execute(request);

        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query replay list", mode: "cli", result });
        } else {
          printReplayList(result);
        }
      } catch (e) {
        throw e;
      }
    });

  replayCmd
    .command("summary <txId>")
    .description("Detailed receipt + trace summary for a transaction")
    .option("--json", "Output as JSON", false)
    .action(async (txId, options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

        const request = createQueryRequest({
          domain: "replay",
          op: "summary",
          params: { txId }
        });
        const result = await engine.execute(request);

        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query replay diff", mode: "cli", result });
        } else {
          printReplaySummary(result);
        }
      } catch (e) {
        throw e;
      }
    });

  replayCmd
    .command("divergences")
    .description("Detect receipts with replay divergence indicators")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief and full currently give the same output)")
    .action(async (options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

        const request = createQueryRequest({
          domain: "replay",
          op: "divergences",
          explain: options.explain === true ? "brief" : options.explain || false
        });
        const result = await engine.execute(request);

        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query events list", mode: "cli", result });
        } else {
          printDivergences(result);
        }
      } catch (e) {
        throw e;
      }
    });

  replayCmd
    .command("invariants <txId>")
    .description("Check replay invariants for a specific transaction")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief and full currently give the same output)")
    .action(async (txId, options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();

        const request = createQueryRequest({
          domain: "replay",
          op: "invariants",
          params: { txId },
          explain: options.explain === true ? "brief" : options.explain || false
        });
        const result = await engine.execute(request);

        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query events inspect", mode: "cli", result });
        } else {
          printInvariants(result);
        }
      } catch (e) {
        throw e;
      }
    });

  // =========================================================================
  // hardkas query dag
  // =========================================================================

  const dagCmd = queryCmd
    .command("dag")
    .description(`Query simulated DAG state ${UI.maturity("research")}`);

  dagCmd
    .command("conflicts")
    .description("Show double-spend conflict analysis")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief and full currently give the same output)")
    .option("--why", "Shorthand for --explain full")
    .action(async (options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();
        const explain = options.why
          ? ("full" as const)
          : options.explain === true
            ? ("brief" as const)
            : options.explain || false;
        const request = createQueryRequest({ domain: "dag", op: "conflicts", explain });
        const result = await engine.execute(request);
        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query stats summary", mode: "cli", result });
        } else {
          printDagConflicts(result);
        }
      } catch (e) {
        throw e;
      }
    });

  dagCmd
    .command("displaced")
    .description("Show displaced transactions")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief and full currently give the same output)")
    .action(async (options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();
        const explain =
          options.explain === true ? ("brief" as const) : options.explain || false;
        const request = createQueryRequest({ domain: "dag", op: "displaced", explain });
        const result = await engine.execute(request);
        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query dag displaced", mode: "cli", result });
        } else {
          printDagDisplaced(result);
        }
      } catch (e) {
        throw e;
      }
    });

  dagCmd
    .command("history <txId>")
    .description("Full lifecycle of a transaction through the DAG")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief and full currently give the same output)")
    .option("--why", "Shorthand for --explain full")
    .action(async (txId, options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();
        const explain = options.why
          ? ("full" as const)
          : options.explain === true
            ? ("brief" as const)
            : options.explain || false;
        const request = createQueryRequest({
          domain: "dag",
          op: "history",
          params: { txId },
          explain
        });
        const result = await engine.execute(request);
        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query dag history", mode: "cli", result });
        } else {
          printDagHistory(result);
        }
      } catch (e) {
        throw e;
      }
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
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query dag sink-path", mode: "cli", result });
        } else {
          printSinkPath(result);
        }
      } catch (e) {
        throw e;
      }
    });

  dagCmd
    .command("anomalies")
    .description("Find transactions or blocks in unexpected states")
    .option("--json", "Output as JSON", false)
    .option("--explain [level]", "Attach explain chains (brief and full currently give the same output)")
    .action(async (options) => {
      try {
        const { createQueryRequest } = await import("@hardkas/query");
        const engine = await getQueryEngine();
        const explain =
          options.explain === true ? ("brief" as const) : options.explain || false;
        const request = createQueryRequest({ domain: "dag", op: "anomalies", explain });
        const result = await engine.execute(request);
        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query dag anomalies", mode: "cli", result });
        } else {
          printDagAnomalies(result);
        }
      } catch (e) {
        throw e;
      }
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
        if (options.domain)
          filters.push({ field: "domain", op: "eq", value: options.domain });
        if (options.kind) filters.push({ field: "kind", op: "eq", value: options.kind });
        if (options.workflow)
          filters.push({ field: "workflowId", op: "eq", value: options.workflow });

        const params: Record<string, string> = {};
        if (options.tx) params["tx"] = options.tx;

        const request = createQueryRequest({
          domain: "events",
          op: "list",
          filters,
          params,
          limit: parseInt(options.limit, 10),
          explain: options.explain === true ? "brief" : options.explain || false
        });

        const result = await engine.execute(request);

        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query events", mode: "cli", result });
        } else {
          printEventList(result);
        }
      } catch (e) {
        throw e;
      }
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
          explain: options.explain === true ? "brief" : options.explain || false
        });

        const result = await engine.execute(request);

        if (options.json) {
          const { getOutput } = await import("../output.js");
          getOutput().writeJson({ ok: true, command: "query tx", mode: "cli", result });
        } else {
          printTxAggregate(result);
        }
      } catch (e) {
        throw e;
      }
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
    console.log(
      `  ${item.schema.padEnd(24)} ${item.networkId.padEnd(10)} ${item.mode.padEnd(12)} ${hash}${from}`
    );
  }
  console.log(`\n  queryHash: ${result.queryHash.slice(0, 16)}...`);
  const backend = result.annotations.backendUsed || "unknown";
  const freshness = result.annotations.freshness
    ? ` | ${result.annotations.freshness}`
    : "";
  // WORKSPACE-AUTHORITY-1: the projection's state is part of every answer (STALE when the answer came from a stale one)
  const projection = result.annotations.projection
    ? ` | projection:${result.annotations.projection.used && result.annotations.projection.state !== "fresh" ? result.annotations.projection.state.toUpperCase() : result.annotations.projection.state}`
    : "";
  console.log(
    `  ${result.annotations.executionMs}ms | backend:${backend}${freshness}${projection} | ${result.annotations.filesScanned ?? 0} files scanned\n`
  );
  printExplain(result.explain);
  printWhy(result.why);
}

function printInspectResult(result: any): void {
  const item = result.items[0];
  if (!item) {
    console.log("  No artifact found.");
    return;
  }
  console.log(`\n  ═══ Artifact Inspection ═══\n`);
  console.log(`  Schema:     ${item.item.schema}`);
  console.log(`  Network:    ${item.item.networkId}`);
  console.log(`  Mode:       ${item.item.mode}`);
  console.log(`  Created:    ${item.item.createdAt}`);
  console.log(`  Hash:       ${item.item.contentHash || "none"}`);
  console.log(`  Integrity:  ${item.integrity.ok ? "✓ VALID" : "✗ INVALID"}`);
  console.log(`  Lineage:    ${item.lineageStatus}`);
  // EVIDENCE-TRUST-1: what looking the parent up in the workspace store found
  if (item.parent && item.parent.status !== "root") {
    console.log(`  Parent:     ${item.parent.status}${item.parent.artifactId ? ` (${item.parent.artifactId})` : ""}`);
  }
  console.log(
    `  Staleness:  ${item.staleness.classification} (${item.staleness.ageHours}h)`
  );
  if (item.economics)
    console.log(
      `  Economics:  ${item.economics.ok ? "✓" : "✗"} mass=${item.economics.massReported} fee=${item.economics.feeReported}`
    );
  if (item.integrity.errors.length > 0) {
    console.log(`\n  Issues:`);
    for (const err of item.integrity.errors) console.log(`    ✗ ${err}`);
  }
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
  // EVIDENCE-TRUST-1 (ET-C3): the identity verdict, then every raw difference with whether the hash covers it.
  console.log(
    diff.sameIdentity
      ? `  Identity: same (${diff.leftIdentity})`
      : `  Identity: different (left ${diff.leftIdentity ?? "not recomputable"}, right ${diff.rightIdentity ?? "not recomputable"})`
  );
  if (diff.identical) {
    console.log(`\n  ✓ Artifacts are identical.\n`);
    return;
  }
  console.log(`\n  ${diff.entries.length} difference(s):\n`);
  for (const entry of diff.entries) {
    const marker = entry.kind === "added" ? "+" : entry.kind === "removed" ? "-" : "~";
    const scope = entry.authenticated ? "authenticated" : "not authenticated";
    const values = entry.secret
      ? "(secret field: the values differ and are not shown)"
      : `${entry.left ?? "(absent)"} → ${entry.right ?? "(absent)"}${entry.redacted ? " (credentials redacted)" : ""}`;
    console.log(`  ${marker} ${entry.field}: ${values} [${entry.kind}, ${scope}]`);
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
    console.log(
      `${prefix} ${node.schema} [${node.contentHash.slice(0, 12)}...] ${node.networkId}/${node.mode}`
    );
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
  if (result.total === 0) {
    console.log("\n  ✓ No orphaned artifacts found.\n");
    return;
  }
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
    console.log(
      `  ${r.txId.slice(0, 20).padEnd(22)} ${r.status.padEnd(10)} ${r.amountSompi.padEnd(12)} fee:${r.feeSompi} ${trace}`
    );
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
  console.log(
    `  Trace:      ${s.hasTrace ? `yes (${s.traceEventCount} events)` : "none"}`
  );
  if (s.preStateHash) console.log(`  Pre-state:  ${s.preStateHash.slice(0, 16)}...`);
  if (s.postStateHash) console.log(`  Post-state: ${s.postStateHash.slice(0, 16)}...`);
  console.log("");
}

function printDivergences(result: any): void {
  if (result.total === 0) {
    console.log("\n  ✓ No replay divergences detected.\n");
    return;
  }
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
  const allOk =
    inv.planIntegrity &&
    inv.receiptReproducible &&
    inv.stateTransitionValid &&
    inv.utxoConservation;
  console.log(`\n  ═══ Replay Invariants: ${inv.txId} ═══\n`);
  console.log(`  Plan integrity:     ${inv.planIntegrity ? "✓" : "✗"}`);
  console.log(`  Receipt reproducible: ${inv.receiptReproducible ? "✓" : "✗"}`);
  console.log(`  State transition:   ${inv.stateTransitionValid ? "✓" : "✗"}`);
  console.log(`  UTXO conservation:  ${inv.utxoConservation ? "✓" : "✗"}`);
  console.log(`  Overall:            ${allOk ? "✓ ALL PASS" : "✗ VIOLATIONS FOUND"}`);
  if (inv.issues.length > 0) {
    console.log(`\n  Issues:`);
    for (const i of inv.issues) console.log(`    ✗ ${i}`);
  }
  console.log("");
  printExplain(result.explain);
  printWhy(result.why);
}

function printDagConflicts(result: any): void {
  console.log("\n  ⚠ DAG model: deterministic-light-model (NOT GHOSTDAG)\n");
  if (result.total === 0) {
    console.log("  ✓ No conflicts detected.\n");
    return;
  }
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
  if (result.total === 0) {
    console.log("  ✓ No displaced transactions.\n");
    return;
  }
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
  if (result.total === 0) {
    console.log("  ✗ Transaction not found in DAG.\n");
    return;
  }
  console.log(`  ═══ DAG Tx History ═══\n`);
  for (const e of result.items) {
    const status = e.accepted ? "ACCEPTED" : e.displaced ? "DISPLACED" : "UNKNOWN";
    const sinkPath = e.inSinkPath ? "IN sink path" : "NOT in sink path";
    console.log(
      `  ${status.padEnd(10)} block:${e.blockId.slice(0, 12)}... daa:${e.daaScore} ${sinkPath}`
    );
  }
  console.log("");
  printExplain(result.explain);
  printWhy(result.why);
}

function printSinkPath(result: any): void {
  console.log("\n  ⚠ DAG model: deterministic-light-model (NOT GHOSTDAG)\n");
  const sp = result.items[0];
  if (!sp) {
    console.log("  No sink path available.\n");
    return;
  }
  console.log(`  ═══ Sink Path (depth: ${sp.depth}) ═══\n`);
  console.log(`  Sink: ${sp.sink}\n`);
  for (let i = 0; i < sp.nodes.length; i++) {
    const n = sp.nodes[i];
    const prefix = i === sp.nodes.length - 1 ? "  └─" : "  ├─";
    const genesis = n.isGenesis ? " [GENESIS]" : "";
    console.log(
      `${prefix} ${n.blockId.slice(0, 16)}... daa:${n.daaScore} txs:${n.acceptedTxCount}${genesis}`
    );
  }
  console.log("");
}

function printDagAnomalies(result: any): void {
  console.log("\n  ⚠ DAG model: deterministic-light-model (NOT GHOSTDAG)\n");
  if (result.total === 0) {
    console.log("  ✓ No DAG anomalies detected.\n");
    return;
  }
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
      console.log(
        `  Evidence Refs: ${block.evidence.map((e: any) => `${e.type}:${e.value.slice(0, 12)}...`).join(", ")}`
      );
    }
    console.log("");
  }
}

function printEventList(result: any): void {
  console.log(
    `\n  ═══ Events: ${result.total} found (showing ${result.items.length}) ═══\n`
  );
  for (const event of result.items) {
    const txTag = event.txId ? ` tx:${event.txId.slice(0, 16)}...` : "";
    console.log(
      `  ${event.timestamp.slice(0, 19).padEnd(20)} ${event.kind.padEnd(28)} ${event.domain.padEnd(12)}${txTag}`
    );
  }
  console.log(`\n  queryHash: ${result.queryHash.slice(0, 16)}...`);
  console.log(`  ${result.annotations.executionMs}ms\n`);
  printExplain(result.explain);
  printWhy(result.why);
}

function printTxAggregate(result: any): void {
  const agg = result.items[0];
  if (!agg) {
    console.log("  No data found for this transaction.");
    return;
  }

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

