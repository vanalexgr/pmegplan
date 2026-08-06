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
 * Widest a scallop is cut, in mm.
 *
 * Not the ostium. A fenestration is cut to the vessel it serves, but a scallop
 * is a broad relief in the edge, and it is the width that lets the edge sit
 * above the vessel without the corners of the cut fouling it. All three
 * scallops in the reference series are 20 mm wide — for an 8 mm coeliac twice
 * and for an SMA once.
 *
 * There is no single right width, and this is a ceiling rather than a law.
 * Manufactured scallops run from 10 mm on the off-the-shelf Zenith Fenestrated
 * to 30 mm on a custom arch device; what is right scales with the vessel and
 * the aorta it sits in. What every specification does share is that the height
 * is at least half the width, so the cut is always a well-formed U. That is the
 * constraint `placeScallop` enforces when a device cannot sit deep enough to
 * carry the full width.
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
  /**
   * Circumferential width of the scallop, in mm. Defaults to
   * `SCALLOP_WIDTH_MM`.
   *
   * A design choice rather than something the anatomy dictates, which is why it
   * is an input: manufactured scallops run from 10 mm on the off-the-shelf
   * fenestrated device to 30 mm on a custom arch one, and what is right scales
   * with the vessel and the aorta it sits in.
   */
  scallopWidthMm?: number;
  /**
   * Depth of the scallop cut, in mm. Defaults to what the healthy aorta above
   * the scalloped vessel allows — see `defaultScallopHeightMm`.
   *
   * Specifying it is what makes a plan comparable across devices. Left to fall
   * out of each device's own pose, the same anatomy gave cuts of 8.5, 20.3 and
   * 25.0 mm on the three scanned grafts, which is three different operations
   * rather than three ways of doing one. Fixed here, the cut is the same on all
   * of them and what differs is whether a device can carry it.
   */
  scallopHeightMm?: number;
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
  /** Width the scallop is to be cut, in mm. Meaningless when none is. */
  scallopWidthMm: number;
  /**
   * Depth the scallop is to be cut, in mm, when one was asked for by name.
   * Null when nothing is scalloped or when the depth is left to the default.
   */
  scallopHeightMm: number | null;
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

/**
 * A graft's circumference, which on a tapered device depends where you measure.
 *
 * Placement needs both: the reference frame the strut map and clearance raster
 * live in, and the true width at the depth an opening actually sits, which is
 * what a tape round the graft would read and what a hole has to be marked from.
 */
export interface GraftCircumference {
  /** At the proximal fabric edge, in mm. The frame the wire map is in. */
  circumferenceMm: number;
  /** At a depth below that edge, in mm. */
  circumferenceAtDepthMm(depthMm: number): number;
}

/** A cylinder, for callers and tests that have no tapered device in hand. */
export function uniformCircumference(
  circumferenceMm: number,
): GraftCircumference {
  return { circumferenceMm, circumferenceAtDepthMm: () => circumferenceMm };
}

export interface PlacedOpening {
  vessel: NormalizedVessel;
  /** Depth below the proximal fabric edge, in mm. */
  depthMm: number;
  /**
   * Circumferential position after rotation, in mm round the graft *at this
   * opening's own depth*. Marking from it means running the tape at the level
   * the hole sits, not at the fabric edge.
   */
  arcMm: number;
  /**
   * The same position as a fraction of a turn, which is what the anatomy
   * actually fixes. Millimetres are this times whatever the graft measures
   * where they are being counted, so it is this that survives a taper.
   */
  turnFraction: number;
  /** Circumference at this opening's depth, in mm. */
  circumferenceMm: number;
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
  const {
    vessels,
    fenestrate,
    scallop = [],
    scallopWidthMm = SCALLOP_WIDTH_MM,
    scallopHeightMm: requestedScallopHeightMm,
    cover = [],
  } = anatomyCase;

  if (!(scallopWidthMm > 0)) {
    throw new Error("Scallop width must be greater than 0 mm.");
  }
  if (
    requestedScallopHeightMm !== undefined &&
    !(requestedScallopHeightMm > 0)
  ) {
    throw new Error("Scallop depth must be greater than 0 mm.");
  }

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

