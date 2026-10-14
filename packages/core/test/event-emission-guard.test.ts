import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { coreEvents } from "../src/events.js";

// EVENT-LEDGER-2 · EVENT-EMISSION-1 regression guard. `coreEvents.normalizeAndEmit` used to discard, silently, anything
// that was not already a formal envelope; 13 call sites handed it raw `{ kind: "…", … }` objects and believed they were
// recorded. Those sites are gone (converted to catalog envelopes or removed as false emissions), normalizeAndEmit now
// refuses a raw object, and this guard keeps the pattern from coming back: no package source calls normalizeAndEmit
// (every producer builds an envelope with createEventEnvelope / emitArtifactWritten and emits it), and no package
// source passes an object literal to coreEvents.emit.

const packagesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function sourcesUnder(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "out") continue;
      sourcesUnder(p, out);
    } else if (/\.(ts|mts|cts|js|mjs|cjs)$/.test(entry.name) && !/\.test\.[mc]?[jt]s$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

function packageSources(): string[] {
  const out: string[] = [];
  for (const pkg of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    sourcesUnder(path.join(packagesDir, pkg.name, "src"), out);
  }
  return out;
}

const rel = (p: string) => path.relative(packagesDir, p).replace(/\\/g, "/");

describe("EVENT-EMISSION-1 · raw emissions cannot come back", () => {
  it("no package source calls normalizeAndEmit (its only definition is the bus in core/src/events.ts)", () => {
    const offenders: string[] = [];
    for (const file of packageSources()) {
      if (rel(file) === "core/src/events.ts") continue;
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        if (/normalizeAndEmit\s*\(/.test(line)) offenders.push(`${rel(file)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders, "a raw event handed to normalizeAndEmit is refused at runtime; build an envelope instead").toEqual([]);
  });

  it("no package source passes an object literal to coreEvents.emit (envelopes come from createEventEnvelope)", () => {
    const offenders: string[] = [];
    for (const file of packageSources()) {
      const text = fs.readFileSync(file, "utf8");
      const re = /coreEvents\s*\.\s*emit\s*\(\s*\{/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const line = text.slice(0, m.index).split(/\r?\n/).length;
        offenders.push(`${rel(file)}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("normalizeAndEmit refuses a raw event with EVENT_ENVELOPE_INVALID instead of dropping it", () => {
    const seen: unknown[] = [];
    const off = coreEvents.on((e) => seen.push(e));
    try {
      expect(() => coreEvents.normalizeAndEmit({ kind: "tx.signed", txId: "raw" })).toThrowError(
        expect.objectContaining({ code: "EVENT_ENVELOPE_INVALID", message: expect.stringContaining('"tx.signed"') })
      );
      expect(() => coreEvents.normalizeAndEmit(undefined)).toThrowError(expect.objectContaining({ code: "EVENT_ENVELOPE_INVALID" }));
      expect(seen).toEqual([]);
    } finally {
      off();
    }
  });
});
