import {
  MIN_PROXIMAL_FENESTRATION_DEPTH_MM,
  measureScallopBridge,
  normalizeAnatomy,
  placeOpenings,
  placeScallop,
  type AnatomyCase,
  type NormalizedAnatomy,
  type PlacedOpening,
  type PlacedScallop,
  type ScallopBridge,
} from "@/lib/planning/anatomy";
import {
  buildClearanceField,
  type ClearanceField,
} from "@/lib/planning/clearanceField";
import {
  proximalDepthLimit,
  solvePose,
  type PoseSolution,
  type ProximalDepthLimit,
} from "@/lib/planning/poseSolver";
import {
  CT_SCAN_REFERENCES,
  describeCtDevice,
  getMeasuredCtScanModel,
  type CtDeviceNaming,
  type CtScanId,
  type MeasuredCtScanModel,
} from "@/lib/ctDeviceCatalog";
import {
  buildBenchCtRenderModel,
  type BenchCtRenderModel,
} from "@/lib/geometry/benchCtRenderModel";
import type { BenchCtDeviceDescriptor } from "@/lib/geometry/benchCtDeviceLibrary";
import { buildBenchCtStrutSegments } from "@/lib/stentGeometry";
import type { StrutSegment } from "@/lib/types";

/**
 * Fabric wanted below the most distal fenestration, in mm. Not a seal in the
 * proximal sense — the distal end is usually extended with a further component
 * — but a component that ends immediately below the lowest hole leaves nothing
 * to overlap into.
 */
const DEFAULT_DISTAL_ALLOWANCE_MM = 30;

/**
 * Radial oversizing accepted at the proximal seal, as a fraction of the aortic
 * diameter. Too little and the graft will not appose; too much and the fabric
 * infolds, which both leaks and distorts the strut spacing this planner relies
 * on being measured.
 */
const MIN_OVERSIZE = 0.1;
const MAX_OVERSIZE = 0.3;

/**
 * Clearance fields cost a few hundred milliseconds to build and depend only on
 * the scanned device, so they are shared process-wide rather than rebuilt per
 * caller. Nothing here varies with the anatomy being planned.
 */
const sharedModelCache = new Map<string, GraftModel>();

export interface PlanOptions {
  /** Restrict to one scanned device. Omit to take whichever plans better. */
  scanId?: CtScanId;
  targetClearanceMm?: number;
  maxRotationDeg?: number;
  distalAllowanceMm?: number;
  /** Scan resolution in mm. Coarser trades accuracy for responsiveness. */
  stepMm?: number;
}

/** Everything one scanned device contributes to a plan. */
export interface GraftModel {
  scan: MeasuredCtScanModel;
  /** Platform, component code and ordered size, for anything user-facing. */
  naming: CtDeviceNaming;
  /** Free-state render model, carrying the fabric edges and bare rings. */
  renderModel: BenchCtRenderModel;
  /**
   * Labelled proximal diameter, in mm. Oversizing is judged against this
   * because it is what the IFU range refers to and what a surgeon sizes from.
   * See `sealingRing.diameterMm` for what the scan measured there.
   */
  proximalDiameterMm: number;
  sealingRing: SealingRing;
  circumferenceMm: number;
  fabricLengthMm: number;
  wireRadiusMm: number;
  /**
   * Measured wire on the unrolled graft, in (arc mm, depth-below-fabric-edge mm).
   * Depths above the proximal fabric edge are negative: on both Zenith Alpha
   * scans the bare fixation ring sits about 12 mm proximal to the fabric.
   */
  segments: StrutSegment[];
  /** How the wire was obtained, and how well it matches the scan. */
  wireProvenance: WireProvenance;
  field: ClearanceField;
}

/**
 * The most proximal covered ring — the one that does the sealing.
 *
 * It is not a body ring repeated. On both Zenith Alpha scans it is taller and
 * about 1.5 mm narrower than the rings below it; on the TX2 it is 7 mm taller
 * and 9 mm wider, being the large end of the taper. Since the seal zone and
 * usually the first fenestration both fall inside it, its geometry is what the
 * proximal part of the plan actually contends with.
 */
