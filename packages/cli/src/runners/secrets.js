import enquirer from "enquirer";
const { Password } = enquirer;
/**
 * Acquires a password from stdin, environment, or interactive prompt.
 */
export async function acquirePassword(options = {}) {
    // 1. Try Environment
    if (options.env && process.env[options.env]) {
        return process.env[options.env];
    }
    // 2. Try Stdin
    if (options.stdin) {
        return new Promise((resolve, reject) => {
            let data = "";
            process.stdin.setEncoding("utf8");
            process.stdin.on("data", (chunk) => {
                data += chunk;
            });
            process.stdin.on("end", () => {
                resolve(data.trim());
            });
            process.stdin.on("error", reject);
        });
    }
    // 3. Fallback to interactive prompt
    const prompt = new Password({
        name: "password",
        message: options.message || "Enter password:"
    });
    return await prompt.run();
}
/**
 * Acquires a private key from stdin, environment, or interactive prompt.
 */
export async function acquirePrivateKey(options = {}) {
    // Same logic as password for now, but can be customized later if needed
    return acquirePassword({
        ...options,
        message: options.message || "Enter private key (hex):"
    });
}
//# sourceMappingURL=secrets.js.map