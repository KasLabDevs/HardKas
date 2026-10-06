import { Hardkas, HardkasOptions } from "@hardkas/sdk";
import fs from "node:fs";
import path from "node:path";
import { UI, handleError } from "../ui.js";
import type { WorkflowArtifact } from "@hardkas/artifacts";
import { HardkasSchemas } from "@hardkas/artifacts";
import { stripBom } from "@hardkas/core";

/**
 * SURFACE-TRUTH-1A: `latest` is the newest workflow artifact in the canonical store, where `workflow run` writes it
 * (`misc/`). The former lookup used `sdk.artifacts.list()`, which reads only the store's top level, so it never found
 * one. It resolves to the artifact's own identity (its contentHash), not to the workflowId runs of one definition share.
 */
async function latestWorkflowIdentity(workspaceRoot: string): Promise<string> {
  const { enumerateWorkspaceArtifactsSync } = await import("@hardkas/artifacts");
  const workflows = enumerateWorkspaceArtifactsSync(workspaceRoot)
    .map((entry) => entry.artifact as any)
    .filter((a) => a?.schema === HardkasSchemas.WorkflowV1 && typeof a.contentHash === "string")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (workflows.length === 0) throw new Error("No workflow artifacts found to resolve 'latest'.");
  return workflows[0].contentHash;
}

