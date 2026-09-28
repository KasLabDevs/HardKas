import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { verifyArtifactIntegritySync } from "@hardkas/artifacts";
import { makeConsumerDir, removeConsumerDir, runCli, type ConsumerDir } from "./first-contact-helpers.js";

// First contact · E03 — docs/guides/tasks.md, followed as written: the task
// registered but every run failed with HASH_VERSION_MISSING because the task
// record was ad-hoc JSON. It is now a sealed `hardkas.scenarioResult.v1`.

const GUIDE_CONFIG = `import { defineHardkasConfig } from "@hardkas/config";
import { task, types } from "@hardkas/core";

export default defineHardkasConfig({
  tasks: {
    hello: task("hello", "prints hello")
      .param("name", "Name", types.string, "alice")
      .action(async (args, hk) => {
        return { hello: args.name };
      })
  }
});
`;

let consumer: ConsumerDir | undefined;
afterEach(() => {
  removeConsumerDir(consumer);
  consumer = undefined;
});

describe("First contact · E03 · custom tasks run as the guide shows", () => {
  it("`hardkas task hello --name bob --json` returns the task output and a record that verifies", () => {
    consumer = makeConsumerDir("hk-fc-task-", ["config", "core", "sdk"]);
    fs.writeFileSync(path.join(consumer.dir, "hardkas.config.ts"), GUIDE_CONFIG);
    const help = runCli(["task", "--help"], consumer.dir);
    expect(help.out).toMatch(/hello \[options\]\s+prints hello/);

    const r = runCli(["task", "hello", "--name", "bob", "--json"], consumer.dir);
    expect(r.status, r.out).toBe(0);
    const env = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
    expect(env).toMatchObject({ ok: true, command: "task", result: { task: "hello", output: { hello: "bob" } } });
    const record = JSON.parse(fs.readFileSync(env.result.artifact, "utf8"));
    expect(record.schema).toBe("hardkas.scenarioResult.v1");
    expect(record.metadata).toMatchObject({ kind: "task", taskName: "hello", args: { name: "bob" }, result: { hello: "bob" } });
    const v = verifyArtifactIntegritySync(record, { strict: true });
    expect(v.ok).toBe(true);
    expect(v.authScope).toBe("FULL");
  });

  it("`--evidence` packs the run and `hardkas evidence verify` accepts the package", () => {
    consumer = makeConsumerDir("hk-fc-task-ev-", ["config", "core", "sdk"]);
    fs.writeFileSync(path.join(consumer.dir, "hardkas.config.ts"), GUIDE_CONFIG);
    const r = runCli(["task", "hello", "--name", "carol", "--evidence"], consumer.dir);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/Evidence packed: /);
    expect(r.out).not.toMatch(/Failed to pack evidence/);
    const pkg = path.join(consumer.dir, "hello.hke.json");
    expect(fs.existsSync(pkg)).toBe(true);
    const v = runCli(["evidence", "verify", pkg], consumer.dir);
    expect(v.status, v.out).toBe(0);
    expect(v.out).toMatch(/EVIDENCE_VERIFIED/);
  });
});
