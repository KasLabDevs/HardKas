import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSnapshot } from "../src/snapshot.js";
import { CURRENT_RUNTIME_VERSION } from "../src/migrations.js";
import { HARDKAS_RUNTIME_VERSION } from "../src/version.js";

// PAPERCUTS #45 (2026-10-04): the snapshot manifest used to carry a version literal of its own.
// It now reads the runtime's version, the one literal of @hardkas/core, which version:check keeps
// equal to the package version.

const here = path.dirname(fileURLToPath(import.meta.url));

describe("PAPERCUTS #45 · the snapshot manifest carries the runtime's version", () => {
  it("manifest.hardkasVersion is the package version, through the runtime constant", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-papercut-45-"));
    try {
      const hardkasDir = path.join(root, ".hardkas");
      fs.mkdirSync(path.join(hardkasDir, "artifacts"), { recursive: true });
      const manifest = await createSnapshot({ hardkasDir, outputDir: path.join(root, "snapshots", "one") });
      const pkg = JSON.parse(fs.readFileSync(path.resolve(here, "../package.json"), "utf8"));
      expect(manifest.hardkasVersion).toBe(pkg.version);
      expect(manifest.hardkasVersion).toBe(HARDKAS_RUNTIME_VERSION);
      expect(CURRENT_RUNTIME_VERSION).toBe(HARDKAS_RUNTIME_VERSION);
      expect(JSON.parse(fs.readFileSync(path.join(root, "snapshots", "one", "manifest.json"), "utf8")).hardkasVersion).toBe(pkg.version);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("snapshot.ts keeps no version literal of its own", () => {
    const source = fs.readFileSync(path.resolve(here, "../src/snapshot.ts"), "utf8");
    expect(source).not.toMatch(/hardkasVersion:\s*"\d/);
    expect(source).toMatch(/hardkasVersion:\s*HARDKAS_RUNTIME_VERSION/);
  });
});
