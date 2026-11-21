import { describe, it, expect } from "vitest";
import {
  MAINNET_CONFIRMATION_REQUIRED,
  PLAINTEXT_MAINNET_FORBIDDEN,
  assertMainnetInteractiveConfirmation,
  assertMainnetNoPlaintext
} from "../src/mainnet-policy.js";

describe("permanent mainnet safety guards", () => {
  it("refuses --yes on mainnet spellings", () => {
    for (const net of ["mainnet", "kaspa", "kaspa-mainnet", "MAINNET-1"]) {
      expect(() =>
        assertMainnetInteractiveConfirmation([net], { yes: true, isTTY: true }, "tx send")
      ).toThrowError(expect.objectContaining({ code: MAINNET_CONFIRMATION_REQUIRED }));
    }
  });

  it("refuses non-TTY execution on mainnet even without --yes", () => {
    expect(() =>
      assertMainnetInteractiveConfirmation(["mainnet"], { yes: false, isTTY: false }, "tx send")
    ).toThrowError(expect.objectContaining({ code: MAINNET_CONFIRMATION_REQUIRED }));
  });

  it("allows interactive TTY confirmation without --yes on mainnet", () => {
    expect(() =>
      assertMainnetInteractiveConfirmation(["mainnet"], { yes: false, isTTY: true }, "tx send")
    ).not.toThrow();
  });

  it("allows --yes and non-TTY on simnet and testnet-10", () => {
    expect(() =>
      assertMainnetInteractiveConfirmation(["simnet", "testnet-10"], { yes: true, isTTY: false }, "tx send")
    ).not.toThrow();
  });

  it("refuses --unsafe-plaintext on mainnet and allows it on simnet", () => {
    expect(() =>
      assertMainnetNoPlaintext(["mainnet"], true, "accounts real generate")
    ).toThrowError(expect.objectContaining({ code: PLAINTEXT_MAINNET_FORBIDDEN }));

    expect(() =>
      assertMainnetNoPlaintext(["simnet"], true, "accounts real generate")
    ).not.toThrow();
  });
});
