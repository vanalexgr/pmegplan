import {
  MIN_PROXIMAL_FENESTRATION_DEPTH_MM,
  defaultScallopHeightMm,
  measureScallopBridge,
  minProximalDepthMm,
  openingHalfSize,
  placeOpenings,
  placeScallop,
  pushInForScallopMm,
  referenceArcMm,
  scallopHeightMm,
  scallopSeparationMm,
  type GraftCircumference,
  type GraftPose,
  type NormalizedAnatomy,
} from "@/lib/planning/anatomy";
import { ellipseClearanceMm } from "@/lib/planning/openingClearance";
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
  /** Scalloped, and the cut would run into the opening below it. */
  | "scallop_meets_opening"
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
  /**
   * Where the cut would have had to sit for this device to clear it, when a
   * specified scallop pinned the pose somewhere that does not.
   *
   * Null when the pose was not pinned, when it cleared, or when no depth in
   * range would have cleared — in which case the device cannot carry the plan
   * and naming a depth would be false comfort.
   */
  scallopRelief: {
    proximalDepthMm: number;
    /** The cut that depth would give, in mm. Shallower than the one asked for. */
    heightMm: number;
    marginMm: number;
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

  // Only what sits above the first fenestration can cap the push-in. A vessel
  // below it is already distal to the fabric edge however shallow the pose, so
  // its bound would be negative and would refuse every plan — `normalizeAnatomy`
  // rejects that case at the input instead, where it can be explained.
  const bounds = anatomy.preserved
    .filter((vessel) => vessel.zMm > proximalFenestrationZMm)
    .map((vessel) => ({
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
    scallopRelief: null,
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
 *
 * A scallop inverts that. The cut is what lets the fabric edge sit above its
 * vessel without covering it, so the aorta gained is sealed rather than merely
 * covered, and stopping at the vessel would cut a scallop of no height — which
 * is to say no scallop at all. Where one is present the deepest qualifying pose
 * wins instead, which is what all three scalloped plans in the reference series
 * did: 16 to 20 mm past the shallowest the seal rule would have allowed.
 */
export function solvePose(
  anatomy: NormalizedAnatomy,
  graft: GraftCircumference,
  field: ClearanceField,
  options: PoseSolveOptions,
): PoseSolution {
  if (anatomy.fenestrations.length === 0) {
    return emptySolution("no_fenestrations");
  }

  // The frame the strut map and the clearance raster are in. Conflict is an
  // angular question and this frame preserves angles exactly; the millimetres
  // the field hands back have already been brought onto the graft.
  const circumferenceMm = graft.circumferenceMm;

  const stepMm = options.stepMm ?? DEFAULT_STEP_MM;

  // The pattern is rigid, so the fabric between a scallop and the openings
  // below it is fixed by anatomy: no push-in can create fabric the vessels do
  // not leave, and none can take it away either. What is refused here is only
  // the geometric impossibility — a cut that runs into the opening, leaving one
  // merged aperture rather than a scallop and a hole. How much bridge is enough
  // is not decided here, because there is no universal answer to decide it by;
  // the plan reports both measures and leaves the judgement where it belongs.
  const separationMm = scallopSeparationMm(anatomy);
  if (separationMm !== null) {
    // Measured at a pose deep enough to cut the full U, which is where the
    // relationship is tightest; below that the cut is clipped and shallower.
    const referencePose: GraftPose = {
      proximalDepthMm: separationMm + anatomy.scallopWidthMm / 2,
      rotationDeg: 0,
    };
    const scallop = placeScallop(anatomy, referencePose, graft);
    const bridge =
      scallop &&
      measureScallopBridge(
        scallop,
        placeOpenings(anatomy, referencePose, graft),
        graft,
      );
    if (bridge && bridge.edgeToEdgeMm <= 0) {
      return emptySolution("scallop_meets_opening");
    }
  }

  const floorMm = options.minProximalDepthMm ?? minProximalDepthMm(anatomy);
  const fabricBoundMm = options.fabricLengthMm - anatomy.fenestrationSpanMm;
  const ceilingMm = Math.min(options.maxProximalDepthMm, fabricBoundMm);

  if (ceilingMm < floorMm) {
    return emptySolution(
      options.maxProximalDepthMm < floorMm
        ? "seal_zone_too_short"
        : "graft_too_short",
    );
  }

  // A scallop of a stated depth leaves the solver one degree of freedom, not
  // two. Where the cut ends relative to its vessel fixes where the fabric edge
  // is, and that is the push-in — so the depth search collapses to a point and
  // only the rotation is still free. That is what makes the same cut appear on
  // every device, with the difference between them being whether the lattice
  // lets it through rather than how deep it came out.
  //
  // Held inside what the neck and the fabric allow. A cut asked for deeper than
  // there is aorta to take it is made as deep as there is, and the placed
  // scallop reports the depth actually cut rather than the one requested.
  const requestedHeightMm =
    anatomy.scalloped === null
      ? null
      : anatomy.scallopHeightMm ??
        defaultScallopHeightMm(anatomy, options.maxProximalDepthMm);
  const pinnedDepthMm =
    requestedHeightMm === null
      ? null
      : pushInForScallopMm(anatomy, requestedHeightMm);

  const minDepthMm = floorMm;
  const maxDepthMm = ceilingMm;
  const heldDepthMm =
    pinnedDepthMm === null
      ? null
      : Math.min(ceilingMm, Math.max(floorMm, pinnedDepthMm));

  const proximalZMm = anatomy.proximalFenestrationZMm as number;
  const offsets = anatomy.fenestrations.map((vessel) => ({
    name: vessel.name,
    /** Depth below the most proximal fenestration, so depth = proximalDepth + this. */
    depthOffsetMm: proximalZMm - vessel.zMm,
    baseArcMm: vessel.clockFraction * circumferenceMm,
    size: openingHalfSize(vessel),
  }));

  // A circular opening reaches the same distance whichever way the wire lies,
  // so it needs one lookup. An egg-shaped one does not, and the ellipse test
  // costs two more — worth paying only where the shape is actually elliptical.
  const anyElliptical = offsets.some(
    (opening) =>
      Math.abs(opening.size.semiArcMm - opening.size.semiDepthMm) > 1e-9,
  );

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

  // With a scallop the fabric edge wants to be as high as the neck allows, so
  // the last qualifying depth row is taken rather than the first. See the
  // function's comment for why the two cases pull opposite ways.
  const preferDeepest = anatomy.scalloped !== null;

  let clearestValue = Number.NEGATIVE_INFINITY;
  let clearestDepthIndex = 0;
  let clearestRotationIndex = 0;
  let preferredDepthIndex = -1;
  let preferredRotationIndex = 0;
  let preferredValue = Number.NEGATIVE_INFINITY;
  let uncappedDepthIndex = -1;
  let uncappedTurnDeg = 0;
  let uncappedValue = Number.NEGATIVE_INFINITY;
  let heldDepthIndex = -1;
  let heldRotationIndex = 0;
  let heldValue = Number.NEGATIVE_INFINITY;

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
        const clearance = anyElliptical
          ? ellipseClearanceMm(
              field,
              arcMm,
              depthMm,
              opening.size,
              options.wireRadiusMm,
            )
          : field.distanceAt(arcMm, depthMm) -
            (opening.size.semiArcMm + options.wireRadiusMm);
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

    if (rowBestValue > clearestValue) {
      clearestValue = rowBestValue;
      clearestDepthIndex = depthIndex;
      clearestRotationIndex = rowBestRotationIndex;
    }

    // The row the specified cut pins the pose to. Held whatever it clears, so
    // that the cut is the one asked for; the rest of the sweep is kept only to
    // say what a different depth would have bought.
    if (heldDepthMm !== null && Math.abs(proximalDepthMm - heldDepthMm) <= stepMm / 2) {
      heldDepthIndex = depthIndex;
      heldRotationIndex =
        rowTurnRotationIndex >= 0 ? rowTurnRotationIndex : rowBestRotationIndex;
      heldValue = rowTurnRotationIndex >= 0 ? rowTurnValue : rowBestValue;
    }

    if (
      rowTurnRotationIndex >= 0 &&
      (preferDeepest || preferredDepthIndex < 0)
    ) {
      preferredDepthIndex = depthIndex;
      preferredRotationIndex = rowTurnRotationIndex;
      preferredValue = rowTurnValue;
    }

    if (
      rowUncappedMagnitudeDeg < Infinity &&
      (preferDeepest || uncappedDepthIndex < 0)
    ) {
      uncappedDepthIndex = depthIndex;
      uncappedTurnDeg = rowUncappedTurnDeg;
      uncappedValue = rowUncappedValue;
    }
  }

  // A specified cut takes the depth it implies and nothing else. Otherwise the
  // deepest pose meeting the clearance target, falling back to the clearest.
  const pinned = heldDepthIndex >= 0;
  const meetsTargetClearance = pinned
    ? heldValue >= targetClearanceMm
    : preferredDepthIndex >= 0;
  const chosenDepthIndex = pinned
    ? heldDepthIndex
    : meetsTargetClearance
      ? preferredDepthIndex
      : clearestDepthIndex;
  const chosenRotationIndex = pinned
    ? heldRotationIndex
    : meetsTargetClearance
      ? preferredRotationIndex
      : clearestRotationIndex;
  const bestValue = pinned
    ? heldValue
    : meetsTargetClearance
      ? preferredValue
      : clearestValue;

  // Where the cut would have had to sit for this device to clear it. Only worth
  // saying when the pose was pinned into a conflict and some other depth in
  // range is conflict-free — otherwise the device cannot carry the plan at all
  // and a depth to aim at would be false comfort. Always a shallower cut than
  // the one asked for, which is the cost being named.
  const reliefDepthMm =
    pinned && bestValue < 0 && clearestValue > 0
      ? minDepthMm + clearestDepthIndex * stepMm
      : null;
  const scallopRelief =
    reliefDepthMm === null
      ? null
      : {
          proximalDepthMm: reliefDepthMm,
          heightMm:
            scallopHeightMm(anatomy, {
              proximalDepthMm: reliefDepthMm,
              rotationDeg: 0,
            }) ?? 0,
          marginMm: clearestValue,
        };

  // Report the shorter way round: 340° clockwise is 20° the other way.
  const pose: GraftPose = {
    proximalDepthMm: minDepthMm + chosenDepthIndex * stepMm,
    rotationDeg: turnDegOf(chosenRotationIndex * rotationStepMm),
  };

  const clearances = placeOpenings(anatomy, pose, graft).map(
    (opening) => ({
      vesselName: opening.vessel.name,
      depthMm: opening.depthMm,
      arcMm: opening.arcMm,
      // Same test the pose was chosen by, so the per-hole figures and the
      // margin cannot disagree about the same opening. Queried in the raster's
      // frame — `opening.arcMm` is millimetres round the graft where the hole
      // sits, which on a tapered device is a different number.
      clearanceMm: ellipseClearanceMm(
        field,
        referenceArcMm(opening.turnFraction, graft),
        opening.depthMm,
        opening,
        options.wireRadiusMm,
      ),
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
    scallopRelief,
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