export interface SealingRing {
  /**
   * Measured diameter across this ring, in mm.
   *
   * Not the device's size and not what oversizing is judged on. It is the 90th
   * percentile radius of this ring's *metal*, doubled, so it sits inside the
   * fabric's outer surface by roughly the fabric thickness plus the wire. On
   * top of that the proximal ring is genuinely narrower than the body in the
   * free state — 40.7 against 42.3 on scan1, 29.8 against 31.6 on scan3 —
   * because nothing holds the end open on the bench.
   */
  diameterMm: number;
  /** Apex-to-apex height, in mm. */
  heightMm: number;
  apexCount: number;
  /** Depth of its proximal apices below the fabric edge, in mm. */
  fromDepthMm: number;
  /** Depth of its distal apices below the fabric edge, in mm. */
  toDepthMm: number;
  /** Median height of the rings below it, in mm. */
  bodyHeightMm: number;
  /** Median diameter of the rings below it, in mm. */
  bodyDiameterMm: number;
  /** Whether it is a different stent from the body rings. */
  differsFromBody: boolean;
}

/**
 * Where the strut geometry came from.
 *
 * `segmented` means the wire is the scan's own metal segmentation. `apex_model`
 * means it was interpolated between a dozen or so apices per ring, which is a
 * plausible path rather than a measured one — the distinction matters, because
 * clearance is decided against whichever it is.
 */
export interface WireProvenance {
  source: "segmented" | "apex_model";
  /** Distinct wire strokes carried, versus apex rows the descriptor stores. */
  segmentCount: number;
  apexCount: number;
  /**
   * Median distance from a stored apex to the nearest segmented metal, in mm.
   * Null on an apex model, where there is nothing independent to check against.
   */
  apexAgreementMm: number | null;
}

/**
 * How one scanned device measures up, and what it would give if used.
 *
 * Every device that suits the seal zone is solved, not just the one that wins,
 * so the choice between them can be made on their actual poses rather than on
 * oversizing alone. A device set aside on sizing carries no solution.
 */
export interface DeviceFit {
  model: GraftModel;
  oversizeFraction: number;
  /**
   * Set when oversizing falls outside the usual window. The device is still
   * planned and selectable — with a three-device library, refusing on
   * oversizing alone leaves real anatomy with no plan at all, and how much
   * oversizing to accept is a clinical judgement rather than the planner's.
   * It is flagged everywhere it appears instead.
   */
  oversizeOutOfRange: "under" | "over" | null;
  /** Null when the device is usable; otherwise why it was set aside. */
  rejection: string | null;
  /** Pose solved on this device; null when it never got that far. */
  solution: PoseSolution | null;
  openings: PlacedOpening[];
  /** The edge cut at the solved pose; null when nothing is scalloped. */
  scallop: PlacedScallop | null;
  /** Fabric between that cut and the nearest opening; null when no scallop. */
  scallopBridge: ScallopBridge | null;
  depthLimit: ProximalDepthLimit;
}

export interface GraftPlan {
  ok: true;
  anatomy: NormalizedAnatomy;
  graft: GraftModel;
  oversizeFraction: number;
  depthLimit: ProximalDepthLimit;
  solution: PoseSolution;
  /** The fenestrations at the solved pose, ready to mark out. */
  openings: PlacedOpening[];
  /** The edge cut at the solved pose; null when nothing is scalloped. */
  scallop: PlacedScallop | null;
  /** Fabric between that cut and the nearest opening; null when no scallop. */
  scallopBridge: ScallopBridge | null;
  /** Length of graft the plan needs, in mm. */
  requiredLengthMm: number;
  /** Every scanned device considered, including the ones set aside. */
  considered: DeviceFit[];
  /** The scan this plan is for. */
  selectedScanId: CtScanId;
  /** What the planner would have chosen unprompted. */
  recommendedScanId: CtScanId;
  /** True when the caller asked for a device other than the recommendation. */
  overridden: boolean;
}

export interface PlanFailure {
  ok: false;
  /** Present whenever the anatomy itself parsed; absent on an input error. */
  anatomy: NormalizedAnatomy | null;
  reason: string;
  considered: DeviceFit[];
}

export type PlanResult = GraftPlan | PlanFailure;

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** Height difference at which the proximal ring counts as a different stent. */
const SEALING_RING_HEIGHT_TOLERANCE_MM = 0.75;

