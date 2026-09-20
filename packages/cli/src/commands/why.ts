import { Command } from "commander";
import path from "path";
import { UI, handleError } from "../ui.js";
import { HardkasSchemas } from "@hardkas/artifacts";

export function registerWhyCommand(program: Command) {
  program
    .command("why")
    .description(
      "Explain the causal lineage of an artifact resolved by exact artifactId or artifact file path"
    )
    .argument(
      "<artifact>",
      "Exact 64-hex artifactId (lineage.artifactId) or absolute/workspace-relative path to the artifact .json file"
    )
    .option("--json", "Output lineage graph in JSON format")
    .option("--workspace <path>", "Override workspace root directory")
    .action(
      async (
        artifactInput: string,
        options: { json?: boolean; workspace?: string }
      ) => {
        UI.setJsonMode(!!options.json);
        try {
          const workspaceRoot = options.workspace
            ? path.resolve(options.workspace)
            : process.cwd();

          // Wave 5 · DEF-17: single delegation point. See
          // packages/artifacts/src/artifact-handle.ts for the accepted forms
          // and typed error contract.
          const { resolveArtifactHandle, ProjectArtifactStore } = await import(
            "@hardkas/artifacts"
          );

          const handle = await resolveArtifactHandle(artifactInput, workspaceRoot);

          // Walk the causal chain from the resolved artifact toward root.
          //
          // Do NOT use ProjectArtifactStore.resolveLineage here: it has a
          // pre-existing case-sensitivity bug in its cycle-break check
          // (schema.includes("TxPlan") vs actual "hardkas.txPlan") that can
          // loop forever when a plan's parentArtifactId is empty. That is a
          // separate defect (recorded as backlog: resolveLineage-cycle-guard)
          // and per Wave 5 · Section H we do not modify legacy store methods.
          //
          // Instead we walk parents inline with a strict visited-set guard
          // and only through the same public readArtifact + resolveArtifactHandle
          // primitives.
          const store = new ProjectArtifactStore(workspaceRoot);
          const lineage: any[] = [handle.artifact];
          const visited = new Set<string>();
          const startId =
            handle.artifactId || (handle.artifact as any)?.lineage?.artifactId;
          if (typeof startId === "string" && startId.length > 0) {
            visited.add(startId);
          }

          let current: any = handle.artifact;
          const MAX_LINEAGE_DEPTH = 64;
          for (let depth = 0; depth < MAX_LINEAGE_DEPTH; depth++) {
            const parentId: string | undefined =
              current?.lineage?.parentArtifactId;
            if (typeof parentId !== "string" || parentId.length === 0) break;
            if (visited.has(parentId)) break;

            let parent: any;
            try {
              parent = await store.readArtifact(parentId);
            } catch {
              break;
            }
            visited.add(parentId);
            lineage.unshift(parent);
            current = parent;
          }

          // Build the chain in target->root order so existing presentation
          // logic (which reverses to root->target) keeps working unchanged.
          const chain: any[] = [];
          for (let i = lineage.length - 1; i >= 0; i--) {
            const artifact: any = lineage[i];

            let role = "Unknown";
            if (typeof artifact.schema === "string") {
              if (artifact.schema.startsWith(HardkasSchemas.TxPlan))
                role = "Transaction Plan";
              if (artifact.schema.startsWith(HardkasSchemas.SignedTx))
                role = "Signed Transaction";
              if (artifact.schema.startsWith(HardkasSchemas.TxReceipt))
                role = "Transaction Receipt";
              if (artifact.schema.startsWith(HardkasSchemas.ReplayV1))
                role = "Replay Verification";
            }

            const nodeId =
              artifact.lineage?.artifactId ||
              artifact.contentHash ||
              artifact.planId ||
              artifact.signedId ||
              "unknown";

            const node: any = {
              id: nodeId,
              schema: artifact.schema,
              role,
              createdAt: artifact.createdAt || artifact.executionTime,
              network: artifact.networkId || "unknown",
              lineage: artifact.lineage || null
            };

            if (
              artifact.schema?.startsWith(HardkasSchemas.SignedTx) &&
              artifact.signatures
            ) {
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
          }

          const targetId = chain[0]?.id;

          if (options.json) {
            UI.writeJson({
              target: targetId,
              resolvedBy: handle.resolvedBy,
              resolvedPath: handle.path,
              chain
            });
            return;
          }

          UI.header(
            `Causal Lineage: ${
              typeof targetId === "string" ? targetId.substring(0, 8) : "unknown"
            }...`
          );

          const reversed = [...chain].reverse();
          for (let i = 0; i < reversed.length; i++) {
            const node = reversed[i];
            const isTarget = node.id === targetId;
            const prefix = i === 0 ? "○" : "└─●";
            const indent = "  ".repeat(i);

            UI.raw(
              `  ${indent}${prefix} ${isTarget ? "\x1b[32m\x1b[1m" : "\x1b[37m"}${node.role}\x1b[0m`
            );
            UI.raw(`  ${indent}  \x1b[90mID:   ${node.id}\x1b[0m`);
            if (node.details) {
              UI.raw(`  ${indent}  \x1b[90mInfo: ${node.details}\x1b[0m`);
            }
            UI.raw(
              `  ${indent}  \x1b[90mTime: ${node.createdAt || "unknown"}\x1b[0m`
            );
          }

          UI.emptyLine();

          const nextSteps: string[] = [];
          const targetNode = chain[0];
          if (targetNode?.schema === HardkasSchemas.TxPlanV1) {
            nextSteps.push("hardkas dev tx sign " + targetId);
          } else if (targetNode?.schema === HardkasSchemas.SignedTxV1) {
            nextSteps.push("hardkas dev tx send " + targetId);
          } else if (targetNode?.schema === HardkasSchemas.TxReceiptV1) {
            nextSteps.push("hardkas dev last --replay");
          } else if (targetNode?.schema === HardkasSchemas.ReplayV1) {
            nextSteps.push("hardkas status");
          }
          UI.printNextSteps(nextSteps);
        } catch (e) {
          handleError(e, "Why Error");
        }
      }
    );
}
