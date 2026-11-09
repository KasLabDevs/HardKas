import { describe, it, expect } from "vitest";
import { knownExtension } from "../src/extensions/api.js";
import { extensionUnavailableError } from "../src/extensions/refusal.js";

// INT9 · D1: @hardkas/ext-l2 (the `l2` extension) and its dependency @hardkas/l2 are not published in this release
// (docs/status/versioning.md, "Not published"), so `hardkas extension install l2` cannot fetch them from a registry.
// The refusal of `hardkas l2 …` keeps its code and exit code, but its next step must not send the user to that command
// as if it worked: it says the extension is not published.

describe("INT9 · the refusal for an unpublished extension", () => {
  const l2 = knownExtension("l2")!;

  it("the catalog marks the l2 extension as not published", () => {
    expect(l2.published).toBe(false);
  });

  it.each([
    ["not installed", undefined],
    ["declared but not installed", { known: l2, status: "not_installed" as const, declared: true }]
  ])("%s: EXTENSION_NOT_INSTALLED, and the suggestion says the package is not published", (_name, state) => {
    const e = extensionUnavailableError(l2, state as never, "'hardkas l2 networks'");
    expect(e.code).toBe("EXTENSION_NOT_INSTALLED");
    expect(e.exitCode).toBe(1);
    expect(e.message).toContain("@hardkas/ext-l2");
    expect(e.suggestion).toMatch(/not published in this release/);
    expect(e.suggestion).not.toBe("Install it in this project: hardkas extension install l2");
  });

  it("incompatible: the suggestion does not send the user to the registry either", () => {
    const e = extensionUnavailableError(
      l2,
      { known: l2, status: "incompatible", reason: "VERSION_MISMATCH", detail: "version 0.0.1", expected: "x", found: "0.0.1" } as never,
      "'hardkas l2 networks'"
    );
    expect(e.code).toBe("EXTENSION_INCOMPATIBLE");
    expect(e.suggestion).toMatch(/not published in this release/);
  });

  it("disabled: unchanged (the fix is in hardkas.config, not an install)", () => {
    const e = extensionUnavailableError(l2, { known: l2, status: "disabled" } as never, "'hardkas l2 networks'");
    expect(e.code).toBe("EXTENSION_DISABLED");
    expect(e.suggestion).toBe("Remove extensions.l2: false from hardkas.config to enable it.");
  });
});