function describeSealingRing(
  descriptor: BenchCtDeviceDescriptor,
  renderModel: BenchCtRenderModel,
): SealingRing {
  const bare = new Set(
    descriptor.rendering?.proximal_bare_ring_indices ??
      Array.from(
        { length: descriptor.geometry?.proximal_fixation.ring_count ?? 0 },
        (_, index) => index,
      ),
  );
  const covered = descriptor.rings.filter((ring) => !bare.has(ring.index));
  // Descriptor rings ascend in scan z; on an inverted scan the anatomically
  // proximal end is the last one.
  const anatomical =
    descriptor.rendering?.anatomical_proximal_z === "high"
      ? [...covered].reverse()
      : covered;

  const seal = anatomical[0];
  const body = anatomical.slice(1);
  const bodyHeightMm =
    body.length > 0
      ? median(body.map((ring) => ring.ring_height_mm))
      : seal.ring_height_mm;
  const bodyDiameterMm =
    body.length > 0
      ? median(body.map((ring) => ring.diameter_mm))
      : seal.diameter_mm;

  // Depths come from the render model, which has already rebased to the fabric
  // edge and flipped an inverted scan.
  const proximalCovered = renderModel.rings
    .filter((ring) => ring.kind === "covered")
    .reduce((highest, ring) =>
      Math.min(...ring.points.map((point) => point.zMm)) <
      Math.min(...highest.points.map((point) => point.zMm))
        ? ring
        : highest,
    );
  const depths = proximalCovered.points.map((point) => point.zMm);

  return {
    diameterMm: seal.diameter_mm,
    heightMm: seal.ring_height_mm,
    apexCount: seal.n_apices,
    fromDepthMm: Math.min(...depths),
    toDepthMm: Math.max(...depths),
    bodyHeightMm,
    bodyDiameterMm,
    differsFromBody:
      Math.abs(seal.ring_height_mm - bodyHeightMm) >
      SEALING_RING_HEIGHT_TOLERANCE_MM,
  };
}

/**
 * Resolve one scanned device into the geometry the solver needs.
 *
 * Everything here comes from the bench CT of an actual endograft: the strut
 * lattice, the fabric edges, the bare fixation ring and its barbs. Nothing is
 * interpolated to an unscanned size.
 */
export function buildGraftModel(scanId: CtScanId): GraftModel {
  const scan = getMeasuredCtScanModel(scanId);
  const descriptor = scan.reference.descriptor;
  const renderModel = buildBenchCtRenderModel(descriptor);
  const sealingRing = describeSealingRing(descriptor, renderModel);
  // Sizing and geometry take different diameters, deliberately.
  //
  // Oversizing is judged against the labelled diameter, because that is what
  // the IFU range refers to and what a surgeon sizes from. Judging it against
  // measured metal understates it — 13% rather than 16.7% for a 36 mm aorta on
  // scan1 — and understating oversizing is the direction that makes an
  // undersized device look acceptable.
  const proximalDiameterMm = scan.reference.candidateNominal.proximalDiameterMm;
  // The unrolled circumference stays measured, so that arc positions, wire
  // spacing and clearances remain one self-consistent frame taken from the same
  // scan. Rescaling it to nominal would move every strut relative to every hole.
  const circumferenceMm = Math.PI * renderModel.diameterAt(0);
  const segments = buildBenchCtStrutSegments(
    scan.reference.descriptor,
    circumferenceMm,
  );

  return {
    scan,
    naming: describeCtDevice(scan),
    renderModel,
    proximalDiameterMm,
    sealingRing,
    wireProvenance: {
      source: descriptor.wire_map ? "segmented" : "apex_model",
      segmentCount: segments.length,
      apexCount: descriptor.rings.reduce(
        (sum, ring) =>
          sum + ring.proximal_apices.length + ring.distal_apices.length,
        0,
      ),
      apexAgreementMm:
        descriptor.wire_map?.datum_fit.apex_residual_p50_mm ?? null,
    },
    circumferenceMm,
    fabricLengthMm: renderModel.fabricLengthMm,
    wireRadiusMm: scan.device.wireRadius,
    segments,
    field: buildClearanceField(segments, circumferenceMm),
  };
}

function cachedGraftModel(
  scanId: CtScanId,
  cache: Map<string, GraftModel>,
): GraftModel {
  let model = cache.get(scanId);
  if (!model) {
    model = buildGraftModel(scanId);
    cache.set(scanId, model);
  }
  return model;
}

