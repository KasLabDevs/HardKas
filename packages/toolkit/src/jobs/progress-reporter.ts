export interface ProgressUpdate {
    processed?: number;
    failed?: number;
    total?: number;
    status?: string;
}

export class ProgressReporter {
    constructor(
        public total: number = 0,
        public processed: number = 0,
        public failed: number = 0,
        public status: string = 'initialized'
    ) {}

    update(update: ProgressUpdate) {
        if (update.total !== undefined) this.total = update.total;
        if (update.processed !== undefined) this.processed = update.processed;
        if (update.failed !== undefined) this.failed = update.failed;
        if (update.status !== undefined) this.status = update.status;
    }

    incSuccess(count: number = 1) {
        this.processed += count;
    }

    incFailed(count: number = 1) {
        this.failed += count;
    }

    toJSON() {
        return {
            total: this.total,
            processed: this.processed,
            failed: this.failed,
            status: this.status,
            percentage: this.total > 0 ? ((this.processed + this.failed) / this.total) * 100 : 0
        };
    }
}
