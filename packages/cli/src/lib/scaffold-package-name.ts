import path from "node:path";
import { builtinModules } from "node:module";

/** What `hardkas init` names a project when its folder gives no usable name. */
export const DEFAULT_SCAFFOLD_PACKAGE_NAME = "hardkas-project";

/**
 * The `name` `hardkas init` writes into a new project's package.json: the project FOLDER's name, made a valid npm
 * package name. `init` takes a name or a path (`hardkas init C:\work\My App`), and it used to write that argument as
 * is, so an absolute or nested path became `"name": "C:\\work\\My App"`, which npm does not accept as a package name.
 *
 * npm's rules (validate-npm-package-name, new packages): at most 214 characters, lower case, URL-safe characters only,
 * not starting with `.` or `_`, not `node_modules` / `favicon.ico`, not a Node core module name. Anything else is
 * replaced by `-`; an empty result is `hardkas-project`, and a core module name gets the `hardkas-` prefix.
 */
export function scaffoldPackageName(projectDir: string): string {
  const base = path.basename(path.resolve(projectDir));
  const name = base
    .toLowerCase()
    .replace(/[^a-z0-9_.~-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[._-]+/, "")
    .replace(/[-.]+$/, "")
    .slice(0, 214)
    .replace(/[-.]+$/, "");
  if (name === "" || name === "node_modules" || name === "favicon.ico") return DEFAULT_SCAFFOLD_PACKAGE_NAME;
  if (builtinModules.includes(name)) return `hardkas-${name}`;
  return name;
}
