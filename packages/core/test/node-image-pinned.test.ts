import { describe, it, expect } from "vitest";
import { KASPAD_REFERENCE_IMAGE, CPUMINER_REFERENCE_IMAGE, PINNED_IMAGE_REFERENCE, NODE_IMAGE_DIGEST_REQUIRED, isPinnedImageReference } from "../src/index.js";

// The one digest rule for node images (P39, extended on 2026-11-11 to the node runner and the simnet harness).

const DIGEST = "f85da74b9514584451f83a2cbea3aa93f700248302fe7e3e0ab17288f93c905b";

describe("isPinnedImageReference", () => {
  it("a reference pinned by a sha256 digest passes; a tag, a bad digest or a non-string does not", () => {
    for (const image of [KASPAD_REFERENCE_IMAGE, CPUMINER_REFERENCE_IMAGE, `kaspanet/rusty-kaspad@sha256:${DIGEST}`, `registry.local:5000/kaspad:dev@sha256:${DIGEST}`]) {
      expect(isPinnedImageReference(image), image).toBe(true);
    }
    for (const image of ["kaspanet/rusty-kaspad:latest", "kaspanet/rusty-kaspad:v2.1.0", "kaspanet/rusty-kaspad", "", " ", `x@sha256:${DIGEST.slice(1)}`, `x@sha256:${DIGEST.toUpperCase()}`, `x@sha512:${DIGEST}`, `@sha256:${DIGEST}`, `a b@sha256:${DIGEST}`, undefined, null, 42]) {
      expect(isPinnedImageReference(image), JSON.stringify(image)).toBe(false);
    }
  });

  it("exports the regex and the typed code the CLI, the node runner and the harness share", () => {
    expect(PINNED_IMAGE_REFERENCE.test(KASPAD_REFERENCE_IMAGE)).toBe(true);
    expect(NODE_IMAGE_DIGEST_REQUIRED).toBe("NODE_IMAGE_DIGEST_REQUIRED");
  });
});
