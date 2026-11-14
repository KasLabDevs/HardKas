import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KASPAD_REFERENCE_IMAGE, isPinnedImageReference } from "@hardkas/core";
import { runDeployInit, DEPLOY_INIT_FILES } from "../src/commands/deploy.js";

// A2 (rc2 audit) · `hardkas deploy init` overwrote the developer's Dockerfile, docker-compose.yml, .env.example and
// PRODUCTION_CHECKLIST.md without checking, printing "Created", and recommended HARDKAS_KASPAD_IMAGE=kaspanet/kaspad:latest,
// a floating tag every HardKAS node path refuses (NODE_IMAGE_DIGEST_REQUIRED). Now an existing target is refused before
// anything is written (DEPLOY_INIT_FILE_EXISTS, exit 2) unless --force, and the image is the pinned reference image.

const made: string[] = [];
const fresh = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "hk-a2-deploy-"));
  made.push(d);
  return d;
};
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("A2 · deploy init never overwrites silently and names only a pinned node image", () => {
  it("an empty directory: the four files, HARDKAS_KASPAD_IMAGE = the pinned reference image, no floating tag", async () => {
    const dir = fresh();
    const r = await runDeployInit({ cwd: dir });
    expect(r.written).toEqual([...DEPLOY_INIT_FILES]);
    const env = fs.readFileSync(path.join(dir, ".env.example"), "utf8");
    const compose = fs.readFileSync(path.join(dir, "docker-compose.yml"), "utf8");
    const envImage = /^HARDKAS_KASPAD_IMAGE=(.+)$/m.exec(env)?.[1];
    const composeImage = /HARDKAS_KASPAD_IMAGE=\$\{HARDKAS_KASPAD_IMAGE:-([^}]+)\}/.exec(compose)?.[1];
    expect({ envImage, composeImage }).toEqual({ envImage: KASPAD_REFERENCE_IMAGE, composeImage: KASPAD_REFERENCE_IMAGE });
    expect(isPinnedImageReference(envImage)).toBe(true);
    expect(`${env}\n${compose}`).not.toMatch(/kaspanet\/kaspad:latest|:latest\b/);
  });

  it("an existing Dockerfile → DEPLOY_INIT_FILE_EXISTS (exit 2): nothing written, the developer's file intact", async () => {
    const dir = fresh();
    fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM my-own-image\n");
    let error: any;
    try {
      await runDeployInit({ cwd: dir });
    } catch (e) {
      error = e;
    }
    expect({ code: error?.code, exitCode: error?.exitCode, names: /Dockerfile/.test(String(error?.message)) }).toEqual({
      code: "DEPLOY_INIT_FILE_EXISTS",
      exitCode: 2,
      names: true
    });
    expect(fs.readFileSync(path.join(dir, "Dockerfile"), "utf8")).toBe("FROM my-own-image\n");
    expect(fs.readdirSync(dir)).toEqual(["Dockerfile"]);
  });

  it("--force replaces them", async () => {
    const dir = fresh();
    fs.writeFileSync(path.join(dir, "docker-compose.yml"), "services: {}\n");
    const r = await runDeployInit({ cwd: dir, force: true });
    expect(r.written).toEqual([...DEPLOY_INIT_FILES]);
    expect(fs.readFileSync(path.join(dir, "docker-compose.yml"), "utf8")).toMatch(/hardkas_data/);
  });
});
