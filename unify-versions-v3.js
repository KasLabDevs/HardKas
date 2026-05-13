import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = 'C:\\Users\\jrodr\\Documents\\kaslabdevs\\GitHub\\HardKas-repo';
const OLD_VERSIONS = ['0.2.2-alpha', '0.2.2-alpha', '0.2.2-alpha', '0.2.2-alpha'];
const NEW_VERSION = '0.2.2-alpha';

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== '.turbo' && file !== 'dist' && file !== 'build') {
                walk(fullPath);
            }
        } else {
            const ext = path.extname(file);
            if (['.json', '.ts', '.js', '.md', '.yml'].includes(ext)) {
                let content = fs.readFileSync(fullPath, 'utf8');
                let modified = false;
                
                for (const old of OLD_VERSIONS) {
                    if (content.includes(old)) {
                        // Special case for pnpm-lock.yaml or similar if it somehow got in
                        if (file.includes('lock')) continue;
                        
                        content = content.split(old).join(NEW_VERSION);
                        modified = true;
                    }
                }
                
                if (modified) {
                    fs.writeFileSync(fullPath, content, 'utf8');
                    console.log(`Updated: ${fullPath}`);
                }
            }
        }
    }
}

console.log(`Starting nuclear sweep to version ${NEW_VERSION}...`);
walk(rootDir);
console.log('Sweep completed!');
