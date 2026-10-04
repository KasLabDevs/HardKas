import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// PAPERCUTS-1 (AUD-36) · 13 CLI sources held double-encoded text (UTF-8 bytes read as Windows-1252 and saved again as
// UTF-8: "âœ…" for "✅", "â”€" for "─", "ðŸ’¡" for "💡"), so users saw garbage in the output of doctor, telemetry,
// artifact explain and others. This guard keeps the CLI sources free of it: a line is double-encoded when re-encoding
// it as Windows-1252 gives valid UTF-8 that differs from it.

const SRC = path.resolve(__dirname, "..", "src");

/** Windows-1252 code point → byte, from the decoder itself (bytes it leaves undefined map to the same C1 code point). */
const CP1252: Map<number, number> = (() => {
  const dec = new TextDecoder("windows-1252");
  const m = new Map<number, number>();
  for (let b = 0; b < 256; b++) m.set(dec.decode(Uint8Array.of(b)).codePointAt(0)!, b);
  return m;
})();

/** The line as it was before being double-encoded, or undefined when it is not double-encoded text. */
export function undoDoubleEncoding(line: string): string | undefined {
  if (!/[\u0080-￿]/.test(line)) return undefined;
  const bytes: number[] = [];
  for (const ch of line) {
    const b = CP1252.get(ch.codePointAt(0)!);
    if (b === undefined) return undefined; // a character Windows-1252 cannot hold: real Unicode text, not mojibake
    bytes.push(b);
  }
  try {
    const fixed = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
    return fixed !== line ? fixed : undefined;
  } catch {
    return undefined; // not valid UTF-8 once re-encoded: genuine Latin-1 text
  }
}

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sources(p) : /\.(ts|tsx|js|mjs|cjs)$/.test(e.name) ? [p] : [];
  });
}

describe("CLI sources · no double-encoded text", () => {
  it("the detector recognises mojibake and leaves real text alone", () => {
    expect(undoDoubleEncoding("  âœ… RPC: READY")).toBe("  ✅ RPC: READY");
    expect(undoDoubleEncoding("â”€â”€")).toBe("──");
    expect(undoDoubleEncoding("✅ ready")).toBeUndefined();
    expect(undoDoubleEncoding("plain ascii")).toBeUndefined();
    expect(undoDoubleEncoding("Más información · añadir")).toBeUndefined();
  });

  it("no line of packages/cli/src is double-encoded", () => {
    const found: string[] = [];
    for (const file of sources(SRC)) {
      fs.readFileSync(file, "utf-8").split(/\r?\n/).forEach((line, i) => {
        if (undoDoubleEncoding(line) !== undefined) found.push(`${path.relative(SRC, file)}:${i + 1}`);
      });
    }
    expect(found).toEqual([]);
  });
});
