import { parseClockFraction } from "@/lib/planning/clock";
import { wrapMm } from "@/lib/planning/geometry";

/**
 * Minimum depth of the most proximal closed fenestration below the proximal
 * fabric edge, in mm. Below this the graft has too little apposed fabric above
 * the first hole to seal.
 */
export const MIN_PROXIMAL_FENESTRATION_DEPTH_MM = 10;

/**
 * Fabric required below a scallop before the next opening, in mm.
 *
 * A scallop cuts the fabric edge around its vessel, so nothing above the
 * scallop's base seals in that sector — the seal has to come from the fabric
 * *below* it instead. Every scalloped case in the reference series respects
 * this, one of them at exactly 10.0 mm.
 */
export const MIN_SEAL_BELOW_SCALLOP_MM = 10;

/**
 * How each vessel is handled.
 *
 * - `fenestration` — takes a closed hole and joins the rigid pattern. The
 *   proximal seal rule applies above the most proximal one.
 * - `scallop` — the fabric edge is cut around the vessel rather than a hole
 *   punched through it. Nothing above the scallop's base seals in that sector,
 *   so the seal comes from below: the next opening must sit at least
 *   `MIN_SEAL_BELOW_SCALLOP_MM` beneath it. A scallop is what resolves anatomy
 *   where a vessel sits too close above the next to allow a closed hole with a
 *   seal of its own.
 * - `preserve` — stays perfused without any cut, by keeping the whole fabric
 *   edge below its ostium. This is the SMA in a juxtarenal repair, and it is
 *   usually what limits how far the pattern can be pushed in.
 * - `cover` — intentionally sacrificed; constrains nothing.
 */
export type VesselTreatment = "fenestration" | "scallop" | "preserve" | "cover";

export interface AnatomyVessel {
  name: string;
  /**
   * Centreline distance from the previous vessel in the chain, in mm.
   * Zero for the most proximal vessel, which starts the chain.
   */
  gapFromPreviousMm: number;
  /**
   * Clock text on axial CT: 12:00 anterior, 3:00 the patient's left. Required
   * only for vessels being fenestrated — a preserved vessel is never cut, so
   * only its axial position matters.
   */
  clock?: string;
  ostiumDiameterMm: number;
  /**
   * Diameter of the opening to cut, in mm. Defaults to the ostium diameter;
   * set it explicitly to carry a reinforcement allowance.
   */
  openingDiameterMm?: number;
}

export interface AortaInput {
  /** Aortic diameter at the intended proximal seal zone, in mm. Drives sizing. */
  sealZoneDiameterMm: number;
  /**
   * Healthy aorta available cranial to the most proximal vessel, in mm.
   * Optional, and rarely the binding constraint when a preserved vessel already
   * caps the fabric edge.
   */
  proximalLandingLengthMm?: number;
}

export interface AnatomyCase {
  /**
   * Recorded rather than assumed, because a left/right inversion is silent and
   * unrecoverable once the graft is cut.
   */
  clockConvention: "axial_ct";
  /**
   * The whole splanchnic chain, proximal to distal — celiac and SMA included
   * even when only the renals are fenestrated, because an unfenestrated vessel
   * still caps how far the pattern can be pushed in.
   */
  vessels: AnatomyVessel[];
  /**
   * Names of the vessels taking a closed fenestration. Anything left out is
   * preserved unless listed in `scallop` or `cover`.
   */
  fenestrate: string[];
  /**
   * Names of vessels served by cutting the fabric edge rather than a closed
   * hole. Only the most proximal treated vessel can be scalloped, since a
   * scallop is an edge cut.
   */
  scallop?: string[];
  /** Names of vessels intentionally sacrificed, such as an accessory renal. */
  cover?: string[];
  aorta: AortaInput;
}

export interface NormalizedVessel extends AnatomyVessel {
  /** Cranial-positive axial position in mm, datum at the lowest renal ostium. */
  zMm: number;
  /** Circumferential position as a fraction of the circumference; 0 is 12:00. */
  clockFraction: number;
  /** Derived from the case's `fenestrate` and `cover` selections. */
  treatment: VesselTreatment;
}

