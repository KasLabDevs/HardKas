import fs from "node:fs";
import path from "node:path";
import type { EscrowRecord } from "../routes/escrow.js";

function bigIntReplacer(_key: string, value: any): any {
  return typeof value === "bigint" ? value.toString() : value;
}

export class AtomicJournalEscrowStore extends Map<string, EscrowRecord> {
  readonly storePath: string;
  readonly lockPath: string;
  private lastMtime = 0;

  constructor(customPath?: string) {
    super();
    const rootDir = process.env.HARDKAS_ROOT || process.cwd();
    this.storePath = customPath || process.env.HARDKAS_ESCROW_STORE_PATH || path.join(rootDir, ".hardkas", "escrow-store.json");
    this.lockPath = this.storePath + ".lock";
    this.loadFromDisk();
  }

  private acquireLock(): void {
    const maxRetries = 200;
    const retryDelayMs = 15;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const dir = path.dirname(this.lockPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const fd = fs.openSync(this.lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR);
        fs.writeSync(fd, `${process.pid}\n${Date.now()}\n`);
        fs.closeSync(fd);
        return;
      } catch (err: any) {
        if (err.code === "EEXIST") {
          try {
            const stats = fs.statSync(this.lockPath);
            if (Date.now() - stats.mtimeMs > 10_000) {
              // Stale lock over 10s old
              try { fs.unlinkSync(this.lockPath); } catch {}
              continue;
            }
          } catch {}
          // Busy wait briefly
          const start = Date.now();
          while (Date.now() - start < retryDelayMs) {}
        } else {
          break;
        }
      }
    }
  }

  private releaseLock(): void {
    try {
      if (fs.existsSync(this.lockPath)) {
        fs.unlinkSync(this.lockPath);
      }
    } catch {}
  }

  loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.storePath)) return;
      const stats = fs.statSync(this.storePath);
      this.lastMtime = stats.mtimeMs;
      const raw = fs.readFileSync(this.storePath, "utf8");
      if (!raw || raw.trim() === "") return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.id) {
            super.set(item.id, item);
          }
        }
      } else if (typeof parsed === "object") {
        for (const [id, item] of Object.entries(parsed)) {
          if (item && (item as any).id) {
            super.set(id, item as EscrowRecord);
          }
        }
      }
    } catch (err) {
      console.warn("AtomicJournalEscrowStore: Failed to load escrow store from disk:", err);
    }
  }

  private checkReload(): void {
    try {
      if (!fs.existsSync(this.storePath)) return;
      const stats = fs.statSync(this.storePath);
      if (stats.mtimeMs > this.lastMtime) {
        this.loadFromDisk();
      }
    } catch {}
  }

  private writeToDiskWithoutLock(): void {
    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tempPath = `${this.storePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
      const records = Array.from(this.values());
      const data = JSON.stringify(records, bigIntReplacer, 2);

      const fd = fs.openSync(tempPath, "w");
      fs.writeSync(fd, data, 0, "utf8");
      try {
        fs.fdatasyncSync(fd);
      } catch {
        fs.fsyncSync(fd);
      }
      fs.closeSync(fd);

      fs.renameSync(tempPath, this.storePath);
      try {
        this.lastMtime = fs.statSync(this.storePath).mtimeMs;
      } catch {}
    } catch (err) {
      console.error("AtomicJournalEscrowStore: Failed to flush to disk:", err);
    }
  }

  override get(key: string): EscrowRecord | undefined {
    this.checkReload();
    return super.get(key);
  }

  override has(key: string): boolean {
    this.checkReload();
    return super.has(key);
  }

  override set(key: string, value: EscrowRecord): this {
    this.acquireLock();
    try {
      this.loadFromDisk();
      super.set(key, value);
      this.writeToDiskWithoutLock();
    } finally {
      this.releaseLock();
    }
    return this;
  }

  override delete(key: string): boolean {
    this.acquireLock();
    let res = false;
    try {
      this.loadFromDisk();
      res = super.delete(key);
      this.writeToDiskWithoutLock();
    } finally {
      this.releaseLock();
    }
    return res;
  }

  override clear(): void {
    this.acquireLock();
    try {
      super.clear();
      this.writeToDiskWithoutLock();
    } finally {
      this.releaseLock();
    }
  }

  /** Write-ahead recording before network transmission */
  commitIntent(id: string, update: Partial<EscrowRecord>): void {
    const existing = this.get(id);
    if (!existing) return;
    const merged = { ...existing, ...update };
    this.set(id, merged);
  }
}
