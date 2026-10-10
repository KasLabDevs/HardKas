import { describe, it, expect } from "vitest";
import { maskSecrets, redactUrlCredentialsInText } from "../src/security.js";

// SECRET-SURFACE-2 · BEFORE (investigation, 2026-10-10) — the ANSI bypass of the free-text redaction.
// The CLI colours what it prints (picocolors; on win32 colours are on unless NO_COLOR is set), so a URL or a key
// reaches the redaction wrapped in escape sequences: "\x1b[37m" + value + "\x1b[39m". Both redactions anchor on `\b`,
// and there is no word boundary between the "m" that ends an escape sequence and the first character of the value,
// so a coloured value is not recognised and is printed as it is. The CLI's console guard (installConsoleRedaction) and
// `handleError`'s maskSecrets both sit behind this. Expected (red on the base): the credentials and the key are
// redacted whether or not escape sequences surround them.

const ESC = "\x1b";
const white = (s: string) => `${ESC}[37m${s}${ESC}[39m`;
const PW = "s3cretpw";
const KEY = "ab".repeat(32);

describe("SECRET-SURFACE-2 · BEFORE · redaction under ANSI escape sequences", () => {
  it("control · a plain URL has its credentials redacted, and a plain key is masked", () => {
    expect(redactUrlCredentialsInText(`node at http://user:${PW}@127.0.0.1:1/ answered`)).not.toContain(PW);
    expect(maskSecrets(`key ${KEY} leaked`)).not.toContain(KEY);
  });

  it("a coloured URL (the way the CLI prints it) still has its credentials redacted", () => {
    const line = `  - Check that the node answers at ${white(`http://user:${PW}@127.0.0.1:1/`)}.`;
    const out = redactUrlCredentialsInText(line);
    expect(out, out).not.toContain(PW);
    expect(out).toContain("127.0.0.1:1"); // the host is kept
  });

  it("a coloured secret-named query value is redacted too", () => {
    const out = redactUrlCredentialsInText(`stream ${white(`http://127.0.0.1:7420/api/stream?token=${PW}`)}`);
    expect(out, out).not.toContain(PW);
  });

  it("a coloured 64-hex value (a private key's shape) is still masked by the free-text safety net", () => {
    const out = maskSecrets(`Set your private key in .env:\n  X_PRIVATE_KEY=${white(KEY)}`);
    expect(out, out).not.toContain(KEY);
  });
});

// AFTER (D4, the reviewer's invariant): the secret is removed before any presentation — escapes are stripped before the
// redaction, hostile or not, and a text that held a secret comes back without them, so no sink can rebuild the value.
describe("SECRET-SURFACE-2 · AFTER · redaction is independent of the presentation", () => {
  const forms: Array<[string, (s: string) => string]> = [
    ["CSI colour", white],
    ["bold + colour, interleaved inside the value", (s) => `${ESC}[1m${s.slice(0, 3)}${ESC}[0m${ESC}[37m${s.slice(3)}${ESC}[39m`],
    ["an escape after every character", (s) => s.split("").join(`${ESC}[0m`)],
    ["OSC hyperlink around the value", (s) => `${ESC}]8;;${s}${ESC}\\${s}${ESC}]8;;${ESC}\\`],
    ["C1 CSI (U+009B)", (s) => `\x9b37m${s}\x9b39m`],
    ["the textual form a serialised log carries", (s) => `\\u001b[37m${s}\\u001b[39m`]
  ];

  for (const [name, wrap] of forms) {
    it(`URL credentials · ${name}`, () => {
      const out = redactUrlCredentialsInText(`node at ${wrap(`http://user:${PW}@127.0.0.1:1/`)} failed`);
      expect(out, out).not.toContain(PW);
      expect(out, "no escape sequence survives in a line that held a secret").not.toMatch(/\x1b|\x9b|\\u001b/);
      expect(out).toContain("127.0.0.1:1");
    });

    it(`a private key's shape · ${name}`, () => {
      const out = maskSecrets(`key ${wrap(KEY)} leaked`);
      expect(out, out).not.toContain(KEY);
      expect(out).not.toMatch(/\x1b|\x9b|\\u001b/);
    });
  }

  it("a coloured line that holds no secret is returned byte for byte (its colours kept)", () => {
    const line = `  ${ESC}[32m✓${ESC}[39m node at ${white("http://127.0.0.1:16110/")} answered in ${ESC}[1m12 ms${ESC}[22m`;
    expect(redactUrlCredentialsInText(line)).toBe(line);
    expect(maskSecrets(line)).toBe(line);
  });

  it("plain text is redacted exactly as before (no escapes involved)", () => {
    expect(redactUrlCredentialsInText(`see http://user:${PW}@h:1/p?token=${PW}&x=1.`)).toBe("see http://h:1/p?token=REDACTED&x=1.");
    expect(maskSecrets(`Your key is ${KEY}`)).toBe(`Your key is ${KEY.slice(0, 6)}...${KEY.slice(-4)} [REDACTED]`);
  });

  it("a JSON document whose string value carries a coloured URL is redacted and stays JSON", () => {
    const doc = JSON.stringify({ endpoint: white(`http://user:${PW}@127.0.0.1:1/`), note: "ok" });
    const out = redactUrlCredentialsInText(doc);
    expect(out).not.toContain(PW);
    expect(JSON.parse(out)).toEqual({ endpoint: "http://127.0.0.1:1/", note: "ok" });
  });

  it("the console guard's input shape: a secret split by escapes is one secret", () => {
    const hostile = `${ESC}[37mhttp://user:${PW.slice(0, 4)}${ESC}[0m${PW.slice(4)}@127.0.0.1:1/${ESC}[39m`;
    expect(redactUrlCredentialsInText(hostile)).toBe("http://127.0.0.1:1/");
  });
});

// The reviewer's combined regression (closing review): the two families that failed before — whitespace around the
// separator (the auditor's `\s` bug) and escape sequences around and inside the value (the `\b` bypass) — in one text.
// And the other side of the same invariant: a coloured line without a secret comes back byte for byte.
describe("SECRET-SURFACE-2 · combined · whitespace and escape sequences interleaved", () => {
  const K = "0f1e2d3c4b5a69788796a5b4c3d2e1f0fedcba98765432100123456789abcdef"; // 64 hex, no repetition
  const everyChar = (s: string) => s.split("").join(`${ESC}[0m`);
  const noEscapes = (s: string) => expect(s, "no escape sequence survives in a text that held a secret").not.toMatch(/\x1b|\x9b|\\u001b/);

  it("a key under a secret-named field: spaces and a tab around the colon, the value split by bold and colour", () => {
    const out = maskSecrets(`  "privateKey"${ESC}[33m \t:${ESC}[39m   "${ESC}[1m${K.slice(0, 7)}${ESC}[0m${ESC}[37m${K.slice(7)}${ESC}[39m"`);
    expect(out, out).not.toContain(K);
    expect(out).toContain("[REDACTED]");
    noEscapes(out);
  });

  it("the .env line: spaces around =, an escape after every character of the value", () => {
    const out = maskSecrets(`VAULT_PRIVATE_KEY ${ESC}[2m=${ESC}[22m ${ESC}[37m${everyChar(K)}${ESC}[39m`);
    expect(out, out).not.toContain(K);
    expect(out).toBe("VAULT_PRIVATE_KEY = 0f1e2d...cdef [REDACTED]");
  });

  it("URL credentials: tabs and runs of spaces around a coloured URL whose password is split by escapes", () => {
    const line = `\tnode\t  at   ${ESC}[37mhttp://user:${PW.slice(0, 3)}${ESC}[0m${ESC}[37m${PW.slice(3)}@127.0.0.1:1/${ESC}[39m   \tfailed`;
    const out = redactUrlCredentialsInText(line);
    expect(out, out).not.toContain(PW);
    expect(out).toContain("http://127.0.0.1:1/");
    noEscapes(out);
  });

  it("a mnemonic under its field: mixed whitespace and colours", () => {
    const words = "abandon ability able about above absent absorb abstract absurd abuse access accident";
    const out = maskSecrets(`mnemonic${ESC}[2m:${ESC}[22m \t${ESC}[37m${words}${ESC}[39m`);
    expect(out, out).not.toContain("abandon ability");
    expect(out).toContain("[MNEMONIC REDACTED]");
    noEscapes(out);
  });

  it("a coloured document value: the textual \\u001b form, spaces, the key split", () => {
    const doc = JSON.stringify({ note: `${ESC}[37mprivateKey :  ${K.slice(0, 20)}${ESC}[0m${K.slice(20)}${ESC}[39m` });
    expect(doc).toContain("\\u001b"); // what a serialised coloured string carries
    const out = maskSecrets(doc);
    expect(out, out).not.toContain(K);
    noEscapes(out);
  });

  it("normal coloured output without a secret is returned byte for byte (an address and amounts, a public query, a 63-hex)", () => {
    const lines = [
      `  ${ESC}[36mkaspa:qr9p3erdswuf0r3wvn9ufxq980ky589m7nvk2p6mmglhxj20j3025p8t8hpct${ESC}[39m   ${ESC}[32m1.50000000 KAS${ESC}[39m   fee ${ESC}[33m0.00002000${ESC}[39m`,
      `  page ${ESC}[37mhttp://127.0.0.1:7420/api/items?page=2&limit=50${ESC}[39m  \t(public query, no credential)`,
      `  ${ESC}[1mcontentHash${ESC}[22m  ${ESC}[2m${K.slice(0, 63)}${ESC}[22m  (63 hex: not a key's shape)`
    ];
    for (const line of lines) {
      expect(maskSecrets(line)).toBe(line);
      expect(redactUrlCredentialsInText(line)).toBe(line);
    }
  });
});
