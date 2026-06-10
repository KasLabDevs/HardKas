import { Command } from "commander";
import { UI, handleError } from "../ui.js";
import { readArtifact } from "@hardkas/artifacts";
import fs from "fs";
import path from "path";
import { HardkasSchemas } from "@hardkas/artifacts";

export function registerWhyCommand(program: Command) {
  program
    .command("why")
    .description("Explain the causal lineage of a given artifact ID")
    .argument("<artifactId>", "The full or partial ID of the artifact")
    .option("--json", "Output lineage graph in JSON format")
    .option("--workspace <path>", "Override workspace root directory")
    .action(
      async (artifactId: string, options: { json?: boolean; workspace?: string }) => {
        UI.setJsonMode(!!options.json);
        try {
          const root = options.workspace
            ? path.resolve(options.workspace)
            : process.cwd();
          if (options.workspace && !fs.existsSync(root)) {
            throw new Error(`Invalid workspace: Directory '${root}' does not exist.`);
          }
          const artifactsDir = path.join(root, ".hardkas", "artifacts");

          if (!fs.existsSync(artifactsDir)) {
            throw new Error(
              "No artifacts directory found. Run this from a HardKAS workspace."
            );
          }

          // 1. Resolve artifact file
          const files = fs.readdirSync(artifactsDir).filter((f) => f.endsWith(".json"));
          const matches = files.filter((f) => f.includes(artifactId));

          if (matches.length === 0) {
            throw new Error(`Artifact matching "${artifactId}" not found.`);
          }
          if (matches.length > 1) {
            throw new Error(
              `Multiple artifacts match "${artifactId}":\n  ${matches.join("\n  ")}`
            );
          }

          const targetFile = matches[0]!;
          const targetId = targetFile.replace(".json", "");

          // 2. Walk lineage
          const chain: any[] = [];
          let currentId: string | undefined = targetId;

          while (currentId) {
            const currentFile = files.find((f) => f.includes(currentId as string));
            if (!currentFile) {
              chain.push({
                id: currentId,
                status: "MISSING",
                error: "Artifact file not found in workspace"
              });
              break;
            }

            const artifact: any = await readArtifact(
              path.join(artifactsDir, currentFile)
            );

            let role = "Unknown";
            if (artifact.schema?.startsWith(HardkasSchemas.TxPlan)) role = "Transaction Plan";
            if (artifact.schema?.startsWith(HardkasSchemas.SignedTx))
              role = "Signed Transaction";
            if (artifact.schema?.startsWith(HardkasSchemas.TxReceipt))
              role = "Transaction Receipt";
            if (artifact.schema?.startsWith(HardkasSchemas.ReplayV1))
              role = "Replay Verification";

            const node: any = {
              id: currentFile.replace(".json", ""),
              schema: artifact.schema,
              role,
              createdAt: artifact.createdAt || artifact.executionTime,
              network: artifact.networkId || "unknown",
              lineage: artifact.lineage || null
            };

            // Extract useful details based on schema
            if (artifact.schema?.startsWith(HardkasSchemas.SignedTx) && artifact.signatures) {
              node.details = `Signed by ${Object.keys(artifact.signatures).join(", ")}`;
            } else if (artifact.schema?.startsWith(HardkasSchemas.TxReceipt)) {
              node.details = `Included in block ${artifact.blockHash || "unknown"}`;
            } else if (artifact.schema?.startsWith(HardkasSchemas.TxPlan)) {
              const outCount = artifact.transaction?.outputs?.length || 0;
              node.details = `Transfers to ${outCount} outputs`;
            } else if (artifact.schema?.startsWith(HardkasSchemas.ReplayV1)) {
              node.details = `Verified: ${artifact.status}`;
            }

            chain.push(node);

            // Move to parent
            currentId =
              artifact.lineage?.parentArtifactId ||
              (artifact.lineage?.parents ? artifact.lineage.parents[0] : undefined) ||
              (artifact.parentArtifactIds ? artifact.parentArtifactIds[0] : undefined) ||
              artifact.sourcePlanId ||
              artifact.planId ||
              artifact.sourceSignedTxId ||
              artifact.signedTxId ||
              artifact.receiptId;
          }

          if (options.json) {
            UI.writeJson({ target: targetId, chain });
            return;
          }

          // Human readable output
          UI.header(`Causal Lineage: ${targetId.substring(0, 8)}...`);

          // We collected child to root. Reverse it to print root -> child.
          const reversed = [...chain].reverse();

          for (let i = 0; i < reversed.length; i++) {
            const node = reversed[i];
            const isTarget = node.id === targetId;
            const prefix = i === 0 ? "○" : "└─●";
            const indent = "  ".repeat(i);

            if (node.status === "MISSING") {
              UI.raw(`  ${indent}${prefix} ${node.id} (MISSING FROM WORKSPACE)`);
              continue;
            }

            UI.raw(
              `  ${indent}${prefix} ${isTarget ? "\x1b[32m\x1b[1m" : "\x1b[37m"}${node.role}\x1b[0m`
            );
            UI.raw(`  ${indent}  \x1b[90mID:   ${node.id}\x1b[0m`);
            if (node.details) {
              UI.raw(`  ${indent}  \x1b[90mInfo: ${node.details}\x1b[0m`);
            }
            UI.raw(`  ${indent}  \x1b[90mTime: ${node.createdAt || "unknown"}\x1b[0m`);
          }

          UI.emptyLine();

          // Explain next steps based on the target artifact type
          const nextSteps = [];
          const targetNode = chain[0]; // The one requested

          if (targetNode.schema === HardkasSchemas.TxPlanV1) {
            nextSteps.push("hardkas dev tx sign " + targetId);
          } else if (targetNode.schema === HardkasSchemas.SignedTxV1) {
            nextSteps.push("hardkas dev tx send " + targetId);
          } else if (targetNode.schema === HardkasSchemas.TxReceiptV1) {
            nextSteps.push("hardkas dev last --replay");
          } else if (targetNode.schema === HardkasSchemas.ReplayV1) {
            nextSteps.push("hardkas status");
          }

          UI.printNextSteps(nextSteps);
        } catch (e) {
          handleError(e, "Why Error");
        }
      }
    );
}
