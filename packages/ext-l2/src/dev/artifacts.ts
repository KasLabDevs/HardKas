import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { HardkasCliError, HardkasExitCode } from "@hardkas/cli/extension-kit";
import { abiSha256, readL2BuildManifest, readWorkspaceJson, type L2BuildManifest } from "../compile/forge-build.js";

/**
 * L2-EXT stage 6 · a contract to deploy or call comes from the last verified build (`hardkas l2 compile`): its creation
 * bytecode AND its canonical ABI (F-05) must hash to what `.hardkas/l2-build.json` recorded, so an artifact edited or
 * left over from another toolchain is never used to encode or decode.
 */
export interface BuiltContract {
  /** `source:Name`, as in the build record. */
  readonly key: string;
  readonly name: string;
  readonly abi: readonly any[];
  readonly bytecode: `0x${string}`;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function readBuildManifest(root: string): L2BuildManifest {
  return readL2BuildManifest(root);
}

/** A built contract named `ref` (`Name` when unique, else `source.sol:Name`), checked against the build record. */
function loadChecked(root: string, ref: string): { key: string; name: string; abi: readonly any[]; bytecode: string } {
  const manifest = readL2BuildManifest(root);
  const keys = Object.keys(manifest.contracts).filter((k) => k === ref || k.endsWith(`:${ref}`) || k.split("/").pop() === ref);
  if (keys.length === 0) {
    throw new HardkasCliError("L2_CONTRACT_NOT_FOUND", `no contract '${ref}' in the verified build (${Object.keys(manifest.contracts).join(", ")})`, {
      exitCode: HardkasExitCode.USAGE_ERROR
    });
  }
  if (keys.length > 1) {
    throw new HardkasCliError("L2_CONTRACT_AMBIGUOUS", `'${ref}' matches ${keys.join(", ")}: name it as source:Name`, { exitCode: HardkasExitCode.USAGE_ERROR });
  }
  const key = keys[0]!;
  const [source, name] = [key.slice(0, key.lastIndexOf(":")), key.slice(key.lastIndexOf(":") + 1)];
  const file = path.join(root, "out", path.basename(source), `${name}.json`);
  if (!fs.existsSync(file)) {
    throw new HardkasCliError("L2_ARTIFACT_NOT_IN_BUILD", `${file} is missing: run hardkas l2 compile again`, { exitCode: HardkasExitCode.USAGE_ERROR });
  }
  const a = readWorkspaceJson(file) as any;
  if (!a || typeof a !== "object" || !Array.isArray(a.abi) || typeof a.bytecode?.object !== "string") {
    throw new HardkasCliError("L2_ARTIFACT_INVALID", `${file} is not a forge artifact (abi, bytecode): run hardkas l2 compile again`, { exitCode: HardkasExitCode.CORRUPTION_DETECTED });
  }
  const recorded = manifest.contracts[key]!;
  if (sha256(a.bytecode.object) !== recorded.bytecodeSha256) {
    throw new HardkasCliError("L2_ARTIFACT_NOT_IN_BUILD", `${file} is not the artifact of the recorded build (its bytecode changed): run hardkas l2 compile again`, {
      exitCode: HardkasExitCode.CORRUPTION_DETECTED
    });
  }
  if (abiSha256(a.abi) !== recorded.abiSha256) {
    throw new HardkasCliError("L2_ARTIFACT_NOT_IN_BUILD", `${file} is not the artifact of the recorded build (its ABI changed): run hardkas l2 compile again`, {
      exitCode: HardkasExitCode.CORRUPTION_DETECTED
    });
  }
  return { key, name, abi: a.abi, bytecode: a.bytecode.object };
}

export function loadBuiltContract(root: string, ref: string): BuiltContract {
  const c = loadChecked(root, ref);
  if (!/^0x[0-9a-fA-F]*$/.test(c.bytecode) || c.bytecode === "0x") {
    throw new HardkasCliError("L2_CONTRACT_NOT_DEPLOYABLE", `${c.key} has no creation bytecode (an interface or abstract contract)`, { exitCode: HardkasExitCode.USAGE_ERROR });
  }
  return { key: c.key, name: c.name, abi: c.abi, bytecode: c.bytecode as `0x${string}` };
}

/** The ABI of a built contract (for calls to an address deployed earlier), bound to the build like a deployment's. */
export function abiOf(root: string, ref: string): { key: string; abi: readonly any[] } {
  const c = loadChecked(root, ref);
  return { key: c.key, abi: c.abi };
}
