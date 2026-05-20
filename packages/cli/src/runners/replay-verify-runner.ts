import { readTxPlanArtifact, readTxReceiptArtifact } from "@hardkas/artifacts";
import { loadOrCreateLocalnetState, verifyReplay } from "@hardkas/localnet";
import { UI } from "../ui.js";
import path from "node:path";
import fs from "node:fs";
import pc from "picocolors";
import { verifyArtifactIntegrity } from "@hardkas/artifacts";
import { WorkspaceNotFoundError, ReplayVerificationError } from "../cli-errors.js";

export interface ReplayVerifyOptions {
  path: string;
  json?: boolean;
}

export async function runReplayVerify(options: ReplayVerifyOptions) {
  const artifactDir = path.resolve(process.cwd(), options.path);
  
  if (!fs.existsSync(path.join(artifactDir, "hardkas.config.ts"))) {
    throw new WorkspaceNotFoundError(options.path);
  }
  
  const planPath = path.join(artifactDir, "tx-plan.json");
  const receiptPath = path.join(artifactDir, "tx-receipt.json");

  // Collect all files from canonical directories + workspace root tx-*.json
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

  function isContaminated(artifact: any): boolean {
    if (artifact.networkId && artifact.networkId !== "simnet") {
      const str = JSON.stringify(artifact);
      if (str.includes("kaspa:sim_")) {
        return true;
      }
    }
    return false;
  }

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const json = JSON.parse(content);
      if (json && json.schema && typeof json.schema === "string" && json.schema.startsWith("hardkas.")) {
        artifactCount++;
        
        // Check contamination
        if (isContaminated(json)) {
          contaminationOk = false;
        }

        // Check determinism only for core artifacts with cryptographic/deterministic content hashes
        const isCoreArtifact = ["hardkas.txPlan", "hardkas.signedTx", "hardkas.txReceipt", "hardkas.snapshot"].includes(json.schema);
        if (isCoreArtifact) {
          const integrity = await verifyArtifactIntegrity(json);
          if (!integrity.ok) {
            determinismOk = false;
          }
        }
      } else {
        lineageOk = false;
      }
    } catch (e) {
      lineageOk = false;
      determinismOk = false;
    }
  }

  // Load plan and receipt
  let plan: any;
  let receipt: any;
  let verifyErrorMsg: string | undefined;
  let report: any = null;

  try {
    if (!fs.existsSync(planPath)) {
      throw new Error(`Transaction plan artifact is missing at: ${planPath}`);
    }
    if (!fs.existsSync(receiptPath)) {
      throw new Error(`Transaction receipt artifact is missing at: ${receiptPath}`);
    }
    plan = await readTxPlanArtifact(planPath);
    receipt = await readTxReceiptArtifact(receiptPath);
  } catch (err: any) {
    verifyErrorMsg = err.message;
  }

  if (!verifyErrorMsg && plan && receipt) {
    try {
      let state = await loadOrCreateLocalnetState();

      if (receipt.mode === "simulated" && receipt.daaScore) {
        const receiptDaa = BigInt(receipt.daaScore);
        const targetDaa = receiptDaa - 1n;
        
        const reconstructedUtxos = state.utxos
          .filter(u => BigInt(u.createdAtDaaScore || "0") <= targetDaa)
          .map(u => {
            if (u.spent && u.spentAtDaaScore && BigInt(u.spentAtDaaScore) >= receiptDaa) {
              const { spentAtDaaScore: _, ...rest } = u;
              return { ...rest, spent: false };
            }
            return u;
          });

        state = {
          ...state,
          daaScore: targetDaa.toString(),
          utxos: reconstructedUtxos
        };
      }

      report = verifyReplay(state, plan, receipt);
    } catch (err: any) {
      verifyErrorMsg = `Replay execution failed: ${err.message}`;
    }
  }

  const invariantsOk = report ? report.invariantsOk : false;
  const passed = lineageOk && determinismOk && contaminationOk && invariantsOk && !verifyErrorMsg;

  if (options.json) {
    console.log(JSON.stringify({
      workspace: options.path,
      artifacts: artifactCount,
      lineage: lineageOk ? "valid" : "invalid",
      determinism: determinismOk ? "verified" : "failed",
      contamination: contaminationOk ? "clean" : "contaminated",
      result: passed ? "PASS" : "FAIL"
    }, null, 2));
  } else {
    UI.header(`Replay Verification: ${path.basename(artifactDir)}`);
    console.log(`  Workspace:      ${options.path}`);
    console.log(`  Artifacts:      ${artifactCount}`);
    console.log(`  Lineage:        ${lineageOk ? pc.green("✓ valid") : pc.red("✗ invalid")}`);
    console.log(`  Determinism:    ${determinismOk ? pc.green("✓ verified") : pc.red("✗ failed")}`);
    console.log(`  Contamination:  ${contaminationOk ? pc.green("✓ clean") : pc.red("✗ contaminated")}`);
    console.log(`  Result:         ${passed ? pc.green("PASS") : pc.red("FAIL")}`);
    console.log("");
  }

  if (!passed) {
    if (verifyErrorMsg) {
      throw new Error(`Failed to perform replay verification: ${verifyErrorMsg}`);
    }
    throw new ReplayVerificationError(report || {
      schema: "hardkas.replayReport.v1",
      txId: receipt?.txId || "unknown",
      planOk: false,
      receiptOk: false,
      invariantsOk: false,
      checks: {
        workflowDeterministic: "diverged",
        consensusValidation: "unimplemented",
        l2BridgeCorrectness: "unimplemented"
      },
      divergences: [],
      errors: [verifyErrorMsg || "Artifact replay verification failed due to diagnostic failures."]
    });
  }
}
