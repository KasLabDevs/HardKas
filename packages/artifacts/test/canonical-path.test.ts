import { describe, test, expect } from "vitest";
import { canonicalStringify, calculateContentHash } from "../src/canonical.js";

describe("canonicalStringify Path Hashing and Backslash Preservation", () => {
  test("preserves backslashes in non-path strings like regexes", () => {
    const obj = { pattern: "\\d+" };
    const serialized = canonicalStringify(obj, 3);
    expect(serialized).toBe('{"pattern":"\\\\d+"}');
  });

  test("normalizes backslashes in allowlisted path keys to forward slashes", () => {
    const obj = {
      sandboxSnapshotPath: "C:\\tmp\\sandbox\\snap.json",
      outputPath: "C:\\out.json",
      artifactPath: "C:\\art.json",
      workspacePath: "C:\\ws.json",
      relativePath: "src\\canonical.ts",
      absolutePath: "C:\\absolute\\path.ts"
    };

    const serialized = canonicalStringify(obj, 3);
    const parsed = JSON.parse(serialized);

    expect(parsed.sandboxSnapshotPath).toBe("C:/tmp/sandbox/snap.json");
    expect(parsed.outputPath).toBe("C:/out.json");
    expect(parsed.artifactPath).toBe("C:/art.json");
    expect(parsed.workspacePath).toBe("C:/ws.json");
    expect(parsed.relativePath).toBe("src/canonical.ts");
    expect(parsed.absolutePath).toBe("C:/absolute/path.ts");
  });

  test("does not normalize fields ending with path if they are not in the strict allowlist", () => {
    const obj = {
      myCustomPath: "A\\B\\C",
      filePath: "A\\B\\C",
      somePathSuffix: "A\\B\\C",
      nonPathField: "A\\B\\C"
    };

    const serialized = canonicalStringify(obj, 3);
    const parsed = JSON.parse(serialized);

    expect(parsed.myCustomPath).toBe("A\\B\\C");
    expect(parsed.filePath).toBe("A\\B\\C");
    expect(parsed.somePathSuffix).toBe("A\\B\\C");
    expect(parsed.nonPathField).toBe("A\\B\\C");
  });

  test("hashing is stable and cross-platform for path fields", () => {
    const windowsObj = {
      sandboxSnapshotPath: "sandbox\\path\\snap.json",
      normalField: "regex\\d+"
    };
    const posixObj = {
      sandboxSnapshotPath: "sandbox/path/snap.json",
      normalField: "regex\\d+"
    };

    const windowsHash = calculateContentHash(windowsObj, 3);
    const posixHash = calculateContentHash(posixObj, 3);

    expect(windowsHash).toBe(posixHash);
  });
});
