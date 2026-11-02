import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { HARDKAS_VERSION } from "@hardkas/artifacts";
import { extManifest, EXT_DIR } from "./helpers/installed-l2.js";

// L2-EXT stage 2 · owner correction C2: the package declares no install-time script, and its manifest is the one the
// CLI registry and `extension install --from` check (catalog name, the CLI's exact version, id, API, entry).
describe("@hardkas/ext-l2 manifest", () => {
  const m = extManifest();

  it("declares no install-time script", () => {
    for (const s of ["preinstall", "install", "postinstall", "prepare", "prepublish"]) expect(m.scripts?.[s], s).toBeUndefined();
  });

  it("is the l2 extension at the CLI's exact version, API 1, with its entry in the published files", () => {
    expect({ name: m.name, version: m.version, manifest: m.hardkas?.extension }).toEqual({
      name: "@hardkas/ext-l2",
      version: HARDKAS_VERSION,
      manifest: { id: "l2", apiVersion: 1, entry: "./dist/extension.js" }
    });
    expect(m.files).toContain("dist");
    expect(m.exports["."].import).toBe(m.hardkas.extension.entry);
    const cli = JSON.parse(fs.readFileSync(path.join(EXT_DIR, "..", "cli", "package.json"), "utf8"));
    expect(cli.version).toBe(m.version);
  });

  it("depends on @hardkas/l2 and viem itself, and takes the CLI as a peer (never bundling another CLI)", () => {
    expect(Object.keys(m.dependencies)).toEqual(expect.arrayContaining(["@hardkas/l2", "viem"]));
    expect(Object.keys(m.peerDependencies)).toEqual(["@hardkas/cli"]);
    expect(m.dependencies["@hardkas/cli"]).toBeUndefined();
  });
});
