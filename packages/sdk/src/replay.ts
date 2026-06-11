import fs from "node:fs";
import path from "node:path";
import {
  readTxPlanArtifact,
  readTxReceiptArtifact,
  verifyArtifactIntegrity,
  writeArtifact
} from "@hardkas/artifacts";
import { deterministicCompare } from "@hardkas/core";
import type { Hardkas } from "./index.js";
import { HardkasSchemas } from "@hardkas/artifacts";

export interface ReplayVerifyOptions {
  path?: string;
  workflowId?: string;
}

export interface ReplayVerifyResult {
  passed: boolean;
  artifactsScanned: number;
  lineage: "valid" | "invalid";
  determinism: "verified" | "failed";
  contamination: "clean" | "contaminated";
  report: any;
  error?: string;
}

interface ReplayTargets {
  planPath: string;
  receiptPath: string;
  artifactDir: string;
  source: "explicit-file" | "explicit-dir" | "artifact-scan" | "workflow-id" | "none";
}

/**
 * Pure function: resolves plan and receipt artifact paths.
 * Never mutates `options`.
 */
function resolveReplayTargets(cwd: string, options: ReplayVerifyOptions): ReplayTargets {
  // 1. Explicit file path
  if (options.path) {
    const fullPath = path.resolve(cwd, options.path);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Path not found: ${options.path}`);
    }

    if (fs.statSync(fullPath).isFile()) {
      const dir = path.dirname(fullPath);
      // Read plan to get planId for receipt matching
      let planId = "";
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
        planId = data.planId || "";
      } catch {
        /* ignore */
      }

      // Find receipt by scanning directory for matching sourcePlanId
      let receiptPath = "";
      if (planId) {
        receiptPath = findReceiptByPlanId(dir, planId);
      }

      return {
        planPath: fullPath,
        receiptPath,
        artifactDir: dir,
        source: "explicit-file"
      };
    }

    // Explicit directory
    return resolveFromDirectory(fullPath, "explicit-dir");
  }

  // 2. Workflow ID (no path) — use defaults
  if (options.workflowId) {
    return {
      planPath: path.join(cwd, "tx-plan.json"),
      receiptPath: path.join(cwd, "tx-receipt.json"),
      artifactDir: cwd,
      source: "workflow-id"
    };
  }

  // 3. No path, no workflowId → scan .hardkas/artifacts/
  const artifactsDir = path.join(cwd, ".hardkas", "artifacts");
  if (!fs.existsSync(artifactsDir) || !fs.statSync(artifactsDir).isDirectory()) {
    throw new Error(
      `No .hardkas/artifacts/ directory found.\n` +
        `  Hint: Run 'hardkas init' first, then execute a transaction.`
    );
  }

  return resolveFromDirectory(artifactsDir, "artifact-scan");
}

/**
 * Scans a directory for plan/receipt artifacts and picks the best match.
 * Matches plan→receipt by sourcePlanId metadata (not filename).
 */
function resolveFromDirectory(
  dir: string,
  source: "explicit-dir" | "artifact-scan"
): ReplayTargets {
  const allFiles = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

  // Parse all artifacts
  const plans: { file: string; planId: string; createdAt: string }[] = [];
  const receipts: {
    file: string;
    sourcePlanId: string;
    txId: string;
    createdAt: string;
  }[] = [];

  for (const f of allFiles) {
    try {
      const raw = fs.readFileSync(path.join(dir, f), "utf-8");
      const data = JSON.parse(raw);
      if (!data || !data.schema) continue;

      if (data.schema === HardkasSchemas.TxPlan) {
        plans.push({
          file: f,
          planId: data.planId || "",
          createdAt: data.createdAt || ""
        });
      } else if (data.schema === HardkasSchemas.TxReceipt) {
        receipts.push({
          file: f,
          sourcePlanId:
            data.sourcePlanId ||
            data.lineage?.parentArtifactId ||
            data.lineage?.rootArtifactId ||
            "",
          txId: data.txId || "",
          createdAt: data.createdAt || ""
        });
      }
    } catch {
      /* skip */
    }
  }

  if (plans.length === 0) {
    throw new Error(
      `No plan artifacts found in ${dir}.\n` +
        `  Hint: Run a transaction first: hardkas tx send --from alice --to bob --amount 10 --network simulated --yes`
    );
  }

  // Sort plans newest first
  plans.sort((a, b) => deterministicCompare(b.createdAt, a.createdAt));

  // Strategy: pick most recent plan that has a matching receipt
  // Match by: (1) sourcePlanId, (2) txId contains planId, (3) createdAt proximity
  for (const plan of plans) {
    const matchingReceipt = receipts.find(
      (r) =>
        // Direct sourcePlanId match
        (r.sourcePlanId && r.sourcePlanId === plan.planId) ||
        // txId derived from planId (e.g., "simulated-plan-xxx-tx" contains "plan-xxx")
        (r.txId && plan.planId && r.txId.includes(plan.planId))
    );
    if (matchingReceipt) {
      return {
        planPath: path.join(dir, plan.file),
        receiptPath: path.join(dir, matchingReceipt.file),
        artifactDir: dir,
        source
      };
    }
  }

  // No plan has a matching receipt — pick most recent plan, report missing receipt
  const bestPlan = plans[0]!;
  return {
    planPath: path.join(dir, bestPlan.file),
    receiptPath: "", // Will trigger actionable error downstream
    artifactDir: dir,
    source
  };
}

/**
 * Finds a receipt artifact whose sourcePlanId matches the given planId.
 */
function findReceiptByPlanId(dir: string, planId: string): string {
  if (!fs.existsSync(dir)) return "";
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, f), "utf-8");
      const data = JSON.parse(raw);
      if (
        data &&
        data.schema === HardkasSchemas.TxReceipt &&
        ((data.sourcePlanId && data.sourcePlanId === planId) ||
          (data.lineage?.parentArtifactId && data.lineage.parentArtifactId === planId) ||
          (data.lineage?.rootArtifactId && data.lineage.rootArtifactId === planId) ||
          (data.txId && data.txId.includes(planId)))
      ) {
        return path.join(dir, f);
      }
    } catch {
      /* skip */
    }
  }
  return "";
}

export class HardkasReplay {
  constructor(private sdk: Hardkas) {}

  /**
   * Verifies the deterministic artifact lineage of a transaction replay
   * against the mathematically reconstructed localnet state.
   */
  async verify(
    targetOrOptions?:
      | string
      | { schema?: string; artifactId?: string }
      | ReplayVerifyOptions,
    options?: ReplayVerifyOptions
  ): Promise<ReplayVerifyResult> {
    const throwOnInvalid = (options as any)?.throwOnInvalid !== false;
    if (
      typeof targetOrOptions === "object" &&
      targetOrOptions !== null &&
      (targetOrOptions as any).contentHash
    ) {
      const verifyRes = await this.sdk.artifacts.verify(targetOrOptions, {
        throwOnInvalid,
        strict: true
      });
      if (!verifyRes.valid && !throwOnInvalid) {
        return {
          passed: false,
          artifactsScanned: 1,
          lineage: "invalid",
          determinism: "failed",
          contamination: "clean",
          report: null,
          error: `Artifact verification failed: ${verifyRes.reason}`
        };
      }
    }

    let opts: ReplayVerifyOptions = options || {};

    if (typeof targetOrOptions === "string") {
      opts.path = targetOrOptions;
    } else if (targetOrOptions && "artifactId" in targetOrOptions) {
      opts.path = (targetOrOptions as any).artifactId;
    } else if (targetOrOptions) {
      opts = { ...opts, ...(targetOrOptions as ReplayVerifyOptions) };
    }

    const targets = resolveReplayTargets(this.sdk.config.cwd, opts);
    let { planPath, receiptPath, artifactDir } = targets;

    // We only check hardkas.config.ts if they gave us a directory that isn't the CWD?
    // Actually we can skip that check or just check workspace.root.
    if (!fs.existsSync(path.join(this.sdk.config.cwd, "hardkas.config.ts"))) {
      throw new Error(`Workspace not found at ${this.sdk.config.cwd}`);
    }

    // Collect files
    const canonicalDirs = [
      path.join(this.sdk.workspace.hardkasDir, "receipts"),
      path.join(this.sdk.workspace.hardkasDir, "traces"),
      path.join(this.sdk.workspace.hardkasDir, "deployments")
    ];

    const files: string[] = [];
    for (const dir of canonicalDirs) {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        const list = fs.readdirSync(dir);
        for (const f of list) {
          if (f.endsWith(".json")) {
            files.push(path.join(dir, f));
          }
        }
      }
    }

    if (fs.existsSync(artifactDir) && fs.statSync(artifactDir).isDirectory()) {
      const rootFiles = fs.readdirSync(artifactDir);
      for (const f of rootFiles) {
        if (f.startsWith("tx-") && f.endsWith(".json")) {
          files.push(path.join(artifactDir, f));
        }
      }
    }

    let artifactCount = 0;
    let lineageOk = true;
    let determinismOk = true;
    let contaminationOk = true;

    const isContaminated = (artifact: any): boolean => {
      if (
        artifact.networkId &&
        artifact.networkId !== "simnet" &&
        artifact.networkId !== "simulated"
      ) {
        const str = JSON.stringify(artifact);
        if (str.includes("kaspa:sim_")) {
          return true;
        }
      }
      return false;
    };

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, "utf-8");
        const json = JSON.parse(content);
        if (
          json &&
          json.schema &&
          typeof json.schema === "string" &&
          json.schema.startsWith("hardkas.")
        ) {
          artifactCount++;

          if (isContaminated(json)) contaminationOk = false;

          const isCoreArtifact = [
            HardkasSchemas.TxPlan,
            HardkasSchemas.SignedTx,
            HardkasSchemas.TxReceipt,
            HardkasSchemas.Snapshot
          ].includes(json.schema);
          if (isCoreArtifact) {
            const integrity = await verifyArtifactIntegrity(json);
            if (!integrity.ok) determinismOk = false;
          }
        } else {
          lineageOk = false;
        }
      } catch (e) {
        lineageOk = false;
        determinismOk = false;
      }
    }

    let plan: any;
    let receipt: any;
    let verifyErrorMsg: string | undefined;
    let report: any = null;

    // Workflow Replay Path
    if (opts.workflowId) {
      try {
        const wfArtifactPath = fs
          .readdirSync(this.sdk.workspace.artifactsDir)
          .find((f) => f.includes(opts.workflowId!) && f.endsWith(".json"));

        if (!wfArtifactPath) throw new Error("Workflow artifact not found");

        const wfArtifactStr = fs.readFileSync(
          path.join(this.sdk.workspace.artifactsDir, wfArtifactPath),
          "utf-8"
        );
        const wfArtifact = JSON.parse(wfArtifactStr) as Record<string, unknown>;

        if (wfArtifact.schema !== HardkasSchemas.WorkflowV1) {
          throw new Error(`Artifact ${opts.workflowId} is not a workflow artifact`);
        }

        const childArtifacts = (wfArtifact.producedArtifacts as string[]) || [];
        for (const childId of childArtifacts) {
          const childFile = fs
            .readdirSync(this.sdk.workspace.artifactsDir)
            .find((f) => f.includes(childId as string) && f.endsWith(".json"));
          if (!childFile) throw new Error(`Child artifact ${childId} not found`);
          const childStr = fs.readFileSync(
            path.join(this.sdk.workspace.artifactsDir, childFile),
            "utf-8"
          );
          const child = JSON.parse(childStr) as Record<string, unknown>;
          const integrity = await verifyArtifactIntegrity(child);
          if (!integrity.ok) {
            determinismOk = false;
            verifyErrorMsg = `Child artifact ${childId} failed cryptographic determinism check: ${JSON.stringify(integrity.issues)}`;
            break;
          }
          if (isContaminated(child)) {
            contaminationOk = false;
            verifyErrorMsg = `Child artifact ${childId} is contaminated with simulated signatures in a real run`;
            break;
          }
          artifactCount++;
        }

        // Mock invariants report for workflows
        report = { invariantsOk: determinismOk && contaminationOk };
      } catch (e: unknown) {
        verifyErrorMsg = `Workflow Replay failed: ${((e instanceof Error) ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e))}`;
        lineageOk = false;
        determinismOk = false;
      }
    }
    // Classic Transaction Replay Path
    else if (targets.source !== "none") {
      try {
        if (!fs.existsSync(planPath))
          throw new Error(`Transaction plan artifact is missing at: ${planPath}`);
        if (!receiptPath || !fs.existsSync(receiptPath))
          throw new Error(
            `No matching receipt artifact found for plan at: ${planPath}\n` +
              `  Hint: Run 'hardkas tx send --from alice --to bob --amount 10 --network simulated --yes' to create a complete plan→sign→send chain.`
          );
        plan = await readTxPlanArtifact(planPath);
        receipt = await readTxReceiptArtifact(receiptPath);
      } catch (err: unknown) {
        verifyErrorMsg = ((err instanceof Error) ? ((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err)) : String(err));
      }

      if (!verifyErrorMsg && plan && receipt) {
        try {
          const { loadOrCreateLocalnetState, reconstructStateAtDaa, verifyReplay } =
            await import("@hardkas/localnet");
          const { systemRuntimeContext } = await import("@hardkas/core");

          let state = await loadOrCreateLocalnetState({ cwd: this.sdk.workspace.root });

          if (receipt.mode === "simulated" && receipt.daaScore) {
            const receiptDaa = BigInt(receipt.daaScore);
            const targetDaa = receiptDaa - 1n;

            state = reconstructStateAtDaa(state, targetDaa);
          }

          report = verifyReplay(state, plan, receipt, systemRuntimeContext);

          // Write replay report artifact to disk for query-store indexing and dashboard visibility
          const reportFilename = `${new Date().toISOString().replace(/:/g, "-")}-${receipt.txId}.replay.json`; // hardkas-determinism-allow: timestamped report file naming
          const reportPath = path.join(this.sdk.workspace.artifactsDir, reportFilename);
          await writeArtifact(reportPath, report);
        } catch (err: unknown) {
          verifyErrorMsg = `Replay execution failed: ${((err instanceof Error) ? ((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err)) : String(err))}`;
        }
      }
    } else {
      // This branch should no longer be reachable since the scan block above
      // either sets options.path or throws, but keep as a safety net.
      verifyErrorMsg = "No path or workflowId provided for replay verification";
    }

    const invariantsOk = report ? report.invariantsOk : false;
    const passed =
      lineageOk && determinismOk && contaminationOk && invariantsOk && !verifyErrorMsg;

    return {
      passed,
      artifactsScanned: artifactCount,
      lineage: lineageOk ? "valid" : "invalid",
      determinism: determinismOk ? "verified" : "failed",
      contamination: contaminationOk ? "clean" : "contaminated",
      report,
      ...(verifyErrorMsg ? { error: verifyErrorMsg } : {})
    };
  }
}
