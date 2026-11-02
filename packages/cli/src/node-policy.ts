/**
 * I-07 · the Node.js runtime HardKAS supports, as the `engines` fields of its packages pin it (exactly; the security
 * baseline). `hardkas doctor` and `hardkas dev doctor` judge the running Node.js against it rather than against an older
 * floor of their own. Changing the supported version is the owner's decision, made here and in `engines` together (a test
 * keeps them equal).
 */
export const SUPPORTED_NODE_VERSION = "24.22.1";

export interface NodeVersionVerdict {
  readonly status: "pass" | "warn" | "fail";
  readonly message: string;
}

/** The supported version passes; another 24.x is a warning (not the pinned patch); any other line fails. */
export function nodeVersionVerdict(version: string = process.version): NodeVersionVerdict {
  const v = version.replace(/^v/, "");
  if (v === SUPPORTED_NODE_VERSION) return { status: "pass", message: `v${v} (the supported Node.js ${SUPPORTED_NODE_VERSION})` };
  const major = SUPPORTED_NODE_VERSION.split(".")[0];
  if (v.split(".")[0] === major) return { status: "warn", message: `v${v}: HardKAS supports exactly Node.js ${SUPPORTED_NODE_VERSION}` };
  return { status: "fail", message: `v${v}: HardKAS supports exactly Node.js ${SUPPORTED_NODE_VERSION}` };
}
