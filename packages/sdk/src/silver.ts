import fs from "node:fs";
import path from "node:path";
import {
  compileSilverScript,
  getSilContract,
  silContractBytecodeHex,
  silverP2shAddress,
  silverP2shLock,
  type SilArtifactValue,
  type SilverCompileResult
} from "@hardkas/core";
import type { Hardkas } from "./index.js";
import { HardkasCorpus, type CorpusVerifyResult } from "./corpus.js";

/**
 * SilverScript v1 from the SDK.
 *
 * Compilation is the managed, pinned silverc (kaspanet/silverscript v1.0.0);
 * the P2SH lock and address come from the Kaspa SDK. Funding and spending are
 * @hardkas/accounts (buildScriptFunding, buildSilverSweep, prepareSilverSpend)
 * or `hardkas silver deploy|spend`. There is no simulated path here.
 */
export interface SilverCompileOptions {
  /** Source text, or `file` relative to the SDK cwd. */
  source?: string;
  file?: string;
  constructorArgs?: readonly SilArtifactValue[];
}

export interface SilverP2sh {
  readonly contract: string;
  readonly bytecodeHex: string;
  readonly lockingScript: { readonly version: number; readonly script: string };
  readonly address: string;
}

export class HardkasSilver {
  constructor(private sdk: Hardkas) {}

  async compile(options: SilverCompileOptions): Promise<SilverCompileResult> {
    return compileSilverScript({
      source: this.readSource(options),
      constructorArgs: options.constructorArgs ?? []
    });
  }

  /** Recompiles and requires silverc to reproduce `compiled` byte for byte. */
  async reproduce(options: SilverCompileOptions & { compiled: SilverCompileResult }): Promise<SilverCompileResult> {
    const again = await this.compile(options);
    if (!Buffer.from(again.artifactBytes).equals(Buffer.from(options.compiled.artifactBytes))) {
      throw new Error("SILVER_ARTIFACT_NOT_REPRODUCED: the pinned silverc does not reproduce this artifact.");
    }
    return again;
  }

  /** The P2SH lock and address of a compiled contract. */
  p2sh(compiled: SilverCompileResult, options: { contract?: string; network?: string } = {}): SilverP2sh {
    const network = options.network ?? "simnet";
    if (network !== "simnet") {
      throw new Error(`SILVERSCRIPT_MAINNET_NOT_ENABLED: SilverScript lifecycle runs on simnet only (got ${network}).`);
    }
    const { name, contract } = getSilContract(compiled.artifact, options.contract);
    const bytecodeHex = silContractBytecodeHex(contract);
    return { contract: name, bytecodeHex, lockingScript: silverP2shLock(bytecodeHex), address: silverP2shAddress(bytecodeHex, network) };
  }

  /** The golden corpus: every case recompiled, derived and checked against its evidence. */
  async verifyCorpus(corpusPath = "fixtures/toccata-v2/silver"): Promise<CorpusVerifyResult> {
    return new HardkasCorpus(this.sdk).verify(corpusPath);
  }

  private readSource(options: SilverCompileOptions): string {
    if ((options.source === undefined) === (options.file === undefined)) {
      throw new Error("SILVER_SOURCE_INVALID: pass exactly one of source or file.");
    }
    if (options.source !== undefined) return options.source;
    const file = path.resolve(this.sdk.cwd, options.file!);
    if (!fs.existsSync(file)) throw new Error(`SILVERSCRIPT_SOURCE_NOT_FOUND: ${file}`);
    return fs.readFileSync(file, "utf8");
  }
}
