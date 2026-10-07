import { HardkasCliError } from "../cli-errors.js";

export interface SemanticVerifyOptions {
  ciMode: boolean;
  json: boolean;
}

/**
 * SURFACE-TRUTH-1A (ST-I2, ST-I3): `verify-semantics` refuses. No HardKAS subsystem records the semantic hashes a
 * cross-platform agreement check would compare. The former runner tallied torture-report cases, synthesised each
 * "semantic hash" as sha256(seed:bucket:id), wrote a bundle that claimed to "prove cross-platform equivalence", and
 * answered `ok: true` even when every check had failed. Until a real source of semantic hashes exists, the command
 * says so with a typed error and reads or writes nothing.
 */
export async function runSemanticVerify(_options: SemanticVerifyOptions): Promise<never> {
  throw new HardkasCliError(
    "VERIFY_SEMANTICS_UNSUPPORTED",
    "verify-semantics cannot verify semantic agreement: no HardKAS subsystem records the semantic hashes it would compare, so it refuses instead of writing a bundle of synthetic hashes. Nothing was read or written. `hardkas verify` checks artifact integrity and lineage.",
    { exitCode: 1 }
  );
}
