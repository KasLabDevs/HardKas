import { Command } from "commander";
import pc from "picocolors";
import path from "node:path";
import fs from "node:fs/promises";
import { UI } from "../ui.js";

async function resolveArtifactPath(id: string): Promise<string | null> {
  // If it's a direct file path that exists, return it
  try {
    const stat = await fs.stat(id);
    if (stat.isFile()) return path.resolve(id);
  } catch {}

  // Otherwise, search common artifact directories
  const searchDirs = [
    path.join(process.cwd(), ".hardkas", "artifacts"),
    path.join(process.cwd(), "artifacts"),
    path.join(process.cwd(), "artifacts", "receipts"),
    path.join(process.cwd(), "artifacts", "plans")
  ];

  for (const dir of searchDirs) {
    try {
      const files = await fs.readdir(dir);
      const match = files.find((f) => f.includes(id) && f.endsWith(".json"));
      if (match) return path.join(dir, match);
    } catch {}
  }

  return null;
}

export function registerExplainCommand(program: Command) {
  program
    .command("explain <id_or_path>")
    .description(
      `Provide a narrative causal explanation of a deterministic artifact, transaction, or replay ${UI.maturity("stable")}`
    )
    .action(async (id: string) => {
      try {
        const artifactPath = await resolveArtifactPath(id);

        if (!artifactPath) {
          UI.semanticError(
            "Artifact Not Found",
            `Could not locate artifact with identifier or path '${id}'`,
            "causal chain integrity",
            "cannot explain deterministic causality for missing data",
            "verify the ID and ensure you are in the correct HardKAS workspace"
          );
          throw new Error("Command failed");
          return;
        }

        const { readArtifact } = await import("@hardkas/artifacts");
        const artifact = (await readArtifact(artifactPath)) as Record<string, unknown>;

        const isSimulated =
          artifact.mode === "simulated" || artifact.networkId === "simulated";
        const schema = (artifact.schema as string) || "unknown";

        console.log(
          `\n  ${pc.magenta("═════")} ${pc.bold("Deterministic Explanation")} ${pc.magenta("═════")}\n`
        );

        console.log(
          pc.white(
            `  This artifact represents a ${pc.cyan(schema)} generated during a ${isSimulated ? "local deterministic replay" : "network interaction"}.\n`
          )
        );

        UI.causality("Execution Trace", {
          "Artifact ID":
            (artifact.txId as string) ||
            (artifact.signedId as string) ||
            (artifact.planId as string) ||
            "unknown",
          "Source Authority": "filesystem artifact",
          "File Path": artifactPath,
          "Projection Layer": "Indexed into SQLite query-store (if dashboard is running)",
          "Replay Result": isSimulated
            ? "deterministic reproduction successful"
            : "network state dependent",
          "Consensus Validation": isSimulated
            ? "NOT performed"
            : "performed by remote node",
          Reason: isSimulated
            ? "simulated execution mode does not validate against Kaspa consensus"
            : "network interaction implies Kaspa consensus"
        });
      } catch (e) {
        throw e;
      }
    });
}
