import { getOutput } from "../output.js";
import { Command } from "commander";
import pc from "picocolors";
import * as fs from "node:fs";
import * as path from "node:path";
import { UI } from "../ui.js";
import { HardkasCliError } from "../cli-errors.js";

const STATE_PATH = path.join(".hardkas", "silver-simulator", "state.json");
const NOT_EVIDENCE =
  "experimental bookkeeping simulation: no script runs; not evidence for any compile/deploy/spend/verify step or capability (use `hardkas silver` on the canonical node)";

/**
 * `hardkas simulator silver` — the experimental SilverScript P2SH bookkeeping
 * simulator. Its SIMULATED_ACCEPTED receipts never satisfy `hardkas silver`,
 * corpus verification or certification.
 */
export function getSimulatorSilverCommand() {
  const cmd = new Command("silver").description(
    `SilverScript P2SH bookkeeping simulator ${UI.maturity("experimental")} (never evidence)`
  );

  cmd
    .command("deploy")
    .argument("<deploy-plan>")
    .description("Simulate a SilverScript deploy plan without a node")
    .action(async (deployPlanPath) => {
      const { simulateSilverDeploy } = await import("@hardkas/simulator");
      const { writeArtifact } = await import("@hardkas/artifacts");
      try {
        const result = simulateSilverDeploy(readJson(deployPlanPath));
        saveState(mergeState(loadState(), result.state));
        // IC-7.3: the file label derives from the identity; it is not stored in the artifact.
        const outPath = path.resolve(process.cwd(), `silverdeploysim-${result.receipt.contentHash.slice(0, 16)}.json`);
        await writeArtifact(outPath, result.receipt);
        report(outPath);
      } catch (error) {
        await rethrow(error);
      }
    });

  cmd
    .command("spend")
    .argument("<spend-plan>")
    .description("Simulate spending a simulated SilverScript output")
    .action(async (spendPlanPath) => {
      const { simulateSilverSpend, createSilverSimulationState } = await import("@hardkas/simulator");
      const { writeArtifact } = await import("@hardkas/artifacts");
      try {
        const result = simulateSilverSpend(readJson(spendPlanPath), loadState() ?? createSilverSimulationState());
        saveState(result.state);
        const outPath = path.resolve(process.cwd(), `silverspendsim-${result.receipt.contentHash.slice(0, 16)}.json`);
        await writeArtifact(outPath, result.receipt);
        report(outPath);
      } catch (error) {
        await rethrow(error);
      }
    });

  return cmd;
}

function report(outPath: string) {
  getOutput().writeLine(`${pc.yellow("SIMULATED_ACCEPTED")} ${pc.dim(`(${NOT_EVIDENCE})`)}`);
  getOutput().writeLine(`Artifact: ${pc.bold(outPath)}`);
  getOutput().writeLine(`State:    ${pc.dim(path.resolve(process.cwd(), STATE_PATH))}`);
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"));
}

function loadState() {
  const fullPath = path.resolve(process.cwd(), STATE_PATH);
  if (!fs.existsSync(fullPath)) return undefined;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function saveState(state: any) {
  const fullPath = path.resolve(process.cwd(), STATE_PATH);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function mergeState(existing: any, next: any) {
  if (!existing) return next;
  return {
    ...next,
    deployReceipts: { ...(existing.deployReceipts || {}), ...(next.deployReceipts || {}) },
    utxos: { ...(existing.utxos || {}), ...(next.utxos || {}) },
    spentOutpoints: Array.from(new Set([...(existing.spentOutpoints || []), ...(next.spentOutpoints || [])])).sort()
  };
}

async function rethrow(error: unknown): Promise<never> {
  const { SilverSimulationError } = await import("@hardkas/simulator");
  if (error instanceof SilverSimulationError) throw new HardkasCliError(error.code, error.message);
  throw error;
}
