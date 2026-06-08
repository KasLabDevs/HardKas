export declare const UI: {
    setJsonMode(enabled: boolean): void;
    isJsonMode(): boolean;
    logHuman(msg: string): void;
    writeJson(data: any): void;
    header(text: string): void;
    divider(): void;
    bullet(text: string): void;
    step(num: number, text: string): void;
    raw(text: string): void;
    emptyLine(): void;
    info(text: string): void;
    success(text: string): void;
    box(title: string, subtitle?: string): void;
    warning(text: string): void;
    securityWarning(code: string, message: string, suggestion?: string): void;
    error(msg: string, suggestion?: string): void;
    field(label: string, value: string | number | boolean | undefined | null): void;
    kas(label: string, sompi: bigint | string): void;
    maturity(label: string): any;
    confirm(message: string): Promise<boolean>;
    footer(hint?: string): void;
    causality(title: string, details: Record<string, string | undefined>, nextSteps?: string[]): void;
    printNextSteps(steps: string[]): void;
    semanticError(title: string, cause: string, invariant: string, consequence: string, remediation: string): void;
    dryRun(message?: string): void;
    writeError(msg: string): void;
};
export declare function handleError(e: unknown, context?: string): void;
/**
 * Specialized error handler for lock-related errors.
 */
export declare function handleLockError(e: any): void;
//# sourceMappingURL=ui.d.ts.map