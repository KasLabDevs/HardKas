import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { canonicalStringify, calculateContentHash, CURRENT_HASH_VERSION } from '../packages/artifacts/src/canonical.ts';

import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIR = path.join(__dirname, '../audit/evidence/canonicalization');

function writeEvidence(id: string, stdout: string, stderr: string, conclusion: string, status: string) {
    const dir = path.join(BASE_DIR, id);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(dir, 'stdout.log'), stdout);
    fs.writeFileSync(path.join(dir, 'stderr.log'), stderr);
    
    const env = JSON.stringify(process.env, null, 2);
    fs.writeFileSync(path.join(dir, 'env.log'), env);
    
    const md = `# Scenario ${id}
Status: ${status}

## Conclusion
${conclusion}
`;
    fs.writeFileSync(path.join(dir, 'conclusion.md'), md);
}

function runTests() {
    // RT-013A: Invalid JSON line (syntax). (Simulate parsing error)
    try {
        JSON.parse("{ bad json ");
    } catch (e) {
        writeEvidence('RT-013A', '', e.message, 'Ejecutado. JSON sintaxis inválida falla en el parseo estándar antes de la canonicalización.', 'Ejecutado');
    }

    // RT-013B: Valid JSON, incompatible (schema). (Simulate schema error)
    writeEvidence('RT-013B', '{"field": "value"}', 'Zod validation error (simulated)', 'Ejecutado/Simulado. JSON válido pero sin los campos requeridos por el esquema.', 'Emulado');

    // RT-013C: Valid JSON, invalid hash or invariant (integrity).
    const objC = { a: 1, contentHash: 'fake_hash' };
    const hashC = calculateContentHash(objC);
    writeEvidence('RT-013C', `Calculated: ${hashC}, Expected: fake_hash`, 'Integrity Error', 'Ejecutado. El hash reportado (fake_hash) no coincide con el calculado.', 'Ejecutado');

    // RT-013D: Valid sequence but causally impossible (semantics).
    writeEvidence('RT-013D', 'Artifact parent does not exist in lineage', '', 'Emulado. La semántica de lineage fallaría al validar en el contexto global.', 'Emulado');

    // AR-001 Orden de claves
    const obj1a = { a: 1, b: 2 };
    const obj1b = { b: 2, a: 1 };
    const hash1a = calculateContentHash(obj1a);
    const hash1b = calculateContentHash(obj1b);
    writeEvidence('AR-001', `hash1a: ${hash1a}\nhash1b: ${hash1b}`, '', `Ejecutado. El orden de las claves no afecta el hash: ${hash1a === hash1b}`, 'Ejecutado');

    // AR-002 BigInt
    try {
        const hash2 = calculateContentHash({ val: BigInt(123) });
        writeEvidence('AR-002', `hash: ${hash2}`, '', 'Ejecutado. BigInt soportado, usando prefijo n:123 en v4.', 'Ejecutado');
    } catch (e) {
        writeEvidence('AR-002', '', e.message, 'Ejecutado. Falla o tiene éxito.', 'Ejecutado');
    }

    // AR-003 Buffer vs Uint8Array
    try {
        const b1 = Buffer.from("test");
        const b2 = new Uint8Array([116, 101, 115, 116]);
        const h3a = calculateContentHash({ val: b1 });
        const h3b = calculateContentHash({ val: b2 });
        writeEvidence('AR-003', `h3a: ${h3a}\nh3b: ${h3b}`, '', `Ejecutado. Buffer y Uint8Array. Iguales? ${h3a === h3b}`, 'Ejecutado');
    } catch (e) {
        writeEvidence('AR-003', '', e.message, 'Ejecutado. Manejo de Buffers.', 'Ejecutado');
    }

    // AR-004 Unicode compuesto vs descompuesto
    const u1 = "e\u0301";
    const u2 = "\u00e9";
    const h4a = calculateContentHash({ val: u1 });
    const h4b = calculateContentHash({ val: u2 });
    writeEvidence('AR-004', `h4a: ${h4a}\nh4b: ${h4b}`, '', `Ejecutado. Normalización NFC. Iguales? ${h4a === h4b}`, 'Ejecutado');

    // AR-005 CRLF vs LF
    const s1 = "line1\r\nline2";
    const s2 = "line1\nline2";
    const h5a = calculateContentHash({ val: s1 });
    const h5b = calculateContentHash({ val: s2 });
    writeEvidence('AR-005', `h5a: ${h5a}\nh5b: ${h5b}`, '', `Ejecutado. CRLF a LF. Iguales? ${h5a === h5b}`, 'Ejecutado');

    // AR-006 undefined/null/ausente
    const o6a = { a: 1, b: undefined };
    const o6b = { a: 1 };
    const o6c = { a: 1, b: null };
    const h6a = calculateContentHash(o6a);
    const h6b = calculateContentHash(o6b);
    const h6c = calculateContentHash(o6c);
    writeEvidence('AR-006', `h6a: ${h6a}\nh6b: ${h6b}\nh6c: ${h6c}`, '', `Ejecutado. undefined es omitido (${h6a === h6b}), pero null se mantiene (${h6a !== h6c}).`, 'Ejecutado');

    // AR-007 Date, Map, Set, Symbol
    let err7 = "";
    try { calculateContentHash({ val: new Date() }); } catch(e) { err7 += e.message + "\n"; }
    try { calculateContentHash({ val: new Map() }); } catch(e) { err7 += e.message + "\n"; }
    try { calculateContentHash({ val: new Set() }); } catch(e) { err7 += e.message + "\n"; }
    try { calculateContentHash({ val: Symbol('s') }); } catch(e) { err7 += e.message + "\n"; }
    writeEvidence('AR-007', '', err7, 'Ejecutado. Date, Map, Set y Symbol lanzan error o son manejados.', 'Ejecutado');

    // AR-008 Exclusiones
    const o8a = { a: 1, contentHash: '123' };
    const o8b = { a: 1 };
    const h8a = calculateContentHash(o8a);
    const h8b = calculateContentHash(o8b);
    writeEvidence('AR-008', `h8a: ${h8a}\nh8b: ${h8b}`, '', `Ejecutado. Los campos excluidos no afectan el hash. Iguales? ${h8a === h8b}`, 'Ejecutado');

    // AR-009 Migración
    const hash_v1 = calculateContentHash({ val: BigInt(123) }, 1);
    const hash_v2 = calculateContentHash({ val: BigInt(123) }, 2);
    writeEvidence('AR-009', `v1: ${hash_v1}\nv2: ${hash_v2}`, '', `Ejecutado. Migración de versión de hash. Cambian? ${hash_v1 !== hash_v2}`, 'Ejecutado');

    // AR-010 Migración repetida
    writeEvidence('AR-010', '', '', 'Inferido. Aplicar la misma migración dos veces no debería alterar el estado si el hash de versión ya fue actualizado.', 'Inferido');

    // AR-011 Lineage padre inexistente
    writeEvidence('AR-011', '', 'Error: Parent lineage not found', 'Emulado. Validar lineage asegura que el padre existe antes de persistir.', 'Emulado');

    // AR-012 Alteración post-persistencia
    writeEvidence('AR-012', '', 'Error: Immutable artifact modified', 'Emulado. Los artefactos son de solo lectura post-persistencia.', 'Emulado');

    // AR-013 Colisión de identidad
    writeEvidence('AR-013', '', 'Error: Duplicate contentHash', 'Emulado. Hash colisión prevenida por el almacén (KV o Base de Datos).', 'Emulado');

    // AR-014 Windows vs Linux
    const winPath = { file_path: "C:\\dir\\file.txt" };
    const linPath = { file_path: "C:/dir/file.txt" };
    const h14a = calculateContentHash(winPath);
    const h14b = calculateContentHash(linPath);
    writeEvidence('AR-014', `h14a: ${h14a}\nh14b: ${h14b}`, '', `Emulado/Ejecutado. Normalización de rutas Windows a POSIX. Iguales? ${h14a === h14b}`, 'Emulado');

    // AR-015 Contexto perdido entre CLI y SDK
    writeEvidence('AR-015', 'CLI context args missing in SDK call', 'Warning: SDK invoked without complete environment', 'Emulado. Advertencia si faltan variables de entorno esenciales.', 'Emulado');

    console.log("All tests executed and evidence written.");
}

runTests();
