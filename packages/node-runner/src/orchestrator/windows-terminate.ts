import { execFile } from "node:child_process";
import type { ProcessIdentity } from "./process-identity";

/**
 * L2-EXT stage 4 (owner review of 1-nov) · the Windows forced stop, bound to one process object instead of a PID.
 *
 * One handle is opened to the PID, and everything after that goes through that handle: the creation instant
 * (GetProcessTimes), the executable (QueryFullProcessImageNameW), the comparison with the recorded identity, then
 * TerminateProcess and the wait. Windows does not give a PID to another process while a handle to the old process
 * object is open, so the process that is checked is the process that is terminated: there is no window between them
 * in which the PID could be reused. If the PID was already reused before the handle was opened, the handle is to the
 * new process and its identity does not match: nothing is terminated.
 *
 * No native dependency: Windows PowerShell compiles the P/Invoke declarations (Add-Type, about half a second).
 * Inputs travel in environment variables, never inside the command text.
 */
export type HandleTerminateOutcome = "stopped" | "gone" | "identity_changed" | "timeout" | "unverifiable";

export interface HandleTerminateResult {
  readonly outcome: HandleTerminateOutcome;
  readonly detail: string;
}

export type HandleTerminator = (identity: ProcessIdentity, waitMs: number) => Promise<HandleTerminateResult>;

const HELPER = `
using System;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
public static class HardkasHandleTerminate {
  const uint PROCESS_TERMINATE = 0x0001, PROCESS_QUERY_LIMITED_INFORMATION = 0x1000, SYNCHRONIZE = 0x00100000;
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetProcessTimes(IntPtr h, out long creation, out long exit, out long kernel, out long user);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageNameW(IntPtr h, int flags, StringBuilder name, ref int size);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr h, uint code);
  [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

  public static string Run(int pid, string expectedStart, string expectedExe, int waitMs) {
    IntPtr h = OpenProcess(PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, false, pid);
    if (h == IntPtr.Zero) {
      int err = Marshal.GetLastWin32Error();
      return err == 87 ? "gone no process has this PID" : "unverifiable OpenProcess error " + err;
    }
    try {
      if (WaitForSingleObject(h, 0) == 0) return "gone the process has already exited";
      long creation, exit, kernel, user;
      if (!GetProcessTimes(h, out creation, out exit, out kernel, out user)) return "unverifiable GetProcessTimes error " + Marshal.GetLastWin32Error();
      var name = new StringBuilder(32768);
      int size = name.Capacity;
      if (!QueryFullProcessImageNameW(h, 0, name, ref size)) return "unverifiable QueryFullProcessImageNameW error " + Marshal.GetLastWin32Error();
      // the recorded instant has microsecond resolution (CIM): compare both at that resolution
      long created = DateTime.FromFileTimeUtc(creation).Ticks / 10;
      long expected = DateTime.Parse(expectedStart, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind).ToUniversalTime().Ticks / 10;
      string exe = Path.GetFullPath(name.ToString(0, size));
      if (created != expected || !string.Equals(exe, Path.GetFullPath(expectedExe), StringComparison.OrdinalIgnoreCase)) {
        return "identity_changed PID " + pid + " is now " + exe + ", created " + DateTime.FromFileTimeUtc(creation).ToString("o") + "; nothing was terminated";
      }
      if (!TerminateProcess(h, 1)) return "unverifiable TerminateProcess error " + Marshal.GetLastWin32Error();
      return WaitForSingleObject(h, (uint)waitMs) == 0 ? "stopped terminated through its verified handle" : "timeout terminated but still running after " + waitMs + " ms";
    } finally {
      CloseHandle(h);
    }
  }
}
`;

const SCRIPT =
  `$ErrorActionPreference = 'Stop'; Add-Type -TypeDefinition @'\n${HELPER}\n'@; ` +
  `[HardkasHandleTerminate]::Run([int]$env:HARDKAS_TERMINATE_PID, $env:HARDKAS_TERMINATE_START, $env:HARDKAS_TERMINATE_EXE, [int]$env:HARDKAS_TERMINATE_WAIT_MS)`;

export const terminateWindowsProcessByHandle: HandleTerminator = (identity, waitMs) =>
  new Promise((resolve) => {
    const env = {
      ...process.env,
      HARDKAS_TERMINATE_PID: String(identity.pid),
      HARDKAS_TERMINATE_START: identity.startTime,
      HARDKAS_TERMINATE_EXE: identity.executable,
      HARDKAS_TERMINATE_WAIT_MS: String(Math.max(0, Math.round(waitMs)))
    };
    const encoded = Buffer.from(SCRIPT, "utf16le").toString("base64");
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { env, timeout: waitMs + 30_000, windowsHide: true, encoding: "utf8" },
      (err, stdout, stderr) => {
        const line = String(stdout ?? "").trim().split(/\r?\n/).pop() ?? "";
        const m = /^(stopped|gone|identity_changed|timeout|unverifiable) (.*)$/.exec(line);
        if (m) resolve({ outcome: m[1] as HandleTerminateOutcome, detail: m[2]! });
        else resolve({ outcome: "unverifiable", detail: `the handle helper did not report (${err?.message ?? (String(stderr ?? "").trim() || "no output")})` });
      }
    );
  });
