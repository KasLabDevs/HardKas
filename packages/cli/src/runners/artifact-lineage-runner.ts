import { verifyLineage, resolveLineageChain } from "@hardkas/artifacts";
import { UI } from "../ui.js";
import { getOutput } from "../output.js";
import fs from "node:fs";
import path from "node:path";
import { stripBom } from "@hardkas/core";

export interface ArtifactLineageOptions {
  path: string;
  workspaceRoot: string;
  /** JSON-PAPERCUTS #5: with `--json` the lineage is ONE JSON document on stdout and no text is printed. */
  json?: boolean;
}

export interface ArtifactLineageResult {
  path: string;
  schema: string | null;
  /** `null` for an orphan (no lineage metadata); provenance cannot be verified then. */
  lineage: {
    lineageId: string | null;
    rootArtifactId: string | null;
    artifactId: string | null;
    parentArtifactId: string | null;
    sequence: number | null;
  } | null;
  orphan: boolean;
  /**
   * The provenance chain (root → … → this artifact) as RESOLVED in the workspace store (EVIDENCE-TRUST-1): each ancestor
   * with what looking it up found. A chain that stops before a root ends with the link that could not be resolved.
   */
  chain: Array<{
    role: "root" | "parent" | "here";
    artifactId: string | null;
    schema?: string;
    status: "here" | "resolved" | "missing" | "invalid" | "unresolved";
    detail?: string;
  }>;
  /** True only when every ancestor was resolved up to the declared root and every link holds. */
  complete: boolean;
  verification: { ok: boolean; issues: Array<{ code: string; severity: string; message: string }> } | null;
  warnings: string[];
}

