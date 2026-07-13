import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";

const VERSION = "v2.0.1";
const ASSET_NAME = `kaspa-wasm32-sdk-${VERSION}.zip`;
const ASSET_URL = `https://github.com/kaspanet/rusty-kaspa/releases/download/${VERSION}/${ASSET_NAME}`;

const VENDOR_DIR = path.resolve(process.cwd(), "vendor/kaspa-wasm");
const TEMP_ZIP = path.resolve(process.cwd(), "vendor", "temp-wasm.zip");

async function downloadWasm() {
  console.log(`Downloading Kaspa WASM SDK ${VERSION} from GitHub releases...`);
  
  if (!fs.existsSync(path.resolve(process.cwd(), "vendor"))) {
    fs.mkdirSync(path.resolve(process.cwd(), "vendor"), { recursive: true });
  }

  const response = await fetch(ASSET_URL);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const fileStream = fs.createWriteStream(TEMP_ZIP);
  await finished(Readable.fromWeb(response.body).pipe(fileStream));
  
  console.log(`Downloaded to ${TEMP_ZIP}`);
  
  // Clean up existing vendor dir if any
  if (fs.existsSync(VENDOR_DIR)) {
    fs.rmSync(VENDOR_DIR, { recursive: true, force: true });
  }
  
  // Use bsdtar (available on Windows 10+) to unzip
  console.log(`Extracting ${ASSET_NAME}...`);
  const TEMP_EXTRACT_DIR = path.resolve(process.cwd(), "vendor", "temp-wasm-extract");
  fs.mkdirSync(TEMP_EXTRACT_DIR, { recursive: true });
  
  execSync(`tar -xf "${TEMP_ZIP}" -C "${TEMP_EXTRACT_DIR}"`, { stdio: "inherit" });
  
  // The zip structure usually contains "nodejs/kaspa" and "web/kaspa". We want the nodejs one.
  const nodejsSrc = path.join(TEMP_EXTRACT_DIR, "kaspa-wasm32-sdk", "nodejs", "kaspa");
  
  if (!fs.existsSync(nodejsSrc)) {
    throw new Error(`Could not find nodejs/kaspa inside the extracted archive at ${TEMP_EXTRACT_DIR}`);
  }
  
  fs.cpSync(nodejsSrc, VENDOR_DIR, { recursive: true });
  console.log(`Successfully extracted WASM SDK to ${VENDOR_DIR}`);
  
  // Cleanup
  fs.rmSync(TEMP_EXTRACT_DIR, { recursive: true, force: true });
  fs.rmSync(TEMP_ZIP, { force: true });
}

downloadWasm().catch((err) => {
  console.error("WASM Download failed:", err);
  process.exit(1);
});
