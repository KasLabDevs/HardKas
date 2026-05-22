export interface StructuralDiff {
  missingArtifacts: string[];
  excludedArtifacts: string[];
  missingProjections: string[];
}

export interface DeterministicDiff {
  stateRootDiverged: boolean;
  lineageDiverged: boolean;
  graphDiverged: boolean;
  differences: Array<{ path: string; a: any; b: any }>;
}

export interface RuntimeNoiseDiff {
  timestampShifts: Array<{ path: string; shiftMs: number }>;
  eventOrderingShifts: string[];
  metadataDrift: string[];
}

export interface LayeredReplayDiff {
  schema: "hardkas.replayDiff.v1";
  structural: StructuralDiff;
  deterministic: DeterministicDiff;
  observational: RuntimeNoiseDiff;
}

export function diffReplays(replayA: any, replayB: any): LayeredReplayDiff {
  const diff: LayeredReplayDiff = {
    schema: "hardkas.replayDiff.v1",
    structural: {
      missingArtifacts: [],
      excludedArtifacts: [],
      missingProjections: []
    },
    deterministic: {
      stateRootDiverged: false,
      lineageDiverged: false,
      graphDiverged: false,
      differences: []
    },
    observational: {
      timestampShifts: [],
      eventOrderingShifts: [],
      metadataDrift: []
    }
  };

  // 1. Structural Diff
  if (replayA.artifacts?.length !== replayB.artifacts?.length) {
    diff.structural.missingArtifacts.push("artifact_count_mismatch");
  }

  // 2. Deterministic Diff (Deep diff ignoring observational noise)
  if (replayA.stateRoot !== replayB.stateRoot) {
    diff.deterministic.stateRootDiverged = true;
    diff.deterministic.differences.push({
      path: "stateRoot",
      a: replayA.stateRoot,
      b: replayB.stateRoot
    });
  }

  // 3. Observational Diff
  if (replayA.timestamp && replayB.timestamp) {
    const timeA = new Date(replayA.timestamp).getTime();
    const timeB = new Date(replayB.timestamp).getTime();
    if (timeA !== timeB) {
      diff.observational.timestampShifts.push({ path: "timestamp", shiftMs: Math.abs(timeA - timeB) });
    }
  }

  return diff;
}
