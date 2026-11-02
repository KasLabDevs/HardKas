// The `l2` extension as the CLI registry hands it to buildHardkasProgram once loaded: the entry from source, bypassing
// only the on-disk discovery (which the registry tests and the packed-consumer check cover against real installs).
import { HARDKAS_VERSION } from "@hardkas/artifacts";
import extension from "../../src/extension.js";
import { KNOWN_EXTENSIONS } from "../../../cli/src/extensions/api.js";
import type { ExtensionRegistry } from "../../../cli/src/extensions/registry.js";

export function loadedL2Registry(workspaceRoot: string = process.cwd()): ExtensionRegistry {
  const known = KNOWN_EXTENSIONS.find((k) => k.id === "l2")!;
  const context = { cliVersion: HARDKAS_VERSION, workspaceRoot, loadedConfig: undefined };
  return {
    states: [{ status: "loaded", known, version: HARDKAS_VERSION, packageDir: "(source)", extension }],
    loaded: [{ known, version: HARDKAS_VERSION, packageDir: "(source)", extension, context }]
  };
}
