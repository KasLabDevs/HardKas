import fs from 'fs';
import path from 'path';

function findTsFiles(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            findTsFiles(fullPath, fileList);
        } else if (fullPath.endsWith('.ts')) {
            fileList.push(fullPath);
        }
    }
    return fileList;
}

const srcDir = path.join(process.cwd(), 'src');
const tsFiles = findTsFiles(srcDir);

let errors = 0;

for (const file of tsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('import') && line.includes('@hardkas/')) {
            const match = line.match(/['"](@hardkas\/[^'"]+)['"]/);
            if (match) {
                const importPath = match[1];
                // Check if it's importing a subpath
                const parts = importPath.split('/');
                if (parts.length > 2) {
                    console.error(`❌ INTERNAL IMPORT DETECTED in ${file}:${i + 1}`);
                    console.error(`   ${line.trim()}`);
                    console.error(`   Reason: Imports must be from top-level package (e.g. @hardkas/toolkit), not from internal paths.`);
                    errors++;
                }
            }
        }
    }
}

if (errors > 0) {
    console.error(`\nFound ${errors} internal import violations. Fix them by updating the framework's public API.`);
    process.exit(1);
} else {
    console.log(`✅ All imports in ${tsFiles.length} files are strictly public.`);
    process.exit(0);
}
