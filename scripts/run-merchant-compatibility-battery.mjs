// scripts/run-merchant-compatibility-battery.mjs — RETIRED (HK-07, SIM-12, CA-EV-06, HK-26)
//
// This was v1 of the merchant-demo compatibility battery. It started every row as PASS and wrote fixed verdict texts
// ("Rejected by rusty-kaspad VM", "matching rusty-kaspad sighash", "Executed successfully against simulator
// artifacts/RPC", ...) for operations it never executed, appended them to logs/merchant-compat-*.jsonl with a raw file append outside the allowed
// mechanism, and started rusty-kaspad by tag on 0.0.0.0:18210. The jsonl files it produced are kept in the
// repository only as a record of that defect and are NOT evidence (logs/README.md lists why, row by row).
//
// It no longer runs anything and writes nothing. The battery is scripts/run-merchant-compatibility-battery-v2.mjs:
// a row is PASS only when the named operation was executed by a declared executor, with its command, measured
// duration, stored observed output and checks re-evaluated by the semantic checker; everything else is NOT_EXECUTED.
console.error(
  "run-merchant-compatibility-battery.mjs (v1) is retired: it recorded PASS rows without executing the operations.\n" +
    "Run: node scripts/run-merchant-compatibility-battery-v2.mjs [--out <dir>] [--envs simulator,simnet,testnet]"
);
process.exit(2);
