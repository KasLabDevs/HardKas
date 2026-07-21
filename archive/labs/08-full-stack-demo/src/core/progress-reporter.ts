export class ProgressReporter {
    constructor(
        public total: number = 0,
        public processed: number = 0,
        public failed: number = 0,
        public status: string = 'initialized'
    ) {}

    incSuccess(count: number = 1) {
        this.processed += count;
    }

    incFailed(count: number = 1) {
        this.failed += count;
    }

    setTotal(total: number) {
        this.total = total;
    }

    setStatus(status: string) {
        this.status = status;
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
