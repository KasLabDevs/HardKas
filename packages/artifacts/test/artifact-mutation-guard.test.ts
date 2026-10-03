import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// ARTIFACT-MUTATION-1 (phase 2A of SNAPSHOT-CREATE-CONCURRENCY-1): every mutation of `.hardkas/artifacts/**` made by
// cooperative repository code goes through the artifact store's mutation gate (packages/artifacts/src/store-mutation.ts)
// and happens under the `artifacts` lock. This guard finds the structural bypass: a filesystem mutation (fs write, copy,
// rename, delete, mkdir, or writeFileAtomic) whose destination is built from the artifact store's location, anywhere but
// in the gate. writeFileAtomic and fs stay legitimate everywhere else: only store-bound destinations are flagged.

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const GATE = path.join("packages", "artifacts", "src", "store-mutation.ts");

/** Mutation primitives (by callee name) and which arguments are destinations. */
const PRIMITIVES = new Map<string, number[]>(Object.entries({
  // hardkas-append-allow: primitive names in this guard's table, not calls
  writeFile: [0], writeFileSync: [0], appendFile: [0], appendFileSync: [0],
  truncate: [0], truncateSync: [0], createWriteStream: [0],
  unlink: [0], unlinkSync: [0], rm: [0], rmSync: [0], rmdir: [0], rmdirSync: [0],
  mkdir: [0], mkdirSync: [0], ensureDir: [0], ensureDirSync: [0], outputFile: [0], writeJson: [0], remove: [0], emptyDir: [0],
  rename: [0, 1], renameSync: [0, 1], move: [0, 1],
  copyFile: [1], copyFileSync: [1], cp: [1], cpSync: [1], copy: [1],
  writeFileAtomic: [0], writeFileAtomicSync: [0]
}));
const FS_EXTRA_ONLY = new Set(["ensureDir", "ensureDirSync", "outputFile", "writeJson", "remove", "emptyDir", "copy", "move"]);
/** Store-location markers in a destination expression (after expanding local variables). */
const STORE_MARKERS: RegExp[] = [
  /["'`]\.hardkas["'`]\s*,\s*["'`]artifacts["'`]/,
  /\.hardkas[\\/]{1,2}artifacts/,
  /\bartifactsDir\b/,
  /\bmainArtifactsDir\b/,
  /\bwsArtifactsDir\b/,
  /\bSILVER(_VM)?_RECORD_DIR\b/,
  /\bgetDefaultTracesDir\s*\(/,
  /\bgetTracePath\s*\(/
];

/** Every flagged mutation in the given source file: `relPath:line callee(dest)`. */
export function storeBoundMutations(filePath: string, rel: string): string[] {
  const text = fs.readFileSync(filePath, "utf-8");
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  // local variable initializers, file-wide (enough to follow `const target = path.join(artifactsDir, …)`); functions are
  // not followed, only value expressions
  const inits = new Map<string, ts.Expression[]>();
  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && !ts.isFunctionLike(node.initializer)) {
      inits.set(node.name.text, [...(inits.get(node.name.text) ?? []), node.initializer]);
    }
    // later assignments too (`let dir: string; … dir = workspace.artifactsDir`)
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left) && !ts.isFunctionLike(node.right)) {
      inits.set(node.left.text, [...(inits.get(node.left.text) ?? []), node.right]);
    }
    ts.forEachChild(node, collect);
  };
  collect(sf);
  /** Identifiers used as values in an expression (not property names, not text inside strings). */
  const valueIds = (node: ts.Node, acc = new Set<string>()): Set<string> => {
    if (ts.isIdentifier(node)) {
      const p = node.parent;
      const isPropertyName = (ts.isPropertyAccessExpression(p) && p.name === node) || (ts.isPropertyAssignment(p) && p.name === node);
      if (!isPropertyName) acc.add(node.text);
    }
    if (ts.isFunctionLike(node)) return acc;
    ts.forEachChild(node, (c) => void valueIds(c, acc));
    return acc;
  };
  const expand = (node: ts.Node, depth = 0, seen = new Set<string>()): string => {
    let out = node.getText(sf);
    if (depth > 3) return out;
    for (const id of valueIds(node)) {
      if (seen.has(id)) continue;
      seen.add(id);
      for (const init of inits.get(id) ?? []) out += ` ${expand(init, depth + 1, seen)}`;
    }
    return out;
  };
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : undefined;
      // fs-extra-only names (writeJson, copy, remove, …) collide with other APIs: they count only on an fs receiver
      const onFsReceiver = ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && /^(fs|fse|fsExtra|fsx)$/i.test(callee.expression.text);
      // a call on the gate itself (`new ArtifactStoreMutation(…).writeFile`, `gate.store.writeFile`) is the API, not a bypass
      const onGate = ts.isPropertyAccessExpression(callee) && /\bArtifactStoreMutation\b/.test(expand(callee.expression));
      const dests = name && !onGate && (!FS_EXTRA_ONLY.has(name) || onFsReceiver) ? PRIMITIVES.get(name) : undefined;
      if (dests) {
        for (const i of dests) {
          const arg = node.arguments[i];
          if (!arg) continue;
          const dest = expand(arg);
          if (STORE_MARKERS.some((m) => m.test(dest))) {
            const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
            hits.push(`${rel.split(path.sep).join("/")}:${line} ${name}(${arg.getText(sf)})`);
            break;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name === "out" || e.name === "test" || e.name === "torture") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|mts|cts|tsx)$/.test(e.name) && !/\.(test|spec)\.[cm]?tsx?$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

describe("ARTIFACT-MUTATION-1 · no filesystem mutation of the artifact store outside its gate", () => {
  it("packages/*/src: every store-bound mutation is in packages/artifacts/src/store-mutation.ts", () => {
    const packagesDir = path.join(repoRoot, "packages");
    const hits: string[] = [];
    for (const pkg of fs.readdirSync(packagesDir)) {
      const src = path.join(packagesDir, pkg, "src");
      if (!fs.existsSync(src)) continue;
      for (const file of sourceFiles(src)) {
        const rel = path.relative(repoRoot, file);
        if (rel === GATE) continue;
        hits.push(...storeBoundMutations(file, rel));
      }
    }
    expect(hits, `store mutations outside the gate:\n${hits.join("\n")}`).toEqual([]);
  });

  it("self-test: flags store-bound destinations, never legitimate writes elsewhere", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-mutation-guard-"));
    try {
      const sample = [
        `import fs from "node:fs"; import path from "node:path"; import { writeFileAtomic } from "@hardkas/core";`,
        `export async function bad(root: string, artifactsDir: string, id: string, src: string) {`,
        `  await writeFileAtomic(path.join(root, ".hardkas", "artifacts", "x.json"), "{}");`, // 3
        `  const target = path.join(artifactsDir, "plans", id);`,
        `  fs.writeFileSync(target, "{}");`, // 5
        `  await fs.promises.copyFile(src, path.join(artifactsDir, id));`, // 6
        `  fs.mkdirSync(SILVER_RECORD_DIR, { recursive: true });`, // 7
        `  await writeFileAtomic(getTracePath(id), "{}");`, // 8
        `  fs.renameSync(path.join(artifactsDir, "a"), "/tmp/b");`, // 9
        `  let out: string; out = workspace.artifactsDir; fs.mkdirSync(out);`, // 10
        `}`,
        `export async function good(root: string, artifactsDir: string, dest: string, name: string, runsDir: string) {`,
        `  await writeFileAtomic(path.join(root, ".hardkas", "config.json"), "{}");`,
        `  await fs.promises.copyFile(path.join(artifactsDir, name), dest);`,
        `  fs.writeFileSync(path.join(root, "snapshots", name), "{}");`,
        `  fs.readFileSync(path.join(artifactsDir, name));`,
        `  const kept = listFiles(artifactsDir).length;`,
        `  getOutput().writeJson({ ok: true, kept });`,
        `  fs.writeFileSync(path.join(runsDir, "scenario-result.json"), "{}");`,
        `  const gate = ArtifactStoreMutation.forPath(path.join(artifactsDir, name));`,
        `  await gate!.store.writeFile(gate!.relPath, "{}");`,
        `  await new ArtifactStoreMutation(root).writeFile(path.join(artifactsDir, name), "{}");`,
        `}`,
        `export const scenario = make(() => { fs.mkdirSync(path.join(process.cwd(), ".hardkas", "artifacts")); });`
      ].join("\n");
      const file = path.join(dir, "sample.ts");
      fs.writeFileSync(file, sample);
      const lines = storeBoundMutations(file, "sample.ts").map((h) => Number(h.split(":")[1]!.split(" ")[0]));
      // 10: an assigned (not initialized) store path; 24: a real store mkdir inside a fixture callback
      expect(lines).toEqual([3, 5, 6, 7, 8, 9, 10, 24]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
