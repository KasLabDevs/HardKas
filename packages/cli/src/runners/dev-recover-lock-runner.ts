import { UI } from "../ui.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";
import { invocationWorkspaceRoot } from "../workspace-root.js";

/** The `--json` answer of `hardkas dev recover-lock`. */
export const DEV_RECOVER_LOCK_SCHEMA = "hardkas.devServerLockRecovery.v1";

/** Each refusal of the recovery (@hardkas/dev-server's recoverStaleSendGuardLock), its exit code and what to do. */
const REFUSALS: Record<string, { exitCode: HardkasExitCode; suggestion: string }> = {
  SEND_GUARD_LOCK_UNREADABLE: {
    exitCode: HardkasExitCode.RUNTIME_FAILURE,
    suggestion: "Run it in the workspace whose dev server refused with SEND_GUARD_LOCK_STALE (the lock is <workspace>/.hardkas/dev-server/send-guard.v1.lock)."
  },
  SEND_GUARD_LOCK_PID_MISMATCH: {
    exitCode: HardkasExitCode.USAGE_ERROR,
    suggestion: "Pass the pid the SEND_GUARD_LOCK_STALE refusal names (the lock names it too)."
  },
  SEND_GUARD_LOCK_OWNER_ALIVE: {
    exitCode: HardkasExitCode.POLICY_DENIED,
    suggestion: "That dev server is running and owns the guard: stop it (Ctrl+C in its window releases the lock) or keep using it."
  }
};

/**
 * BETA-FIX W1 · `hardkas dev recover-lock --pid <pid>`: the controlled recovery of a STALE send-guard lock — the lock a dev
 * server leaves when its process is ended without running its handlers (on Windows Stop-Process or Task Manager, i.e.
 * TerminateProcess; SIGKILL elsewhere). Stop every dev server on the workspace first. The lock is archived (renamed to
 * `send-guard.v1.lock.stale-<pid>-<time>`, kept as evidence), only when it names `pid` and that process is not running;
 * the send-guard log is untouched, so unknown outcomes the dead server left still block. Acts on the invocation
 * workspace (the nearest hardkas.config.* at or above the current directory), the root the dev server records under.
 */
export async function runDevRecoverLock(options: { pid?: string; json?: boolean }): Promise<{ archived: string; lock: string; pid: number }> {
  const raw = String(options.pid ?? "").trim();
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new HardkasCliError(
      "DEV_RECOVER_LOCK_PID_INVALID",
      `--pid must be the process id the SEND_GUARD_LOCK_STALE refusal names, a positive whole number (got '${raw}'). Nothing was changed.`,
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }
  const pid = Number(raw);
  const root = invocationWorkspaceRoot();
  const { recoverStaleSendGuardLock } = await import("@hardkas/dev-server");
  let result: { archived: string; lock: string };
  try {
    result = recoverStaleSendGuardLock(root, { pid });
  } catch (e) {
    const code = typeof (e as { code?: unknown })?.code === "string" ? String((e as { code: string }).code) : "";
    const known = REFUSALS[code];
    throw new HardkasCliError(known ? code : "SEND_GUARD_LOCK_RECOVERY_FAILED", e instanceof Error ? e.message : String(e), {
      exitCode: known?.exitCode ?? HardkasExitCode.RUNTIME_FAILURE,
      ...(known ? { suggestion: known.suggestion } : {}),
      context: { workspace: root, pid: String(pid) }
    });
  }
  const out = { ...result, pid };
  if (options.json) {
    UI.writeJson({ schema: DEV_RECOVER_LOCK_SCHEMA, ok: true, status: "archived", pid, lock: result.lock, archived: result.archived, workspace: root });
  } else {
    UI.success(`Stale send-guard lock of pid ${pid} archived (kept as evidence): ${result.archived}`);
    UI.info("The send-guard log is untouched: sends whose outcome the stopped server left unknown still block until observed.");
    UI.printNextSteps(["start one dev server on this workspace (hardkas dev)"]);
  }
  return out;
}
