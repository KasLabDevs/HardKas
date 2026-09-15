const TEMPLATES = ["timelock-vault", "multisig-2-of-3"];
export class MockSilverToolkit {
    constructor() { }
    static open() {
        return new MockSilverToolkit();
    }
    templates() {
        return [...TEMPLATES];
    }
    async build(source) {
        return { source, bytecode: Buffer.from(source).toString("hex"), mock: true };
    }
    async simulate(_build) {
        return { success: true, executionTrace: [], gasConsumed: 0, mock: true };
    }
    async artifact(build, name) {
        return { id: `mock-silver-${Date.now()}`, ...(name ? { name } : {}), source: build.source, bytecode: build.bytecode, mock: true };
    }
    /** A showcase log entry; deliberately not a HardKAS evidence schema. */
    async record(build, simulation) {
        return { kind: "showcase.mock-silver.log", source: build.source, success: simulation.success, mock: true };
    }
}
