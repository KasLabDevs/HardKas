import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const cliPath = path.resolve(__dirname, "../dist/index.js");

function runCli(args: string[]): { stdout: string; stderr: string; status: number | null } {
  try {
    const stdout = execFileSync("node", [cliPath, ...args], { 
        encoding: "utf8", 
        stdio: "pipe",
        env: { ...process.env, HARDKAS_PROJECTION_BACKEND: "sqlite" }
    });
    return { stdout, stderr: "", status: 0 };
  } catch (error: any) {
    return { stdout: error.stdout || "", stderr: error.stderr || "", status: error.status };
  }
}

describe("Phase 8: Query Store Security", () => {
  beforeAll(() => {
      // ensure query store rebuild is done
      runCli(["query", "store", "rebuild"]);
  });

  it("1. SELECT succeeds by default", () => {
    const res = runCli(["query", "store", "sql", "SELECT 1 AS ok"]);
    if (res.status !== 0) throw new Error("Status was not 0. stderr: " + res.stderr + "\nstdout: " + res.stdout);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("ok");
  });

  it("2. WITH SELECT succeeds by default", () => {
    const res = runCli(["query", "store", "sql", "WITH cte AS (SELECT 1 AS ok) SELECT * FROM cte"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("ok");
  });

  it("3. INSERT blocked by default", () => {
    const res = runCli(["query", "store", "sql", "INSERT INTO artifacts (artifact_id) VALUES ('test')"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("QUERY_STORE_READ_ONLY_VIOLATION");
  });

  it("4. UPDATE blocked by default", () => {
    const res = runCli(["query", "store", "sql", "UPDATE artifacts SET schema = 'evil'"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("QUERY_STORE_READ_ONLY_VIOLATION");
  });

  it("5. DELETE blocked by default", () => {
    const res = runCli(["query", "store", "sql", "DELETE FROM artifacts"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("QUERY_STORE_READ_ONLY_VIOLATION");
  });

  it("6. DROP blocked by default", () => {
    const res = runCli(["query", "store", "sql", "DROP TABLE artifacts"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("QUERY_STORE_READ_ONLY_VIOLATION");
  });

  it("7. CREATE/ALTER blocked by default", () => {
    const res = runCli(["query", "store", "sql", "CREATE TABLE evil (id TEXT)"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("QUERY_STORE_READ_ONLY_VIOLATION");
    
    const res2 = runCli(["query", "store", "sql", "ALTER TABLE artifacts ADD COLUMN evil TEXT"]);
    expect(res2.status).not.toBe(0);
    expect(res2.stderr).toContain("QUERY_STORE_READ_ONLY_VIOLATION");
  });

  it("8. VACUUM/PRAGMA mutating blocked by default", () => {
    const res = runCli(["query", "store", "sql", "VACUUM"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("QUERY_STORE_READ_ONLY_VIOLATION");
  });

  it("9. Multiple statement attack blocked", () => {
    const res = runCli(["query", "store", "sql", "SELECT 1; DROP TABLE artifacts;"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("QUERY_STORE_READ_ONLY_VIOLATION");
  });

  it("10. Comment-obfuscated mutation blocked", () => {
    const res = runCli(["query", "store", "sql", "/* safe */ DROP TABLE artifacts;"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("QUERY_STORE_READ_ONLY_VIOLATION");
    
    const res2 = runCli(["query", "store", "sql", "--", "-- just a select\\nDROP TABLE artifacts;"]);
    expect(res2.status).not.toBe(0);
    expect(res2.stderr).toContain("QUERY_STORE_READ_ONLY_VIOLATION");
  });

  it("11. Mutation with only --unsafe-write fails", () => {
    const res = runCli(["query", "store", "sql", "DELETE FROM artifacts", "--unsafe-write"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("QUERY_STORE_WRITE_REQUIRES_YES");
  });

  it("12. Mutation with only --yes fails", () => {
    const res = runCli(["query", "store", "sql", "DELETE FROM artifacts", "--yes"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("QUERY_STORE_WRITE_REQUIRES_UNSAFE_WRITE");
  });

  it("13. Mutation with both flags succeeds only in explicit unsafe command path", () => {
    const res = runCli(["query", "store", "sql", "DROP TABLE IF EXISTS _test_mut; CREATE TABLE _test_mut (id TEXT);", "--unsafe-write", "--yes"]);
    expect(res.status).toBe(0);
    
    // verify it worked
    const verify = runCli(["query", "store", "sql", "SELECT * FROM _test_mut"]);
    expect(verify.status).toBe(0);
    
    // clean up
    runCli(["query", "store", "sql", "DROP TABLE _test_mut", "--unsafe-write", "--yes"]);
  });

  it("14. query store rebuild still works", () => {
    const res = runCli(["query", "store", "rebuild"]);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("Index rebuilt successfully");
  });


});
