import { redactSecrets } from "./packages/core/dist/index.js";
console.log("Type:", typeof redactSecrets);
console.log("Redacted:", redactSecrets("1234567890123456789012345678901234567890123456789012345678901234"));
