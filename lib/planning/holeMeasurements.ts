import { arcMmToClockText } from "@/lib/planning/clock";
import type { PlacedOpening } from "@/lib/planning/anatomy";
import type { GraftModel } from "@/lib/planning/plan";
import { wrapMm } from "@/lib/planning/geometry";
import { ellipseReachMm } from "@/lib/planning/openingClearance";

/**
 * Signed circumferential difference, shortest way round.
 * Positive means `to` is clockwise of `from`.
 */
function arcDeltaMm(fromMm: number, toMm: number, circumferenceMm: number): number {
  const raw = wrapMm(toMm - fromMm, circumferenceMm);
  return raw > circumferenceMm / 2 ? raw - circumferenceMm : raw;
}

/** A strut landmark the surgeon can actually see and measure from. */
export interface StrutLandmark {
  kind: "apex" | "valley";
  /** Distance from the hole edge to the landmark, in mm. */
  distanceMm: number;
  /** Depth of the landmark below the proximal fabric edge, in mm. */
  depthMm: number;
  clock: string;
  /** Circumferential offset from the hole centre, in mm; positive clockwise. */
  arcOffsetMm: number;
}

/**
 * One direction's free fabric, with the point it was measured to so the views
 * can draw the same line the number came from.
 */
export interface HoleGap {
  distanceMm: number;
  /** Where the blocking wire sits, in graft coordinates. */
  atArcMm: number;
  atDepthMm: number;
}

/**
 * The free fabric around a hole, measured from its edge outward.
 *
 * `null` means no metal was found in that direction inside the search window,
 * which on these devices means the nearest ring is further than the window and
 * the direction is not the binding one.
 */
export interface HoleGaps {
  above: HoleGap | null;
  below: HoleGap | null;
  left: HoleGap | null;
  right: HoleGap | null;
}

export interface HoleMeasurement {
  vesselName: string;
  /** Circumferential width, in mm. Equals `heightMm` on a circular opening. */
  diameterMm: number;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  arcMm: number;
  clock: string;
  /** Distance from the hole edge to the nearest wire, in mm. Negative overlaps. */
  clearanceMm: number;
  gaps: HoleGaps;
  /** Nearest apex above and valley below, as landmarks to measure from. */
  apexAbove: StrutLandmark | null;
  valleyBelow: StrutLandmark | null;
  /** True when the hole sits inside the ring rather than in a window. */
  insideRingBand: boolean;
}

/** How far around the circumference to look for a neighbouring strut, in mm. */
const LATERAL_WINDOW_MM = 30;
/** How far axially to look for the ring above and below, in mm. */
const AXIAL_WINDOW_MM = 40;

/**
 * Measure the fabric around one planned opening.
 *
 * Everything is taken from the scan's own wire strokes, and reported the way it
 * would be marked out: a distance from the hole edge to the nearest metal in
 * each direction, plus the nearest apex above and valley below to lay a ruler
 * against. The clearance figure alone says whether a hole fits; these say where
 * to put it.
 */
