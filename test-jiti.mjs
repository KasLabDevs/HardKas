import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url);
const c = jiti('@hardkas/config');
console.log("Config keys:", Object.keys(c));
const sdk = jiti('@hardkas/sdk');
console.log("SDK keys:", Object.keys(sdk));
