import {
  MIN_PROXIMAL_FENESTRATION_DEPTH_MM,
  placeOpenings,
  type GraftPose,
  type NormalizedAnatomy,
} from "@/lib/planning/anatomy";
import type { ClearanceField } from "@/lib/planning/clearanceField";
import { wrapMm } from "@/lib/planning/geometry";

const DEFAULT_STEP_MM = 0.25;
/**
 * Clearance at which pushing the pattern deeper stops buying anything worth the
 * extra aortic coverage. Sized to absorb the 0.3 mm apex localisation quoted in
 * the bench-CT descriptors plus ordinary error in the measured anatomy.
 */
const DEFAULT_TARGET_CLEARANCE_MM = 1;
/**
 * Largest turn accepted at deployment. Poses needing more are discarded even
 * when they clear better, and the pattern is pushed in further instead.
 */
const DEFAULT_MAX_ROTATION_DEG = 45;

export type PoseStatus =
  | "conflict_free"
  | "best_compromise"
  /** No room for the seal below a preserved vessel; that vessel needs its own hole. */
  | "seal_zone_too_short"
  | "graft_too_short"
  | "no_fenestrations";

export interface PoseSolveOptions {
  /** Scan resolution in mm, applied to both depth and circumferential travel. */
  stepMm?: number;
  /** Seal rule. Defaults to `MIN_PROXIMAL_FENESTRATION_DEPTH_MM`. */
  minProximalDepthMm?: number;
  /**
   * Deepest the pattern may be pushed in, in mm, bounded by healthy aorta above
   * the first fenestration. See `maxProximalDepthFromAnatomy`.
   */
  maxProximalDepthMm: number;
  /** Fabric length available below the proximal edge, in mm. */
  fabricLengthMm: number;
  wireRadiusMm: number;
  /**
   * Clearance considered sufficient, in mm. The solver returns the shallowest
   * pose reaching it rather than the deepest-clearing one, because covering
   * more aorta has a real cost and clearance beyond this does not.
   */
  targetClearanceMm?: number;
  /**
   * Largest turn accepted at deployment, in degrees either way. Defaults to
   * `DEFAULT_MAX_ROTATION_DEG`. A shallow pose needing more than this is
   * rejected in favour of a deeper one that stays inside it.
   */
  maxRotationDeg?: number;
  /**
   * Rotation after which the strut lattice is assumed to repeat, in degrees.
   *
   * Defaults to a full turn, and should usually stay there. An idealised ring
   * repeats every 360/n, but measured rings have unevenly spaced apices, so
   * restricting the scan to one nominal period discards the very irregularity
   * the bench CT was taken to capture and settles for a worse position. Low
   * rotation is obtained instead by preferring the smallest turn that still
   * meets `targetClearanceMm`.
   */
  rotationPeriodDeg?: number;
}

export interface OpeningClearance {
  vesselName: string;
  depthMm: number;
  arcMm: number;
  /** Distance from the opening edge to the nearest wire, in mm. */
  clearanceMm: number;
}

export interface PoseMap {
  depthStartMm: number;
  depthStepMm: number;
  /** Circumferential travel between columns, in mm. */
  rotationStepMm: number;
  depthCount: number;
  rotationCount: number;
  /** Rotation span the columns cover, in degrees; one lattice period. */
  rotationPeriodDeg: number;
  /** Worst opening clearance in mm at each (depth, rotation) cell, row-major. */
  values: Float32Array;
}

export interface PoseSolution {
  status: PoseStatus;
  pose: GraftPose;
  /**
   * Worst opening clearance at `pose`, in mm. Because the pattern is rigid,
   * translating it by any distance up to this value cannot create a conflict,
   * so this doubles as the radius of the conflict-free neighbourhood — the
   * robustness of the plan, without simulating perturbed scenarios.
   */
  marginMm: number;
  /** Whether `marginMm` reached the requested target rather than merely clearing. */
  meetsTargetClearance: boolean;
  /**
   * A pose that would have met the target but needed a turn beyond
   * `maxRotationDeg`, when the capped answer falls short. Surfaces the trade
   * instead of silently returning the degraded pose.
   */
  excludedByTurnCap: {
    rotationDeg: number;
    marginMm: number;
    proximalDepthMm: number;
  } | null;
  clearances: OpeningClearance[];
  map: PoseMap | null;
}

