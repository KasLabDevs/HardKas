import { explainArtifact } from "@hardkas/artifacts";
import { UI } from "../ui.js";
import fs from "node:fs";
import path from "node:path";
import { formatSompiToKas, formatSignedSompiToKas, stripBom } from "@hardkas/core";

export interface ArtifactExplainOptions {
  path: string;
  workspaceRoot: string;
}

export async function runArtifactExplain(options: {
  path: string;
  workspaceRoot: string;
}) {
  // WORKSPACE-AUTHORITY-1 (WA-I3): explaining reads; it never opens (and so never bootstraps) a workspace. The path is
  // resolved against the workspace root, as before; an artifact outside any workspace can be explained too.
  const absolutePath = path.resolve(options.workspaceRoot, options.path);
  const storeRoot = fs.existsSync(path.join(options.workspaceRoot, ".hardkas")) ? options.workspaceRoot : undefined;

  if (!fs.existsSync(absolutePath)) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("FILE_NOT_FOUND", `File not found: ${options.path}`, {
      exitCode: 1
    });
  }

  const rawArtifact = JSON.parse(stripBom(fs.readFileSync(absolutePath, "utf-8")));
  // EVIDENCE-TRUST-1 (ET-C2): references are looked up in this workspace's store, as `hardkas verify` does. With no store
  // there, nothing is searched and the references say so ("not resolved"), never "missing".
  const explanation = await explainArtifact(rawArtifact, storeRoot ? { workspaceRoot: storeRoot } : {});

  UI.header(`Operational Audit: ${path.basename(options.path)}`);

  // 1. Summary Section
  console.log(
    "┌── SUMMARY ───────────────────────────────────────────────────"
  );
  console.log(`│ TYPE:      ${explanation.summary.type.padEnd(48)} │`);
  console.log(`│ VERSION:   ${explanation.summary.version.padEnd(48)} │`);
  console.log(`│ NETWORK:   ${explanation.summary.network.padEnd(48)} │`);
  console.log(`│ MODE:      ${explanation.summary.mode.toUpperCase().padEnd(48)} │`);
  console.log(`│ CREATED:   ${explanation.summary.createdAt.padEnd(48)} │`);
  console.log(
    `│ STATUS:    ${explanation.summary.status.toUpperCase().padEnd(48)} │`
  );
  console.log(
    "└──────────────────────────────────────────────────────────────"
  );

  // 2. Identity Section
  console.log("\n[ IDENTITY & LINEAGE ]");
  console.log(`  ArtifactId: ${explanation.identity.artifactId}`);
  console.log(`  Hash:       ${explanation.identity.contentHash}`);
  if (explanation.identity.lineageId) {
    console.log(`  LineageId:  ${explanation.identity.lineageId}`);
    console.log(`  RootId:     ${explanation.identity.rootArtifactId}`);
    console.log(
      `  ParentId:   ${explanation.identity.parentArtifactId || "None (Root)"}`
    );
  }
  const parent = explanation.identity.parent;
  if (parent.status !== "root") {
    const found =
      parent.status === "resolved"
        ? "resolved (a verified copy is in the workspace store)"
        : parent.status === "missing"
          ? "MISSING from the workspace store"
          : parent.status === "invalid"
            ? `INVALID (a copy is there but does not verify${parent.detail ? `: ${parent.detail}` : ""})`
            : `not resolved${parent.detail ? ` (${parent.detail})` : ""}`;
    console.log(`  Parent:     ${found}`);
  }

  // 3. Economics Section
  if (explanation.economics) {
    console.log("\n[ ECONOMIC AUDIT ]");
    if (explanation.economics.ok) {
      UI.success("  ✓ Economic invariants verified.");
    } else {
      UI.error("  ✗ Economic invariants VIOLATED.");
    }

    console.log(`\n  Mass:`);
    console.log(`    Reported:   ${explanation.economics.mass.reported}`);
    console.log(`    Recomputed: ${explanation.economics.mass.recomputed}`);

    console.log(`\n  Fees:`);
    console.log(
      `    Reported:   ${formatSompiToKas(explanation.economics.fee.reported)}`
    );
    console.log(
      `    Recomputed: ${formatSompiToKas(explanation.economics.fee.recomputed)}`
    );
    console.log(`    Rate:       ${explanation.economics.fee.rate} sompi/mass`);

    if (explanation.economics.fee.delta !== 0n) {
      const delta = explanation.economics.fee.delta;
      const type = delta > 0n ? "Overpaid" : "Underpaid";
      // formatSompiToKas handles the sign, but we might want absolute for delta display with a type suffix
      const absDelta = delta < 0n ? -delta : delta;
      console.log(`    Delta:      ${formatSompiToKas(absDelta)} (${type})`);
    }

    console.log(`\n  Balance Sheet:`);
    console.log(
      `    Total Inputs:  ${formatSignedSompiToKas(explanation.economics.balance.inputs)}`
    );
    console.log(
      `    Total Outputs: ${formatSignedSompiToKas(explanation.economics.balance.outputs)}`
    );
    if (explanation.economics.balance.change > 0n) {
      console.log(
        `    Change:        ${formatSignedSompiToKas(explanation.economics.balance.change)}`
      );
    }
    console.log(
      `    Implied Fee:   ${formatSignedSompiToKas(explanation.economics.balance.impliedFee)}`
    );
  }

  // 4. Security Section
  console.log("\n[ SECURITY & INTEGRITY ]");
  if (explanation.security.strictOk) {
    UI.success("  ✓ No critical integrity violations detected.");
  } else {
    const hasErrors = explanation.security.issues.some(
      (i: any) => i.severity === "critical" || i.severity === "error"
    );
    if (hasErrors) {
      UI.error("  ✗ SECURITY WARNINGS DETECTED.");
      // Will throw at the end of the function to preserve cleanup/output
    } else {
      UI.warning("  ⚠ SECURITY WARNINGS DETECTED.");
    }
  }

  if (explanation.security.issues.length > 0) {
    explanation.security.issues.forEach((issue) => {
      const prefix =
        issue.severity === "critical"
          ? "CRITICAL"
          : issue.severity === "error"
            ? "ERROR"
            : "WARNING";
      console.log(`  • [${prefix}] [${issue.code}] ${issue.message}`);
    });
  }

  UI.divider();

  if (explanation.security && !explanation.security.strictOk) {
    const hasErrors = explanation.security.issues.some(
      (i: any) => i.severity === "critical" || i.severity === "error"
    );
    if (hasErrors) {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError("SECURITY_WARNINGS", "Security warnings detected.", {
        exitCode: 1
      });
    }
  }
}
