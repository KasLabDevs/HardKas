import fs from "node:fs";
import path from "node:path";

export async function withKeystoreLock<T>(
  filePath: string,
  operation: () => Promise<T>
): Promise<T> {
  const lockFilePath = `${filePath}.lock`;
  const staleTimeoutMs = parseInt(process.env.HARDKAS_KEYSTORE_LOCK_STALE_MS || "30000", 10);
  const acquireTimeoutMs = parseInt(process.env.HARDKAS_KEYSTORE_LOCK_TIMEOUT_MS || "10000", 10);
  const start = Date.now();

  while (true) {
    try {
      fs.mkdirSync(path.dirname(lockFilePath), { recursive: true });
      fs.writeFileSync(lockFilePath, process.pid.toString(), { flag: "wx" });
      break;
    } catch (err: any) {
      if (err.code === "EEXIST") {
        const stats = fs.statSync(lockFilePath, { throwIfNoEntry: false });
        if (stats && Date.now() - stats.mtimeMs > staleTimeoutMs) {
          try { fs.unlinkSync(lockFilePath); } catch (e) {}
          continue;
        }

        if (Date.now() - start > acquireTimeoutMs) {
          const e = new Error("KEYSTORE_LOCK_TIMEOUT: Failed to acquire lock for keystore.json");
          (e as any).code = "KEYSTORE_LOCK_TIMEOUT";
          throw e;
        }
        
        // Retry interval 25-100ms with jitter
        const jitter = Math.floor(Math.random() * 75) + 25;
        await new Promise(resolve => setTimeout(resolve, jitter));
      } else {
        throw err;
      }
    }
  }

  try {
    return await operation();
  } finally {
    try { fs.unlinkSync(lockFilePath); } catch (e) {}
  }
}

export async function appendToKeystoreJson(
  workspaceRoot: string,
  alias: string,
  accountData: any
): Promise<void> {
  const keystorePath = path.join(workspaceRoot, ".hardkas", "keystore.json");
  const tempPath = path.join(workspaceRoot, ".hardkas", `keystore-${process.pid}-${Date.now()}.json.tmp`);

  await withKeystoreLock(keystorePath, async () => {
    let ks: Record<string, any> = {};
    if (fs.existsSync(keystorePath)) {
      try {
        const data = await fs.promises.readFile(keystorePath, "utf-8");
        ks = JSON.parse(data);
      } catch (e) {
        // Ignore read/parse errors, assume empty or overwrite
      }
    }

    ks[alias] = accountData;

    const fd = await fs.promises.open(tempPath, "w");
    try {
      await fd.writeFile(JSON.stringify(ks, null, 2));
      await fd.sync(); // fsync
    } finally {
      await fd.close();
    }

    await fs.promises.rename(tempPath, keystorePath); // atomic rename
    
    // verify parse after write (sanity check)
    const written = await fs.promises.readFile(keystorePath, "utf-8");
    JSON.parse(written);
  });
}
