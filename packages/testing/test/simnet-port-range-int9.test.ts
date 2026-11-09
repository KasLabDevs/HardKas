import { describe, it, expect } from "vitest";
import net from "node:net";
import {
  HARDKAS_TEST_SIMNET_PORT_RANGE_ENV,
  parseSimnetPortRange,
  pickSimnetHostPort,
  simnetHostPortIsFree
} from "../src/simnet-node-harness.js";

// INT9-C · the harness published its node on any free port the OS gave it. Several sessions sharing one machine (each
// with its own port range) could not keep their nodes inside their own range. HARDKAS_TEST_SIMNET_PORT_RANGE ("low-high")
// now bounds the host port the harness picks; a range that touches a canonical localnet port is refused.

describe("INT9-C · HARDKAS_TEST_SIMNET_PORT_RANGE bounds the harness's host port", () => {
  it("PR-1 parses low-high (inclusive); empty means unbounded", () => {
    expect(HARDKAS_TEST_SIMNET_PORT_RANGE_ENV).toBe("HARDKAS_TEST_SIMNET_PORT_RANGE");
    expect(parseSimnetPortRange("26500-26599")).toEqual({ low: 26500, high: 26599 });
    expect(parseSimnetPortRange(" 26500 - 26500 ")).toEqual({ low: 26500, high: 26500 });
    expect(parseSimnetPortRange(undefined)).toBeUndefined();
    expect(parseSimnetPortRange("")).toBeUndefined();
  });

  it("PR-2 refuses a malformed range, an inverted one, and one outside 1024..65535", () => {
    for (const bad of ["26500", "a-b", "26599-26500", "80-90", "65000-70000"]) {
      expect(() => parseSimnetPortRange(bad), bad).toThrow(/SIMNET_PORT_RANGE_INVALID/);
    }
  });

  it("PR-3 refuses a range that contains a canonical localnet port (16110..18211)", () => {
    expect(() => parseSimnetPortRange("18200-18300")).toThrow(/SIMNET_PORT_RANGE_CANONICAL/);
    expect(() => parseSimnetPortRange("16000-16110")).toThrow(/SIMNET_PORT_RANGE_CANONICAL/);
  });

  it("PR-4 picks the first free port of the range from the start offset, wrapping around; none free is an error", async () => {
    const taken = new Set([26500, 26501, 26502]);
    const isFree = async (p: number) => !taken.has(p);
    expect(await pickSimnetHostPort({ low: 26500, high: 26509 }, isFree, 0)).toBe(26503);
    expect(await pickSimnetHostPort({ low: 26500, high: 26509 }, isFree, 9)).toBe(26509);
    taken.add(26509);
    expect(await pickSimnetHostPort({ low: 26500, high: 26509 }, isFree, 9)).toBe(26503);
    await expect(pickSimnetHostPort({ low: 26500, high: 26502 }, isFree, 0)).rejects.toThrow(/SIMNET_PORT_RANGE_EXHAUSTED/);
  });

  it("PR-5 a port something listens on is not free; a closed one is", async () => {
    const server = net.createServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as net.AddressInfo).port;
    try {
      expect(await simnetHostPortIsFree(port)).toBe(false);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
    expect(await simnetHostPortIsFree(port)).toBe(true);
  });
});
