import { describe, it, expect, vi, beforeEach } from "vitest";
import { runL2BridgeStatus, runL2BridgeAssumptions } from "../src/runners/l2-bridge-runners.js";
import * as l2 from "@hardkas/l2";

vi.mock("@hardkas/l2", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getL2BridgeAssumptions: vi.fn()
  };
});

describe("L2 Bridge CLI Runners", () => {
  const mockAssumptions = {
    schema: "hardkas.l2BridgeAssumptions.v1",
    hardkasVersion: "0.4.0-alpha",
    l2Network: "igra",
    bridgePhase: "pre-zk",
    trustlessExit: false,
    custodyModel: "Phase-dependent bridge custody; verify live Igra bridge phase before use.",
    exitModel: "Trustless exit is available only in the ZK phase.",
    riskProfile: "high",
    notes: [
      "Kaspa L1 does not execute EVM.",
      "Igra execution occurs on L2.",
      "Kaspa L1 provides sequencing, data availability, state commitment anchoring and finality.",
      "Bridge security is phase-dependent: pre-ZK -> MPC -> ZK.",
      "Trustless exit exists only in the ZK phase."
    ],
    updatedAt: "2026-05-15T10:20:26.625Z"
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("runL2BridgeStatus", () => {
    it("should display bridge status", async () => {
      (l2.getL2BridgeAssumptions as any).mockReturnValue(mockAssumptions);
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await runL2BridgeStatus({ network: "igra" });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Igra bridge status"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Bridge phase:   pre-zk"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Trustless exit: no"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Risk:           high"));
    });

    it("should output JSON", async () => {
      (l2.getL2BridgeAssumptions as any).mockReturnValue(mockAssumptions);
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await runL2BridgeStatus({ network: "igra", json: true });

      const json = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(json);
    expect(parsed.hardkasVersion).toBe("0.4.0-alpha");
      expect(parsed.l2Network).toBe("igra");
    });

    it("should throw for unknown network", async () => {
      (l2.getL2BridgeAssumptions as any).mockReturnValue(null);
      await expect(runL2BridgeStatus({ network: "unknown" })).rejects.toThrow("L2 profile 'unknown' not found");
    });
  });

  describe("runL2BridgeAssumptions", () => {
    it("should display bridge assumptions", async () => {
      (l2.getL2BridgeAssumptions as any).mockReturnValue(mockAssumptions);
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await runL2BridgeAssumptions({ network: "igra" });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Igra bridge assumptions"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("pre-ZK: stronger trust assumptions"));
    });
  });
});
