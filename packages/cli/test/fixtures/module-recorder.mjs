// L2-EXT stage 2 · test instrument: `node --import <this> …` records the URL of every module the process resolves
// (ESM import and CommonJS require alike) to HARDKAS_MODULE_LOG, one per line. Used to prove which code a CLI run
// loaded (P1 / C2: no extension, no @hardkas/l2, no viem). It fails loudly where the hooks API is missing, so a run
// never "proves" an absence with an instrument that recorded nothing.
import fs from "node:fs";
import module from "node:module";

const log = process.env.HARDKAS_MODULE_LOG;
if (!log) throw new Error("module-recorder: HARDKAS_MODULE_LOG is not set");
if (typeof module.registerHooks !== "function") throw new Error("module-recorder: node:module registerHooks is unavailable");

fs.writeFileSync(log, "");
module.registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    try {
      // hardkas-append-allow: a test instrument's own log, not a workspace ledger
      fs.appendFileSync(log, `${result.url}\n`);
    } catch {
      /* the log is evidence, not a dependency of the run */
    }
    return result;
  }
});
