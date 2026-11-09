import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cliDist, childEnv } from "./first-contact-helpers.js";
import { parseStateMapOption } from "../src/commands/silver.js";

// RC1 · rough edges the hackathon guide (front R4) hit while following its own steps:
//  - `artifact inspect` of a plan printed `Receipt Ref: undefined.receipt.json` (it guessed `${txId}.receipt.json`, and a
//    plan has no txId);
//  - `silver covenant transition --state-map` took inline JSON only, which some shells mangle, and an invalid value was an
//    untyped SyntaxError.

const PLAN_FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../artifacts/test/fixtures/valid/tx-plan.valid.json");
let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-rc1-rough-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("RC1 · artifact inspect of a plan", () => {
  it("never prints an invented receipt reference (human and JSON)", { timeout: 120_000 }, () => {
    const file = path.join(dir, "tx-plan.valid.json");
    fs.copyFileSync(PLAN_FIXTURE, file);
    const env = childEnv({ HARDKAS_HOME: path.join(dir, ".home") });
    const human = spawnSync(process.execPath, [cliDist, "artifact", "inspect", file], { cwd: dir, encoding: "utf8", timeout: 120_000, env });
    expect(human.status, human.stdout + human.stderr).toBe(0);
    expect(human.stdout + human.stderr).not.toMatch(/undefined\.receipt\.json/);
    const json = spawnSync(process.execPath, [cliDist, "artifact", "inspect", file, "--json"], { cwd: dir, encoding: "utf8", timeout: 120_000, env });
    expect(json.status, json.stdout + json.stderr).toBe(0);
    expect(json.stdout).not.toMatch(/undefined\.receipt\.json/);
  });
});

describe("RC1 · --state-map", () => {
  it("inline JSON, as before", () => {
    expect(parseStateMapOption('{"value":0}')).toEqual({ value: 0 });
  });

  it("the path of a JSON file (BOM tolerated), so no shell has to quote JSON", () => {
    const file = path.join(dir, "state-map.json");
    fs.writeFileSync(file, '﻿{ "value": 1 }');
    expect(parseStateMapOption(file)).toEqual({ value: 1 });
  });

  it.each([
    ["inline JSON a shell stripped of its quotes", "{value:0}"],
    ["an array", "[0]"],
    ["an empty object", "{}"],
    ["a negative index", '{"value":-1}'],
    ["a non-integer index", '{"value":"0"}']
  ])("%s: typed SILVER_ARGS_INVALID (usage, exit 2)", (_name, raw) => {
    expect(() => parseStateMapOption(raw)).toThrow(expect.objectContaining({ code: "SILVER_ARGS_INVALID", exitCode: 2 }));
  });

  it("a path that does not exist: typed SILVER_FILE_NOT_FOUND", () => {
    expect(() => parseStateMapOption(path.join(dir, "missing.json"))).toThrow(expect.objectContaining({ code: "SILVER_FILE_NOT_FOUND" }));
  });
});
