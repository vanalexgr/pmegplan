import { arcMmToClockText } from "@/lib/planning/clock";
import type { PlacedOpening } from "@/lib/planning/anatomy";
import type { GraftModel } from "@/lib/planning/plan";
import { wrapMm } from "@/lib/planning/geometry";

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
 * The free fabric around a hole, measured from its edge outward.
 *
 * `null` means no metal was found in that direction inside the search window,
 * which on these devices means the nearest ring is further than the window and
 * the direction is not the binding one.
 */
export interface HoleGaps {
  aboveMm: number | null;
  belowMm: number | null;
  leftMm: number | null;
  rightMm: number | null;
}

export interface HoleMeasurement {
  vesselName: string;
  diameterMm: number;
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
  const holeRadiusMm = opening.radiusMm;
  // Gaps are measured to the wire's surface rather than its axis, so they read
  // on the same basis as the clearance figure and as a ruler laid on the graft.
  const radiusMm = holeRadiusMm + graft.wireRadiusMm;
  const centreArc = opening.arcMm;
  const centreDepth = opening.depthMm;

  let aboveMm: number | null = null;
  let belowMm: number | null = null;
  let leftMm: number | null = null;
  let rightMm: number | null = null;
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
    if (lateralMm < radiusMm) {
      const halfChordMm = Math.sqrt(radiusMm * radiusMm - lateralMm * lateralMm);
      if (bottom <= centreDepth - halfChordMm) {
        const gap = centreDepth - bottom - halfChordMm;
        if (aboveMm === null || gap < aboveMm) aboveMm = gap;
      }
      if (top >= centreDepth + halfChordMm) {
        const gap = top - centreDepth - halfChordMm;
        if (belowMm === null || gap < belowMm) belowMm = gap;
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
    if (verticalMm < radiusMm) {
      const halfChordMm =
        Math.sqrt(radiusMm * radiusMm - verticalMm * verticalMm);
      if (lateralMm >= halfChordMm) {
        const gap = lateralMm - halfChordMm;
        if (dArc < 0) {
          if (leftMm === null || gap < leftMm) leftMm = gap;
        } else if (rightMm === null || gap < rightMm) rightMm = gap;
      }
    }

    // Wire running through the opening itself, judged on the bare hole rather
    // than the clearance-inflated one: this is metal in the hole, not metal
    // close to it.
    if (
      lateralMm <= holeRadiusMm &&
      bottom > centreDepth - holeRadiusMm &&
      top < centreDepth + holeRadiusMm
    ) {
      insideRingBand = true;
    }

    // Landmarks. An apex is the shallowest point of a stroke, a valley the
    // deepest; the nearest of each is what a ruler gets laid against.
    if (Math.abs(dArc) <= LATERAL_WINDOW_MM) {
      const apexDepth = top;
      if (
        apexDepth < centreDepth - radiusMm &&
        centreDepth - apexDepth < AXIAL_WINDOW_MM
      ) {
        const distanceMm = Math.hypot(
          dArc,
          centreDepth - apexDepth,
        ) - radiusMm;
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
        valleyDepth > centreDepth + radiusMm &&
        valleyDepth - centreDepth < AXIAL_WINDOW_MM
      ) {
        const distanceMm = Math.hypot(
          dArc,
          valleyDepth - centreDepth,
        ) - radiusMm;
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
    diameterMm: holeRadiusMm * 2,
    depthMm: centreDepth,
    arcMm: centreArc,
    clock: arcMmToClockText(centreArc, circumferenceMm),
    clearanceMm,
    gaps: { aboveMm, belowMm, leftMm, rightMm },
    apexAbove,
    valleyBelow,
    insideRingBand,
  };
}
