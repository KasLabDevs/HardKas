import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Hardkas } from "../src/index.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";

// CI-MACOS · a workspace opened through a symlink (on macOS every temp directory: /var is a link to /private/var). Its
// files' real paths are under the root's real path, not under the root as written: verifying a file of the workspace by
// its path must not call it "outside the workspace", and a link inside the workspace that leads out still must.

let parent: string;
let link: string;
let outside: string;
let sdk: Hardkas;

const policy = () => {
  const p: any = {
    schema: "hardkas.policy.v1",
    hardkasVersion: "0.13.0-rc.1",
    version: "1.0.0-alpha",
    hashVersion: CURRENT_HASH_VERSION,
    networkId: "simnet",
    mode: "simulator",
    createdAt: new Date().toISOString(),
    decision: "ALLOW",
    rules: []
  };
  p.contentHash = calculateContentHash(p, CURRENT_HASH_VERSION);
  return p;
};

beforeAll(async () => {
  parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "hk-ws-symlink-")));
  const real = path.join(parent, "real");
  fs.mkdirSync(real);
  link = path.join(parent, "link");
  // a junction needs no privilege on Windows; elsewhere a directory symlink
  fs.symlinkSync(real, link, process.platform === "win32" ? "junction" : "dir");
  outside = path.join(parent, "outside");
  fs.mkdirSync(outside);
  sdk = await Hardkas.create({ cwd: link, autoBootstrap: true, network: "simulated" });
});

afterAll(() => {
  fs.rmSync(parent, { recursive: true, force: true });
});

describe("CI-MACOS · a workspace opened through a symlink", () => {
  it("a file of the workspace, by its path, verifies (it is not 'outside the workspace')", async () => {
    const { absolutePath } = await sdk.artifacts.write(policy());
    const result = await sdk.artifacts.verify(absolutePath!, { throwOnInvalid: false });
    expect(result, JSON.stringify(result)).toMatchObject({ valid: true });
  });

  it("a tampered file of the workspace is a content hash mismatch, not a missing artifact", async () => {
    const { absolutePath } = await sdk.artifacts.write(policy());
    const content = JSON.parse(fs.readFileSync(absolutePath!, "utf-8"));
    content.decision = "DENY";
    fs.writeFileSync(absolutePath!, JSON.stringify(content, null, 2), "utf-8");
    sdk.artifacts.cache.clear();
    const result = await sdk.artifacts.verify(absolutePath!, { throwOnInvalid: false });
    expect(result).toMatchObject({ valid: false, reason: "content_hash_mismatch" });
  });

  it("control · a link inside the workspace that leads out is still outside the workspace", async () => {
    const escaped = path.join(outside, "p.json");
    fs.writeFileSync(escaped, JSON.stringify(policy()));
    const inner = path.join(link, "escape");
    fs.symlinkSync(outside, inner, process.platform === "win32" ? "junction" : "dir");
    const result = await sdk.artifacts.verify(path.join(inner, "p.json"), { throwOnInvalid: false });
    expect(result.valid).toBe(false);
    expect(result.reason).not.toBe("content_hash_mismatch");
  });
});
