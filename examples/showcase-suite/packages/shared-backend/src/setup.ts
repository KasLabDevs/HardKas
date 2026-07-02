import { SqliteStorage } from '@hardkas/storage-sqlite';
import { JobsToolkit, PaymentToolkit, WalletToolkit, IndexerToolkit, SnapshotToolkit, SilverToolkit } from '@hardkas/toolkit';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface HardKASContext {
    storage: SqliteStorage;
    dataPath: string;
}

export async function initializeHardKAS(appName: string, mode: 'simulated' | 'rpc' = 'simulated'): Promise<HardKASContext> {
    const dataPath = path.join(os.homedir(), '.hardkas', 'showcase', appName);
    if (!fs.existsSync(dataPath)) {
        fs.mkdirSync(dataPath, { recursive: true });
    }

    const storage = new SqliteStorage({ path: path.join(dataPath, 'state.db') });
    await storage.migrate();

    return {
        storage,
        dataPath
    };
}
