import fs from 'fs';
import path from 'path';
import { generateReproducibilityReport } from './packages/testing/src/reproducibility.ts';

const report = generateReproducibilityReport();
const targetPath = path.resolve('./packages/testing/test/golden/reproducibility.json');
fs.writeFileSync(targetPath, JSON.stringify(report, null, 2));
console.log('Updated reproducibility.json');