export async function runWorkflowRun(
  file: string,
  options: {
    workspaceRoot?: string;
    dryRun?: boolean;
    json?: boolean;
    network?: string;
    offline?: boolean;
    timeout?: string;
  }
) {
  try {
    if (options.json) UI.setJsonMode(true);

    let fullPath = path.resolve(process.cwd(), file);

    // Implicit resolution logic
    if (!fs.existsSync(fullPath) && !file.endsWith(".json")) {
      const explicitExt = `${file}.json`;
      const candidates = [
        path.resolve(process.cwd(), ".hardkas/workflows", explicitExt),
        path.resolve(process.cwd(), "examples/workflows", explicitExt)
      ];

      const found = candidates.filter((c) => fs.existsSync(c));
      if (found.length > 1) {
        throw new Error(
          `Ambiguous workflow name '${file}'. Found multiple matches:\n- ${found.join("\n- ")}`
        );
      } else if (found.length === 1) {
        fullPath = found[0]!;
      }
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Workflow definition not found: ${file}`);
    }

    const content = fs.readFileSync(fullPath, "utf8");
    const def = JSON.parse(stripBom(content));

    if (!def.steps || !Array.isArray(def.steps)) {
      throw new Error("Invalid workflow definition: missing 'steps' array");
    }

    UI.info(`Initializing Workflow Runtime in Agent Mode...`);

    // We instantiate HardKAS explicitly in agent mode to sandbox the execution.
    const sdk = await Hardkas.open({
      ...(options.workspaceRoot ? { cwd: options.workspaceRoot } : {}),
      network: options.network,
      mode: "agent",
      policy: {
        requireDryRun: options.dryRun || false,
        allowNetwork: options.offline ? false : def.allowNetwork || false,
        allowMainnet: false // Never allow mainnet via CLI workflows for now
      }
    } as HardkasOptions);

    UI.info(`Running ${def.steps.length} workflow steps...`);

    let resultPromise = sdk.workflow.run({
      steps: def.steps,
      ...(options.dryRun !== undefined && { dryRun: options.dryRun })
    });

    if (options.timeout) {
      const timeoutMs = parseInt(options.timeout, 10);
      if (!isNaN(timeoutMs)) {
        const timeoutPromise = new Promise<any>((_, reject) => {
          setTimeout(
            () => reject(new Error(`Workflow execution timed out after ${timeoutMs}ms`)),
            timeoutMs
          );
        });
        resultPromise = Promise.race([resultPromise, timeoutPromise]);
      }
    }

    const result = await resultPromise;

    if (result.status === "failed") {
      if (options.json) {
        UI.writeJson(result);
      } else {
        UI.warning(`Artifact generated but marked as failed: ${result.workflowId}`);
      }
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError(
        "WORKFLOW_FAILED",
        `Workflow failed (${result.errorEnvelope?.code ?? "unknown"}): ${result.errorEnvelope?.message}`,
        { exitCode: 1 }
      );
    }

    if (options.json) {
      UI.writeJson(result);
    } else {
      UI.success(`Workflow completed successfully: ${result.workflowId}`);
      if (result.producedArtifacts.length > 0) {
        UI.info(`Produced ${result.producedArtifacts.length} child artifacts.`);
      }
    }
  } catch (e: unknown) {
    if (((e as any).name) === "HardkasCliError") throw e;
    const { HardkasCliError } = await import("../cli-errors.js");
    // a typed SDK error (e.g. POLICY_VIOLATION) keeps its code
    const code = (e as any)?.name === "HardkasError" && typeof (e as any).code === "string" ? (e as any).code : "WORKFLOW_ERROR";
    throw new HardkasCliError(code, ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) || "Unknown error", {
      exitCode: 1,
      cause: e
    });
  }
}

export async function runWorkflowInspect(
  id: string,
  options: { workspaceRoot?: string; json?: boolean }
) {
  try {
    if (options.json) UI.setJsonMode(true);
    const sdk = await Hardkas.open({
      ...(options.workspaceRoot ? { cwd: options.workspaceRoot } : {}),
      mode: "agent"
    });

    let targetId = id;
    if (id === "latest") {
      targetId = await latestWorkflowIdentity(sdk.workspace.root);
      UI.info(`Resolved 'latest' to workflow artifact: ${targetId}`);
    }

    // IC-5′.2: a workflowId is the `workflow` namespace; a 64-hex id or a path is the artifact namespace.
    const artifact = (await sdk.artifacts.read(
      /^[0-9a-f]{64}$/.test(targetId) || /[\\/]/.test(targetId) ? targetId : { workflow: targetId }
    )) as WorkflowArtifact;

    if (artifact.schema !== HardkasSchemas.WorkflowV1) {
      throw new Error(`Artifact ${id} is not a valid workflow artifact`);
    }

    if (options.json) {
      UI.writeJson(artifact);
      return;
    }

    UI.success(`Workflow Artifact: ${id}`);
    console.log(`  Status: ${artifact.status}`);
    console.log(`  Steps executed: ${artifact.steps.length}`);
    console.log(`  Produced artifacts: ${artifact.producedArtifacts.length}`);
  } catch (e: unknown) {
    if (((e as any).name) === "HardkasCliError") throw e;
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("WORKFLOW_INSPECT_ERROR", ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) || "Unknown error", {
      exitCode: 1,
      cause: e
    });
  }
}

/**
 * SURFACE-TRUTH-1A (ST-I3): there is no workflow replay. The former runner asked `sdk.replay.verify({ workflowId })`,
 * which always answers "Workflow Replay via ID not supported", behind a success line that claimed a "cryptographically
 * secured" replay. The command is hidden and refuses until a real replay of a workflow's steps exists.
 */
export async function runWorkflowReplay(_id: string, _options: any): Promise<never> {
  const { HardkasCliError } = await import("../cli-errors.js");
  throw new HardkasCliError(
    "WORKFLOW_REPLAY_UNSUPPORTED",
    "Workflow replay is not supported: no replay of a workflow's steps exists. A simulated receipt can be replayed with `hardkas replay verify <receipt>`. Nothing was replayed.",
    { exitCode: 1 }
  );
}

export async function runWorkflowDiff(
  idA: string,
  idB: string,
  options: { workspaceRoot?: string }
) {
  try {
    const sdk = await Hardkas.open({
      ...(options.workspaceRoot ? { cwd: options.workspaceRoot } : {})
    } as HardkasOptions);

    const resolveAlias = async (id: string) => (id === "latest" ? latestWorkflowIdentity(sdk.workspace.root) : id);
    const asLookup = (id: string) =>
      /^[0-9a-f]{64}$/.test(id) || /[\\/]/.test(id) ? id : { workflow: id };

    const targetIdA = await resolveAlias(idA);
    const targetIdB = await resolveAlias(idB);

    UI.info(`Comparing Workflow A (${targetIdA}) against Workflow B (${targetIdB})...`);

    const wfA = (await sdk.artifacts.read(asLookup(targetIdA))) as WorkflowArtifact;
    const wfB = (await sdk.artifacts.read(asLookup(targetIdB))) as WorkflowArtifact;

    if (wfA.schema !== HardkasSchemas.WorkflowV1 || wfB.schema !== HardkasSchemas.WorkflowV1) {
      throw new Error("Both artifacts must be workflows");
    }

    UI.info("\n=== Metadata Diff ===");
    console.log(
      `Generation Range A: ${wfA.generationRange?.start || "none"} -> ${wfA.generationRange?.end || "none"}`
    );
    console.log(
      `Generation Range B: ${wfB.generationRange?.start || "none"} -> ${wfB.generationRange?.end || "none"}`
    );

    UI.info("\n=== Produced Artifacts Diff ===");
    console.log(`A: ${wfA.producedArtifacts?.length || 0} artifacts`);
    console.log(`B: ${wfB.producedArtifacts?.length || 0} artifacts`);

    UI.info("\n=== Steps Diff ===");
    console.log(`A: ${wfA.steps?.length || 0} steps executed`);
    console.log(`B: ${wfB.steps?.length || 0} steps executed`);
  } catch (e: unknown) {
    if (((e as any).name) === "HardkasCliError") throw e;
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("WORKFLOW_DIFF_ERROR", ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) || "Unknown error", {
      exitCode: 1,
      cause: e
    });
  }
}
