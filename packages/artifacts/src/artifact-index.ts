import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ArtifactEntry {
    hash: string;
    schema: string;
    timestamp: string;
    filePath: string;
    tags?: string[];
}

export interface ArtifactIndexQuery {
    schema?: string | undefined;
    from?: string | undefined; // ISO date
    to?: string | undefined;   // ISO date
    tags?: string[] | undefined;
}

export interface ArtifactIndexOptions {
    filePath?: string;
}

export class ArtifactIndexStoreJson {
    private readonly filePath: string;

    constructor(options?: ArtifactIndexOptions) {
        this.filePath = options?.filePath || path.join(process.cwd(), '.hardkas', 'artifact-index.json');
    }

    private ensureDir() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    public getAll(): Record<string, ArtifactEntry> {
        if (!fs.existsSync(this.filePath)) return {};
        try {
            return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        } catch {
            return {};
        }
    }

    public setAll(data: Record<string, ArtifactEntry>) {
        this.ensureDir();
        fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    }

    public index(artifact: ArtifactEntry): void {
        const data = this.getAll();
        data[artifact.hash] = artifact;
        this.setAll(data);
    }

    public get(hash: string): ArtifactEntry | undefined {
        return this.getAll()[hash];
    }

    public list(): ArtifactEntry[] {
        return Object.values(this.getAll());
    }

    public find(query: ArtifactIndexQuery): ArtifactEntry[] {
        let entries = this.list();

        if (query.schema) {
            entries = entries.filter(e => e.schema === query.schema);
        }
        
        if (query.from) {
            const fromTime = new Date(query.from).getTime();
            entries = entries.filter(e => new Date(e.timestamp).getTime() >= fromTime);
        }

        if (query.to) {
            const toTime = new Date(query.to).getTime();
            entries = entries.filter(e => new Date(e.timestamp).getTime() <= toTime);
        }

        if (query.tags && query.tags.length > 0) {
            entries = entries.filter(e => 
                e.tags && query.tags!.every(tag => e.tags!.includes(tag))
            );
        }

        return entries;
    }
}
