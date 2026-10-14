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
