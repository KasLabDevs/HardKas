export interface SecretAcquisitionOptions {
    stdin?: boolean | undefined;
    env?: string | undefined;
    message?: string | undefined;
}
/**
 * Acquires a password from stdin, environment, or interactive prompt.
 */
export declare function acquirePassword(options?: SecretAcquisitionOptions): Promise<string>;
/**
 * Acquires a private key from stdin, environment, or interactive prompt.
 */
export declare function acquirePrivateKey(options?: SecretAcquisitionOptions): Promise<string>;
//# sourceMappingURL=secrets.d.ts.map