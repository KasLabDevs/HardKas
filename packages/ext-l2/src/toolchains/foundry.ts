import type { ManagedToolchainReference } from "@hardkas/cli/extension-kit";

/**
 * L2-EXT stage 3 · Foundry v1.8.6, pinned (design §4.3, decision D3; verified 30-oct-2026 with the authorized
 * download: l2fix-evidence\12-foundry-pin\foundry-pin-verify.log).
 *
 * Each asset digest equals the `.sha256` published on the GitHub release; each file digest was computed from the
 * extracted archive (flat, no subdirectory). Only what HardKAS uses is installed: anvil (local EVM node), forge
 * (compile and test) and cast; chisel and solar are in the archive but not extracted. Only win32-x64 and linux-x64
 * (glibc) are pinned (D4); on any other platform foundry is not offered rather than installed unverified.
 *
 * The toolchain manager of the core installs it, and only on `hardkas toolchain install foundry`: installing the
 * extension downloads and runs nothing.
 */
const RELEASE_TAG = "v1.8.6";
const DOWNLOAD = `https://github.com/foundry-rs/foundry/releases/download/${RELEASE_TAG}/`;

export const FOUNDRY_REFERENCES: Readonly<Record<string, ManagedToolchainReference>> = {
  "win32-x64": {
    id: "foundry",
    version: "1.8.6",
    releaseTag: RELEASE_TAG,
    assetName: "foundry_v1.8.6_win32_amd64.zip",
    url: `${DOWNLOAD}foundry_v1.8.6_win32_amd64.zip`,
    assetSha256: "924d6395786af438e7cb315f6835185f99d727ed6127dbbc4e6a62eb14edcfff",
    archive: "zip",
    assetSubdir: "",
    entry: "anvil.exe",
    executables: ["anvil.exe", "forge.exe", "cast.exe"],
    files: {
      "anvil.exe": { sha256: "64c6878503d3b4d6160c116410f957949da9dfd2b78c2a8707c50f550a6c40d3", size: 46423552 },
      "forge.exe": { sha256: "6596e0961bee2335e4637c76ec19e0c07a82c039e2cec09a253bf49cd84eb34f", size: 94851584 },
      "cast.exe": { sha256: "414861364fa377e1d4c1de4be250501510bf4800e103a6f10cac0efe2febfbef", size: 68379648 }
    }
  },
  "linux-x64": {
    id: "foundry",
    version: "1.8.6",
    releaseTag: RELEASE_TAG,
    assetName: "foundry_v1.8.6_linux_amd64.tar.gz",
    url: `${DOWNLOAD}foundry_v1.8.6_linux_amd64.tar.gz`,
    assetSha256: "58850106984038f3a7200f38a4182c8cb423d3a4f4c7848eacbc2453e6bc35fc",
    archive: "tar.gz",
    assetSubdir: "",
    entry: "anvil",
    executables: ["anvil", "forge", "cast"],
    files: {
      anvil: { sha256: "3c28263c7989c78b70b56090a97832263b118201dd038a8662b77bd49a252cd5", size: 53336048 },
      forge: { sha256: "cfabb782cf5220e46146820a9518aca0f11fc8891ee507860d162669879526c3", size: 105321232 },
      cast: { sha256: "e511d5459e583c5239ac413e387f5d5f644daa78b6178f67471f320b1c3ebac5", size: 77389384 }
    }
  }
};

/** True on a musl libc (Alpine): the pinned linux-x64 build is glibc and is never offered there. */
export function isMusl(report: { header?: { glibcVersionRuntime?: string } } | undefined = (process as any).report?.getReport?.()): boolean {
  return process.platform === "linux" && !report?.header?.glibcVersionRuntime;
}

/** The foundry pin for a platform, or undefined where none is pinned (or the libc does not match). */
export function foundryReferenceFor(platform: string, arch: string, musl: boolean): ManagedToolchainReference | undefined {
  if (platform === "linux" && musl) return undefined;
  return FOUNDRY_REFERENCES[`${platform}-${arch}`];
}