  for (const name of scalloped) {
    // A renal takes a fenestration and a bridging stent. Scalloping one would
    // put the cut below the whole visceral segment and leave the vessel without
    // the sealed junction it is the point of treating.
    if (isRenal(name)) {
      throw new Error(`${name} is a renal artery and takes a fenestration, not a scallop.`);
    }
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

  // A scallop is a cut in the fabric edge, so it has to be the proximal-most
  // thing cut. A vessel *preserved* above it is a different matter and a common
  // one: keeping the coeliac clear of the fabric altogether still leaves the
  // edge free to be scalloped for the SMA below it. All a preserved vessel does
  // is cap the push-in, which `proximalDepthLimit` already handles.
  if (scallopVessel) {
    const cutAbove = normalized.filter(
      (vessel) =>
        vessel.zMm > scallopVessel.zMm && vessel.treatment === "fenestration",
    );
    if (cutAbove.length > 0) {
      throw new Error(
        `${scallopVessel.name} is scalloped, so the fabric edge is cut there — ${cutAbove
          .map((vessel) => vessel.name)
          .join(", ")} cannot be fenestrated above it.`,
      );
    }
  }
  const fenestrationZ = fenestrations.map((vessel) => vessel.zMm);
  const proximalFenestrationZMm =
    fenestrationZ.length > 0 ? Math.max(...fenestrationZ) : null;

  // Preserving a vessel means keeping it clear of the fabric, and the fabric
  // starts above the first fenestration. Anything preserved below that is under
  // fabric whatever the pose, so leaving it preserved is not a plan but a
  // mistake — and one that reads as a device failure rather than an input
  // error, because it caps the push-in below the seal minimum and every device
  // is refused.
  if (proximalFenestrationZMm !== null) {
    const buried = normalized.filter(
      (vessel) =>
        vessel.treatment === "preserve" && vessel.zMm < proximalFenestrationZMm,
    );
    if (buried.length > 0) {
      throw new Error(
        `${buried
          .map((vessel) => vessel.name)
          .join(", ")} would be under the fabric, below the first fenestration — ${
          buried.length > 1 ? "they cannot" : "it cannot"
        } be preserved there. Fenestrate or cover ${
          buried.length > 1 ? "them" : "it"
        }.`,
      );
    }
  }

  return {
    vessels: normalized,
    fenestrations,
    scalloped: scallopVessel,
    scallopWidthMm,
    scallopHeightMm:
      scallopVessel === null ? null : requestedScallopHeightMm ?? null,
    preserved: normalized.filter((vessel) => vessel.treatment === "preserve"),
    datumVesselName: datum.vessel.name,
    proximalFenestrationZMm,
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
 * Normally the seal rule: the first hole needs fabric above it.
 *
 * With a scallop the edge is already cut, and what bounds the pose instead is
 * that the cut has to clear the vessel it was made for. Push the pattern in a
 * millimetre and the cut deepens by the same millimetre, so at the separation
 * exactly the fabric edge lies across the ostium's centre. Requiring the
 * ostium's own radius on top puts the edge level with its cranial rim, which is
 * the shallowest pose at which any of the vessel is relieved at all.
 *
 * It matters because the depth search stops at this floor and a device that
 * cannot go deeper would otherwise be handed back a scallop of no height, which
 * is not a shallower scallop but a covered vessel.
 */
export function minProximalDepthMm(anatomy: NormalizedAnatomy): number {
  const separation = scallopSeparationMm(anatomy);
  if (separation === null || anatomy.scalloped === null) {
    return MIN_PROXIMAL_FENESTRATION_DEPTH_MM;
  }
  return separation + anatomy.scalloped.ostiumDiameterMm / 2;
}

/**
 * Height of the scallop a pose implies, in mm — the fabric taken off the edge
 * so that none of it crosses the scalloped vessel.
 *
 * The cut runs past the ostium's centre to its caudal rim, so the whole vessel
 * is relieved rather than half of it. That is a radius more than the figure a
 * Cook plan sheet quotes, which is measured from the edge to the vessel centre
 * and is what `ScallopBridge.toCentreMm` reports; both are kept, because the
 * one to state on a plan and the one to cut to are not the same number.
 */
export function scallopHeightMm(
  anatomy: NormalizedAnatomy,
  pose: GraftPose,
): number | null {
  const separation = scallopSeparationMm(anatomy);
  if (separation === null || anatomy.scalloped === null) return null;
  return (
    pose.proximalDepthMm - separation + anatomy.scalloped.ostiumDiameterMm / 2
  );
}

/**
 * Push-in a scallop of a given depth implies, in mm.
 *
 * The inverse of `scallopHeightMm`, and the reason a specified cut leaves the
 * solver only one degree of freedom. Fixing where the cut ends relative to the
 * vessel fixes where the fabric edge is, and the fabric edge is the push-in.
 */
export function pushInForScallopMm(
  anatomy: NormalizedAnatomy,
  heightMm: number,
): number | null {
  const separation = scallopSeparationMm(anatomy);
  if (separation === null || anatomy.scalloped === null) return null;
  return heightMm + separation - anatomy.scalloped.ostiumDiameterMm / 2;
}

/**
 * The cut to make when none was specified, in mm.
 *
 * Taken from the aorta rather than from any device: what a scallop is for is to
 * let the fabric edge sit as high in the healthy neck as that neck allows, and
 * how much neck there is has nothing to do with which graft is chosen. Deriving
 * it here is what gives all three devices the same cut to be judged against.
 */
export function defaultScallopHeightMm(
  anatomy: NormalizedAnatomy,
  maxPushInMm: number,
): number | null {
  if (!Number.isFinite(maxPushInMm)) return null;
  return scallopHeightMm(anatomy, {
    proximalDepthMm: maxPushInMm,
    rotationDeg: 0,
  });
}

/**
 * Depth of the scalloped vessel's centre below the fabric edge, in mm.
 *
 * The plan-sheet figure: nadir-to-centre, which the reference series states and
 * which this reproduces exactly. A radius shallower than the cut itself.
 */
export function scallopCentreDepthMm(
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
  /**
   * Circumferential centre after rotation, in mm round the graft. Measured at
   * the fabric edge, which is where the cut is marked out and where a tapered
   * graft is at its widest anyway.
   */
  arcMm: number;
  /** The same centre as a fraction of a turn. See `PlacedOpening.turnFraction`. */
  turnFraction: number;
  /**
   * The circumference `arcMm` and `semiArcMm` are measured against, in mm.
   *
   * The fabric edge's, unlike an opening's, because that is the rim the cut is
   * marked out from. Treating the width as a constant angle over the cut's
   * depth is then a small approximation on a tapered device — 1.3% over 29 mm
   * on the TX2 — and the direction that keeps the marked width the cut width.
   */
  circumferenceMm: number;
  /** Half the cut's circumferential width, in mm. */
  semiArcMm: number;
  /** Depth of the deepest point of the cut below the fabric edge, in mm. */
  heightMm: number;
  /**
   * Depth of the scalloped vessel's centre below the fabric edge, in mm — the
   * figure a Cook plan sheet quotes. A radius shallower than `heightMm`.
   */
  centreDepthMm: number;
}

/**
 * Height below which the pose has cut nothing, in mm.
 *
 * A pose that puts the fabric edge level with the scalloped vessel leaves no
 * scallop — and leaves that vessel worse off than either alternative, since the
 * edge crosses its ostium with no cut to relieve it. That is a device that
 * cannot carry the plan, not a scallop of no height, so nothing is placed.
 */
const MIN_CUT_MM = 0.5;

/**
 * Place the scalloped vessel's cut on the unrolled graft.
 *
 * Null when nothing is scalloped, and also when the pose leaves no cut to make
 * — see `MIN_CUT_MM`. Callers that need to tell those apart can ask the anatomy
 * whether a scallop was wanted.
 */
export function placeScallop(
  anatomy: NormalizedAnatomy,
  pose: GraftPose,
  graft: GraftCircumference,
): PlacedScallop | null {
  const vessel = anatomy.scalloped;
  const heightMm = scallopHeightMm(anatomy, pose);
  const centreDepthMm = scallopCentreDepthMm(anatomy, pose);
  if (
    vessel === null ||
    heightMm === null ||
    centreDepthMm === null ||
    heightMm < MIN_CUT_MM
  ) {
    return null;
  }

  const requestedWidthMm = anatomy.scallopWidthMm;
  const turnFraction = wrapTurn(vessel.clockFraction - pose.rotationDeg / 360);
  return {
    vessel,
    turnFraction,
    circumferenceMm: graft.circumferenceMm,
    arcMm: turnFraction * graft.circumferenceMm,
    // A cut cannot be wider than twice its depth without ceasing to be a U:
    // the semicircular base alone is a half-width deep. Where the device cannot
    // sit deep enough for the full width, the cut narrows to the widest
    // semicircle that fits rather than flattening into a saucer nothing is
    // manufactured as. The width that comes back is the width to cut.
    semiArcMm: Math.min(requestedWidthMm / 2, heightMm),
    heightMm,
    centreDepthMm,
  };
}

/**
 * Depth of the cut edge at an offset from the scallop's centre, in mm. Zero
 * outside the cut, where the fabric edge is still the fabric edge.
 *
 * One profile, always: a U, with straight sides running down from the edge and
 * closed by a semicircle of the cut's own half-width, so the vessel sits in a
 * round bottom rather than in square corners — which is both how a scallop is
 * cut and where the fabric would otherwise tear. A cut only half as deep as it
 * is wide is the limiting case, a bare semicircle with no sides.
 *
 * It cannot be shallower than that, because `placeScallop` narrows the width
 * before it comes to this. A cut that stayed 20 mm wide at 8 mm deep would have
 * to bulge into a saucer, and nothing is manufactured that shape.
 */
export function scallopEdgeDepthMm(
  scallop: PlacedScallop,
  arcOffsetMm: number,
): number {
  const { semiArcMm, heightMm } = scallop;
  if (Math.abs(arcOffsetMm) >= semiArcMm || heightMm <= 0) return 0;
  const across = Math.sqrt(1 - (arcOffsetMm / semiArcMm) ** 2);
  return Math.max(0, heightMm - semiArcMm) + semiArcMm * across;
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

/**
 * A point on the graft: how far round, and how far down.
 *
 * Round is a fraction of a turn rather than millimetres, because the two things
 * being compared here sit at different depths and, on a tapered graft, a turn
 * is a different number of millimetres at each of them.
 */
interface SurfacePoint {
  turnFraction: number;
  depthMm: number;
}

/** Signed shortest way round between two turn fractions, in turns. */
function turnGap(fromFraction: number, toFraction: number): number {
  const raw = ((toFraction - fromFraction) % 1) + 1.5;
  return (raw % 1) - 0.5;
}

/** Points along a scallop's cut boundary: down one side, round, and up. */
function cutBoundary(
  scallop: PlacedScallop,
  graft: GraftCircumference,
  steps = 160,
): SurfacePoint[] {
  const points: SurfacePoint[] = [];
  // The cut is marked out at the fabric edge, so its width is millimetres of
  // the graft's widest circumference and converts to a turn by that.
  const toTurn = (offsetMm: number) =>
    scallop.turnFraction + offsetMm / graft.circumferenceMm;

  // The rounded bottom.
  for (let step = 0; step <= steps; step += 1) {
    const offsetMm = scallop.semiArcMm * (-1 + (2 * step) / steps);
    points.push({
      turnFraction: toTurn(offsetMm),
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
        turnFraction: toTurn(side * scallop.semiArcMm),
        depthMm,
      });
    }
  }
  return points;
}

export function measureScallopBridge(
  scallop: PlacedScallop,
  openings: PlacedOpening[],
  graft: GraftCircumference,
): ScallopBridge | null {
  if (openings.length === 0) return null;

  const boundary = cutBoundary(scallop, graft);
  let nearest: ScallopBridge | null = null;

  /**
   * Distance across the fabric between two points, in mm.
   *
   * The circumferential part is a turn taken at the width midway between them,
   * because a run from a cut at the fabric edge to a renal 60 mm down crosses
   * fabric that has been narrowing the whole way. On a cylinder the mean is the
   * width; on the tapered device it is right to first order, which at these
   * separations is a few hundredths of a millimetre.
   */
  const spanMm = (from: SurfacePoint, to: SurfacePoint) => {
    const meanCircumferenceMm =
      (graft.circumferenceAtDepthMm(from.depthMm) +
        graft.circumferenceAtDepthMm(to.depthMm)) /
      2;
    return Math.hypot(
      turnGap(from.turnFraction, to.turnFraction) * meanCircumferenceMm,
      to.depthMm - from.depthMm,
    );
  };

  for (const opening of openings) {
    let edgeToEdgeMm = Number.POSITIVE_INFINITY;
    let overlapping = false;

    // Sampled rather than solved: the cut is a U and the opening an ellipse,
    // and the closest approach between them has no closed form worth the
    // trouble at a tenth of a millimetre.
    const rim: SurfacePoint[] = [];
    for (let step = 0; step < 120; step += 1) {
      const phi = (step / 120) * Math.PI * 2;
      rim.push({
        turnFraction:
          opening.turnFraction +
          (opening.semiArcMm * Math.cos(phi)) / opening.circumferenceMm,
        depthMm: opening.depthMm + opening.semiDepthMm * Math.sin(phi),
      });
    }

    const centre: SurfacePoint = {
      turnFraction: opening.turnFraction,
      depthMm: opening.depthMm,
    };

    for (const point of boundary) {
      // A cut boundary running inside the opening means the two are one
      // aperture, not a scallop with fabric under it.
      const dArc =
        turnGap(point.turnFraction, opening.turnFraction) *
        opening.circumferenceMm;
      const dDepth = point.depthMm - opening.depthMm;
      if (
        (dArc / opening.semiArcMm) ** 2 + (dDepth / opening.semiDepthMm) ** 2 <
        1
      ) {
        overlapping = true;
      }
      for (const rimPoint of rim) {
        const distanceMm = spanMm(point, rimPoint);
        if (distanceMm < edgeToEdgeMm) edgeToEdgeMm = distanceMm;
      }
    }

    // The other way round: an opening wholly inside the cut has no boundary
    // point of the cut within it, but is just as merged. Taken the short way
    // round, so a cut sitting on the 12:00 seam still sees an opening a few
    // millimetres the other side of it.
    for (const rimPoint of rim) {
      const offsetMm =
        turnGap(scallop.turnFraction, rimPoint.turnFraction) *
        graft.circumferenceMm;
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
        // The plan-sheet run: nadir to the opening's centre. Measured from the
        // vessel centre the cut was made for, not from the cut's own lowest
        // point, because that is the figure the reference series states.
        toCentreMm: centre.depthMm - scallop.centreDepthMm,
        edgeToEdgeMm,
        circumferenceFraction:
          (scallop.semiArcMm * 2) / graft.circumferenceMm,
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

/**
 * Project the fenestrations onto the graft for a given pose.
 *
 * The turn fraction is what the anatomy fixes and it is pose-invariant apart
 * from the rotation. Millimetres come from the graft's width at each opening's
 * own depth, so a hole on a tapered device is marked where a tape run round the
 * graft at that level would put it.
 */
export function placeOpenings(
  anatomy: NormalizedAnatomy,
  pose: GraftPose,
  graft: GraftCircumference,
): PlacedOpening[] {
  const edgeZMm = fabricEdgeZMm(anatomy, pose);
  const rotationFraction = pose.rotationDeg / 360;

  return anatomy.fenestrations.map((vessel) => {
    const size = openingHalfSize(vessel);
    const depthMm = edgeZMm - vessel.zMm;
    const circumferenceMm = graft.circumferenceAtDepthMm(depthMm);
    const turnFraction = wrapTurn(vessel.clockFraction - rotationFraction);
    return {
      vessel,
      depthMm,
      turnFraction,
      circumferenceMm,
      arcMm: turnFraction * circumferenceMm,
      ...size,
      radiusMm: Math.max(size.semiArcMm, size.semiDepthMm),
    };
  });
}

/** A fraction of a turn, brought into [0, 1). */
export function wrapTurn(fraction: number): number {
  return ((fraction % 1) + 1) % 1;
}

/**
 * An opening's position in the frame the strut map is in, in mm.
 *
 * The raster needs one frame with a constant wrap period, so conflict testing
 * happens at the proximal circumference for every depth. Angles are preserved
 * by that, which is what strut conflict turns on; only distances need bringing
 * back, and `ClearanceField.distanceAt` does it.
 */
export function referenceArcMm(
  turnFraction: number,
  graft: GraftCircumference,
): number {
  return wrapMm(turnFraction * graft.circumferenceMm, graft.circumferenceMm);
}
