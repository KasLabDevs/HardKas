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
    hardkasVersion: "0.1.0-dev",
    l2Network: "igra",
    bridgePhase: "pre-zk",
    trustlessExit: false,
    custodyModel: "Test custody",
    exitModel: "Test exit",
    riskProfile: "high",
    notes: ["Note 1", "Note 2"],
    updatedAt: "2026-01-01T00:00:00Z"
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

      expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(mockAssumptions, null, 2));
    });

    it("should throw for unknown network", async () => {
      (l2.getL2BridgeAssumptions as any).mockReturnValue(null);
      await expect(runL2BridgeStatus({ network: "unknown" })).rejects.toThrow("No bridge assumptions found");
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
