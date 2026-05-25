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
  const stateA = replayA.stateRoot || replayA.postStateHash;
  const stateB = replayB.stateRoot || replayB.postStateHash;
  if (stateA !== stateB) {
    diff.deterministic.stateRootDiverged = true;
    diff.deterministic.differences.push({
      path: "stateRoot",
      a: stateA,
      b: stateB
    });
  }
  if (replayA.amountSompi !== undefined && replayB.amountSompi !== undefined && replayA.amountSompi !== replayB.amountSompi) {
    diff.deterministic.differences.push({
      path: "amountSompi",
      a: replayA.amountSompi,
      b: replayB.amountSompi
    });
  }

  // 3. Observational Diff
  const tsA = replayA.timestamp || replayA.createdAt;
  const tsB = replayB.timestamp || replayB.createdAt;
  if (tsA && tsB) {
    const timeA = new Date(tsA).getTime();
    const timeB = new Date(tsB).getTime();
    if (timeA !== timeB) {
      diff.observational.timestampShifts.push({ path: "timestamp", shiftMs: Math.abs(timeA - timeB) });
    }
  }

  return diff;
}
