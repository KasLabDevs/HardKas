import * as fs from 'node:fs';
import * as path from 'node:path';

export interface DomainStoreJsonOptions {
    filePath: string;
}

export class DomainStoreJson<T> {
    private filePath: string;
    private data: Map<string, T>;

    constructor(options: DomainStoreJsonOptions) {
        this.filePath = options.filePath;
        this.data = new Map<string, T>();
        this.load();
    }

    private load() {
        if (!fs.existsSync(this.filePath)) {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            this.saveAll();
            return;
        }
        try {
            const raw = fs.readFileSync(this.filePath, 'utf-8');
            const parsed = JSON.parse(raw, (key, value) => {
                if (value && typeof value === 'object' && '__bigint__' in value) {
                    return BigInt(value.__bigint__);
                }
                return value;
            });
            for (const [k, v] of Object.entries(parsed)) {
                this.data.set(k, v as T);
            }
        } catch (err) {
            console.error(`Failed to load DomainStoreJson at ${this.filePath}`, err);
        }
    }

    private saveAll() {
        const obj = Object.fromEntries(this.data);
        fs.writeFileSync(this.filePath, JSON.stringify(obj, (key, value) => {
            if (typeof value === 'bigint') {
                return { __bigint__: value.toString() };
            }
            return value;
        }, 2), 'utf-8');
    }

    public save(id: string, entity: T): void {
        this.data.set(id, entity);
        this.saveAll();
    }

    public get(id: string): T | undefined {
        return this.data.get(id);
    }

    public list(): T[] {
        return Array.from(this.data.values());
    }

    public delete(id: string): boolean {
        const deleted = this.data.delete(id);
        if (deleted) {
            this.saveAll();
        }
        return deleted;
    }
}
