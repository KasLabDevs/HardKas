import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { KASPAD_REFERENCE_IMAGE } from "@hardkas/core";
import { cliDist, childEnv } from "./first-contact-helpers.js";
import { assertNodeStartImagePinned, PINNED_NODE_IMAGE } from "../src/runners/node-start-runner.js";
import { buildHardkasProgram } from "../src/program.js";
import { NO_EFFECT_OPTIONS } from "../src/no-effect-options.js";

// -----------------------------------------------------------------------------
// ESCALÓN 4 · P39 · `node start --image <image>` ran any image, a moving tag included (only `:latest` was refused, and
// `--allow-floating-image` lifted even that); HARDKAS_KASPAD_IMAGE, the runner's default, was not checked at all. Now
// the image must be pinned by digest (`<repository>[:tag]@sha256:<64 hex>`), whichever way it is given, or the command
// is the typed usage error NODE_IMAGE_DIGEST_REQUIRED (exit 2) before the lock or Docker is touched: nothing starts.
// Without Docker: a fake `docker` first on PATH records every call, so "Docker was not asked" is observed, not assumed.
// -----------------------------------------------------------------------------

const DIGEST = "f85da74b9514584451f83a2cbea3aa93f700248302fe7e3e0ab17288f93c905b";
const FLOATING = ["kaspanet/rusty-kaspad:latest", "kaspanet/rusty-kaspad:v2.1.0", "kaspanet/rusty-kaspad", "", " ", `x@sha256:${DIGEST.slice(1)}`, `x@sha256:${DIGEST.toUpperCase()}`, `x@sha512:${DIGEST}`, `@sha256:${DIGEST}`];
const PINNED = [KASPAD_REFERENCE_IMAGE, `kaspanet/rusty-kaspad@sha256:${DIGEST}`, `registry.local:5000/kaspad:dev@sha256:${DIGEST}`];

const codeOf = (fn: () => void): string => {
  try {
    fn();
    return "PASSED";
  } catch (e: any) {
    return String(e?.code);
  }
};

describe("P39 · the image check (no Docker involved)", () => {
  it("an image without a sha256 digest is NODE_IMAGE_DIGEST_REQUIRED (exit 2); a pinned one passes", () => {
    for (const image of FLOATING) expect(codeOf(() => assertNodeStartImagePinned({ image }, {})), JSON.stringify(image)).toBe("NODE_IMAGE_DIGEST_REQUIRED");
    for (const image of PINNED) expect(codeOf(() => assertNodeStartImagePinned({ image }, {})), image).toBe("PASSED");
    let err: any;
    try {
      assertNodeStartImagePinned({ image: "kaspanet/rusty-kaspad:latest" }, {});
    } catch (e) {
      err = e;
    }
    expect(err?.exitCode).toBe(2);
    expect(String(err?.message)).toMatch(/Nothing was started/);
    expect(PINNED_NODE_IMAGE.test(KASPAD_REFERENCE_IMAGE), "the default reference image is itself pinned").toBe(true);
  });

  it("HARDKAS_KASPAD_IMAGE (the runner's default) is held to the same rule when --image is not given; --image decides when given", () => {
    expect(codeOf(() => assertNodeStartImagePinned({}, { HARDKAS_KASPAD_IMAGE: "kaspanet/rusty-kaspad:latest" }))).toBe("NODE_IMAGE_DIGEST_REQUIRED");
    expect(codeOf(() => assertNodeStartImagePinned({}, { HARDKAS_KASPAD_IMAGE: KASPAD_REFERENCE_IMAGE }))).toBe("PASSED");
    expect(codeOf(() => assertNodeStartImagePinned({}, {})), "nothing given: the pinned reference image").toBe("PASSED");
    expect(codeOf(() => assertNodeStartImagePinned({ image: KASPAD_REFERENCE_IMAGE }, { HARDKAS_KASPAD_IMAGE: "floating:latest" }))).toBe("PASSED");
    expect(codeOf(() => assertNodeStartImagePinned({ image: "floating:latest" }, { HARDKAS_KASPAD_IMAGE: KASPAD_REFERENCE_IMAGE }))).toBe("NODE_IMAGE_DIGEST_REQUIRED");
  });

  it("the help says so, and --allow-floating-image is a named no-effect option", () => {
    const program = buildHardkasProgram({ forDocs: true });
    const start = program.commands.find((c) => c.name() === "node")!.commands.find((c) => c.name() === "start")!;
    expect(start.options.find((o) => o.long === "--image")!.description).toMatch(/pinned by digest.*NODE_IMAGE_DIGEST_REQUIRED/);
    expect(start.options.find((o) => o.long === "--allow-floating-image")!.description).toMatch(/^No effect: /);
    expect(NO_EFFECT_OPTIONS["node start"]?.["--allow-floating-image"]).toMatch(/pinned by digest/);
  });
});

