import { getOutput } from "../output.js";
import path from "node:path";
import pc from "picocolors";
import type { SilverCorpusVerifyResult } from "@hardkas/core";

export interface CorpusVerifyOptions {
  path: string;
  json?: boolean;
  workspaceRoot?: string;
}

/**
 * Verifies the SilverScript golden corpus offline: every artifact recompiled
 * with the managed silverc, every lock and covenant id re-derived with the
 * SDK, every case's evidence checked against the reference node identity.
 */
export async function runCorpusVerify(options: CorpusVerifyOptions): Promise<SilverCorpusVerifyResult> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const { verifySilverCorpus } = await import("@hardkas/core");
  const result = await verifySilverCorpus(path.resolve(workspaceRoot, options.path), { workspaceRoot });

  if (options.json) {
    getOutput().writeJson(result);
  } else if (result.ok) {
    getOutput().writeLine(pc.green("SILVER_CORPUS_VERIFY_PASS"));
    getOutput().writeLine(`Path: ${result.path}`);
    getOutput().writeLine(`Cases: ${result.summary.cases}, recompiled: ${result.summary.compilesRecompiled}, controls: ${result.summary.controlsChecked}`);
    getOutput().writeLine(`Node: ${result.summary.node}`);
    getOutput().writeLine(`Compiler: ${result.summary.compiler}`);
    for (const [capability, status] of Object.entries(result.capabilities)) {
      getOutput().writeLine(`  ${status === "PASS" ? pc.green(status) : pc.red(status)} ${capability}`);
    }
  } else {
    getOutput().error(pc.red("SILVER_CORPUS_VERIFY_FAIL"));
    for (const issue of result.issues) {
      getOutput().error(`- ${issue.code}${issue.case ? ` [${issue.case}]` : ""}: ${issue.message}`);
    }
  }

  if (!result.ok) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("CORPUS_VERIFY_FAILED", "Corpus verification failed.", { exitCode: 1 });
  }
  return result;
}
