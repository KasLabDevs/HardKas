import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ProjectionStoreOptions {
    namespace: string;
    dirPath?: string;
}

export class ProjectionStoreJson {
    private readonly namespace: string;
    private readonly filePath: string;

    constructor(options: ProjectionStoreOptions) {
        this.namespace = options.namespace;
        const dir = options.dirPath || path.join(process.cwd(), '.hardkas', 'projections');
        this.filePath = path.join(dir, `${this.namespace}.json`);
    }

    private ensureDir() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    public getAll(): Record<string, any> {
        if (!fs.existsSync(this.filePath)) return {};
        try {
            return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        } catch {
            return {};
        }
    }

    public setAll(data: Record<string, any>) {
        this.ensureDir();
        const tmp = this.filePath + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
        fs.renameSync(tmp, this.filePath);
    }

    public get<T = any>(key: string): T | undefined {
        const data = this.getAll();
        return data[key] as T;
    }

    public set<T = any>(key: string, val: T): void {
        const data = this.getAll();
        data[key] = val;
        this.setAll(data);
    }

    public update<T = any>(key: string, updater: (prev: T | undefined) => T): void {
        const data = this.getAll();
        data[key] = updater(data[key]);
        this.setAll(data);
    }
}
