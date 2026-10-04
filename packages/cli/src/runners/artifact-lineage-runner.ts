import { verifyArtifactIntegrity, verifyLineage } from "@hardkas/artifacts";
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
  /** The provenance chain as the human output draws it (root → … → this artifact). */
  chain: Array<{ role: "root" | "parent" | "here"; artifactId: string | null; schema?: string }>;
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
  const chain: ArtifactLineageResult["chain"] = [];
  if (lineage.rootArtifactId === lineage.artifactId) {
    chain.push({ role: "root", artifactId: lineage.artifactId ?? null, ...(schema ? { schema } : {}) });
  } else {
    chain.push({ role: "root", artifactId: lineage.rootArtifactId ?? null });
    if (lineage.parentArtifactId) chain.push({ role: "parent", artifactId: lineage.parentArtifactId });
    chain.push({ role: "here", artifactId: lineage.artifactId ?? null, ...(schema ? { schema } : {}) });
  }

  // Validation
  const verification = verifyLineage(artifact);
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
    verification: {
      ok: verification.ok,
      issues: verification.issues.map((i) => ({ code: i.code, severity: i.severity, message: i.message }))
    },
    warnings: []
  };

  if (json) {
    // One document, whatever the verdict: on violations the envelope carries the typed code
    // and the exit code comes from the error below (the top-level handler writes nothing more).
    if (verification.ok) {
      out.writeJson({ ok: true, command: "artifact lineage", mode: "cli", result });
    } else {
      out.writeJson({
        ok: false,
        command: "artifact lineage",
        mode: "cli",
        code: "LINEAGE_VIOLATIONS",
        message: "Lineage structure is inconsistent.",
        result
      });
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

    // Trace visualization (conceptual)
    out.writeLine("\nPROVENANCE CHAIN:");
    const lines: string[] = [];
    if (lineage.rootArtifactId === lineage.artifactId) {
      lines.push(`[ROOT] ${artifact.schema} (${lineage.artifactId.slice(0, 8)}...)`);
    } else {
      lines.push(`[ROOT] ${lineage.rootArtifactId.slice(0, 8)}...`);
      lines.push(`  ↓    (Intermediate Artifacts)`);
      if (lineage.parentArtifactId) {
        lines.push(`  ↓    ${lineage.parentArtifactId.slice(0, 8)}... (Parent)`);
      }
      lines.push(`[HERE] ${artifact.schema} (${lineage.artifactId.slice(0, 8)}...)`);
    }
    lines.forEach((step) => out.writeLine(`  ${step}`));

    if (!verification.ok) {
      out.writeLine("\nLineage Violations:");
      verification.issues.forEach((i) => {
        const prefix = i.severity === "error" ? "✗" : "⚠";
        out.writeLine(`  ${prefix} [${i.code}] ${i.message}`);
      });
    } else {
      out.writeLine("\n✓ Internal lineage structure is consistent.");
    }

    UI.footer("Operational Provenance Complete");
  }

  if (!verification.ok) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "LINEAGE_VIOLATIONS",
      "Lineage structure is inconsistent.",
      { exitCode: 1 }
    );
  }
  return result;
}