export function measureHole(
  graft: GraftModel,
  opening: PlacedOpening,
  clearanceMm: number,
): HoleMeasurement {
  const { segments, circumferenceMm } = graft;
  // Semi-axes of the opening, and of the same opening grown by the wire radius.
  // Gaps are measured to the wire's surface rather than its axis, so they read
  // on the same basis as the clearance figure and as a ruler laid on the graft.
  const holeArcMm = opening.semiArcMm;
  const holeDepthMm = opening.semiDepthMm;
  const semiArcMm = holeArcMm + graft.wireRadiusMm;
  const semiDepthMm = holeDepthMm + graft.wireRadiusMm;
  const centreArc = opening.arcMm;
  const centreDepth = opening.depthMm;

  let above: HoleGap | null = null;
  let below: HoleGap | null = null;
  let left: HoleGap | null = null;
  let right: HoleGap | null = null;
  let apexAbove: StrutLandmark | null = null;
  let valleyBelow: StrutLandmark | null = null;
  let insideRingBand = false;

  for (const [arcMm, fromZ, , toZ] of segments) {
    const dArc = arcDeltaMm(centreArc, arcMm, circumferenceMm);
    if (Math.abs(dArc) > LATERAL_WINDOW_MM) continue;

    const top = Math.min(fromZ, toZ);
    const bottom = Math.max(fromZ, toZ);

    const lateralMm = Math.abs(dArc);

    // Sliding the hole axially, it meets this stroke when its rim reaches it —
    // and the rim is only `radius` away straight up. Offset sideways by
    // `lateral`, the rim is nearer by the chord half-width, so that is what
    // gets subtracted rather than the full radius.
    if (lateralMm < semiArcMm) {
      // Half-height of the rim at this sideways offset. On a circle this is
      // the usual chord; on an ellipse the semi-axes differ, so the rim is
      // nearer or further than a circle of either dimension would suggest.
      const halfChordMm =
        semiDepthMm * Math.sqrt(1 - (lateralMm / semiArcMm) ** 2);
      if (bottom <= centreDepth - halfChordMm) {
        const distanceMm = centreDepth - bottom - halfChordMm;
        if (above === null || distanceMm < above.distanceMm) {
          above = { distanceMm, atArcMm: arcMm, atDepthMm: bottom };
        }
      }
      if (top >= centreDepth + halfChordMm) {
        const distanceMm = top - centreDepth - halfChordMm;
        if (below === null || distanceMm < below.distanceMm) {
          below = { distanceMm, atArcMm: arcMm, atDepthMm: top };
        }
      }
    }

    // Sliding it circumferentially, by the same argument about the rim: a
    // stroke that only clips the top or bottom of the hole is reached later
    // than one running through its middle.
    const verticalMm =
      top <= centreDepth && centreDepth <= bottom
        ? 0
        : Math.min(
            Math.abs(centreDepth - top),
            Math.abs(centreDepth - bottom),
          );
    if (verticalMm < semiDepthMm) {
      const halfChordMm =
        semiArcMm * Math.sqrt(1 - (verticalMm / semiDepthMm) ** 2);
      if (lateralMm >= halfChordMm) {
        const distanceMm = lateralMm - halfChordMm;
        // The depth the ruler would sit at: the stroke's nearest point.
        const atDepthMm =
          verticalMm === 0
            ? centreDepth
            : Math.abs(centreDepth - top) < Math.abs(centreDepth - bottom)
              ? top
              : bottom;
        const gap = { distanceMm, atArcMm: arcMm, atDepthMm };
        if (dArc < 0) {
          if (left === null || distanceMm < left.distanceMm) left = gap;
        } else if (right === null || distanceMm < right.distanceMm) right = gap;
      }
    }

    // Wire running through the opening itself, judged on the bare hole rather
    // than the clearance-inflated one: this is metal in the hole, not metal
    // close to it.
    if (lateralMm <= holeArcMm) {
      const halfChordMm =
        holeDepthMm * Math.sqrt(1 - (lateralMm / holeArcMm) ** 2);
      if (
        bottom > centreDepth - halfChordMm &&
        top < centreDepth + halfChordMm
      ) {
        insideRingBand = true;
      }
    }

    // Landmarks. An apex is the shallowest point of a stroke, a valley the
    // deepest; the nearest of each is what a ruler gets laid against.
    if (Math.abs(dArc) <= LATERAL_WINDOW_MM) {
      const apexDepth = top;
      if (
        apexDepth < centreDepth - semiDepthMm &&
        centreDepth - apexDepth < AXIAL_WINDOW_MM
      ) {
        const distanceMm =
          Math.hypot(dArc, centreDepth - apexDepth) -
          ellipseReachMm(
            { semiArcMm, semiDepthMm },
            Math.atan2(centreDepth - apexDepth, dArc),
          );
        if (apexAbove === null || distanceMm < apexAbove.distanceMm) {
          apexAbove = {
            kind: "apex",
            distanceMm,
            depthMm: apexDepth,
            clock: arcMmToClockText(arcMm, circumferenceMm),
            arcOffsetMm: dArc,
          };
        }
      }

      const valleyDepth = bottom;
      if (
        valleyDepth > centreDepth + semiDepthMm &&
        valleyDepth - centreDepth < AXIAL_WINDOW_MM
      ) {
        const distanceMm =
          Math.hypot(dArc, valleyDepth - centreDepth) -
          ellipseReachMm(
            { semiArcMm, semiDepthMm },
            Math.atan2(valleyDepth - centreDepth, dArc),
          );
        if (valleyBelow === null || distanceMm < valleyBelow.distanceMm) {
          valleyBelow = {
            kind: "valley",
            distanceMm,
            depthMm: valleyDepth,
            clock: arcMmToClockText(arcMm, circumferenceMm),
            arcOffsetMm: dArc,
          };
        }
      }
    }
  }

  return {
    vesselName: opening.vessel.name,
    diameterMm: holeArcMm * 2,
    widthMm: holeArcMm * 2,
    heightMm: holeDepthMm * 2,
    depthMm: centreDepth,
    arcMm: centreArc,
    clock: arcMmToClockText(centreArc, circumferenceMm),
    clearanceMm,
    gaps: { above, below, left, right },
    apexAbove,
    valleyBelow,
    insideRingBand,
  };
}