export interface NormalizedAnatomy {
  vessels: NormalizedVessel[];
  /** Vessels taking a closed fenestration, ordered proximal to distal. */
  fenestrations: NormalizedVessel[];
  /** The scalloped vessel, if any. At most one, and the most proximal. */
  scalloped: NormalizedVessel | null;
  /** Vessels that must stay above the fabric edge, ordered proximal to distal. */
  preserved: NormalizedVessel[];
  /** Name of the vessel the axial datum was placed at. */
  datumVesselName: string;
  /** Axial position of the most proximal fenestration; null when there are none. */
  proximalFenestrationZMm: number | null;
  /** Axial span from the most proximal to the most distal fenestration, in mm. */
  fenestrationSpanMm: number;
}

/**
 * Pose of the hole pattern on the graft. The pattern is rigid: anatomy fixes
 * the holes relative to each other, so only these two values are free.
 */
export interface GraftPose {
  /** Depth of the most proximal fenestration below the fabric edge, in mm. */
  proximalDepthMm: number;
  /** Clockwise rotation applied to the graft at deployment, in degrees. */
  rotationDeg: number;
}

export interface PlacedOpening {
  vessel: NormalizedVessel;
  /** Depth below the proximal fabric edge, in mm. */
  depthMm: number;
  /** Circumferential position on the unrolled graft after rotation, in mm. */
  arcMm: number;
  /**
   * Radius that must stay clear of wire, in mm: half the opening's largest
   * dimension. The wire radius is added by the clearance test, matching
   * `getSafeThreshold`.
   */
  radiusMm: number;
}

function isRenal(name: string): boolean {
  const normalized = name.trim().toUpperCase();
  return normalized === "RRA" || normalized === "LRA" || normalized.includes("RENAL");
}

/**
 * Walk the measured vessel chain into a single cranial-positive axis and place
 * the datum at the lowest renal ostium. When no renal is present the most
 * distal vessel carries the datum instead.
 */
export function normalizeAnatomy(anatomyCase: AnatomyCase): NormalizedAnatomy {
  const { vessels, fenestrate, scallop = [], cover = [] } = anatomyCase;

  if (vessels.length === 0) {
    throw new Error("A case needs at least one vessel.");
  }

  const names = new Set<string>();
  for (const vessel of vessels) {
    if (names.has(vessel.name)) {
      throw new Error(`Vessel ${vessel.name} is listed more than once.`);
    }
    names.add(vessel.name);
  }

  for (const name of [...fenestrate, ...scallop, ...cover]) {
    if (!names.has(name)) {
      throw new Error(`${name} is selected but not in the measured chain.`);
    }
  }

  const fenestrated = new Set(fenestrate);
  const scalloped = new Set(scallop);
  const covered = new Set(cover);
  for (const name of fenestrated) {
    if (covered.has(name)) {
      throw new Error(`${name} cannot be both fenestrated and covered.`);
    }
    if (scalloped.has(name)) {
      throw new Error(`${name} cannot be both fenestrated and scalloped.`);
    }
  }
  for (const name of scalloped) {
    if (covered.has(name)) {
      throw new Error(`${name} cannot be both scalloped and covered.`);
    }
  }

  if (scalloped.size > 1) {
    throw new Error(
      "Only one vessel can be scalloped: a scallop is a cut in the fabric edge, and the edge is one place.",
    );
  }

  if (fenestrated.size === 0) {
    throw new Error("A case needs at least one fenestration.");
  }

  let running = 0;
  const chained = vessels.map((vessel, index) => {
    if (index > 0) {
      if (!(vessel.gapFromPreviousMm > 0)) {
        throw new Error(
          `Gap above ${vessel.name} must be greater than 0 mm.`,
        );
      }
      running -= vessel.gapFromPreviousMm;
    }
    return { vessel, rawZMm: running };
  });

  const renals = chained.filter((entry) => isRenal(entry.vessel.name));
  const datum = (renals.length > 0 ? renals : chained).reduce((lowest, entry) =>
    entry.rawZMm < lowest.rawZMm ? entry : lowest,
  );

  const normalized: NormalizedVessel[] = chained.map(({ vessel, rawZMm }) => {
    const isFenestrated = fenestrated.has(vessel.name);
    if (isFenestrated && vessel.clock === undefined) {
      throw new Error(`${vessel.name} is fenestrated and needs a clock position.`);
    }

    return {
      ...vessel,
      zMm: rawZMm - datum.rawZMm,
      clockFraction:
        vessel.clock === undefined ? 0 : parseClockFraction(vessel.clock),
      treatment: isFenestrated
        ? "fenestration"
        : scalloped.has(vessel.name)
          ? "scallop"
          : covered.has(vessel.name)
            ? "cover"
            : "preserve",
    };
  });

  const fenestrations = normalized.filter(
    (vessel) => vessel.treatment === "fenestration",
  );
  const scallopVessel =
    normalized.find((vessel) => vessel.treatment === "scallop") ?? null;

  // A scallop cuts the fabric edge, so nothing may be treated above it.
  if (scallopVessel) {
    const above = normalized.filter(
      (vessel) =>
        vessel.zMm > scallopVessel.zMm &&
        (vessel.treatment === "fenestration" || vessel.treatment === "preserve"),
    );
    if (above.length > 0) {
      throw new Error(
        `${scallopVessel.name} is scalloped, so the fabric edge is cut there — ${above
          .map((vessel) => vessel.name)
          .join(", ")} cannot be treated above it.`,
      );
    }
  }
  const fenestrationZ = fenestrations.map((vessel) => vessel.zMm);

  return {
    vessels: normalized,
    fenestrations,
    scalloped: scallopVessel,
    preserved: normalized.filter((vessel) => vessel.treatment === "preserve"),
    datumVesselName: datum.vessel.name,
    proximalFenestrationZMm:
      fenestrationZ.length > 0 ? Math.max(...fenestrationZ) : null,
    fenestrationSpanMm:
      fenestrationZ.length > 0
        ? Math.max(...fenestrationZ) - Math.min(...fenestrationZ)
        : 0,
  };
}