/**
 * Deepest the pattern may be pushed in.
 *
 * Every preserved vessel caps the fabric edge at its inferior ostial margin,
 * since raising the edge past that would cover a vessel meant to stay perfused.
 * In a juxtarenal repair this is the SMA, and it is what makes the SMA-to-renal
 * distance decisive: the whole seal zone has to fit between the two.
 *
 * Ostium positions are taken as centres, so half the ostium diameter is
 * subtracted to reach the inferior margin.
 */
function greatestCommonDivisor(left: number, right: number): number {
  return right === 0 ? left : greatestCommonDivisor(right, left % right);
}

/**
 * Rotation after which a ring lattice maps back onto itself.
 *
 * A ring carrying n apices is n-fold symmetric whatever its phase, so a stack of
 * rings repeats every 360/gcd(counts) degrees. Uniform devices collapse to one
 * ring's period; a tapered device that changes apex count part-way down keeps
 * only the symmetry its counts share.
 */
export function rotationPeriodDegFromApexCounts(counts: number[]): number {
  const usable = counts.filter((count) => Number.isInteger(count) && count > 0);
  if (usable.length === 0) return 360;
  return 360 / usable.reduce(greatestCommonDivisor);
}

export interface ProximalDepthLimit {
  maxDepthMm: number;
  /**
   * Vessel that caps the push-in, or null when only the healthy-aorta length
   * does. When the seal will not fit, this names the vessel that has to take a
   * fenestration of its own.
   */
  limitingVesselName: string | null;
}

export function proximalDepthLimit(
  anatomy: NormalizedAnatomy,
  proximalLandingLengthMm?: number,
): ProximalDepthLimit {
  if (anatomy.proximalFenestrationZMm === null) {
    return { maxDepthMm: 0, limitingVesselName: null };
  }
  const proximalFenestrationZMm = anatomy.proximalFenestrationZMm;

  const bounds = anatomy.preserved.map((vessel) => ({
    maxDepthMm:
      vessel.zMm - vessel.ostiumDiameterMm / 2 - proximalFenestrationZMm,
    limitingVesselName: vessel.name as string | null,
  }));

  if (proximalLandingLengthMm !== undefined) {
    const highestVesselZMm = Math.max(
      ...anatomy.vessels.map((vessel) => vessel.zMm),
    );
    bounds.push({
      maxDepthMm:
        highestVesselZMm + proximalLandingLengthMm - proximalFenestrationZMm,
      limitingVesselName: null,
    });
  }

  if (bounds.length === 0) {
    return { maxDepthMm: Number.POSITIVE_INFINITY, limitingVesselName: null };
  }

  return bounds.reduce((tightest, bound) =>
    bound.maxDepthMm < tightest.maxDepthMm ? bound : tightest,
  );
}

export function maxProximalDepthFromAnatomy(
  anatomy: NormalizedAnatomy,
  proximalLandingLengthMm?: number,
): number {
  return proximalDepthLimit(anatomy, proximalLandingLengthMm).maxDepthMm;
}

function emptySolution(status: PoseStatus): PoseSolution {
  return {
    status,
    pose: { proximalDepthMm: MIN_PROXIMAL_FENESTRATION_DEPTH_MM, rotationDeg: 0 },
    marginMm: Number.NEGATIVE_INFINITY,
    meetsTargetClearance: false,
    excludedByTurnCap: null,
    clearances: [],
    map: null,
  };
}

