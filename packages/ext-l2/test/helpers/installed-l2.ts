// A project with @hardkas/ext-l2 installed the way a package manager leaves it: the package is a real directory inside
// the project's node_modules (its built package.json + dist), so the CLI's registry checks it exactly as in a user
// project; its dependencies are linked to the ones this repo resolved for packages/ext-l2. Needs `pnpm -r build`.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { childEnv, repoRoot, cliDist } from "../../../cli/test/first-contact-helpers.js";

export const EXT_DIR = path.join(repoRoot, "packages", "ext-l2");
const RECORDER = path.join(repoRoot, "packages", "cli", "test", "fixtures", "module-recorder.mjs");

export function extManifest(): any {
  return JSON.parse(fs.readFileSync(path.join(EXT_DIR, "package.json"), "utf8"));
}

/** Installs the built extension in `ws` (a project directory) and returns the links it made (to remove first). */
export function installL2Extension(ws: string): string[] {
  const manifest = extManifest();
  if (!fs.existsSync(path.join(EXT_DIR, "dist", "extension.js"))) throw new Error("packages/ext-l2/dist is missing: run pnpm -r build");
  const pkgJson = path.join(ws, "package.json");
  const project = fs.existsSync(pkgJson) ? JSON.parse(fs.readFileSync(pkgJson, "utf8")) : { name: "l2-project", version: "1.0.0", private: true };
  project.devDependencies = { ...project.devDependencies, "@hardkas/ext-l2": manifest.version };
  fs.writeFileSync(pkgJson, JSON.stringify(project, null, 2));

  const target = path.join(ws, "node_modules", "@hardkas", "ext-l2");
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(path.join(EXT_DIR, "package.json"), path.join(target, "package.json"));
  fs.cpSync(path.join(EXT_DIR, "dist"), path.join(target, "dist"), { recursive: true });
  // stage 5: the package also ships its templates (package.json "files")
  fs.cpSync(path.join(EXT_DIR, "templates"), path.join(target, "templates"), { recursive: true });

  const links: string[] = [];
  for (const dep of [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})]) {
    const resolved = fs.realpathSync(path.join(EXT_DIR, "node_modules", ...dep.split("/")));
    const at = path.join(ws, "node_modules", ...dep.split("/"));
    if (fs.existsSync(at)) continue;
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.symlinkSync(resolved, at, "junction");
    links.push(at);
  }
  return links;
}

/** Removes `ws`: links first (never their targets), then the tree. */
export function removeProject(ws: string, links: string[]): void {
  for (const l of links) {
    try {
      const st = fs.lstatSync(l);
      if (st.isSymbolicLink()) fs.unlinkSync(l);
      else if (st.isDirectory()) fs.rmdirSync(l);
    } catch {
      /* already gone */
    }
  }
  for (const l of links) if (fs.existsSync(l)) throw new Error(`refusing to delete ${ws}: link ${l} could not be removed`);
  fs.rmSync(ws, { recursive: true, force: true });
}

const L2_CODE = /\/(packages|@hardkas)\/l2\/|\/node_modules\/viem\/|\/\.pnpm\/viem@/;
const EXT_ENTRY = /\/node_modules\/@hardkas\/ext-l2\/dist\//;

/**
 * Runs the built CLI in `ws`, recording every module it resolved. HARDKAS_HOME is inherited, as in the core's spawned
 * tests: the hermetic gate provides a private copy of its baseline home (kaspa-wasm installed).
 */
export function cliIn(ws: string, args: string[], name: string, env: Record<string, string> = {}) {
  const log = path.join(ws, `${name}.modules.log`);
  const nodeOptions = `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(RECORDER).href}`.trim();
  const r = spawnSync(process.execPath, [cliDist, ...args], {
    cwd: ws,
    encoding: "utf8",
    timeout: 180_000,
    env: childEnv({ HARDKAS_MODULE_LOG: log, NODE_OPTIONS: nodeOptions, ...env })
  });
  const modules = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean).map((u) => u.replace(/\\/g, "/")) : [];
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  return {
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    json,
    modules,
    loadedL2Code: modules.some((u) => L2_CODE.test(u)),
    loadedExtension: modules.some((u) => EXT_ENTRY.test(u)),
    sawCli: modules.some((u) => u.includes("/packages/cli/dist/"))
  };
}
