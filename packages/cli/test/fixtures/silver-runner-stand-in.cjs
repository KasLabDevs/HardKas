// Test preload (NODE_OPTIONS=--require=<this file>): starts a node stand-in script in place of ONE SilverScript runner
// path. HardKAS still resolves, digests and applies its trust policy to that path as usual; only the start of that runner
// is redirected (a stand-in cannot be a native executable on every platform, and the CLI takes no runner object). Since
// F2 HardKAS starts a private copy of the runner's identified bytes under <HARDKAS_HOME>/run/silver-runners, never the
// configured path: a start of such a copy holding the target's exact bytes is that runner's start too. On Linux and macOS
// (R-01, REMED-CLOSE) that copy is started through HardKAS's exec trampoline, Node.js itself with
// `-e <trampoline> -- <copy> <sha256> <runner args…>`: that start is the runner's start as well, with the args after the
// digest.
//   HK_TEST_RUNNER_REDIRECT  the runner path the CLI resolves (an existing file: it is digested first)
//   HK_TEST_RUNNER_STAND_IN  the node script that answers instead
//   HK_TEST_RUNNER_STARTS    optional: a file that gets one line per redirected start
"use strict";
const cp = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const target = process.env.HK_TEST_RUNNER_REDIRECT;
const standIn = process.env.HK_TEST_RUNNER_STAND_IN;
if (target && standIn) {
  const key = (p) => {
    const r = path.resolve(String(p));
    return process.platform === "win32" ? r.toLowerCase() : r;
  };
  const wanted = key(target);
  const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const stagedRoot = () => {
    const home = process.env.HARDKAS_HOME && process.env.HARDKAS_HOME.trim() !== "" ? path.resolve(process.env.HARDKAS_HOME) : path.join(os.homedir(), ".hardkas");
    return key(path.join(home, "run", "silver-runners")) + path.sep;
  };
  /** The configured runner, or HardKAS's private copy of exactly its bytes. */
  const isTarget = (file) => {
    if (typeof file !== "string") return false;
    if (key(file) === wanted) return true;
    if (!key(file).startsWith(stagedRoot())) return false;
    try {
      return sha256(file) === sha256(target);
    } catch {
      return false;
    }
  };
  const started = () => {
    // hardkas-append-allow: one line per redirected start, for the test to count (test fixture)
    if (process.env.HK_TEST_RUNNER_STARTS) fs.appendFileSync(process.env.HK_TEST_RUNNER_STARTS, `${process.pid}\n`);
  };
  /** The runner's own args when `file args` is a start of the target: directly, or of its copy through the trampoline. */
  const runnerArgs = (file, args) => {
    if (!Array.isArray(args)) return undefined;
    if (isTarget(file)) return args;
    if (typeof file !== "string" || key(file) !== key(process.execPath)) return undefined;
    const end = args.indexOf("--");
    const e = args.indexOf("-e");
    return e >= 0 && end > e && isTarget(args[end + 1]) ? args.slice(end + 3) : undefined;
  };
  const realExecFile = cp.execFile;
  const realSpawn = cp.spawn;
  cp.execFile = function (file, args, ...rest) {
    const own = runnerArgs(file, args);
    if (own) {
      started();
      return realExecFile.call(this, process.execPath, [standIn, ...own], ...rest);
    }
    return realExecFile.call(this, file, args, ...rest);
  };
  cp.spawn = function (file, args, ...rest) {
    const own = runnerArgs(file, args);
    if (own) {
      started();
      return realSpawn.call(this, process.execPath, [standIn, ...own], ...rest);
    }
    return realSpawn.call(this, file, args, ...rest);
  };
  require("node:module").syncBuiltinESMExports();
}
