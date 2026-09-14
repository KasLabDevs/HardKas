import path from "node:path";
import { verifySilverCorpus, type SilverCorpusIssue, type SilverCorpusVerifyResult } from "@hardkas/core";
import type { Hardkas } from "./index.js";

/**
 * The SilverScript golden corpus (fixtures/toccata-v2/silver): cases recorded
 * from real execution against the verified node, verified offline by
 * recompiling with the managed silverc and re-deriving locks and covenant ids
 * with the SDK. Same implementation as `hardkas corpus verify`.
 */
export type CorpusIssue = SilverCorpusIssue;
export type CorpusVerifyResult = SilverCorpusVerifyResult;

export class HardkasCorpus {
  constructor(private sdk: Hardkas) {}

  async verify(targetPath: string): Promise<CorpusVerifyResult> {
    return verifyToccataCorpus(targetPath, this.sdk.cwd);
  }
}

export async function verifyToccataCorpus(targetPath: string, workspaceRoot = process.cwd()): Promise<CorpusVerifyResult> {
  return verifySilverCorpus(path.resolve(workspaceRoot, targetPath), { workspaceRoot });
}
