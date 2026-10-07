import { describe, it, expect } from "vitest";
import { validateAccountName } from "../src/real-accounts.js";

// CONTAINMENT-2 (R1) · account-name hygiene: an account name also names its keystore file (`<name>.json`), so a name
// that Windows maps to a device is refused like any other non-plain name. Validation only: nothing touches the disk.

const accepted = (names: string[]) =>
  names.filter((n) => {
    try {
      validateAccountName(n);
      return true;
    } catch {
      return false;
    }
  });

describe("CONTAINMENT-2 · account names", () => {
  it("refuses device names in any case", () => {
    expect(accepted(["CON", "con", "NUL", "Com1", "LPT9", "aux", "prn"])).toEqual([]);
  });

  it("controls: ordinary names are accepted", () => {
    const names = ["alice", "bob_1", "con1", "console", "nul-l", "default"];
    expect(accepted(names)).toEqual(names);
  });
});
