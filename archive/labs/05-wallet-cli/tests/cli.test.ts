import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { program, STORE_PATH } from '../src/cli.js';
import * as fs from 'node:fs';

describe('Wallet CLI', () => {
    beforeEach(() => {
        if (fs.existsSync(STORE_PATH)) {
            fs.unlinkSync(STORE_PATH);
        }
    });

    afterEach(() => {
        if (fs.existsSync(STORE_PATH)) {
            fs.unlinkSync(STORE_PATH);
        }
    });

    it('should create a wallet and generate an address', async () => {
        // We capture console.log output
        let output = "";
        const originalLog = console.log;
        console.log = (msg: string) => { output += msg + "\n"; };

        try {
            await program.parseAsync(['node', 'cli.js', 'create', 'mywallet']);
            expect(output).toContain("Wallet 'mywallet' created successfully");
            
            output = "";
            await program.parseAsync(['node', 'cli.js', 'address', 'mywallet']);
            expect(output).toContain("Address: kaspasim:");
            
        } finally {
            console.log = originalLog;
        }
    });

    it('should show balance for the mock', async () => {
        let output = "";
        const originalLog = console.log;
        console.log = (msg: string) => { output += msg + "\n"; };

        try {
            await program.parseAsync(['node', 'cli.js', 'create', 'mywallet2']);
            await program.parseAsync(['node', 'cli.js', 'address', 'mywallet2']);
            output = ""; // clear output

            await program.parseAsync(['node', 'cli.js', 'balance', 'mywallet2']);
            // Mock returns 10,000,000 SOMPI (0.1 KAS)
            expect(output).toContain("Balance: 0.1 KAS (10000000 SOMPI)");
        } finally {
            console.log = originalLog;
        }
    });

    it('should estimate fee', async () => {
        let output = "";
        const originalLog = console.log;
        console.log = (msg: string) => { output += msg + "\n"; };

        try {
            await program.parseAsync(['node', 'cli.js', 'create', 'mywallet3']);
            await program.parseAsync(['node', 'cli.js', 'address', 'mywallet3']);
            output = ""; // clear output

            await program.parseAsync(['node', 'cli.js', 'estimate-fee', 'mywallet3', 'kaspatest:qq12345', '1000']);
            expect(output).toContain("Estimated Fee:");
        } finally {
            console.log = originalLog;
        }
    });

    it('should generate simulated transaction plan', async () => {
        let output = "";
        const originalLog = console.log;
        console.log = (msg: string) => { output += msg + "\n"; };

        try {
            await program.parseAsync(['node', 'cli.js', 'create', 'mywallet4']);
            await program.parseAsync(['node', 'cli.js', 'address', 'mywallet4']);
            output = ""; // clear output

            await program.parseAsync(['node', 'cli.js', 'send', 'mywallet4', 'kaspatest:qq12345', '2000']);
            expect(output).toContain("Transaction Plan:");
            expect(output).toContain("Amount: 2000 SOMPI");
        } finally {
            console.log = originalLog;
        }
    });
});