describe("P39 · hardkas node start: refused before the lock or Docker is touched", () => {
  let ws = "";
  let fake = "";
  const calls = () => path.join(fake, "calls.log");

  beforeAll(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-p39-ws-"));
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {};\n");
    fake = fs.mkdtempSync(path.join(os.tmpdir(), "hk-p39-docker-"));
    // a docker that records its arguments and fails (never a real engine)
    fs.writeFileSync(path.join(fake, "docker.cmd"), `@echo %* >> "%~dp0calls.log"\r\n@exit /b 1\r\n`);
    fs.writeFileSync(path.join(fake, "docker"), `#!/bin/sh\necho "$@" >> "$(dirname "$0")/calls.log"\nexit 1\n`, { mode: 0o755 });
  });
  afterAll(() => {
    fs.rmSync(ws, { recursive: true, force: true });
    fs.rmSync(fake, { recursive: true, force: true });
  });

  function run(args: string[], extra: Record<string, string> = {}) {
    const env = childEnv(extra);
    delete env.HARDKAS_ALLOW_SIMULATED_NODE;
    if (!("HARDKAS_KASPAD_IMAGE" in extra)) delete env.HARDKAS_KASPAD_IMAGE;
    const pathKey = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
    env[pathKey] = `${fake}${path.delimiter}${env[pathKey] ?? ""}`;
    env.DOCKER_HOST = "tcp://127.0.0.1:1";
    const r = spawnSync(process.execPath, [cliDist, ...args], { cwd: ws, env, encoding: "utf8", timeout: 120_000, input: "" });
    const stdout = r.stdout ?? "";
    let json: any;
    try {
      json = JSON.parse(stdout.slice(stdout.indexOf("{"), stdout.lastIndexOf("}") + 1));
    } catch {
      json = undefined;
    }
    return { status: r.status, stdout, all: `${stdout}\n${r.stderr ?? ""}`, json };
  }
  const brief = (r: { status: number | null; all: string }) => JSON.stringify({ status: r.status, out: r.all.slice(-800) });

  it("--image without a digest (a tag, :latest with --allow-floating-image, or HARDKAS_KASPAD_IMAGE): exit 2, Docker never called, no lock", () => {
    for (const argv of [
      ["node", "start", "--image", "kaspanet/rusty-kaspad:v2.1.0", "--json"],
      ["node", "start", "--image", "kaspanet/rusty-kaspad:latest", "--allow-floating-image", "--json"]
    ]) {
      const r = run(argv);
      expect(r.json?.code, brief(r)).toBe("NODE_IMAGE_DIGEST_REQUIRED");
      expect(r.status, brief(r)).toBe(2);
      expect(r.all).not.toMatch(/started successfully/);
    }
    const env = run(["node", "start", "--json"], { HARDKAS_KASPAD_IMAGE: "kaspanet/rusty-kaspad:latest" });
    expect(env.json?.code, brief(env)).toBe("NODE_IMAGE_DIGEST_REQUIRED");
    expect(env.json?.message).toMatch(/HARDKAS_KASPAD_IMAGE/);
    const human = run(["node", "start", "--image", "kaspanet/rusty-kaspad:latest"]);
    expect(human.status, brief(human)).toBe(2);
    expect(human.all).toMatch(/NODE_IMAGE_DIGEST_REQUIRED/);
    expect(fs.existsSync(calls()), "the fake docker was never invoked").toBe(false);
    expect(fs.existsSync(path.join(ws, ".hardkas", "locks", "node.lock")), "no lock left behind").toBe(false);
    expect(fs.existsSync(path.join(ws, ".hardkas", "kaspad")), "no data directory created").toBe(false);
  }, 240_000);

  it("control: a pinned --image passes the check and reaches Docker (the fake one, which fails): never NODE_IMAGE_DIGEST_REQUIRED", () => {
    const r = run(["node", "start", "--image", `kaspanet/rusty-kaspad@sha256:${DIGEST}`, "--json"]);
    expect(r.status, brief(r)).not.toBe(0);
    expect(r.json?.code, brief(r)).not.toBe("NODE_IMAGE_DIGEST_REQUIRED");
    expect(r.all).not.toMatch(/started successfully/);
    expect(fs.existsSync(calls()), "the check passed and Docker was asked").toBe(true);
  }, 180_000);
});