/**
 * Axial separation between the scalloped vessel and the first fenestration,
 * in mm. Null when nothing is scalloped.
 *
 * This is the fabric that does the sealing when the edge is cut, so the seal
 * rule applies to it rather than to the depth of the first hole.
 */
export function scallopSeparationMm(
  anatomy: NormalizedAnatomy,
): number | null {
  if (anatomy.scalloped === null || anatomy.proximalFenestrationZMm === null) {
    return null;
  }
  return anatomy.scalloped.zMm - anatomy.proximalFenestrationZMm;
}

/**
 * Shallowest the pattern may sit, in mm.
 *
 * Normally the seal rule: the first hole needs fabric above it. With a scallop
 * the edge is already cut, so what bounds the pose instead is that the scallop
 * base cannot sit above the fabric edge — which puts the first fenestration at
 * least the scallop separation down.
 */
export function minProximalDepthMm(anatomy: NormalizedAnatomy): number {
  const separation = scallopSeparationMm(anatomy);
  return separation === null ? MIN_PROXIMAL_FENESTRATION_DEPTH_MM : separation;
}

/**
 * Height of the scallop a pose implies, in mm — the fabric removed from the
 * edge down to the scalloped vessel.
 *
 * Derived rather than chosen: pushing the pattern deeper cuts a taller scallop.
 * Reproduces the height stated on all three scalloped plans in the reference
 * series exactly.
 */
export function scallopHeightMm(
  anatomy: NormalizedAnatomy,
  pose: GraftPose,
): number | null {
  const separation = scallopSeparationMm(anatomy);
  return separation === null ? null : pose.proximalDepthMm - separation;
}

/** Axial position of the proximal fabric edge implied by a pose, in mm. */
export function fabricEdgeZMm(
  anatomy: NormalizedAnatomy,
  pose: GraftPose,
): number {
  if (anatomy.proximalFenestrationZMm === null) {
    throw new Error("Pose requires at least one fenestration.");
  }
  return anatomy.proximalFenestrationZMm + pose.proximalDepthMm;
}

/** Project the fenestrations onto the unrolled graft for a given pose. */
export function placeOpenings(
  anatomy: NormalizedAnatomy,
  pose: GraftPose,
  circumferenceMm: number,
): PlacedOpening[] {
  const edgeZMm = fabricEdgeZMm(anatomy, pose);
  const rotationFraction = pose.rotationDeg / 360;

  return anatomy.fenestrations.map((vessel) => ({
    vessel,
    depthMm: edgeZMm - vessel.zMm,
    arcMm: wrapMm(
      (vessel.clockFraction - rotationFraction) * circumferenceMm,
      circumferenceMm,
    ),
    radiusMm: (vessel.openingDiameterMm ?? vessel.ostiumDiameterMm) / 2,
  }));
}
