import fs from "node:fs";
import path from "node:path";

/**
 * REMED-CLOSE · test isolation. No test may leave state in the repository root's .hardkas: one run would hand it to the
 * next. The directory is listed before a run and after it; anything added, changed or removed fails the run, by name.
 * Files already there are only compared, never removed or rewritten.
 */
export interface RootHygiene {
  setup(): void;
  /** Throws TEST_ROOT_HARDKAS_WRITTEN when the run touched the directory. */
  teardown(): void;
}

type Entry = { readonly size: number; readonly mtimeMs: number };

function listTree(root: string): Map<string, Entry> {
  const out = new Map<string, Entry>();
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        out.set(`${path.relative(root, p)}/`, { size: 0, mtimeMs: 0 });
        walk(p);
      } else {
        try {
          const st = fs.statSync(p);
          out.set(path.relative(root, p), { size: st.size, mtimeMs: st.mtimeMs });
        } catch {}
      }
    }
  };
  walk(root);
  return out;
}

export function rootHygiene(hardkasDir: string): RootHygiene {
  let before = new Map<string, Entry>();
  let existed = false;
  return {
    setup() {
      existed = fs.existsSync(hardkasDir);
      before = listTree(hardkasDir);
    },
    teardown() {
      const exists = fs.existsSync(hardkasDir);
      const after = listTree(hardkasDir);
      // the directory itself counts too: one a run creates (even left empty) or removes is named "./"
      const added = [...(!existed && exists ? ["./"] : []), ...[...after.keys()].filter((k) => !before.has(k))];
      const removed = [...(existed && !exists ? ["./"] : []), ...[...before.keys()].filter((k) => !after.has(k))];
      const changed = [...after].filter(([k, e]) => {
        const b = before.get(k);
        return b !== undefined && (b.size !== e.size || b.mtimeMs !== e.mtimeMs);
      }).map(([k]) => k);
      if (added.length + changed.length + removed.length > 0) {
        const show = (xs: string[]) => (xs.length > 20 ? [...xs.slice(0, 20), `… ${xs.length - 20} more`] : xs).join(", ");
        throw new Error(
          `TEST_ROOT_HARDKAS_WRITTEN: this run touched ${hardkasDir} — added [${show(added.sort())}], changed [${show(changed.sort())}], ` +
            `removed [${show(removed.sort())}]. A test must use a workspace of its own (a temporary directory), never the repository root's.`
        );
      }
    }
  };
}
