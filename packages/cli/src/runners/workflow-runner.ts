import { Hardkas } from "@hardkas/sdk";
import fs from "node:fs";
import path from "node:path";
import { UI, handleError } from "../ui.js";

export async function runWorkflowRun(file: string, options: any) {
  try {
    const fullPath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Workflow definition not found: ${file}`);
    }

    const content = fs.readFileSync(fullPath, "utf8");
    const def = JSON.parse(content);

    if (!def.steps || !Array.isArray(def.steps)) {
      throw new Error("Invalid workflow definition: missing 'steps' array");
    }

    UI.info(`Initializing Workflow Runtime in Agent Mode...`);
    
    // We instantiate HardKAS explicitly in agent mode to sandbox the execution.
    const sdk = await Hardkas.open({ 
      cwd: options.workspaceRoot,
      mode: "agent",
      policy: {
        requireDryRun: options.dryRun || false,
        allowNetwork: def.allowNetwork || false,
        allowMainnet: false, // Never allow mainnet via CLI workflows for now
      }
    });

    UI.info(`Running ${def.steps.length} workflow steps...`);
    
    const result = await sdk.workflow.run({
      steps: def.steps,
      dryRun: options.dryRun
    });

    if (result.status === "failed") {
      UI.error(`Workflow failed: ${result.errorEnvelope?.message}`);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        UI.warn(`Artifact generated but marked as failed: ${result.workflowId}`);
      }
      process.exitCode = 1;
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      UI.success(`Workflow completed successfully: ${result.workflowId}`);
      if (result.producedArtifacts.length > 0) {
        UI.info(`Produced ${result.producedArtifacts.length} child artifacts.`);
      }
    }

  } catch (e) {
    handleError(e);
    process.exitCode = 1;
  }
}

export async function runWorkflowInspect(id: string, options: any) {
  try {
    const sdk = await Hardkas.open({ cwd: options.workspaceRoot });
    const artifact = await sdk.artifacts.read(id);
    
    if (artifact.schema !== "hardkas.workflow.v1") {
      throw new Error(`Artifact ${id} is not a workflow artifact. Found: ${artifact.schema}`);
    }

    if (options.json) {
      console.log(JSON.stringify(artifact, null, 2));
    } else {
      UI.success(`Workflow Artifact: ${id}`);
      console.log(`  Status: ${artifact.status}`);
      console.log(`  Steps executed: ${artifact.steps.length}`);
      console.log(`  Produced artifacts: ${artifact.producedArtifacts.length}`);
    }
  } catch (e) {
    handleError(e);
    process.exitCode = 1;
  }
}

export async function runWorkflowReplay(id: string, options: any) {
  try {
    const sdk = await Hardkas.open({ cwd: options.workspaceRoot });
    UI.info(`Replaying workflow lineage for ${id}...`);
    
    const result = await sdk.replay.verify({ workflowId: id });
    
    if (!result.passed) {
      UI.error(`Workflow replay failed: ${result.error || "Integrity verification failed"}`);
      process.exitCode = 1;
      return;
    }
    
    UI.success("Workflow replay verification passed (cryptographically secured).");
    console.log(`  Artifacts scanned: ${result.artifactsScanned}`);
    console.log(`  Determinism: ${result.determinism}`);
    console.log(`  Contamination: ${result.contamination}`);
    
  } catch (e) {
    handleError(e);
    process.exitCode = 1;
  }
}

export async function runWorkflowDiff(idA: string, idB: string, options: any) {
  try {
    const sdk = await Hardkas.open({ cwd: options.workspaceRoot });
    
    UI.info(`Comparing Workflow A (${idA}) against Workflow B (${idB})...`);
    
    const wfA = await sdk.artifacts.read(idA) as any;
    const wfB = await sdk.artifacts.read(idB) as any;
    
    if (wfA.schema !== "hardkas.workflow.v1" || wfB.schema !== "hardkas.workflow.v1") {
      throw new Error("Both artifacts must be workflows");
    }
    
    UI.info("\n=== Metadata Diff ===");
    console.log(`Generation Range A: ${wfA.generationRange?.start || "none"} -> ${wfA.generationRange?.end || "none"}`);
    console.log(`Generation Range B: ${wfB.generationRange?.start || "none"} -> ${wfB.generationRange?.end || "none"}`);
    
    UI.info("\n=== Produced Artifacts Diff ===");
    console.log(`A: ${wfA.producedArtifacts?.length || 0} artifacts`);
    console.log(`B: ${wfB.producedArtifacts?.length || 0} artifacts`);
    
    UI.info("\n=== Steps Diff ===");
    console.log(`A: ${wfA.steps?.length || 0} steps executed`);
    console.log(`B: ${wfB.steps?.length || 0} steps executed`);
    
  } catch (e) {
    handleError(e);
    process.exitCode = 1;
  }
}
