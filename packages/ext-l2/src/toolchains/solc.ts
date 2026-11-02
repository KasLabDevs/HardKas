import type { ManagedToolchainReference } from "@hardkas/cli/extension-kit";

/**
 * L2-EXT stage 5 · solc 0.8.38, pinned (research of 1-nov-2026: l2fix-evidence\25-solc-research\SOLC_RESEARCH.md).
 *
 * The official static builds from binaries.soliditylang.org. Each digest is the `sha256` of that build in the platform's
 * official `list.json`, and equals the digest GitHub publishes for the same file on the v0.8.38 release
 * (`solc-windows.exe`, `solc-static-linux`). The asset is the compiler itself (no archive): it is installed under one
 * fixed name. 0.8.38 is the first release without the known bug of 0.8.37 (YulOptimizerKnowledgeBaseStaleBookkeeping).
 *
 * forge never fetches a compiler here: `hardkas l2 compile` passes this verified solc to forge and runs it offline. Only
 * win32-x64 and linux-x64 (glibc) are pinned, as for Foundry.
 */
const VERSION = "0.8.38";
const LONG_VERSION = "0.8.38+commit.1835d247";
const BINARIES = "https://binaries.soliditylang.org/";

export const SOLC_VERSION = VERSION;
export const SOLC_LONG_VERSION = LONG_VERSION;

export const SOLC_REFERENCES: Readonly<Record<string, ManagedToolchainReference>> = {
  "win32-x64": {
    id: "solc",
    version: VERSION,
    releaseTag: `v${VERSION}`,
    assetName: `solc-windows-amd64-v${LONG_VERSION}.exe`,
    url: `${BINARIES}windows-amd64/solc-windows-amd64-v${LONG_VERSION}.exe`,
    assetSha256: "3fb6699791d7eb9d8cb28168116cc9b5eca9f2bec1ec356f7d66034d91035e9b",
    archive: "binary",
    assetSubdir: "",
    entry: "solc.exe",
    executables: ["solc.exe"],
    files: {
      "solc.exe": { sha256: "3fb6699791d7eb9d8cb28168116cc9b5eca9f2bec1ec356f7d66034d91035e9b", size: 9536000 }
    }
  },
  "linux-x64": {
    id: "solc",
    version: VERSION,
    releaseTag: `v${VERSION}`,
    assetName: `solc-linux-amd64-v${LONG_VERSION}`,
    url: `${BINARIES}linux-amd64/solc-linux-amd64-v${LONG_VERSION}`,
    assetSha256: "65c3180a336eabb6bdc4bbd49cc405aeb233976964ae6c11fba2a6c8be8f3243",
    archive: "binary",
    assetSubdir: "",
    entry: "solc",
    executables: ["solc"],
    files: {
      solc: { sha256: "65c3180a336eabb6bdc4bbd49cc405aeb233976964ae6c11fba2a6c8be8f3243", size: 15527664 }
    }
  }
};

/** The solc pin for a platform, or undefined where none is pinned (or the libc does not match). */
export function solcReferenceFor(platform: string, arch: string, musl: boolean): ManagedToolchainReference | undefined {
  if (platform === "linux" && musl) return undefined;
  return SOLC_REFERENCES[`${platform}-${arch}`];
}
