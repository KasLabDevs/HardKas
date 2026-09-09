import { SqliteStorage } from '@hardkas/storage-sqlite';
import path from 'path';
import fs from 'fs';
import os from 'os';
export async function initializeHardKAS(appName, mode = 'simulated') {
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