/**
 * Shortest device that can carry the pattern: the seal above the first
 * fenestration, the span the anatomy fixes, and something below the last hole.
 */
export function requiredGraftLengthMm(
  anatomy: NormalizedAnatomy,
  distalAllowanceMm = DEFAULT_DISTAL_ALLOWANCE_MM,
): number {
  return (
    MIN_PROXIMAL_FENESTRATION_DEPTH_MM +
    anatomy.fenestrationSpanMm +
    distalAllowanceMm
  );
}

function assessFit(
  model: GraftModel,
  sealZoneDiameterMm: number,
  requiredLengthMm: number,
): DeviceFit {
  const oversizeFraction =
    (model.proximalDiameterMm - sealZoneDiameterMm) / sealZoneDiameterMm;

  // Fabric length is the only hard rejection: a device that cannot physically
  // carry the pattern has nothing to plan. Oversizing outside the window is
  // flagged and left selectable — see `DeviceFit.oversizeOutOfRange`.
  const rejection =
    model.fabricLengthMm < requiredLengthMm
      ? `${model.fabricLengthMm.toFixed(0)} mm of fabric, ${requiredLengthMm.toFixed(0)} mm needed`
      : null;

  const oversizeOutOfRange =
    oversizeFraction < MIN_OVERSIZE
      ? ("under" as const)
      : oversizeFraction > MAX_OVERSIZE
        ? ("over" as const)
        : null;

  return {
    model,
    oversizeFraction,
    oversizeOutOfRange,
    rejection,
    solution: null,
    openings: [],
    scallop: null,
    scallopBridge: null,
    depthLimit: { maxDepthMm: 0, limitingVesselName: null },
  };
}

/** Plain-language note on oversizing, for anywhere a device is shown. */
export function oversizeWarning(fit: DeviceFit): string | null {
  if (fit.oversizeOutOfRange === null) return null;
  const percent = (fit.oversizeFraction * 100).toFixed(0);
  if (fit.oversizeFraction < 0) {
    return `undersized — ${fit.model.proximalDiameterMm} mm graft in a larger aorta; it will not appose`;
  }
  return fit.oversizeOutOfRange === "under"
    ? `only ${percent}% oversizing, below the usual ${MIN_OVERSIZE * 100}% — seal at risk`
    : `${percent}% oversizing, above the usual ${MAX_OVERSIZE * 100}% — risks infolding`;
}

/** Solve the pose this device would give, and record it on the fit. */
function solveFit(
  anatomy: NormalizedAnatomy,
  fit: DeviceFit,
  proximalLandingLengthMm: number | undefined,
  options: PlanOptions,
): DeviceFit {
  const { model } = fit;
  const depthLimit = proximalDepthLimit(anatomy, proximalLandingLengthMm);
  const solution = solvePose(anatomy, model.circumferenceMm, model.field, {
    maxProximalDepthMm: depthLimit.maxDepthMm,
    fabricLengthMm: model.fabricLengthMm,
    wireRadiusMm: model.wireRadiusMm,
    targetClearanceMm: options.targetClearanceMm,
    maxRotationDeg: options.maxRotationDeg,
    stepMm: options.stepMm,
  });

  const openings =
    solution.map === null
      ? []
      : placeOpenings(anatomy, solution.pose, model.circumferenceMm);
  const scallop =
    solution.map === null
      ? null
      : placeScallop(anatomy, solution.pose, model.circumferenceMm);

  return {
    ...fit,
    depthLimit,
    solution,
    openings,
    scallop,
    scallopBridge: scallop
      ? measureScallopBridge(scallop, openings, model.circumferenceMm)
      : null,
  };
}

/**
 * Which solved device the planner would pick unprompted.
 *
 * Prefer one that actually clears; among those the shallowest, since every
 * extra millimetre of push-in is aorta covered for nothing — unless a scallop
 * is cut, where the same millimetre is aorta sealed and the deepest wins
 * instead. This is only a default — where several devices clear, the choice
 * between them is the surgeon's, and the alternatives are kept so it can be
 * made on their poses.
 */
