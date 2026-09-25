import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { UI, handleError } from "../ui.js";
import { HardkasError } from "@hardkas/core";
import { HardkasCliError } from "../cli-errors.js";
import { HardkasSchemas } from "@hardkas/artifacts";

export interface ArtifactInspectOptions {
  idOrPath: string;
  json?: boolean;
  workspaceRoot: string;
}

export async function runArtifactInspect(options: ArtifactInspectOptions) {
  let targetPath = path.resolve(options.workspaceRoot, options.idOrPath);
  let resolvedById = false;

  if (!fs.existsSync(targetPath)) {
    // Wave 1.2 · IC-5′.2–.5: an id is only a 64-hex artifactId, resolved by verified
    // identity (no substring search, no label/txId/workflowId detection, no
    // "most recent" pick among several matches). Labels need their namespace:
    // `hardkas why --plan|--signed|--tx|--workflow <id>`.
    const { resolveArtifactHandle } = await import("@hardkas/artifacts");
    let handle;
    try {
      handle = await resolveArtifactHandle(options.idOrPath, options.workspaceRoot);
    } catch (e: any) {
      const code = e?.code || "ARTIFACT_NOT_FOUND";
      if (code === "NAMESPACE_REQUIRED") {
        const ns = e?.context?.namespace;
        throw new HardkasCliError(
          "NAMESPACE_REQUIRED",
          `'${options.idOrPath}' is neither a workspace path nor a 64-hex artifactId. ${
            ns ? `It looks like a ${ns} identifier: run hardkas why --${ns} ${options.idOrPath}` : "Pass an artifactId or a path."
          }`
        );
      }
      throw new HardkasCliError(
        code === "CANDIDATE_INVALID" ? "CANDIDATE_INVALID" : "INVALID_ARTIFACT",
        `Artifact not found: could not resolve '${options.idOrPath}' as a file or verified artifactId (${e?.message ?? String(e)}).`
      );
    }
    targetPath = handle.path;
    resolvedById = true;
  }

  const content = fs.readFileSync(targetPath, "utf-8");
  let artifact: any;
  try {
    artifact = JSON.parse(content);
  } catch (e) {
    throw new HardkasError("INVALID_JSON", `File ${targetPath} is not valid JSON.`);
  }

  const { recomputeDeclaredContentHash } = await import("@hardkas/artifacts");

  // Recompute with the version the artifact declares; never fall back to another one.
  let canonicalHash: string;
  try {
    canonicalHash = recomputeDeclaredContentHash(artifact);
  } catch (error) {
    canonicalHash = `HASH_VERSION_INVALID (${error instanceof Error ? error.message : String(error)})`;
  }
  const type = artifact.schema || artifact.type || "unknown";
  const id =
    artifact.txId ||
    artifact.workflowId ||
    artifact.id ||
    artifact.planId ||
    artifact.signedId;
  const parents =
    artifact.parents ||
    artifact.parentTxIds ||
    (artifact.parentTxId ? [artifact.parentTxId] : undefined);
  const lineageId = artifact.lineageId;
  const receiptRef =
    artifact.receiptId ||
    artifact.receiptPath ||
    (type.includes("txPlan") ? `${artifact.txId}.receipt.json` : undefined);

  const isCoreArtifact = [
    HardkasSchemas.TxPlanV1,
    HardkasSchemas.SignedTxV1,
    HardkasSchemas.TxReceiptV1,
    HardkasSchemas.Snapshot
  ].includes(type);
  const isWorkflow = type === HardkasSchemas.WorkflowV1;
  const replayability = isCoreArtifact || isWorkflow ? "supported" : "unknown";

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          schemaVersion: HardkasSchemas.ArtifactInspectV1,
          ok: true,
          artifact: {
            id,
            path: targetPath,
            type,
            canonicalHash,
            parents,
            lineageId,
            receiptRef,
            replayability
          },
          warnings: [],
          errors: []
        },
        null,
        2
      )
    );
  } else {
    UI.header(`Artifact Inspector`);
    console.log(
      `  ${pc.bold("Resolved Path:")} ${pc.cyan(path.relative(options.workspaceRoot, targetPath))} ${resolvedById ? pc.dim("(via ID match)") : ""}`
    );
    console.log(`  ${pc.bold("Schema/Type:")}   ${pc.yellow(type)}`);
    console.log(`  ${pc.bold("Canonical Hash:")} ${pc.magenta(canonicalHash)}`);
    if (id) console.log(`  ${pc.bold("Primary ID:")}    ${pc.green(id)}`);
    if (lineageId) console.log(`  ${pc.bold("Lineage ID:")}    ${pc.blue(lineageId)}`);
    if (parents && parents.length > 0) {
      console.log(
        `  ${pc.bold("Parents:")}       ${pc.dim(parents.filter(Boolean).join(", "))}`
      );
    }
    if (receiptRef) console.log(`  ${pc.bold("Receipt Ref:")}   ${pc.dim(receiptRef)}`);

    const repColor = replayability === "supported" ? pc.green : pc.yellow;
    console.log(`  ${pc.bold("Replayability:")} ${repColor(replayability)}\n`);

    // IC-5′.11: suggest the canonical identity, never a label or file name.
    UI.printNextSteps([
      /^[0-9a-f]{64}$/.test(canonicalHash)
        ? `hardkas why ${canonicalHash}`
        : `hardkas why ${path.relative(options.workspaceRoot, targetPath).replace(/\\/g, "/")}`
    ]);
  }
}
