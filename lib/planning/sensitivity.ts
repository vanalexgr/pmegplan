import {
  minProximalDepthMm,
  openingHalfSize,
  scallopSeparationMm,
  type NormalizedAnatomy,
} from "@/lib/planning/anatomy";
import type { PoseSolution } from "@/lib/planning/poseSolver";
import type { ProximalDepthLimit } from "@/lib/planning/poseSolver";

/** Which constraint decided the plan. */
export type BindingConstraint =
  /** A preserved vessel left too little fabric above the first hole to seal. */
  | "push_in_ceiling"
  /** A scallop that would run into the opening below it. */
  | "scallop_meets_opening"
  /** The plan stands or falls on how close an opening sits to wire. */
  | "clearance";

/**
 * How far a measurement would have to be wrong for the answer to change.
 *
 * The purpose is not to hedge every verdict. It is to separate the ones that
 * would survive a millimetre of measurement error from the ones that would not,
 * because those two deserve different amounts of trust and look identical
 * otherwise. A verdict that only flips if a coeliac ostium was mismeasured by
 * 8 mm is safe; one that flips at 0.4 mm is a prompt to go back to the CT.
 */
export interface InputSensitivity {
  binding: BindingConstraint;
  /** Slack on the binding constraint, in mm. Negative when it is violated. */
  slackMm: number;
  /** Vessel the verdict hinges on, when one does. */
  vesselName: string | null;
  /** That vessel's distance from the first opening as entered, in mm. */
  gapMm: number | null;
  /** That vessel's ostium diameter as entered, in mm. */
  ostiumMm: number | null;
  /**
   * How much further from the first opening that vessel would have to sit for
   * the verdict to flip, in mm. Null when no gap change would do it.
   */
  gapChangeMm: number | null;
  /**
   * What that vessel's ostium diameter would have to become for the verdict to
   * flip, in mm. Negative means no real ostium can — the verdict is not a
   * measurement artefact.
   */
  ostiumWouldNeedMm: number | null;
  /**
   * Positional error the plan tolerates on any one opening before an opening
   * touches wire, in mm.
   *
   * This is the clearance margin, which because the pattern is rigid is already
   * the radius of the conflict-free neighbourhood — so it doubles as the
   * tolerance on every vessel measurement that feeds it.
   */
  positionToleranceMm: number;
}

/**
 * Axial separation at which the cut would just touch the first opening, in mm.
 *
 * Approximate — it takes the openings as aligned with the cut, which is the
 * worst case and the one the refusal is made on.
 */
function openingReachMm(anatomy: NormalizedAnatomy): number {
  const first = anatomy.fenestrations[0];
  return first === undefined ? 0 : openingHalfSize(first).semiDepthMm;
}

export function analyseSensitivity(
  anatomy: NormalizedAnatomy,
  solution: PoseSolution,
  depthLimit: ProximalDepthLimit,
): InputSensitivity {
  const positionToleranceMm = Number.isFinite(solution.marginMm)
    ? solution.marginMm
    : 0;

  if (solution.status === "scallop_meets_opening") {
    const separationMm = scallopSeparationMm(anatomy) ?? 0;
    // The cut is as wide as it is because that is what the series cuts, so what
    // has to move is the vessels. The ostium does not enter it: a scallop is
    // sized to the edge relief, not to the vessel.
    const neededMm = openingReachMm(anatomy);
    return {
      binding: "scallop_meets_opening",
      slackMm: separationMm - neededMm,
      vesselName: anatomy.scalloped?.name ?? null,
      gapMm: separationMm,
      ostiumMm: anatomy.scalloped?.ostiumDiameterMm ?? null,
      gapChangeMm: neededMm - separationMm,
      ostiumWouldNeedMm: null,
      positionToleranceMm,
    };
  }

  if (solution.status === "seal_zone_too_short") {
    const minDepthMm = minProximalDepthMm(anatomy);
    const slackMm = depthLimit.maxDepthMm - minDepthMm;
    const vessel = anatomy.vessels.find(
      (candidate) => candidate.name === depthLimit.limitingVesselName,
    );

    if (!vessel || anatomy.proximalFenestrationZMm === null) {
      return {
        binding: "push_in_ceiling",
        slackMm,
        vesselName: depthLimit.limitingVesselName,
        gapMm: null,
        ostiumMm: null,
        gapChangeMm: slackMm < 0 ? -slackMm : null,
        ostiumWouldNeedMm: null,
        positionToleranceMm,
      };
    }

    // The bound is (gap - ostium/2) >= minDepth, so either term can be moved.
    const gapMm = vessel.zMm - anatomy.proximalFenestrationZMm;
    return {
      binding: "push_in_ceiling",
      slackMm,
      vesselName: vessel.name,
      gapMm,
      ostiumMm: vessel.ostiumDiameterMm,
      gapChangeMm: slackMm < 0 ? -slackMm : null,
      ostiumWouldNeedMm: 2 * (gapMm - minDepthMm),
      positionToleranceMm,
    };
  }

  return {
    binding: "clearance",
    slackMm: solution.marginMm,
    vesselName:
      solution.clearances.length > 0
        ? solution.clearances.reduce((tightest, candidate) =>
            candidate.clearanceMm < tightest.clearanceMm ? candidate : tightest,
          ).vesselName
        : null,
    gapMm: null,
    ostiumMm: null,
    gapChangeMm: null,
    ostiumWouldNeedMm: null,
    positionToleranceMm,
  };
}

/** Clearance below which a plan is worth re-measuring rather than trusting, in mm. */
export const KNIFE_EDGE_MM = 0.5;

/** Whether the verdict would survive ordinary measurement error. */
export function isKnifeEdge(sensitivity: InputSensitivity): boolean {
  return Math.abs(sensitivity.slackMm) < KNIFE_EDGE_MM;
}
