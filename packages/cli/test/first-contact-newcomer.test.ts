import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  repoRoot,
  makeConsumerDir,
  removeConsumerDir,
  runNode,
  runCli,
  codeBlockAfter,
  type ConsumerDir
} from "./first-contact-helpers.js";

// First contact · P-01 (cheap form) — what a newcomer runs, run as a newcomer runs
// it: the published documentation's code, verbatim, in a consumer project that
// resolves `@hardkas/*` through node_modules (package exports → built dist), and
// the test `hardkas init` scaffolds, run by vitest inside that project.
// Before this block every case failed with `parent_plan_unresolved` (E01).

let consumer: ConsumerDir | undefined;
afterEach(() => {
  removeConsumerDir(consumer);
  consumer = undefined;
});

describe("First contact · the documented first steps work as published", () => {
  it("docs/start/quickstart.md · SDK Workflow runs verbatim and prints the simulation receipt", () => {
    consumer = makeConsumerDir("hk-fc-qs-", ["sdk"]);
    const code = codeBlockAfter(path.join(repoRoot, "docs", "start", "quickstart.md"), "## 4. SDK Workflow");
    expect(code).toMatch(/sdk\.tx\.plan\(/);
    expect(code).toMatch(/sdk\.tx\.sign\(/);
    expect(code).toMatch(/sdk\.tx\.simulate\(/);
    fs.writeFileSync(path.join(consumer.dir, "quickstart.mjs"), code);
    const r = runNode(["quickstart.mjs"], consumer.dir);
    expect(r.status, r.out).toBe(0);
    expect(r.stdout).toMatch(/Simulation receipt: synthetic-[0-9a-f]{64}/);
    expect(r.out).not.toMatch(/parent_plan_unresolved|DEBUG SDK TX PLAN/);
  });

  it("README.md · 30 Second SDK Example runs verbatim and prints the receipt txId", () => {
    consumer = makeConsumerDir("hk-fc-readme-", ["sdk"]);
    const code = codeBlockAfter(path.join(repoRoot, "README.md"), "## 30 Second SDK Example");
    fs.writeFileSync(path.join(consumer.dir, "readme.mjs"), code);
    const r = runNode(["readme.mjs"], consumer.dir);
    expect(r.status, r.out).toBe(0);
    expect(r.stdout).toMatch(/synthetic-[0-9a-f]{64}/);
    expect(r.out).not.toMatch(/parent_plan_unresolved|DEBUG SDK TX PLAN/);
  });

  it("`hardkas init .` then its generated test passes under vitest in the new project, balance check included", () => {
    const vitestReal = fs.realpathSync(path.join(repoRoot, "packages", "testing", "node_modules", "vitest"));
    consumer = makeConsumerDir("hk-fc-init-", ["sdk", "testing"], { vitest: vitestReal });
    const init = runCli(["init", "."], consumer.dir);
    expect(init.status, init.out).toBe(0);
    expect(fs.existsSync(path.join(consumer.dir, "test", "payment.test.ts"))).toBe(true);
    const r = runNode([path.join(vitestReal, "vitest.mjs"), "run", "--reporter=verbose"], consumer.dir, 180_000);
    expect(r.out).toMatch(/payment flow/);
    expect(r.out).not.toMatch(/parent_plan_unresolved/);
    // Demo-cut step 2 · E04: the simulator keeps one identity per account, so the
    // scaffolded balance check (Bob +10 KAS) holds. This case was pinned to the E04
    // symptom (Bob −990 KAS) in the first-contact block and is now green.
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/1 passed/);
  }, 240_000);
});
