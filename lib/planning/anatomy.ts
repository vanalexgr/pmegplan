import { parseClockFraction } from "@/lib/planning/clock";
import { wrapMm } from "@/lib/planning/geometry";

/**
 * Minimum depth of the most proximal closed fenestration below the proximal
 * fabric edge, in mm. Below this the graft has too little apposed fabric above
 * the first hole to seal.
 */
export const MIN_PROXIMAL_FENESTRATION_DEPTH_MM = 10;

/**
 * Narrowest fabric bridge in the reference series, in mm.
 *
 * Not a minimum. There is no universal one — what a bridge has to be is
 * platform-, anatomy- and manufacturer-specific, and CMD dimensions are not
 * transferable to a physician modification, where the reinforcement, fabric
 * handling and controlled deployment that let a manufacturer accept a close
 * relationship are all absent. This is only the tightest bridge a manufacturer
 * has been seen to accept in this series, so a plan below it is worth saying is
 * unprecedented here rather than worth refusing.
 */
export const NARROWEST_SERIES_BRIDGE_MM = 6;

/**
 * Circumferential width of a scallop, in mm.
 *
 * Not the ostium. A fenestration is cut to the vessel it serves, but all three
 * scallops in the reference series are 20 mm wide — for an 8 mm coeliac twice
 * and for an SMA once — because a scallop is a broad relief in the edge rather
 * than a hole the vessel has to line up with, and it is the width that lets the
 * edge sit above the vessel without the corners of the cut fouling it.
 */
export const SCALLOP_WIDTH_MM = 20;

/**
 * How each vessel is handled.
 *
 * - `fenestration` — takes a closed hole and joins the rigid pattern. The
 *   proximal seal rule applies above the most proximal one.
 * - `scallop` — the fabric edge is cut around the vessel rather than a hole
 *   punched through it, keeping it perfused without a bridging stent. The cut
 *   itself seals nothing: it trades the seal in its own sector for coverage
 *   everywhere else, and what seals is the fabric apposed to healthy aorta
 *   around it plus the full circumference below its deepest point. A scallop is
 *   what resolves anatomy where a vessel sits too close above the next to allow
 *   a closed hole with a seal of its own.
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
   * set it explicitly to carry a reinforcement allowance. Ignored when
   * `openingHeightMm` is given.
   */
  openingDiameterMm?: number;
  /**
   * Circumferential width of the opening, in mm. With `openingHeightMm` this
   * describes an egg-shaped opening — taller than it is wide — which some
   * prefer for the easier cannulation a longer axial opening gives. Both must
   * be set together; otherwise the opening is circular.
   */
  openingWidthMm?: number;
  /** Axial height of the opening, in mm. See `openingWidthMm`. */
  openingHeightMm?: number;
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
  /** Half the opening's circumferential width, in mm. */
  semiArcMm: number;
  /** Half the opening's axial height, in mm. */
  semiDepthMm: number;
  /**
   * Half the largest dimension, in mm. The circumscribed circle — kept for
   * drawing and for the coarse checks that do not need the ellipse.
   */
  radiusMm: number;
}

