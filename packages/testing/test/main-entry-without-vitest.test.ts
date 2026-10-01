import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// vitest is an OPTIONAL peer of @hardkas/testing: only ./setup and ./scenarios need
// it. That is correct only while the main entry never loads vitest at runtime, so
// this walks the main entry's runtime import graph (this package and every
// @hardkas/* workspace package it reaches) and fails on any value import of it.
// Only `import type` / `export type` count as type-only: under verbatimModuleSyntax
// an unused value import would be kept.

const PACKAGES = path.resolve(__dirname, "../..");
const TESTING = path.join(PACKAGES, "testing");
const isVitest = (spec: string) => spec === "vitest" || spec.startsWith("vitest/") || spec.startsWith("@vitest/");

const isLeaf = (file: string) => /\.(json|node)$/.test(file);

function resolveSource(file: string): string | null {
  if (isLeaf(file)) return fs.existsSync(file) ? file : null;
  const base = file.replace(/\.(m?js|cjs|ts)$/, "");
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), `${base}.js`, `${base}.cjs`, `${base}.mjs`]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** "@hardkas/x" or "@hardkas/x/sub" → that package's source file, through its exports map. */
function resolveWorkspace(spec: string): string | null {
  const [, name, ...rest] = spec.split("/");
  const pkgDir = path.join(PACKAGES, name!);
  const manifest = path.join(pkgDir, "package.json");
  if (!fs.existsSync(manifest)) return null;
  const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
  const key = rest.length ? `./${rest.join("/")}` : ".";
  const entry = pkg.exports?.[key];
  const target = typeof entry === "string" ? entry : entry?.import ?? entry?.default;
  const dist = typeof target === "string" ? target : key === "." ? pkg.main : undefined;
  if (!dist) return null;
  return resolveSource(path.join(pkgDir, dist.replace(/^(\.\/)?dist\//, "src/")));
}

/** Specifiers a module loads at runtime: every import/export-from, import() and require() except type-only ones. */
function runtimeSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const specs: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
      specs.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specs.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      const [arg] = node.arguments;
      if (arg && ts.isStringLiteral(arg)) specs.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specs;
}

function walk(entry: string) {
  const seen = new Set<string>();
  const external = new Map<string, string>();
  const unresolved: string[] = [];
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (isLeaf(file)) continue;
    for (const spec of runtimeSpecifiers(file)) {
      if (spec.endsWith(".node")) continue; // native addon binary (pskt-native), cannot load vitest
      const next = spec.startsWith(".") ? resolveSource(path.resolve(path.dirname(file), spec)) : spec.startsWith("@hardkas/") ? resolveWorkspace(spec) : null;
      if (spec.startsWith(".") || spec.startsWith("@hardkas/")) {
        if (next) queue.push(next);
        else unresolved.push(`${path.relative(PACKAGES, file)} → ${spec}`);
      } else if (!external.has(spec)) {
        external.set(spec, path.relative(PACKAGES, file));
      }
    }
  }
  return { modules: seen.size, external, unresolved };
}

describe("@hardkas/testing: vitest stays an optional peer", () => {
  it("the main entry's runtime graph never imports vitest", () => {
    const { modules, external, unresolved } = walk(path.join(TESTING, "src", "index.ts"));
    expect(unresolved).toEqual([]);
    expect(modules).toBeGreaterThan(20);
    const vitestImports = [...external].filter(([spec]) => isVitest(spec)).map(([spec, from]) => `${from} → ${spec}`);
    expect(vitestImports).toEqual([]);
  });

  it("the walk does see vitest where it is loaded: ./setup and ./scenarios", () => {
    for (const entry of ["setup.ts", "scenarios.ts"]) {
      const { external } = walk(path.join(TESTING, "src", entry));
      expect([...external.keys()].some(isVitest), entry).toBe(true);
    }
  });

  it("the manifest declares vitest as an optional peer next to the two entries that need it", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(TESTING, "package.json"), "utf8"));
    expect(pkg.peerDependencies?.vitest).toBeTruthy();
    expect(pkg.peerDependenciesMeta?.vitest?.optional).toBe(true);
    expect(pkg.dependencies?.vitest).toBeUndefined();
    expect(Object.keys(pkg.exports)).toEqual(expect.arrayContaining([".", "./setup", "./scenarios"]));
  });
});
