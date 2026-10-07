import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { withLock } from "@hardkas/core";
import { ArtifactStoreMutation, writeFileRespectingStore, ensureDirRespectingStore } from "../src/store-mutation.js";

// ARTIFACT-STORE-MUTATION-API-1 (phase 2A of SNAPSHOT-CREATE-CONCURRENCY-1): the artifact store's single physical gate.
// It resolves the workspace store, keeps every path inside it, takes `artifacts` reentrantly and does the mutation
// (atomic replace, or exclusive create that never overwrites).

let root: string;
const store = () => path.join(root, ".hardkas", "artifacts");
const lockFile = () => path.join(root, ".hardkas", "locks", "artifacts.lock");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-store-mutation-"));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("ArtifactStoreMutation · paths", () => {
  it("writes inside the store, creating parents, and returns the absolute path", async () => {
    const p = await new ArtifactStoreMutation(root).writeFile(path.join("plans", "a.json"), "{}");
    expect(p).toBe(path.join(store(), "plans", "a.json"));
    expect(fs.readFileSync(p, "utf-8")).toBe("{}");
  });

  it.each([["../outside.json"], ["plans/../../outside.json"], [path.join(os.tmpdir(), "elsewhere.json")], [""]])(
    "refuses %s: ARTIFACT_PATH_OUTSIDE_STORE, nothing written",
    async (rel) => {
      await expect(new ArtifactStoreMutation(root).writeFile(rel, "{}")).rejects.toMatchObject({ code: "ARTIFACT_PATH_OUTSIDE_STORE" });
      expect(fs.existsSync(path.join(root, ".hardkas", "outside.json"))).toBe(false);
    }
  );

  it("refuses a directory linked out of the store", async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "hk-store-mutation-out-"));
    try {
      fs.mkdirSync(store(), { recursive: true });
      fs.symlinkSync(outside, path.join(store(), "linked"), "junction");
      await expect(new ArtifactStoreMutation(root).writeFile(path.join("linked", "x.json"), "{}")).rejects.toMatchObject({ code: "ARTIFACT_PATH_OUTSIDE_STORE" });
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("forPath finds the store a path is in (or is); undefined outside any store", () => {
    const inStore = ArtifactStoreMutation.forPath(path.join(store(), "silver", "r.json"));
    expect(inStore?.store.storeDir).toBe(store());
    expect(inStore?.relPath).toBe(path.join("silver", "r.json"));
    expect(ArtifactStoreMutation.forPath(store())?.relPath).toBe("");
    expect(ArtifactStoreMutation.forPath(path.join(root, ".hardkas", "runs", "x", "artifacts", "a.json"))).toBeUndefined();
    expect(ArtifactStoreMutation.forPath(path.join(root, "exports", "a.json"))).toBeUndefined();
  });
});

describe("ArtifactStoreMutation · write modes", () => {
  it("replaces an existing file by default (today's store semantics, atomically)", async () => {
    const gate = new ArtifactStoreMutation(root);
    await gate.writeFile("a.json", "one");
    await gate.writeFile("a.json", "two");
    expect(fs.readFileSync(path.join(store(), "a.json"), "utf-8")).toBe("two");
    expect(fs.readdirSync(store())).toEqual(["a.json"]); // no temp left behind
  });

  it("exclusive: creates an absent file, and never overwrites an existing one (EEXIST)", async () => {
    const gate = new ArtifactStoreMutation(root);
    await gate.writeFile("r.json", "first", { exclusive: true });
    await expect(gate.writeFile("r.json", "second", { exclusive: true })).rejects.toMatchObject({ code: "EEXIST" });
    expect(fs.readFileSync(path.join(store(), "r.json"), "utf-8")).toBe("first");
  });

  it("ensureDir creates the store, or a directory inside it", async () => {
    const gate = new ArtifactStoreMutation(root);
    await gate.ensureDir();
    await gate.ensureDir("silver-vm");
    expect(fs.statSync(path.join(store(), "silver-vm")).isDirectory()).toBe(true);
    await expect(gate.ensureDir("..")).rejects.toMatchObject({ code: "ARTIFACT_PATH_OUTSIDE_STORE" });
  });
});

describe("ArtifactStoreMutation · the artifacts lock", () => {
  it("waits while another holder has `artifacts`, writes once it is released", async () => {
    fs.mkdirSync(path.dirname(lockFile()), { recursive: true });
    fs.writeFileSync(lockFile(), JSON.stringify({ schema: "hardkas.lock.v1", name: "artifacts", pid: process.ppid, command: "another process", cwd: root, hostname: os.hostname(), createdAt: new Date().toISOString(), expiresAt: null }));
    const pending = new ArtifactStoreMutation(root).writeFile("a.json", "{}");
    await sleep(600);
    expect(fs.existsSync(path.join(store(), "a.json"))).toBe(false);
    fs.unlinkSync(lockFile());
    await pending;
    expect(fs.existsSync(path.join(store(), "a.json"))).toBe(true);
  });

  it("joins a holding of `artifacts` its caller already has (reentrant), and releases nothing of it", async () => {
    await withLock({ rootDir: root, name: "artifacts", command: "outer operation" }, async () => {
      await new ArtifactStoreMutation(root).writeFile("a.json", "{}");
      expect(fs.existsSync(lockFile()), "the caller's holding is still in place").toBe(true);
    });
    expect(fs.existsSync(lockFile())).toBe(false);
  });
});

describe("caller-chosen paths", () => {
  it("writeFileRespectingStore: inside a store through the gate, elsewhere the caller's own write", async () => {
    let plain = 0;
    await writeFileRespectingStore(path.join(store(), "export.json"), "{}", () => { plain++; });
    expect(plain).toBe(0);
    expect(fs.existsSync(path.join(store(), "export.json"))).toBe(true);
    const outside = path.join(root, "exports", "export.json");
    await writeFileRespectingStore(outside, "{}", () => { plain++; });
    expect(plain).toBe(1);
  });

  it("ensureDirRespectingStore: the store through the gate, other directories with a plain mkdir", async () => {
    await ensureDirRespectingStore(path.join(store(), "silver"));
    await ensureDirRespectingStore(path.join(root, "reports"));
    expect(fs.statSync(path.join(store(), "silver")).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(root, "reports")).isDirectory()).toBe(true);
  });
});
