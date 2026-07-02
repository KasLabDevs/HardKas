export class HardkasRpcConnectionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "HardkasRpcConnectionError";
    }
}

export class HardkasRpcTimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "HardkasRpcTimeoutError";
    }
}

export class HardkasRpcSemanticError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "HardkasRpcSemanticError";
    }
}