function recommend(solved: DeviceFit[], wantsScallop: boolean): DeviceFit {
  // A device inside the oversizing window is preferred over one outside it,
  // whatever the clearance: a hole that clears wire on a graft that will not
  // seal is not a better plan.
  const inWindow = solved.filter((fit) => fit.oversizeOutOfRange === null);
  const pool = inWindow.length > 0 ? inWindow : solved;
  return pool.reduce((best, candidate) => {
    const bestSolution = best.solution as PoseSolution;
    const candidateSolution = candidate.solution as PoseSolution;
    // A device whose pose leaves no cut cannot carry a plan that asked for one,
    // however well it clears: the scalloped vessel ends up crossed by the
    // fabric edge with nothing relieving it.
    if (wantsScallop && (best.scallop === null) !== (candidate.scallop === null)) {
      return candidate.scallop !== null ? candidate : best;
    }
    const bestClears = bestSolution.marginMm > 0;
    const candidateClears = candidateSolution.marginMm > 0;
    if (bestClears !== candidateClears) return candidateClears ? candidate : best;
    if (!candidateClears) {
      return candidateSolution.marginMm > bestSolution.marginMm ? candidate : best;
    }
    if (
      bestSolution.meetsTargetClearance !== candidateSolution.meetsTargetClearance
    ) {
      return candidateSolution.meetsTargetClearance ? candidate : best;
    }
    const deeper =
      candidateSolution.pose.proximalDepthMm >
      bestSolution.pose.proximalDepthMm;
    return deeper === wantsScallop ? candidate : best;
  });
}

/**
 * Plan a PMEG from measured anatomy against the scanned device library.
 *
 * Candidates are the endografts that have actually been through the bench CT.
 * Nothing is scaled to an unscanned catalog size: the point of the library is
 * that the lattice, the fabric edges and the fixation ring are measured, and a
 * proxy geometry would forfeit exactly that.
 */
export function planGraft(
  anatomyCase: AnatomyCase,
  options: PlanOptions = {},
  /** Override the shared clearance-field cache; mainly for tests. */
  modelCache: Map<string, GraftModel> = sharedModelCache,
): PlanResult {
  let anatomy: NormalizedAnatomy;
  try {
    anatomy = normalizeAnatomy(anatomyCase);
  } catch (error) {
    return {
      ok: false,
      anatomy: null,
      reason: error instanceof Error ? error.message : String(error),
      considered: [],
    };
  }

  const requiredLengthMm = requiredGraftLengthMm(
    anatomy,
    options.distalAllowanceMm,
  );
  // Every scanned device is assessed and every usable one is solved, whichever
  // is asked for. `scanId` picks between the results rather than narrowing the
  // search, so the alternatives stay visible and a choice can be compared
  // against what it gives up.
  const considered = CT_SCAN_REFERENCES.map((reference) =>
    assessFit(
      cachedGraftModel(reference.id, modelCache),
      anatomyCase.aorta.sealZoneDiameterMm,
      requiredLengthMm,
    ),
  ).map((fit) =>
    fit.rejection === null
      ? solveFit(
          anatomy,
          fit,
          anatomyCase.aorta.proximalLandingLengthMm,
          options,
        )
      : fit,
  );

  const solved = considered.filter((fit) => fit.solution !== null);
  if (solved.length === 0) {
    return {
      ok: false,
      anatomy,
      reason: `None of the ${considered.length} scanned endografts suit a ${anatomyCase.aorta.sealZoneDiameterMm.toFixed(0)} mm seal zone needing ${requiredLengthMm.toFixed(0)} mm of fabric.`,
      considered,
    };
  }

  const recommended = recommend(solved, anatomy.scalloped !== null);
  const requested =
    options.scanId === undefined
      ? undefined
      : solved.find((fit) => fit.model.scan.reference.id === options.scanId);
  // A device that was asked for but is not usable falls back to the
  // recommendation rather than failing: the anatomy changed under a choice made
  // earlier, and losing the plan would be a worse answer than replacing it.
  const chosen = requested ?? recommended;

  return {
    ok: true,
    anatomy,
    graft: chosen.model,
    oversizeFraction: chosen.oversizeFraction,
    depthLimit: chosen.depthLimit,
    solution: chosen.solution as PoseSolution,
    openings: chosen.openings,
    scallop: chosen.scallop,
    scallopBridge: chosen.scallopBridge,
    requiredLengthMm,
    considered,
    selectedScanId: chosen.model.scan.reference.id,
    recommendedScanId: recommended.model.scan.reference.id,
    overridden: chosen !== recommended,
  };
}
