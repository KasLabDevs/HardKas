import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { diffReplays, LayeredReplayDiff } from "@hardkas/core";
import { UI } from "../ui.js";

export interface ReplayDiffOptions {
  idA: string;
  idB: string;
  json?: boolean;
  network: string;
  workspaceRoot: string;
}

export async function runReplayDiff(options: ReplayDiffOptions) {
  const { Hardkas } = await import("@hardkas/sdk");
  const sdk = await Hardkas.open({ cwd: options.workspaceRoot });
  const artifactDir = sdk.workspace.artifactsDir;
  
  const pathA = path.join(artifactDir, `${options.idA}.json`);
  const pathB = path.join(artifactDir, `${options.idB}.json`);

  let replayA, replayB;

  try {
    const contentA = await fs.readFile(pathA, "utf-8");
    replayA = JSON.parse(contentA);
  } catch {
    throw new Error(`Could not read replay artifact A: ${options.idA} at ${pathA}`);
  }

  try {
    const contentB = await fs.readFile(pathB, "utf-8");
    replayB = JSON.parse(contentB);
  } catch {
    throw new Error(`Could not read replay artifact B: ${options.idB} at ${pathB}`);
  }

  const diffResult = diffReplays(replayA, replayB);

  if (options.json) {
    console.log(JSON.stringify(diffResult, null, 2));
    return;
  }

  UI.header(`Replay Diff: ${options.idA} vs ${options.idB}`);

  // 1. Structural Diff
  console.log(`\n  ${pc.bold("1. Structural Diff (Layer 1)")}`);
  if (diffResult.structural.missingArtifacts.length === 0 && diffResult.structural.excludedArtifacts.length === 0 && diffResult.structural.missingProjections.length === 0) {
    console.log(`    ${pc.green("✓")} No structural differences`);
  } else {
    diffResult.structural.missingArtifacts.forEach(a => console.log(`    ${pc.red("-")} Missing artifact: ${a}`));
    diffResult.structural.missingProjections.forEach(p => console.log(`    ${pc.red("-")} Missing projection: ${p}`));
    diffResult.structural.excludedArtifacts.forEach(e => console.log(`    ${pc.red("-")} Excluded artifact: ${e}`));
  }

  // 2. Deterministic Diff
  console.log(`\n  ${pc.bold("2. Deterministic Diff (Layer 2)")}`);
  if (!diffResult.deterministic.stateRootDiverged && !diffResult.deterministic.lineageDiverged && !diffResult.deterministic.graphDiverged && diffResult.deterministic.differences.length === 0) {
    console.log(`    ${pc.green("✓")} No deterministic divergence`);
  } else {
    if (diffResult.deterministic.stateRootDiverged) console.log(`    ${pc.red("✗")} State Root diverged`);
    if (diffResult.deterministic.lineageDiverged) console.log(`    ${pc.red("✗")} Lineage diverged`);
    if (diffResult.deterministic.graphDiverged) console.log(`    ${pc.red("✗")} Causality Graph diverged`);
    
    diffResult.deterministic.differences.forEach(d => {
      console.log(`    ${pc.yellow("~")} Path: ${d.path}`);
      console.log(`      A: ${JSON.stringify(d.a)}`);
      console.log(`      B: ${JSON.stringify(d.b)}`);
    });
  }

  // 3. Observational Noise Diff
  console.log(`\n  ${pc.bold("3. Runtime Noise Diff (Layer 3)")}`);
  if (diffResult.observational.timestampShifts.length === 0 && diffResult.observational.eventOrderingShifts.length === 0 && diffResult.observational.metadataDrift.length === 0) {
    console.log(`    ${pc.green("✓")} No observational shifts`);
  } else {
    diffResult.observational.timestampShifts.forEach(t => console.log(`    ${pc.blue("~")} Timestamp shift in ${t.path}: ${t.shiftMs}ms`));
    diffResult.observational.eventOrderingShifts.forEach(o => console.log(`    ${pc.blue("~")} Ordering shift: ${o}`));
    diffResult.observational.metadataDrift.forEach(m => console.log(`    ${pc.blue("~")} Metadata drift: ${m}`));
  }

  console.log("");
}
