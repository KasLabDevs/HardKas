import { describe, it, expect, afterEach } from "vitest";
import { Hardkas } from "../src/index.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Surface Cut 3a. `hardkas.events` (@hardkas/rpc-events) never delivered a UTXO event
// from a real node: as the SDK wired it, it never subscribed, and after `connect()` its
// address filter dropped every notification. Watching addresses is kaspa-wasm's
// UtxoProcessor + UtxoContext. This keeps the dead API and its package from coming back.
describe("Surface Cut 3a: no hardkas.events", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it("a Hardkas instance has no events provider", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-no-events-"));
    const sdk = await Hardkas.open({ cwd: tmpDir });
    expect("events" in sdk).toBe(false);
  });

  it("the SDK manifest does not depend on @hardkas/rpc-events", () => {
    const manifest = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      expect(manifest[section]?.["@hardkas/rpc-events"], section).toBeUndefined();
    }
  });
});
