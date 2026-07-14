/**
 * Shared QueryEngine factory for CLI query subcommands.
 *
 * This is the ONLY place where process.env and process.cwd() are resolved
 * into explicit QueryEngine configuration. The engine itself never reads
 * environment variables.
 */
import path from "node:path";

export async function getQueryEngine() {
  const { QueryEngine } = await import("@hardkas/query");

  const artifactDir = process.cwd();
  const modeRaw = process.env.HARDKAS_PROJECTION_BACKEND;
  const backendMode =
    modeRaw === "sqlite" || modeRaw === "filesystem" || modeRaw === "auto"
      ? modeRaw
      : "auto";
  const databasePath =
    process.env.HARDKAS_QUERY_STORE_PATH ??
    path.join(artifactDir, ".hardkas", "store.db");

  return QueryEngine.create({
    artifactDir,
    backendMode,
    databasePath
  });
}
