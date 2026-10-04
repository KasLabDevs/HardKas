// Test preload (NODE_OPTIONS=--require=<this file>): kills the process with SIGKILL, before any cleanup, right before
// the k-th fs.renameSync whose destination matches HK_TEST_CRASH_BEFORE_RENAME ("<regex>" or "<regex>#k"). Every
// atomic write (writeFileAtomic) becomes visible through that rename, so this is a crash at an exact durable step.
"use strict";
const fs = require("node:fs");
const spec = /^(.*?)(?:#(\d+))?$/.exec(process.env.HK_TEST_CRASH_BEFORE_RENAME || "");
if (spec && spec[1]) {
  const pattern = new RegExp(spec[1]);
  const nth = Number(spec[2] || 1);
  let seen = 0;
  const realRename = fs.renameSync;
  fs.renameSync = function (src, dst, ...rest) {
    if (pattern.test(String(dst)) && ++seen === nth) process.kill(process.pid, "SIGKILL");
    return realRename.call(this, src, dst, ...rest);
  };
  require("node:module").syncBuiltinESMExports();
}
