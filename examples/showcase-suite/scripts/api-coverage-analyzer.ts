import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const packagesDir = path.resolve(__dirname, '../../../packages');
const evidenceDir = path.resolve(__dirname, '../evidence');
const outputDir = path.resolve(__dirname, '..');

// Helper to get all APIs exercised by all apps
function getExercisedApis(): Map<string, { app: string; api: string }> {
    const exercised = new Map<string, { app: string; api: string }>();
    const files = fs.readdirSync(evidenceDir).filter(f => f.endsWith('.evidence.json'));
    for (const file of files) {
        const data = JSON.parse(fs.readFileSync(path.join(evidenceDir, file), 'utf8'));
        const apis: string[] = data.publicApisExercised || [];
        for (const api of apis) {
            exercised.set(api, { app: data.app, api });
        }
    }
    return exercised;
}

// Very basic AST visitor to extract exported names
function getExportedNames(filePath: string): string[] {
    const exports: string[] = [];
    if (!fs.existsSync(filePath)) return exports;
    
    const sourceFile = ts.createSourceFile(
        filePath,
        fs.readFileSync(filePath, 'utf8'),
        ts.ScriptTarget.Latest,
        true
    );

    function visit(node: ts.Node) {
        if (ts.isFunctionDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
            if (node.name) exports.push(node.name.text);
        } else if (ts.isClassDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
            if (node.name) exports.push(node.name.text);
        } else if (ts.isVariableStatement(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
            node.declarationList.declarations.forEach(d => {
                if (ts.isIdentifier(d.name)) exports.push(d.name.text);
            });
        }
        ts.forEachChild(node, visit);
    }
    
    visit(sourceFile);
    return exports;
}

const PACKAGE_CATEGORIES: Record<string, string> = {
    '@hardkas/accounts': 'Public runtime',
    '@hardkas/core': 'Public runtime',
    '@hardkas/jobs': 'Public runtime',
    '@hardkas/kaspa-rpc': 'Public runtime',
    '@hardkas/l2': 'Public runtime',
    '@hardkas/observability': 'Public runtime',
    '@hardkas/plugin-local-indexer': 'Public runtime',
    '@hardkas/query': 'Public runtime',
    '@hardkas/query-store': 'Public runtime',
    '@hardkas/react': 'Public runtime',
    '@hardkas/storage-postgres': 'Public runtime',
    '@hardkas/storage-sqlite': 'Public runtime',
    '@hardkas/sync-daemon': 'Public runtime',
    '@hardkas/toolkit': 'Public runtime',
    '@hardkas/tx-builder': 'Public runtime',
    '@hardkas/wallet-adapter': 'Public runtime',

    '@hardkas/artifacts': 'Public tooling',
    '@hardkas/bridge-local': 'Public tooling',
    '@hardkas/cli': 'Public tooling',
    '@hardkas/dev-server': 'Public tooling',
    '@hardkas/localnet': 'Public tooling',
    '@hardkas/node-orchestrator': 'Public tooling',
    '@hardkas/node-runner': 'Public tooling',
    '@hardkas/plugin-rpc-backend': 'Public tooling',
    '@hardkas/simulator': 'Public tooling',
    '@hardkas/simulator-adapters': 'Public tooling',

    '@hardkas/client': 'Internal/support',
    '@hardkas/config': 'Internal/support',
    '@hardkas/sessions': 'Internal/support',
    '@hardkas/testing': 'Internal/support',

    '@hardkas/sdk': 'Deprecated/experimental'
};

function analyze() {
    console.log('[API Coverage] Analyzing Workspace APIs...');
    const exercisedApis = getExercisedApis();
    
    const pkgDirs = fs.readdirSync(packagesDir).filter(d => fs.statSync(path.join(packagesDir, d)).isDirectory() && !d.startsWith('.'));
    
    const results = {
        used: [] as { pkg: string, api: string, app: string }[],
        unused: [] as { pkg: string, api: string }[],
        internal: [] as { pkg: string, api: string }[],
        deprecated: [] as { pkg: string, api: string }[],
        futureGuard: [] as { pkg: string, api: string }[]
    };

    for (const pkg of pkgDirs) {
        const pkgName = `@hardkas/${pkg}`;
        const cat = PACKAGE_CATEGORIES[pkgName] || 'Public runtime';
        const isInternalPkg = cat === 'Internal/support';
        const isDeprecatedPkg = cat === 'Deprecated/experimental';
        const indexFile = path.join(packagesDir, pkg, 'src', 'index.ts');
        const publicFile = path.join(packagesDir, pkg, 'src', 'public.ts');
        
        let exported = getExportedNames(indexFile);
        exported = exported.concat(getExportedNames(publicFile));
        
        for (const api of exported) {
            // Very naive classification for the sake of demonstration
            const apiFullName = `${pkg}.${api}`; // E.g. core.Wallet
            
            let isUsed = false;
            let usedApp = '';
            
            // Match exactly or loosely
            for (const [exercisedName, info] of exercisedApis.entries()) {
                if (exercisedName === api || exercisedName.includes(api) || exercisedName.startsWith(api + '.')) {
                    isUsed = true;
                    usedApp = info.app;
                    break;
                }
            }
            
            if (isUsed) {
                results.used.push({ pkg, api, app: usedApp });
            } else if (
                isInternalPkg || 
                api.startsWith('_') || 
                api.toLowerCase().includes('internal') ||
                api.startsWith('mapKaspa') ||
                api.startsWith('Mock') ||
                api.endsWith('Plugin') ||
                api.endsWith('Schema') ||
                api.endsWith('Error') ||
                api.includes('SOMPI')
            ) {
                results.internal.push({ pkg, api });
            } else if (isDeprecatedPkg || api.toLowerCase().includes('deprecated') || api.toLowerCase().includes('legacy')) {
                results.deprecated.push({ pkg, api });
            } else if (api.toLowerCase().includes('future') || api.toLowerCase().includes('experimental')) {
                results.futureGuard.push({ pkg, api });
            } else {
                results.unused.push({ pkg, api });
            }
        }
    }
    
    let report = `# API Dead Zone Report\n\n`;
    
    report += `## 🟢 Public API Used\n`;
    report += `| Package | API | Used By App |\n|---------|-----|-------------|\n`;
    for (const { pkg, api, app } of results.used) {
        report += `| ${pkg} | \`${api}\` | ${app} |\n`;
    }
    
    report += `\n## 🔴 Public API Unused (Dead Zone)\n`;
    report += `> [!WARNING]\n> These APIs must be implemented in a showcase application.\n\n`;
    report += `| Package | API |\n|---------|-----|\n`;
    for (const { pkg, api } of results.unused) {
        report += `| ${pkg} | \`${api}\` |\n`;
    }
    
    report += `\n## 🟡 Internal Exports\n`;
    for (const { pkg, api } of results.internal) {
        report += `- ${pkg}: \`${api}\`\n`;
    }
    
    report += `\n## 🟣 Future Capability Guards\n`;
    for (const { pkg, api } of results.futureGuard) {
        report += `- ${pkg}: \`${api}\`\n`;
    }
    
    report += `\n## 🟤 Deprecated\n`;
    for (const { pkg, api } of results.deprecated) {
        report += `- ${pkg}: \`${api}\`\n`;
    }
    
    fs.writeFileSync(path.join(outputDir, 'API_DEAD_ZONE_REPORT.md'), report);
    console.log(`[API Coverage] Generated API_DEAD_ZONE_REPORT.md`);
    
    if (results.unused.length > 0) {
        console.error(`[API Coverage] FAILED! Found ${results.unused.length} dead public APIs.`);
        process.exit(1);
    } else {
        console.log(`[API Coverage] SUCCESS! 0 Dead Public APIs.`);
    }
}

analyze();
