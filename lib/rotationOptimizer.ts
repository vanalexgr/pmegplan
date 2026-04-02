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
        },
      ],
    };
  }

  const scanData: RotationScanPoint[] = [];
  let bestConflictFreeDelta: number | null = null;
  let bestConflictFreeClearance = Number.NEGATIVE_INFINITY;
  let bestCompromiseDelta = 0;
  let bestCompromiseClearance = Number.NEGATIVE_INFINITY;
  const steps = Math.ceil(circ / stepMm);

  for (let stepIndex = 0; stepIndex <= steps; stepIndex += 1) {
    const delta = Math.min(stepIndex * stepMm, circ);
    const distPerFen = roundFenestrations.map((fenestration) => {
      const cx = wrapMm(clockToArc(fenestration.clock, circ) + delta, circ);
      return minDistToStruts(cx, fenestration.depthMm, segs, circ);
    });

    const thresholds = roundFenestrations.map((fenestration) =>
      getSafeThreshold(fenestration, wireRadius),
    );
    const allClear = distPerFen.every(
      (distance, index) => distance >= thresholds[index],
    );
    const minClearance = Math.min(...distPerFen);

    scanData.push({
      deltaMm: delta,
      deltaDeg: (delta / circ) * 360,
      distPerFen,
      allClear,
    });

    if (allClear && minClearance > bestConflictFreeClearance) {
      bestConflictFreeClearance = minClearance;
      bestConflictFreeDelta = delta;
    }

    if (minClearance > bestCompromiseClearance) {
      bestCompromiseClearance = minClearance;
      bestCompromiseDelta = delta;
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
    bestConflictFreeDelta === null ? bestCompromiseDelta : bestConflictFreeDelta;

  return {
    optimalDeltaMm,
    optimalDeltaDeg: (optimalDeltaMm / circ) * 360,
    validWindows,
    hasConflictFreeRotation: bestConflictFreeDelta !== null,
    bestCompromiseMm: bestCompromiseDelta,
    bestCompromiseDeg: (bestCompromiseDelta / circ) * 360,
    scanData,
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

