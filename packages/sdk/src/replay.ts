import fs from "node:fs";
import path from "node:path";
import { 
  readTxPlanArtifact, 
  readTxReceiptArtifact, 
  verifyArtifactIntegrity,
  writeArtifact
} from "@hardkas/artifacts";
import type { Hardkas } from "./index.js";

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

export class HardkasReplay {
  constructor(private sdk: Hardkas) {}

  /**
   * Verifies the deterministic artifact lineage of a transaction replay 
   * against the mathematically reconstructed localnet state.
   */
  async verify(options: ReplayVerifyOptions): Promise<ReplayVerifyResult> {
    const artifactDir = options.path ? path.resolve(this.sdk.config.cwd, options.path) : this.sdk.config.cwd;
    
    if (options.path && !fs.existsSync(path.join(artifactDir, "hardkas.config.ts"))) {
      throw new Error(`Workspace not found at ${options.path}`);
    }
    
    const planPath = path.join(artifactDir, "tx-plan.json");
    const receiptPath = path.join(artifactDir, "tx-receipt.json");

    // Collect files
    const canonicalDirs = [
      path.join(artifactDir, ".hardkas", "receipts"),
      path.join(artifactDir, ".hardkas", "traces"),
      path.join(artifactDir, ".hardkas", "deployments"),
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
      if (artifact.networkId && artifact.networkId !== "simnet" && artifact.networkId !== "simulated") {
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
        if (json && json.schema && typeof json.schema === "string" && json.schema.startsWith("hardkas.")) {
          artifactCount++;
          
          if (isContaminated(json)) contaminationOk = false;

          const isCoreArtifact = ["hardkas.txPlan", "hardkas.signedTx", "hardkas.txReceipt", "hardkas.snapshot"].includes(json.schema);
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
    if (options.workflowId) {
      try {
        const wfArtifactPath = fs.readdirSync(this.sdk.workspace.artifactsDir)
          .find(f => f.includes(options.workflowId!) && f.endsWith(".json"));
        
        if (!wfArtifactPath) throw new Error("Workflow artifact not found");
        
        const wfArtifactStr = fs.readFileSync(path.join(this.sdk.workspace.artifactsDir, wfArtifactPath), "utf-8");
        const wfArtifact = JSON.parse(wfArtifactStr) as Record<string, unknown>;
        
        if (wfArtifact.schema !== "hardkas.workflow.v1") {
          throw new Error(`Artifact ${options.workflowId} is not a workflow artifact`);
        }

        const childArtifacts = (wfArtifact.producedArtifacts as string[]) || [];
        for (const childId of childArtifacts) {
          const childFile = fs.readdirSync(this.sdk.workspace.artifactsDir)
            .find(f => f.includes(childId as string) && f.endsWith(".json"));
          if (!childFile) throw new Error(`Child artifact ${childId} not found`);
          const childStr = fs.readFileSync(path.join(this.sdk.workspace.artifactsDir, childFile), "utf-8");
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

      } catch (e: any) {
        verifyErrorMsg = `Workflow Replay failed: ${e.message}`;
        lineageOk = false;
        determinismOk = false;
      }
    } 
    // Classic Transaction Replay Path
    else if (options.path) {
      try {
        if (!fs.existsSync(planPath)) throw new Error(`Transaction plan artifact is missing at: ${planPath}`);
        if (!fs.existsSync(receiptPath)) throw new Error(`Transaction receipt artifact is missing at: ${receiptPath}`);
        plan = await readTxPlanArtifact(planPath);
        receipt = await readTxReceiptArtifact(receiptPath);
      } catch (err: any) {
        verifyErrorMsg = err.message;
      }

      if (!verifyErrorMsg && plan && receipt) {
        try {
          const { loadOrCreateLocalnetState, reconstructStateAtDaa, verifyReplay } = await import("@hardkas/localnet");
          const { systemRuntimeContext } = await import("@hardkas/core");
          
          let state = await loadOrCreateLocalnetState();

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
        } catch (err: any) {
          verifyErrorMsg = `Replay execution failed: ${err.message}`;
        }
      }
    } else {
      verifyErrorMsg = "No path or workflowId provided for replay verification";
    }

    const invariantsOk = report ? report.invariantsOk : false;
    const passed = lineageOk && determinismOk && contaminationOk && invariantsOk && !verifyErrorMsg;

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
