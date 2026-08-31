import type { PortableSigningSession } from "@hardkas/core";
/**
 * Safely loads a PortableSigningSession from a file.
 * Automatically checks for sensitive material via deserializeSession.
 */
export declare function loadSession(filePath: string): Promise<PortableSigningSession>;
/**
 * Atomically writes a PortableSigningSession to a file.
 * Enforces O_EXCL unless force=true.
 */
export declare function saveSession(session: PortableSigningSession, filePath: string, force: boolean): Promise<void>;
//# sourceMappingURL=fs.d.ts.map