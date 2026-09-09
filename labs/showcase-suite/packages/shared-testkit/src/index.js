import fs from 'fs';
import path from 'path';
export const TEST_ACCOUNT = 'kaspasim:qrcd4qw3f35r4wqaumn8d846cmz3dgz2302p8jd99wv36z0eg2z9ytvsurdxd';
export const TEST_PRIVATE_KEY = '1111111111111111111111111111111111111111111111111111111111111111';
export function createMockRequest(body = {}) {
    return {
        json: async () => body,
        headers: new Map()
    };
}
export function writeEvidence(app, evidence) {
    const rootPath = path.resolve(process.cwd(), '../../../'); // Since runners will be inside apps/name/src/backend or run from examples/showcase-suite
    // We will ensure the output goes to `examples/showcase-suite/evidence/`
    // Assuming runner is executed via `pnpm showcase:xyz` from `examples/showcase-suite`
    const evidenceDir = path.resolve(process.cwd(), 'evidence');
    if (!fs.existsSync(evidenceDir)) {
        fs.mkdirSync(evidenceDir, { recursive: true });
    }
    const outPath = path.join(evidenceDir, `${app}.evidence.json`);
    fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
    console.log(`[Gauntlet] Wrote evidence for ${app} to ${outPath}`);
}
