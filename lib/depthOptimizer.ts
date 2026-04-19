/**
 * depthOptimizer.ts — PMEGplan.io
 *
 * Global depth-offset optimisation.
 *
 * All fenestrations are shifted distally/proximally by the same delta (mm),
 * preserving their relative axial spacing.  This is the depth analogue of the
 * rotational optimiser: instead of scanning circumferential arc offset we scan
 * the longitudinal (Z-axis) offset.
 *
 * Constraints
 * -----------
 * • Scallops sit at the proximal edge (depth 0) by anatomical definition —
 *   they are excluded from the depth check.
 * • Every non-scallop fenestration must remain ≥ MIN_PROX_DEPTH_MM from the
 *   proximal fabric edge after the shift is applied.
 * • The deepest fenestration must not exceed the device's seal-zone height.
 *
 * Convention: depth 0 = proximal fabric edge, increasing distally.
 */

import { getSafeThreshold, minDistToStruts, wrapMm } from "@/lib/conflictDetection";
import { clockToArc } from "@/lib/conflictDetection";
import type {
  DepthResult,
  DepthWindow,
  Fenestration,
  StrutSegment,
} from "@/lib/types";

/** Minimum distance from proximal fabric edge for any non-scallop fenestration. */
export const MIN_PROX_DEPTH_MM = 5;

/** Scan resolution in mm. */
const STEP_MM = 0.5;

/**
 * Optimise a global depth shift δ (mm) applied to all non-scallop fenestrations.
 *
 * @param fenestrations   All fenestrations from the case input
 * @param optimalDeltaMm  Arc rotation delta already found (used to compute adjusted arcs)
 * @param segs            Strut segments for the selected device/size
 * @param circ            Graft circumference in mm
 * @param wireRadius      Wire radius in mm
 * @param sealZoneH       Seal-zone height in mm (upper bound for fenestration depth)
 */
export function optimiseDepth(
  fenestrations: Fenestration[],
  optimalArcDeltaMm: number,
  segs: StrutSegment[],
  circ: number,
  wireRadius: number,
  sealZoneH: number,
): DepthResult {
  const roundFens = fenestrations.filter((f) => f.ftype !== "SCALLOP");

  // Adjusted arc positions (after rotation) — fixed for the depth scan.
  const adjustedArcs = fenestrations.map((f) =>
    wrapMm(clockToArc(f.clock, circ) + optimalArcDeltaMm, circ),
  );

  // ── Compute scan range for δ ─────────────────────────────────────────────
  const depths   = roundFens.map((f) => f.depthMm);
  const minDepth = depths.length > 0 ? Math.min(...depths) : 0;
  const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;

  // δ lower bound: ensure every fen stays ≥ MIN_PROX_DEPTH_MM
  const deltaMin = depths.length > 0 ? MIN_PROX_DEPTH_MM - minDepth : 0;
  // δ upper bound: ensure deepest fen stays ≤ sealZoneH
  const deltaMax = depths.length > 0 ? sealZoneH - maxDepth : 0;

  // Nothing to optimise if no round fenestrations or range is degenerate.
  if (roundFens.length === 0 || deltaMin > deltaMax) {
    const clearancePerFen = fenestrations.map((f, i) => {
      if (f.ftype === "SCALLOP") return Number.POSITIVE_INFINITY;
      return minDistToStruts(adjustedArcs[i], f.depthMm, segs, circ);
    });
    return {
      optimalDeltaMm: 0,
      hasConflictFreeDepth: false,
      validWindows: [],
      bestCompromiseDeltaMm: 0,
      adjustedDepths: fenestrations.map((f) => f.depthMm),
      clearancePerFen,
      scanMin: deltaMin,
      scanMax: deltaMax,
    };
  }

  // ── Scan ─────────────────────────────────────────────────────────────────
  const steps = Math.round((deltaMax - deltaMin) / STEP_MM);

  const validWindows: DepthWindow[] = [];
  let windowStart: number | null = null;
  let bestDelta = 0;
  let bestClearance = -Infinity;
  let bestCompromiseDelta = deltaMin;
  let bestCompromiseClearance = -Infinity;

  for (let i = 0; i <= steps; i++) {
    const delta      = deltaMin + i * STEP_MM;
    const clearances = roundFens.map((f, ri) => {
      const fenIdx = fenestrations.indexOf(f);
      return minDistToStruts(adjustedArcs[fenIdx], f.depthMm + delta, segs, circ);
    });
    const thresholds = roundFens.map((f) => getSafeThreshold(f, wireRadius));
    const allClear   = clearances.every((c, j) => c >= thresholds[j]);
    const minC       = Math.min(...clearances);

    if (allClear) {
      if (windowStart === null) windowStart = delta;
      if (minC > bestClearance) {
        bestClearance = minC;
        bestDelta     = delta;
      }
    } else {
      if (windowStart !== null) {
        validWindows.push({ startMm: windowStart, endMm: delta - STEP_MM });
        windowStart = null;
      }
      if (minC > bestCompromiseClearance) {
        bestCompromiseClearance = minC;
        bestCompromiseDelta     = delta;
      }
    }
  }
  if (windowStart !== null) {
    validWindows.push({ startMm: windowStart, endMm: deltaMax });
  }

  const hasConflictFreeDepth = validWindows.length > 0;

  // Prefer δ closest to 0 among conflict-free windows (minimise adjustment).
  if (hasConflictFreeDepth) {
    let minAbsDelta = Infinity;
    for (const w of validWindows) {
      const nearest = Math.max(w.startMm, Math.min(w.endMm, 0));
      if (Math.abs(nearest) < minAbsDelta) {
        minAbsDelta = Math.abs(nearest);
        bestDelta   = nearest;
      }
    }
    // If δ=0 is conflict-free, stick with 0.
    if (minAbsDelta === 0) bestDelta = 0;
  }

  const optimalDelta     = hasConflictFreeDepth ? bestDelta : bestCompromiseDelta;
  const adjustedDepths   = fenestrations.map((f) =>
    f.ftype === "SCALLOP" ? 0 : parseFloat((f.depthMm + optimalDelta).toFixed(1)),
  );
  const clearancePerFen  = fenestrations.map((f, i) => {
    if (f.ftype === "SCALLOP") return Number.POSITIVE_INFINITY;
    return minDistToStruts(adjustedArcs[i], f.depthMm + optimalDelta, segs, circ);
  });

  return {
    optimalDeltaMm:        parseFloat(optimalDelta.toFixed(1)),
    hasConflictFreeDepth,
    validWindows,
    bestCompromiseDeltaMm: parseFloat(bestCompromiseDelta.toFixed(1)),
    adjustedDepths,
    clearancePerFen,
    scanMin:               deltaMin,
    scanMax:               deltaMax,
  };
}
