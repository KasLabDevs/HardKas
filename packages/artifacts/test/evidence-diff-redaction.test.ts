import { describe, it, expect } from "vitest";
import { diffArtifacts } from "../src/diff.js";

// EVIDENCE-DIFF-REDACTION-1 (investigation, 2026-10-04) · BEFORE. `diffArtifacts` — the comparison replay verification
// uses to decide whether a replayed receipt reproduces the original — runs `maskSecrets` on both sides first: every
// 64-hex string becomes `<first 6>...<last 4> [REDACTED]`, a key containing "secret", "privatekey", "mnemonic" or
// "password" (any case) becomes "[REDACTED]", and a run of 12–24 lowercase words becomes "[MNEMONIC REDACTED]".
// Equality is then decided on the masked values. These cases pin what a comparison of evidence must see (the values
// themselves) and, as controls, that what a diff exposes still holds no secret.

const hex64 = (mid: string, head = "ab12cd", tail = "ef34") => head + mid.repeat(54) + tail;
const A = hex64("0");
const B = hex64("9"); // differs from A only in the 54 middle characters, the ones the mask hides
const EDGE = "f" + A.slice(1); // differs from A in its first character, which the mask shows
const words = (last: string) => `alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo ${last}`;

describe("EVIDENCE-DIFF-REDACTION-1 · diffArtifacts decides on the evidence itself", () => {
  it("control: identical artifacts are identical", () => {
    const x = { postStateHash: A, txId: `synthetic-${A}`, nested: [{ h: A }], password: "same" };
    expect(diffArtifacts(x, structuredClone(x)).identical).toBe(true);
  });

  it("control: a 64-hex value that differs in its first character is a difference", () => {
    expect(diffArtifacts({ postStateHash: A }, { postStateHash: EDGE }).identical).toBe(false);
  });

  it.each([
    ["a top-level hash", { postStateHash: A }, { postStateHash: B }],
    ["a prefixed id", { txId: `synthetic-${A}` }, { txId: `synthetic-${B}` }],
    ["a hash inside an array of objects", { inputs: [{ outpoint: { transactionId: A, index: 0 } }] }, { inputs: [{ outpoint: { transactionId: B, index: 0 } }] }]
  ])("%s that differs only in its middle is a difference", (_what, left, right) => {
    expect(diffArtifacts(left, right).identical).toBe(false);
  });

  it.each(["password", "keystorePassword", "clientSecret", "privateKeyHex", "mnemonicPhrase", "secretRedaction", "passwordProtected"])(
    "a field named %s whose values differ is a difference",
    (key) => {
      expect(diffArtifacts({ [key]: "one" }, { [key]: "two" }).identical).toBe(false);
    }
  );

  it("a secret-named field nested in an object is compared", () => {
    expect(diffArtifacts({ meta: { signer: { privateKeyHint: "one" } } }, { meta: { signer: { privateKeyHint: "two" } } }).identical).toBe(false);
  });

  it("a non-secret text of twelve lowercase words that differs is a difference", () => {
    expect(diffArtifacts({ notes: words("lima") }, { notes: words("mike") }).identical).toBe(false);
  });

  it("(proposed contract) a difference on a public hash carries the real values, not a masked form", () => {
    const d = diffArtifacts({ postStateHash: A }, { postStateHash: EDGE });
    expect(d.entries).toEqual([{ path: "postStateHash", kind: "changed", left: A, right: EDGE }]);
  });

  it("control: what a diff exposes never holds a secret value", () => {
    const k1 = hex64("1");
    const k2 = hex64("2");
    const d = diffArtifacts({ privateKey: k1, wallet: { mnemonic: words("lima") } }, { privateKey: k2, wallet: { mnemonic: words("mike") } });
    const exposed = JSON.stringify(d);
    for (const secret of [k1, k2, "lima", "mike"]) expect(exposed).not.toContain(secret);
  });
});

// The public semantics of diffArtifacts after the fix, pinned: raw comparison, evidence-safe entries.
describe("EVIDENCE-DIFF-REDACTION-1 · diffArtifacts entries are safe to record", () => {
  it("a secret field that differs is an entry with its path and no values", () => {
    expect(diffArtifacts({ password: "one" }, { password: "two" }).entries).toEqual([{ path: "password", kind: "changed", secret: true }]);
  });

  it("a secret field present on one side only is an entry with no value", () => {
    expect(diffArtifacts({ a: 1 }, { a: 1, token: "t-1" }).entries).toEqual([{ path: "token", kind: "added", secret: true }]);
    expect(diffArtifacts({ a: 1, token: "t-1" }, { a: 1 }).entries).toEqual([{ path: "token", kind: "removed", secret: true }]);
  });

  it("a value that holds a secret anywhere inside is recorded without its value", () => {
    expect(diffArtifacts({}, { meta: { nested: [{ apiKey: "k-1" }] } }).entries).toEqual([{ path: "meta", kind: "added", secret: true }]);
  });

  it("an element under a secret field is a secret entry", () => {
    expect(diffArtifacts({ mnemonic: ["w1", "w2"] }, { mnemonic: ["w1", "w3"] }).entries).toEqual([{ path: "mnemonic[1]", kind: "changed", secret: true }]);
  });

  it("a name that only contains a secret word is not secret: its values are carried (names, not shapes)", () => {
    expect(diffArtifacts({ secretRedaction: "one" }, { secretRedaction: "two" }).entries).toEqual([
      { path: "secretRedaction", kind: "changed", left: "one", right: "two" }
    ]);
  });

  it("SEMANTIC_EXCLUSIONS are still skipped", () => {
    expect(diffArtifacts({ createdAt: "2026-01-01", hashVersion: 4 }, { createdAt: "2026-10-04", hashVersion: 5 }).identical).toBe(true);
  });
});
