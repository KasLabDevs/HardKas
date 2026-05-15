import { describe, it } from "node:test";
import assert from "node:assert";
import { execa } from "execa";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "../src/fs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("HardKAS Concurrency Safety", () => {
  
  it("should ensure isolated sandboxes for parallel CLI runs", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-concurrency-"));
    const sandbox1 = path.join(tempDir, "sandbox1");
    const sandbox2 = path.join(tempDir, "sandbox2");
    
    fs.mkdirSync(sandbox1);
    fs.mkdirSync(sandbox2);

    const cliPath = path.resolve(__dirname, "../src/main.ts");
    const tsxPath = path.resolve(__dirname, "../../../node_modules/.bin/tsx");

    // Run two inits in parallel
    await Promise.all([
      execa(tsxPath, [cliPath, "init", "--name", "prj1"], { cwd: sandbox1 }),
      execa(tsxPath, [cliPath, "init", "--name", "prj2"], { cwd: sandbox2 })
    ]);

    assert.ok(fs.existsSync(path.join(sandbox1, "package.json")));
    assert.ok(fs.existsSync(path.join(sandbox2, "package.json")));
    
    const pkg1 = JSON.parse(fs.readFileSync(path.join(sandbox1, "package.json"), "utf8"));
    const pkg2 = JSON.parse(fs.readFileSync(path.join(sandbox2, "package.json"), "utf8"));
    
    assert.strictEqual(pkg1.name, "prj1");
    assert.strictEqual(pkg2.name, "prj2");
    
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should prevent corruption during concurrent atomic writes to same file", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-atomic-concurrency-"));
    const targetFile = path.join(tempDir, "contested.txt");
    
    const content1 = "A".repeat(1024 * 1024); // 1MB of A
    const content2 = "B".repeat(1024 * 1024); // 1MB of B
    
    const attempts = 10;
    const promises = [];
    for (let i = 0; i < attempts; i++) {
      promises.push(writeFileAtomic(targetFile, i % 2 === 0 ? content1 : content2));
    }
    
    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === "fulfilled").length;
    console.log(`Successful atomic writes: ${successful}/${attempts}`);
    
    if (fs.existsSync(targetFile)) {
      const finalContent = fs.readFileSync(targetFile, "utf8");
      const isAllA = finalContent === content1;
      const isAllB = finalContent === content2;
      assert.ok(isAllA || isAllB, "File content should be either all A or all B");
      assert.strictEqual(finalContent.length, 1024 * 1024, "File size should be exactly 1MB");
    }
    
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