export async function runArtifactLineage(options: ArtifactLineageOptions): Promise<ArtifactLineageResult> {
  const { Hardkas } = await import("@hardkas/sdk");
  const sdk = await Hardkas.open({ cwd: options.workspaceRoot });
  const absolutePath = sdk.workspace.resolvePath(options.path);
  const json = options.json === true;

  if (!fs.existsSync(absolutePath)) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("FILE_NOT_FOUND", `File not found: ${options.path}`, {
      exitCode: 1
    });
  }

  const content = fs.readFileSync(absolutePath, "utf-8");
  const artifact = JSON.parse(stripBom(content));
  const schema = typeof artifact?.schema === "string" ? artifact.schema : null;

  if (!json) UI.header(`Artifact Lineage: ${path.basename(options.path)}`);

  const lineage = artifact.lineage;
  if (!lineage) {
    const result: ArtifactLineageResult = {
      path: options.path,
      schema,
      lineage: null,
      orphan: true,
      chain: [],
      complete: false,
      verification: null,
      warnings: [
        "No lineage metadata found in this artifact.",
        "Artifact is an 'orphan' (Provenance cannot be verified)."
      ]
    };
    if (json) {
      getOutput().writeJson({ ok: true, command: "artifact lineage", mode: "cli", result });
      return result;
    }
    UI.warning(result.warnings[0]!);
    UI.info(result.warnings[1]!);
    return result;
  }

  const out = getOutput();

  // Validation: the internal structure, then the chain as RESOLVED in the workspace store (EVIDENCE-TRUST-1, ET-C2) —
  // the same verified resolver `hardkas verify` uses. Provenance is complete only if that walk reached the declared root.
  const structure = verifyLineage(artifact);
  const resolved = resolveLineageChain(artifact, { workspaceRoot: sdk.workspace.root });
  const stopped = resolved.links.length > 1 && resolved.links[resolved.links.length - 1]!.status !== "resolved"
    ? resolved.links[resolved.links.length - 1]!
    : undefined;
  const chainIssues = [...resolved.issues];
  if (stopped) {
    chainIssues.unshift({
      code: stopped.status === "missing" ? "PARENT_MISSING" : stopped.status === "invalid" ? "PARENT_INVALID" : "PARENT_UNRESOLVED",
      severity: "error",
      message:
        stopped.status === "missing"
          ? `Ancestor ${stopped.artifactId} is not in the workspace store`
          : stopped.status === "invalid"
            ? `Ancestor ${stopped.artifactId} is in the workspace store but does not verify as that identity${stopped.detail ? ` (${stopped.detail})` : ""}`
            : `Ancestor ${stopped.artifactId} was not resolved${stopped.detail ? ` (${stopped.detail})` : ""}`
    });
  }
  const complete = resolved.complete && !stopped;
  const chain: ArtifactLineageResult["chain"] = resolved.links
    .map((link, i) => ({
      role: (resolved.links.length === 1 && !stopped
        ? "root"
        : i === 0
          ? "here"
          : i === resolved.links.length - 1 && !stopped
            ? "root"
            : "parent") as "root" | "parent" | "here",
      artifactId: link.artifactId,
      ...(link.schema ? { schema: link.schema } : {}),
      status: link.status,
      ...(link.detail ? { detail: link.detail } : {})
    }))
    .reverse();
  const issues = [...structure.issues, ...chainIssues];
  const ok = structure.ok && complete;
  const result: ArtifactLineageResult = {
    path: options.path,
    schema,
    lineage: {
      lineageId: lineage.lineageId ?? null,
      rootArtifactId: lineage.rootArtifactId ?? null,
      artifactId: lineage.artifactId ?? null,
      parentArtifactId: lineage.parentArtifactId ?? null,
      sequence: typeof lineage.sequence === "number" ? lineage.sequence : null
    },
    orphan: false,
    chain,
    complete,
    verification: {
      ok,
      issues: issues.map((i) => ({ code: i.code, severity: i.severity, message: i.message }))
    },
    warnings: []
  };
  const failure = !structure.ok
    ? { code: "LINEAGE_VIOLATIONS", message: "Lineage structure is inconsistent." }
    : !complete
      ? { code: "LINEAGE_INCOMPLETE", message: "The provenance chain could not be resolved in the workspace store." }
      : undefined;

  if (json) {
    // One document, whatever the verdict: on violations the envelope carries the typed code
    // and the exit code comes from the error below (the top-level handler writes nothing more).
    if (!failure) {
      out.writeJson({ ok: true, command: "artifact lineage", mode: "cli", result });
    } else {
      out.writeJson({ ok: false, command: "artifact lineage", mode: "cli", code: failure.code, message: failure.message, result });
    }
  } else {
    out.writeLine("═".repeat(60));
    out.writeLine(`Lineage ID:    ${lineage.lineageId}`);
    out.writeLine(`Root Artifact: ${lineage.rootArtifactId}`);
    out.writeLine(`Current ID:    ${lineage.artifactId}`);
    out.writeLine(`Parent ID:     ${lineage.parentArtifactId || "None (Root)"}`);
    if (lineage.sequence !== undefined) {
      out.writeLine(`Sequence:      ${lineage.sequence}`);
    }
    out.writeLine("═".repeat(60));

    out.writeLine("\nPROVENANCE CHAIN (resolved in the workspace store):");
    for (const link of chain) {
      const tag = link.role === "root" ? "[ROOT]" : link.role === "here" ? "[HERE]" : "  ↑   ";
      const what =
        link.status === "here" || link.status === "resolved"
          ? `${link.schema ?? "artifact"} (${link.artifactId ?? "?"})`
          : `${link.artifactId ?? "?"} — ${link.status.toUpperCase()}${link.detail ? ` (${link.detail})` : ""}`;
      out.writeLine(`  ${tag} ${what}`);
    }

    if (issues.length > 0) {
      out.writeLine(complete && structure.ok ? "\nLineage warnings:" : "\nLineage Violations:");
      issues.forEach((i) => {
        const prefix = i.severity === "error" ? "✗" : "⚠";
        out.writeLine(`  ${prefix} [${i.code}] ${i.message}`);
      });
    }
    if (!failure) {
      out.writeLine("\n✓ Every ancestor was resolved and verified in the workspace store, up to the declared root.");
      UI.footer("Operational Provenance Complete");
    }
  }

  if (failure) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(failure.code, failure.message, { exitCode: 1 });
  }
  return result;
}
