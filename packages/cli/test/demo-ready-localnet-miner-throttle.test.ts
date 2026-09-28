import { describe, it, expect } from "vitest";
import { toccataMinerArgs } from "../src/runners/localnet-runners.js";

// Demo-ready · found while qualifying E02 on a real node (continuous mining, `localnet fund --keep-miner`):
// the companion cpuminer ran unthrottled. One CPU thread on simnet then outruns the node, and
// consecutive reads of the mining address return different coinbase outpoints (whole sets leave
// and come back); a plan signed on one of them was refused as an orphan ~30 s later. With the
// upstream miner's own `--throttle` (5 ms, the value the repo's real-node harnesses already use:
// scripts/toccata-gauntlet.mjs, test-gauntlet/real-node/silver-e2e.mjs) the view is stable.
// HARNESS-LOCAL knob: not a Kaspa or Toccata parameter and not part of any capability claim.

const ADDRESS = "kaspasim:qzascaezg6w8a2jdet5vfjj5vdrr339xtsnlkk38hjueqmyay2s4x9a968my4";
const valueAfter = (args: string[], flag: string) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};

describe("Demo-ready · localnet companion miner rate limit", () => {
  it("runs the upstream cpuminer with --throttle 5 by default, mining to the funded address", () => {
    const args = toccataMinerArgs(ADDRESS, {});
    expect(valueAfter(args, "--throttle")).toBe("5");
    expect(valueAfter(args, "-a")).toBe(ADDRESS);
    expect(args).toContain("--mine-when-not-synced");
    expect(valueAfter(args, "-t")).toBe("1");
    expect(args.some((a) => a.startsWith("kaspanet/cpuminer@sha256:"))).toBe(true);
  });

  it("HARDKAS_TOCCATA_MINER_THROTTLE_MS overrides the rate; 0 disables it; anything else keeps the default", () => {
    expect(valueAfter(toccataMinerArgs(ADDRESS, { HARDKAS_TOCCATA_MINER_THROTTLE_MS: "50" }), "--throttle")).toBe("50");
    expect(toccataMinerArgs(ADDRESS, { HARDKAS_TOCCATA_MINER_THROTTLE_MS: "0" })).not.toContain("--throttle");
    expect(valueAfter(toccataMinerArgs(ADDRESS, { HARDKAS_TOCCATA_MINER_THROTTLE_MS: "5; rm -rf /" }), "--throttle")).toBe("5");
    expect(valueAfter(toccataMinerArgs(ADDRESS, { HARDKAS_TOCCATA_MINER_THROTTLE_MS: "-3" }), "--throttle")).toBe("5");
  });
});
