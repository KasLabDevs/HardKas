/**
 * ESCALÓN 3 · a backup that never replaces another file. `config repair` used to copy over `<file>.backup` on every
 * run, so the second run replaced the user's original with the template; `accounts real init --force` kept no copy.
 */
import fs from "node:fs";

/**
 * Copies `file` to `<file>.backup`, or to the first free `<file>.backup.N`, never overwriting an existing file
 * (COPYFILE_EXCL; the copy keeps the source's permission bits). Returns the backup's path.
 */
export function backupFileNoOverwrite(file: string): string {
  for (let n = 0; n < 10_000; n++) {
    const target = n === 0 ? `${file}.backup` : `${file}.backup.${n}`;
    try {
      fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL);
      return target;
    } catch (e: any) {
      if (e?.code !== "EEXIST") throw e;
    }
  }
  throw new Error(`No free backup name for ${file}`);
}
