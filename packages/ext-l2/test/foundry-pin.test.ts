import { describe, it, expect } from "vitest";
import { FOUNDRY_REFERENCES, foundryReferenceFor, isMusl } from "../src/toolchains/foundry.js";
import { solcReferenceFor } from "../src/toolchains/solc.js";
import extension from "../src/extension.js";

// L2-EXT stage 3 · the Foundry pins (v1.8.6, win32-x64 and linux-x64 only) and where they are offered.
describe("Foundry pins", () => {
  it("pin the release digests verified on 30-oct (asset = the release's .sha256) and the extracted binaries HardKAS uses", () => {
    expect(FOUNDRY_REFERENCES["win32-x64"]!.assetSha256).toBe("924d6395786af438e7cb315f6835185f99d727ed6127dbbc4e6a62eb14edcfff");
    expect(FOUNDRY_REFERENCES["linux-x64"]!.assetSha256).toBe("58850106984038f3a7200f38a4182c8cb423d3a4f4c7848eacbc2453e6bc35fc");
    expect(Object.keys(FOUNDRY_REFERENCES["win32-x64"]!.files).sort()).toEqual(["anvil.exe", "cast.exe", "forge.exe"]);
    expect(Object.keys(FOUNDRY_REFERENCES["linux-x64"]!.files).sort()).toEqual(["anvil", "cast", "forge"]);
    for (const ref of Object.values(FOUNDRY_REFERENCES)) {
      expect(ref.id).toBe("foundry");
      expect(ref.url).toBe(`https://github.com/foundry-rs/foundry/releases/download/v1.8.6/${ref.assetName}`);
      expect(ref.executables!.every((e) => e in ref.files)).toBe(true);
      expect(ref.entry in ref.files).toBe(true);
    }
  });

  it("are offered only on win32-x64 and glibc linux-x64", () => {
    expect(foundryReferenceFor("win32", "x64", false)?.assetName).toBe("foundry_v1.8.6_win32_amd64.zip");
    expect(foundryReferenceFor("linux", "x64", false)?.assetName).toBe("foundry_v1.8.6_linux_amd64.tar.gz");
    expect(foundryReferenceFor("linux", "x64", true)).toBeUndefined(); // Alpine (musl): the glibc build is never offered
    expect(foundryReferenceFor("darwin", "arm64", false)).toBeUndefined();
    expect(foundryReferenceFor("linux", "arm64", false)).toBeUndefined();
    expect(foundryReferenceFor("win32", "arm64", false)).toBeUndefined();
  });

  it("musl is detected from the process report (no glibc runtime) on linux only", () => {
    if (process.platform === "linux") {
      expect(isMusl({ header: {} })).toBe(true);
      expect(isMusl({ header: { glibcVersionRuntime: "2.39" } })).toBe(false);
    } else {
      expect(isMusl({ header: {} })).toBe(false);
    }
  });

  it("the extension hands the core this platform's pins only (Foundry, and since stage 5 solc), and loading it fetches or runs nothing", () => {
    const refs = extension.toolchains!();
    const expected = [foundryReferenceFor(process.platform, process.arch, isMusl()), solcReferenceFor(process.platform, process.arch, isMusl())].filter((r) => r !== undefined);
    expect(refs).toEqual(expected);
    // one pin per toolchain: never another platform's as well
    expect(new Set(refs.map((r) => r.id)).size).toBe(refs.length);
  });
});