/**
 * Find the graft pose that keeps every fenestration furthest from wire.
 *
 * The hole pattern is rigid — anatomy fixes the openings relative to each other
 * — so the only free parameters are how far the pattern sits below the fabric
 * edge and how far the graft is rotated. Both are scanned together rather than
 * sequentially, because a depth that looks best on its own can foreclose the
 * rotation that would have cleared every hole.
 *
 * Among poses that clear the wire, the shallowest one reaching
 * `targetClearanceMm` wins. Maximising clearance outright would push the fabric
 * edge as far cranially as the constraints allow, buying fractions of a
 * millimetre of wire clearance at the cost of real aortic coverage.
 */
export function solvePose(
  anatomy: NormalizedAnatomy,
  circumferenceMm: number,
  field: ClearanceField,
  options: PoseSolveOptions,
): PoseSolution {
  if (anatomy.fenestrations.length === 0) {
    return emptySolution("no_fenestrations");
  }

  const stepMm = options.stepMm ?? DEFAULT_STEP_MM;
  const minDepthMm = options.minProximalDepthMm ?? MIN_PROXIMAL_FENESTRATION_DEPTH_MM;
  const fabricBoundMm = options.fabricLengthMm - anatomy.fenestrationSpanMm;
  const maxDepthMm = Math.min(options.maxProximalDepthMm, fabricBoundMm);

  if (maxDepthMm < minDepthMm) {
    return emptySolution(
      options.maxProximalDepthMm < minDepthMm
        ? "seal_zone_too_short"
        : "graft_too_short",
    );
  }

  const proximalZMm = anatomy.proximalFenestrationZMm as number;
  const offsets = anatomy.fenestrations.map((vessel) => ({
    name: vessel.name,
    /** Depth below the most proximal fenestration, so depth = proximalDepth + this. */
    depthOffsetMm: proximalZMm - vessel.zMm,
    baseArcMm: vessel.clockFraction * circumferenceMm,
    thresholdMm:
      (vessel.openingDiameterMm ?? vessel.ostiumDiameterMm) / 2 +
      options.wireRadiusMm,
  }));

  const rotationPeriodDeg = Math.min(options.rotationPeriodDeg ?? 360, 360);
  const rotationArcMm = (circumferenceMm * rotationPeriodDeg) / 360;
  const depthCount = Math.max(1, Math.floor((maxDepthMm - minDepthMm) / stepMm) + 1);
  // Divide the period into whole steps so the samples tile it exactly. Rounding
  // instead would leave a ragged remainder and sample the lattice unevenly.
  const rotationCount = Math.max(1, Math.ceil(rotationArcMm / stepMm));
  const rotationStepMm = rotationArcMm / rotationCount;
  const values = new Float32Array(depthCount * rotationCount);

  const targetClearanceMm =
    options.targetClearanceMm ?? DEFAULT_TARGET_CLEARANCE_MM;

  let deepestValue = Number.NEGATIVE_INFINITY;
  let deepestDepthIndex = 0;
  let deepestRotationIndex = 0;
  let shallowestDepthIndex = -1;
  let shallowestRotationIndex = 0;
  let shallowestValue = Number.NEGATIVE_INFINITY;
  let uncappedDepthIndex = -1;
  let uncappedTurnDeg = 0;
  let uncappedValue = Number.NEGATIVE_INFINITY;

  const maxRotationDeg = options.maxRotationDeg ?? DEFAULT_MAX_ROTATION_DEG;
  const turnDegOf = (travelMm: number) => {
    const deg = (travelMm / circumferenceMm) * 360;
    return deg > 180 ? deg - 360 : deg;
  };

  for (let depthIndex = 0; depthIndex < depthCount; depthIndex += 1) {
    const proximalDepthMm = minDepthMm + depthIndex * stepMm;
    const rowBase = depthIndex * rotationCount;
    let rowBestValue = Number.NEGATIVE_INFINITY;
    let rowBestRotationIndex = 0;
    let rowTurnRotationIndex = -1;
    let rowTurnValue = Number.NEGATIVE_INFINITY;
    let rowTurnMagnitudeDeg = Number.POSITIVE_INFINITY;
    let rowUncappedTurnDeg = 0;
    let rowUncappedValue = Number.NEGATIVE_INFINITY;
    let rowUncappedMagnitudeDeg = Number.POSITIVE_INFINITY;

    for (let rotationIndex = 0; rotationIndex < rotationCount; rotationIndex += 1) {
      const travelMm = rotationIndex * rotationStepMm;
      let worst = Number.POSITIVE_INFINITY;

      for (const opening of offsets) {
        const arcMm = wrapMm(opening.baseArcMm - travelMm, circumferenceMm);
        const depthMm = proximalDepthMm + opening.depthOffsetMm;
        const clearance =
          field.distanceAt(arcMm, depthMm) - opening.thresholdMm;
        if (clearance < worst) worst = clearance;
      }

      // The map keeps every pose, including ones the turn cap rules out, so a
      // reader can see what was given up.
      values[rowBase + rotationIndex] = worst;

      const turnDeg = turnDegOf(travelMm);
      const magnitudeDeg = Math.abs(turnDeg);

      if (
        worst >= targetClearanceMm &&
        magnitudeDeg < rowUncappedMagnitudeDeg
      ) {
        rowUncappedMagnitudeDeg = magnitudeDeg;
        rowUncappedTurnDeg = turnDeg;
        rowUncappedValue = worst;
      }

      if (magnitudeDeg > maxRotationDeg) continue;

      if (worst > rowBestValue) {
        rowBestValue = worst;
        rowBestRotationIndex = rotationIndex;
      }

      if (worst >= targetClearanceMm && magnitudeDeg < rowTurnMagnitudeDeg) {
        rowTurnMagnitudeDeg = magnitudeDeg;
        rowTurnRotationIndex = rotationIndex;
        rowTurnValue = worst;
      }
    }

    if (rowBestValue > deepestValue) {
      deepestValue = rowBestValue;
      deepestDepthIndex = depthIndex;
      deepestRotationIndex = rowBestRotationIndex;
    }

    if (shallowestDepthIndex < 0 && rowTurnRotationIndex >= 0) {
      shallowestDepthIndex = depthIndex;
      shallowestRotationIndex = rowTurnRotationIndex;
      shallowestValue = rowTurnValue;
    }

    if (uncappedDepthIndex < 0 && rowUncappedMagnitudeDeg < Infinity) {
      uncappedDepthIndex = depthIndex;
      uncappedTurnDeg = rowUncappedTurnDeg;
      uncappedValue = rowUncappedValue;
    }
  }

  const meetsTargetClearance = shallowestDepthIndex >= 0;
  const chosenDepthIndex = meetsTargetClearance
    ? shallowestDepthIndex
    : deepestDepthIndex;
  const chosenRotationIndex = meetsTargetClearance
    ? shallowestRotationIndex
    : deepestRotationIndex;
  const bestValue = meetsTargetClearance ? shallowestValue : deepestValue;

  // Report the shorter way round: 340° clockwise is 20° the other way.
  const pose: GraftPose = {
    proximalDepthMm: minDepthMm + chosenDepthIndex * stepMm,
    rotationDeg: turnDegOf(chosenRotationIndex * rotationStepMm),
  };

  const clearances = placeOpenings(anatomy, pose, circumferenceMm).map(
    (opening) => ({
      vesselName: opening.vessel.name,
      depthMm: opening.depthMm,
      arcMm: opening.arcMm,
      clearanceMm:
        field.distanceAt(opening.arcMm, opening.depthMm) -
        opening.radiusMm -
        options.wireRadiusMm,
    }),
  );

  return {
    status: bestValue >= 0 ? "conflict_free" : "best_compromise",
    pose,
    marginMm: bestValue,
    meetsTargetClearance,
    excludedByTurnCap:
      !meetsTargetClearance && uncappedDepthIndex >= 0
        ? {
            rotationDeg: uncappedTurnDeg,
            marginMm: uncappedValue,
            proximalDepthMm: minDepthMm + uncappedDepthIndex * stepMm,
          }
        : null,
    clearances,
    map: {
      depthStartMm: minDepthMm,
      depthStepMm: stepMm,
      rotationStepMm,
      depthCount,
      rotationCount,
      rotationPeriodDeg,
      values,
    },
  };
}
