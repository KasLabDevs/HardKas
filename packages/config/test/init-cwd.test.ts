import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadHardkasConfig } from "../src/load";
import path from "node:path";

describe("loadHardkasConfig INIT_CWD safety", () => {
  const originalInitCwd = process.env.INIT_CWD;

  beforeEach(() => {
    // Set process.env.INIT_CWD to a dummy path that is distinct from process.cwd()
    process.env.INIT_CWD = path.resolve("/dummy/ambient/workspace");
  });

  afterEach(() => {
    process.env.INIT_CWD = originalInitCwd;
  });

  it("should ignore process.env.INIT_CWD by default", async () => {
    const loadedDefault = await loadHardkasConfig();
    
    // Compare with a control run where INIT_CWD is completely unset
    const saved = process.env.INIT_CWD;
    delete process.env.INIT_CWD;
    const loadedControl = await loadHardkasConfig();
    process.env.INIT_CWD = saved;

    expect(loadedDefault.cwd).toBe(loadedControl.cwd);
    expect(loadedDefault.cwd).not.toBe(saved);
  });

  it("should honor process.env.INIT_CWD when ambientWorkspace is explicitly set to true", async () => {
    const loaded = await loadHardkasConfig({ ambientWorkspace: true });
    expect(loaded.cwd).toBe(process.env.INIT_CWD);
  });

  it("should prioritize explicit options.cwd over process.env.INIT_CWD even when ambientWorkspace is true", async () => {
    const explicitCwd = path.resolve("/explicit/cwd/path");
    const loaded = await loadHardkasConfig({ cwd: explicitCwd, ambientWorkspace: true });
    expect(loaded.cwd).toBe(explicitCwd);
  });
});
