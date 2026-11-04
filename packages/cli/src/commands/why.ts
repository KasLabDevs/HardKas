import { Command } from "commander";
import { explicitWorkspaceOrCwd } from "../workspace-root.js";
import { UI, handleError } from "../ui.js";
import { HardkasSchemas } from "@hardkas/artifacts";
import { LookupUsageError, lookupFromArgs, namespaceRequiredHint } from "../runners/lookup-args.js";
import { describeWhyNode } from "../runners/why-narrative.js";

export function registerWhyCommand(program: Command) {
  program
    .command("why")
    .description(
      "Explain the causal lineage of an artifact resolved by exact artifactId, artifact file path, or a namespaced identifier (--plan, --signed, --tx, --workflow)"
    )
    .argument(
      "[artifact]",
      "Exact 64-hex artifactId (the recomputed contentHash) or absolute/workspace-relative path to the artifact .json file"
    )
    .option("--artifact <id-or-path>", "64-hex artifactId or workspace path (same as the positional)")
    .option("--plan <planId>", "Resolve a plan by its derived label (verified against its hash)")
    .option("--signed <signedId>", "Resolve a signed transaction by its derived label (verified)")
    .option("--tx <txId>", "Resolve the submission receipt for a txId (never the signed); with no submission here, the tx as observed by this workspace (origin: observed)")
    .option("--workflow <workflowId>", "Resolve a workflow run by its correlation id")
    .option("--json", "Output lineage graph in JSON format")
    .option("--workspace <path>", "Override workspace root directory")
    .action(
      async (
        artifactInput: string | undefined,
        options: { json?: boolean; workspace?: string; artifact?: string; plan?: string; signed?: string; tx?: string; workflow?: string }
      ) => {
        UI.setJsonMode(!!options.json);
        try {
          const workspaceRoot = explicitWorkspaceOrCwd(); // --workspace is resolved once (WORKSPACE-AUTHORITY-1)

          // Wave 5 · DEF-17: single delegation point. Wave 1.2 · IC-5′: namespaced,
          // verified lookups (see packages/artifacts/src/resolve.ts).
          const { resolveArtifactHandle, ProjectArtifactStore } = await import(
            "@hardkas/artifacts"
          );

          let lookup;
          try {
            lookup = lookupFromArgs(artifactInput, options);
          } catch (e: any) {
            if (e instanceof LookupUsageError) {
              UI.semanticError("Usage", e.message, "identity contract", "one target per call", "pass an artifactId, a path, or exactly one of --plan/--signed/--tx/--workflow");
              // CLI-RUNTIME-CONTRACT-1: a usage error keeps its code (LOOKUP_USAGE) and exits 2.
              const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
              throw new HardkasCliError(e.code, e.message, { exitCode: HardkasExitCode.USAGE_ERROR, cause: e });
            }
            throw e;
          }

          let handle;
          try {
            handle = await resolveArtifactHandle(
              lookup.input,
              workspaceRoot,
              lookup.namespace ? { namespace: lookup.namespace } : {}
            );
          } catch (e: any) {
            // STAGE-B-2 · C4: a txId with no submission here but with verified observations is explained from them,
            // labelled origin "observed" (nothing sent by this workspace is implied). Only RECEIPT_NOT_FOUND falls back.
            if (lookup.namespace === "tx" && e?.code === "RECEIPT_NOT_FOUND") {
              const { findObservedTx, observedJson, observedRows } = await import("../runners/observed-tx.js");
              const { observed } = findObservedTx(lookup.input, workspaceRoot);
              if (observed) {
                if (options.json) {
                  UI.writeJson({ target: observed.txId, ...observedJson(observed) });
                  return;
                }
                UI.causality(`Observed Transaction: ${observed.txId.substring(0, 8)}...`, observedRows(observed), [`hardkas tx status ${observed.txId}`], "info");
                return;
              }
            }
            if (e?.code === "NAMESPACE_REQUIRED" && !options.json) {
              UI.semanticError(
                "Namespace Required",
                e.message,
                "identity contract",
                "a label, txId or workflowId is not an artifactId",
                namespaceRequiredHint("why", e)
              );
            }
            // The typed error (code) reaches the renderer / JSON envelope unchanged.
            throw e;
          }

          // Walk the causal chain from the resolved artifact toward root, through the
          // authenticated lineage.parentArtifactId only (IC-5′.6), with a visited-set guard.
          const store = new ProjectArtifactStore(workspaceRoot);
          const lineage: any[] = [handle.artifact];
          const visited = new Set<string>([handle.artifactId]);

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
              if (artifact.schema === HardkasSchemas.CovenantTransitionFactV1)
                role = "Covenant Transition";
              if (artifact.schema === HardkasSchemas.ZkVerificationFactV1)
                role = "ZK Verification";
            }

            // IC-5′.11: the canonical identity, never a label.
            const nodeId =
              i === lineage.length - 1
                ? handle.artifactId
                : artifact.lineage?.artifactId || artifact.contentHash || "unknown";

            const node: any = {
              id: nodeId,
              schema: artifact.schema,
              role,
              createdAt: artifact.createdAt || artifact.executionTime,
              network: artifact.networkId || "unknown",
              ...(typeof artifact.txId === "string" ? { txId: artifact.txId } : {}),
              lineage: artifact.lineage || null
            };

            const details = describeWhyNode(artifact);
            if (details) node.details = details;

            chain.push(node);
          }

          const targetId = chain[0]?.id;

          // Discover associated collateral facts (Covenant / ZK) without modifying the linear parent-child lineage
          const targetTxId =
            typeof handle.artifact?.txId === "string"
              ? handle.artifact.txId
              : (lookup.namespace === "tx" ? lookup.input : undefined);

          let factsResolution: any;
          if (targetTxId) {
            const planNode = chain.find((n) => n.schema?.startsWith(HardkasSchemas.TxPlan));
            const signedNode = chain.find((n) => n.schema?.startsWith(HardkasSchemas.SignedTx));
            const planArtifact = lineage.find((a: any) => a.schema?.startsWith(HardkasSchemas.TxPlan));
            const { resolveAssociatedFacts } = await import("../runners/why-facts.js");
            factsResolution = resolveAssociatedFacts({
              txId: targetTxId,
              workspaceRoot,
              planArtifactId: planNode?.id,
              draftArtifactId: signedNode?.id,
              planOutputs: planArtifact?.outputs
            });

            if (chain[0]) {
              const allFacts = [
                ...factsResolution.covenantFacts,
                ...factsResolution.zkFacts
              ];
              if (allFacts.length > 0) {
                chain[0].associatedFacts = allFacts.map((f: any) => ({
                  schema: f.schema,
                  id: f.id,
                  relation: f.relation,
                  ...(f.reason ? { reason: f.reason } : {}),
                  ...(f.details ? { details: f.details } : {})
                }));
              }
              if (factsResolution.offlineStatus) {
                chain[0].offlineStatus = factsResolution.offlineStatus;
              }
            }
          }

          if (options.json) {
            UI.writeJson({
              target: targetId,
              // STAGE-B-2 · C4: a --tx lookup that resolved a submission says so (≠ origin "observed")
              ...(lookup.namespace === "tx" ? { origin: "submitted" } : {}),
              authScope: handle.authScope,
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
            if (node.txId) {
              UI.raw(`  ${indent}  \x1b[90mTxID: ${node.txId}\x1b[0m`);
            }
            if (node.details) {
              UI.raw(`  ${indent}  \x1b[90mInfo: ${node.details}\x1b[0m`);
            }
            UI.raw(
              `  ${indent}  \x1b[90mTime: ${node.createdAt || "unknown"}\x1b[0m`
            );
          }

          if (factsResolution) {
            const allFacts = [
              ...factsResolution.covenantFacts,
              ...factsResolution.zkFacts
            ];
            if (allFacts.length > 0 || factsResolution.contradictoryFacts.length > 0) {
              UI.emptyLine();
              UI.raw("  \x1b[1mAssociated Evidence:\x1b[0m");
              for (const f of factsResolution.covenantFacts) {
                const color = f.relation === "exact" ? "\x1b[32m" : f.relation === "compatible" ? "\x1b[36m" : "\x1b[31m";
                UI.raw(`    ◆ Covenant Transition (${color}${f.relation.toUpperCase()}\x1b[0m)`);
                UI.raw(`      \x1b[90mFact ID:   ${f.id}\x1b[0m`);
                if (f.reason) UI.raw(`      \x1b[90mBinding:   ${f.reason}\x1b[0m`);
                if (f.details) UI.raw(`      \x1b[90mDetails:   ${f.details}\x1b[0m`);
              }
              for (const f of factsResolution.zkFacts) {
                const color = f.relation === "exact" ? "\x1b[32m" : f.relation === "compatible" ? "\x1b[36m" : "\x1b[31m";
                UI.raw(`    ◆ ZK Verification (${color}${f.relation.toUpperCase()}\x1b[0m)`);
                UI.raw(`      \x1b[90mFact ID:   ${f.id}\x1b[0m`);
                if (f.reason) UI.raw(`      \x1b[90mBinding:   ${f.reason}\x1b[0m`);
                if (f.details) UI.raw(`      \x1b[90mDetails:   ${f.details}\x1b[0m`);
              }
            }

            if (factsResolution.offlineStatus) {
              UI.emptyLine();
              UI.raw("  \x1b[1mDerived Status (Offline):\x1b[0m");
              const s = factsResolution.offlineStatus;
              if (s.tx) {
                UI.raw(`    Transaction: ${s.tx.status}${s.tx.confirmations?.blue ? ` (${s.tx.confirmations.blue} blue-score confirmations)` : ""}`);
                if (s.tx.reasons && s.tx.reasons.length > 0 && s.tx.status !== "FINALIZED") {
                  UI.raw(`      \x1b[90mReason:      ${s.tx.reasons[0]}\x1b[0m`);
                }
              }
              if (s.covenant) {
                UI.raw(`    Covenant:    ${s.covenant.kind}${s.covenant.activeOutpoint ? ` (Active: ${s.covenant.activeOutpoint})` : ""}`);
              }
              if (s.zk) {
                UI.raw(`    ZK:          ${s.zk.kind}`);
              }
              UI.raw(`    \x1b[90mNotice:      ${s.offlineNotice}\x1b[0m`);
            }
          }

          UI.emptyLine();

          const nextSteps: string[] = [];
          const targetNode = chain[0];
          // SURFACE-TRUTH-1B: the commands that sign and send a file (`dev tx` has no `sign`, and `dev tx send` takes no
          // artifact: it plans, signs and sends from --from/--to/--amount).
          if (targetNode?.schema === HardkasSchemas.TxPlanV1) {
            nextSteps.push("hardkas tx sign <plan-file>");
          } else if (targetNode?.schema === HardkasSchemas.SignedTxV1) {
            nextSteps.push("hardkas tx send <signed-file>");
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
