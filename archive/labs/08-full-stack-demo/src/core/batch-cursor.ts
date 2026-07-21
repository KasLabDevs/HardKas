export class BatchCursor<T> {
    constructor(
        private readonly items: T[],
        private readonly batchSize: number,
        private currentIndex: number = 0
    ) {}

    hasNext(): boolean {
        return this.currentIndex < this.items.length;
    }

    nextBatch(): T[] {
        if (!this.hasNext()) return [];
        const batch = this.items.slice(this.currentIndex, this.currentIndex + this.batchSize);
        this.currentIndex += this.batchSize;
        return batch;
    }

    getCursor(): number {
        return this.currentIndex;
    }
}
