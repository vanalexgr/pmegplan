import {
  checkConflict,
  clockToArc,
  getSafeThreshold,
  minDistToStruts,
  wrapMm,
} from "@/lib/conflictDetection";
import type {
  Fenestration,
  RotationResult,
  RotationScanPoint,
  StrutSegment,
} from "@/lib/types";


export const MAX_DEPLOYMENT_TORQUE_DEG = 60;
export const HIGH_DEPLOYMENT_TORQUE_WARNING_DEG = 45;

function getDeploymentTorqueInfo(deltaDeg: number) {
  const normalized = ((deltaDeg % 360) + 360) % 360;
  let burden = normalized;
  let direction: "clockwise" | "counter-clockwise" | "none" = "none";

  if (normalized === 0) {
    burden = 0;
  } else if (normalized > 180) {
    burden = 360 - normalized;
    direction = "counter-clockwise"; // e.g. 340 deg target = 20 deg CCW
  } else {
    burden = normalized;
    direction = "clockwise";
  }

  return {
    deploymentTorqueDeg: burden,
    deploymentTorqueDirection: direction,
    targetAlignmentDeg: normalized,
  };
}

export function optimiseRotation(
  fenestrations: Fenestration[],
  segs: StrutSegment[],
  circ: number,
  wireRadius: number,
  stepMm = 0.1,
): RotationResult {
  const roundFenestrations = fenestrations.filter(
    (fenestration) => fenestration.ftype !== "SCALLOP",
  );

  if (roundFenestrations.length === 0) {
    return {
      optimalDeltaMm: 0,
      optimalDeltaDeg: 0,
      validWindows: [
        { startMm: 0, endMm: circ, startDeg: 0, endDeg: 360 },
      ],
      hasConflictFreeRotation: true,
      bestCompromiseMm: 0,
      bestCompromiseDeg: 0,
      scanData: [
        {
          deltaMm: 0,
          deltaDeg: 0,
          distPerFen: [],
          allClear: true,
          withinTorqueLimit: true,
          excludedByTorqueCap: false,
          deploymentTorqueDeg: 0,
          deploymentTorqueDirection: "none",
          targetAlignmentDeg: 0,
        },
      ],
      hasTorqueExcludedConflictFreeSolution: false,
    };
  }

  const scanData: RotationScanPoint[] = [];
  
  // Track the best options that are actually deployable
  let bestConflictFreeDeployableDelta: number | null = null;
  let bestConflictFreeDeployableClearance = Number.NEGATIVE_INFINITY;
  let bestCompromiseDeployableDelta = 0;
  let bestCompromiseDeployableClearance = Number.NEGATIVE_INFINITY;

  // Track the absolute best options ignoring deployability, just to know if we missed something good
  let bestConflictFreeExcludedDelta: number | null = null;
  let bestConflictFreeExcludedClearance = Number.NEGATIVE_INFINITY;
  let bestConflictFreeExcludedTorqueDeg: number | null = null;

  const steps = Math.ceil(circ / stepMm);

  for (let stepIndex = 0; stepIndex <= steps; stepIndex += 1) {
    const delta = Math.min(stepIndex * stepMm, circ);
    const deltaDeg = (delta / circ) * 360;
    const { deploymentTorqueDeg, deploymentTorqueDirection, targetAlignmentDeg } = getDeploymentTorqueInfo(deltaDeg);
    const withinTorqueLimit = deploymentTorqueDeg <= MAX_DEPLOYMENT_TORQUE_DEG;

    const distPerFen = roundFenestrations.map((fenestration) => {
      const cx = wrapMm(clockToArc(fenestration.clock, circ) + delta, circ);
      return minDistToStruts(cx, fenestration.depthMm, segs, circ);
    });

    const thresholds = roundFenestrations.map((fenestration) =>
      getSafeThreshold(fenestration, wireRadius),
    );
    const geometryClear = distPerFen.every(
      (distance, index) => distance >= thresholds[index],
    );
    const minClearance = Math.min(...distPerFen);
    
    // allClear denotes whether it's truly a usable conflict-free point
    const allClear = geometryClear && withinTorqueLimit;
    const excludedByTorqueCap = geometryClear && !withinTorqueLimit;

    scanData.push({
      deltaMm: delta,
      deltaDeg,
      distPerFen,
      allClear,
      withinTorqueLimit,
      excludedByTorqueCap,
      deploymentTorqueDeg,
      deploymentTorqueDirection,
      targetAlignmentDeg,
    });

    if (geometryClear) {
      if (withinTorqueLimit) {
        if (minClearance > bestConflictFreeDeployableClearance) {
          bestConflictFreeDeployableClearance = minClearance;
          bestConflictFreeDeployableDelta = delta;
        }
      } else {
        if (minClearance > bestConflictFreeExcludedClearance) {
          bestConflictFreeExcludedClearance = minClearance;
          bestConflictFreeExcludedDelta = delta;
          bestConflictFreeExcludedTorqueDeg = deploymentTorqueDeg;
        }
      }
    }

    if (withinTorqueLimit && minClearance > bestCompromiseDeployableClearance) {
      bestCompromiseDeployableClearance = minClearance;
      bestCompromiseDeployableDelta = delta;
    }
  }

  const validWindows: RotationResult["validWindows"] = [];
  let inWindow = false;
  let windowStart = 0;

  for (const point of scanData) {
    if (point.allClear && !inWindow) {
      inWindow = true;
      windowStart = point.deltaMm;
    }

    if (!point.allClear && inWindow) {
      inWindow = false;
      const endMm = Math.max(windowStart, point.deltaMm - stepMm);
      validWindows.push({
        startMm: windowStart,
        endMm,
        startDeg: (windowStart / circ) * 360,
        endDeg: (endMm / circ) * 360,
      });
    }
  }

  if (inWindow) {
    const endMm = scanData.at(-1)?.deltaMm ?? circ;
    validWindows.push({
      startMm: windowStart,
      endMm,
      startDeg: (windowStart / circ) * 360,
      endDeg: (endMm / circ) * 360,
    });
  }

  const optimalDeltaMm =
    bestConflictFreeDeployableDelta === null ? bestCompromiseDeployableDelta : bestConflictFreeDeployableDelta;

  return {
    optimalDeltaMm,
    optimalDeltaDeg: (optimalDeltaMm / circ) * 360,
    validWindows,
    hasConflictFreeRotation: bestConflictFreeDeployableDelta !== null,
    bestCompromiseMm: bestCompromiseDeployableDelta,
    bestCompromiseDeg: (bestCompromiseDeployableDelta / circ) * 360,
    scanData,
    hasTorqueExcludedConflictFreeSolution: bestConflictFreeDeployableDelta === null && bestConflictFreeExcludedDelta !== null,
    bestTorqueExcludedConflictFreeAlignmentDeg: bestConflictFreeExcludedDelta !== null ? (bestConflictFreeExcludedDelta / circ) * 360 : undefined,
    bestTorqueExcludedConflictFreeTorqueDeg: bestConflictFreeExcludedTorqueDeg !== null ? bestConflictFreeExcludedTorqueDeg : undefined,
  };
}

export function baselineConflictSummary(
  fenestrations: Fenestration[],
  segs: StrutSegment[],
  circ: number,
  wireRadius: number,
) {
  return fenestrations.map((fenestration) =>
    checkConflict(fenestration, segs, circ, wireRadius, 0),
  );
}