/** Half-dimensions of the opening a vessel calls for, in mm. */
export function openingHalfSize(vessel: AnatomyVessel): {
  semiArcMm: number;
  semiDepthMm: number;
} {
  if (vessel.openingWidthMm !== undefined && vessel.openingHeightMm !== undefined) {
    return {
      semiArcMm: vessel.openingWidthMm / 2,
      semiDepthMm: vessel.openingHeightMm / 2,
    };
  }
  const diameter = vessel.openingDiameterMm ?? vessel.ostiumDiameterMm;
  return { semiArcMm: diameter / 2, semiDepthMm: diameter / 2 };
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
    const isScalloped = scalloped.has(vessel.name);
    // A scallop is a cut at a clock position just as a hole is, and it is drawn
    // on the template, so an unstated clock would become a drawn claim.
    if ((isFenestrated || isScalloped) && vessel.clock === undefined) {
      throw new Error(
        `${vessel.name} is ${
          isFenestrated ? "fenestrated" : "scalloped"
        } and needs a clock position.`,
      );
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
 * Fixed by anatomy and untouched by the pose, because the pattern is rigid and
 * carries the cut with it. See `measureScallopBridge` for what it leaves.
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

/**
 * The scallop cut a pose implies, on the unrolled graft.
 *
 * A scallop is not a hole in the fabric but a notch taken out of its proximal
 * edge, so it is described by where the edge is cut and how far down the cut
 * runs rather than by a centre and a radius.
 */
export interface PlacedScallop {
  vessel: NormalizedVessel;
  /** Circumferential centre on the unrolled graft after rotation, in mm. */
  arcMm: number;
  /** Half the cut's circumferential width, in mm. */
  semiArcMm: number;
  /** Depth of the deepest point of the cut below the fabric edge, in mm. */
  heightMm: number;
}

/** Place the scalloped vessel's cut on the unrolled graft. Null when none. */
export function placeScallop(
  anatomy: NormalizedAnatomy,
  pose: GraftPose,
  circumferenceMm: number,
): PlacedScallop | null {
  const vessel = anatomy.scalloped;
  const heightMm = scallopHeightMm(anatomy, pose);
  if (vessel === null || heightMm === null) return null;

  const rotationFraction = pose.rotationDeg / 360;
  return {
    vessel,
    arcMm: wrapMm(
      (vessel.clockFraction - rotationFraction) * circumferenceMm,
      circumferenceMm,
    ),
    semiArcMm: SCALLOP_WIDTH_MM / 2,
    heightMm,
  };
}

/**
 * Depth of the cut edge at an offset from the scallop's centre, in mm. Zero
 * outside the cut, where the fabric edge is still the fabric edge.
 *
 * The profile is a U — straight sides running down from the edge, closed by a
 * semicircle of the cut's own half-width — so the vessel sits in a round bottom
 * rather than in square corners, which is both how a scallop is cut and where
 * the fabric would otherwise tear.
 */
export function scallopEdgeDepthMm(
  scallop: PlacedScallop,
  arcOffsetMm: number,
): number {
  const { semiArcMm, heightMm } = scallop;
  if (Math.abs(arcOffsetMm) >= semiArcMm) return 0;
  const round = Math.sqrt(semiArcMm * semiArcMm - arcOffsetMm * arcOffsetMm);
  return Math.max(0, heightMm - semiArcMm + round);
}

/**
 * What the fabric between a scallop and the openings below it actually is.
 *
 * Two numbers, because the one that is easy to quote is not the one that
 * matters. Nadir-to-centre is what a plan sheet states and what the reference
 * series can be compared on; it ignores the opening's own size and any
 * difference in clock, so it overstates the fabric on every case where the two
 * are not aligned. The edge-to-edge bridge is the fabric that is really there,
 * measured on the unrolled graft between the cut and the opening's rim.
 *
 * Neither is a verdict. There is no universal minimum bridge — see
 * `NARROWEST_SERIES_BRIDGE_MM` — and whether the remaining circumferential
 * fabric and healthy aortic length are enough is a judgement about the
 * pathology that no single distance answers.
 */
export interface ScallopBridge {
  /** Opening the cut comes closest to. */
  vesselName: string;
  /** Scallop nadir to that opening's centre, axially, in mm. */
  toCentreMm: number;
  /**
   * Shortest distance from the cut's boundary to that opening's rim, in mm.
   * Negative when the two would run into each other.
   */
  edgeToEdgeMm: number;
  /** Share of the circumference the cut spans, as a fraction. */
  circumferenceFraction: number;
}

/** Points along a scallop's cut boundary: down one side, round, and up. */
function cutBoundary(
  scallop: PlacedScallop,
  steps = 160,
): Array<{ arcMm: number; depthMm: number }> {
  const points: Array<{ arcMm: number; depthMm: number }> = [];
  // The rounded bottom.
  for (let step = 0; step <= steps; step += 1) {
    const offsetMm = scallop.semiArcMm * (-1 + (2 * step) / steps);
    points.push({
      arcMm: scallop.arcMm + offsetMm,
      depthMm: scallopEdgeDepthMm(scallop, offsetMm),
    });
  }
  // The straight sides, which are what a fenestration offset in clock from the
  // scallop comes nearest to.
  const shoulderMm = Math.max(0, scallop.heightMm - scallop.semiArcMm);
  for (let step = 1; step <= steps / 4; step += 1) {
    const depthMm = (step / (steps / 4)) * shoulderMm;
    for (const side of [-1, 1]) {
      points.push({
        arcMm: scallop.arcMm + side * scallop.semiArcMm,
        depthMm,
      });
    }
  }
  return points;
}

export function measureScallopBridge(
  scallop: PlacedScallop,
  openings: PlacedOpening[],
  circumferenceMm: number,
): ScallopBridge | null {
  if (openings.length === 0) return null;

  const boundary = cutBoundary(scallop);
  let nearest: ScallopBridge | null = null;

  /** Shortest way round from one arc position to another, in mm. */
  const arcGapMm = (fromMm: number, toMm: number) => {
    const raw = Math.abs(toMm - fromMm) % circumferenceMm;
    return raw > circumferenceMm / 2 ? circumferenceMm - raw : raw;
  };

  for (const opening of openings) {
    let edgeToEdgeMm = Number.POSITIVE_INFINITY;
    let overlapping = false;

    // Sampled rather than solved: the cut is a U and the opening an ellipse,
    // and the closest approach between them has no closed form worth the
    // trouble at a tenth of a millimetre.
    const rim: Array<{ arcMm: number; depthMm: number }> = [];
    for (let step = 0; step < 120; step += 1) {
      const phi = (step / 120) * Math.PI * 2;
      rim.push({
        arcMm: opening.arcMm + opening.semiArcMm * Math.cos(phi),
        depthMm: opening.depthMm + opening.semiDepthMm * Math.sin(phi),
      });
    }

    for (const point of boundary) {
      // A cut boundary running inside the opening means the two are one
      // aperture, not a scallop with fabric under it.
      const dArc = arcGapMm(point.arcMm, opening.arcMm);
      const dDepth = point.depthMm - opening.depthMm;
      if (
        (dArc / opening.semiArcMm) ** 2 + (dDepth / opening.semiDepthMm) ** 2 <
        1
      ) {
        overlapping = true;
      }
      for (const rimPoint of rim) {
        const distanceMm = Math.hypot(
          arcGapMm(rimPoint.arcMm, point.arcMm),
          rimPoint.depthMm - point.depthMm,
        );
        if (distanceMm < edgeToEdgeMm) edgeToEdgeMm = distanceMm;
      }
    }

    // The other way round: an opening wholly inside the cut has no boundary
    // point of the cut within it, but is just as merged.
    for (const rimPoint of rim) {
      const offsetMm = rimPoint.arcMm - scallop.arcMm;
      if (
        Math.abs(offsetMm) < scallop.semiArcMm &&
        rimPoint.depthMm < scallopEdgeDepthMm(scallop, offsetMm)
      ) {
        overlapping = true;
      }
    }

    if (overlapping) edgeToEdgeMm = -edgeToEdgeMm;

    if (nearest === null || edgeToEdgeMm < nearest.edgeToEdgeMm) {
      nearest = {
        vesselName: opening.vessel.name,
        toCentreMm: opening.depthMm - scallop.heightMm,
        edgeToEdgeMm,
        circumferenceFraction: (scallop.semiArcMm * 2) / circumferenceMm,
      };
    }
  }

  return nearest;
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

  return anatomy.fenestrations.map((vessel) => {
    const size = openingHalfSize(vessel);
    return {
      vessel,
      depthMm: edgeZMm - vessel.zMm,
      arcMm: wrapMm(
        (vessel.clockFraction - rotationFraction) * circumferenceMm,
        circumferenceMm,
      ),
      ...size,
      radiusMm: Math.max(size.semiArcMm, size.semiDepthMm),
    };
  });
}
