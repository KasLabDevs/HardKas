export class JobCheckpoint {
    private currentCursor: any = null;

    constructor(initialCursor?: any) {
        this.currentCursor = initialCursor;
    }

    save(cursor: any) {
        this.currentCursor = cursor;
    }

    load(): any {
        return this.currentCursor;
    }
}
