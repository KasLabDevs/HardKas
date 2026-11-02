/**
 * `@hardkas/cli/extension-kit`: the one surface a first-party extension imports from the CLI (design §3.2).
 *
 * It is a separate build entry of this package, so an extension shares the running CLI's modules (its output mode,
 * its error renderer, the invocation's workspace root) instead of importing CLI internals by path.
 */
export {
  HARDKAS_EXTENSION_API_VERSION,
  type HardkasExtension,
  type HardkasExtensionContext,
  type HardkasExtensionTemplate,
  type HardkasExtensionDoctorCheck
} from "./extensions/api.js";
export { UI, handleError, errorCodeOf, exitCodeOf } from "./ui.js";
export { HardkasCliError, HardkasExitCode } from "./cli-errors.js";
export { getOutput } from "./output.js";
export { invocationWorkspace, invocationWorkspaceRoot } from "./workspace-root.js";
// L2-EXT stage 3: an extension's toolchain pins use the core's types (the manager installs them, not the extension)
export type { ManagedToolchainReference, ManagedToolchainFile } from "@hardkas/core";
// NEW-11: the L1 workspace checks, which the l2 extension's `dev doctor` alias composes with its L2 section
export {
  collectWorkspaceDoctorChecks,
  renderWorkspaceDoctorReport,
  type WorkspaceDoctorCheck,
  type WorkspaceDoctorStatus
} from "./runners/workspace-doctor-runner.js";
