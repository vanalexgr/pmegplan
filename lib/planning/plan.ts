import {
  MIN_PROXIMAL_FENESTRATION_DEPTH_MM,
  normalizeAnatomy,
  placeOpenings,
  type AnatomyCase,
  type NormalizedAnatomy,
  type PlacedOpening,
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
  getMeasuredCtScanModel,
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
  /** Accept a device outside the usual oversizing window. */
  allowAnyOversize?: boolean;
}

/** Everything one scanned device contributes to a plan. */
export interface GraftModel {
  scan: MeasuredCtScanModel;
  /** Free-state render model, carrying the fabric edges and bare rings. */
  renderModel: BenchCtRenderModel;
  /** Measured outer diameter at the proximal fabric edge, in mm. */
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
  /** Measured diameter across this ring, in mm. Drives oversizing. */
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

/** How one scanned device measures up against the seal zone. */
export interface DeviceFit {
  model: GraftModel;
  oversizeFraction: number;
  /** Null when the device fits; otherwise why it was set aside. */
  rejection: string | null;
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
  /** Length of graft the plan needs, in mm. */
  requiredLengthMm: number;
  /** Every scanned device considered, including the ones set aside. */
  considered: DeviceFit[];
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
  // Oversizing is judged at the ring that seals, not at an interpolated point
  // on the fabric surface: on every scanned device the two differ.
  const proximalDiameterMm = sealingRing.diameterMm;
  const circumferenceMm = Math.PI * proximalDiameterMm;
  const segments = buildBenchCtStrutSegments(
    scan.reference.descriptor,
    circumferenceMm,
  );

  return {
    scan,
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
  allowAnyOversize: boolean,
): DeviceFit {
  const oversizeFraction =
    (model.proximalDiameterMm - sealZoneDiameterMm) / sealZoneDiameterMm;

  let rejection: string | null = null;
  if (model.fabricLengthMm < requiredLengthMm) {
    rejection = `${model.fabricLengthMm.toFixed(0)} mm of fabric, ${requiredLengthMm.toFixed(0)} mm needed`;
  } else if (!allowAnyOversize && oversizeFraction < MIN_OVERSIZE) {
    rejection =
      oversizeFraction < 0
        ? `undersized: ${model.proximalDiameterMm.toFixed(1)} mm graft in a ${sealZoneDiameterMm.toFixed(0)} mm aorta`
        : `only ${(oversizeFraction * 100).toFixed(0)}% oversizing`;
  } else if (!allowAnyOversize && oversizeFraction > MAX_OVERSIZE) {
    rejection = `${(oversizeFraction * 100).toFixed(0)}% oversizing risks infolding`;
  }

  return { model, oversizeFraction, rejection };
}

function planWithModel(
  anatomy: NormalizedAnatomy,
  fit: DeviceFit,
  requiredLengthMm: number,
  proximalLandingLengthMm: number | undefined,
  considered: DeviceFit[],
  options: PlanOptions,
): GraftPlan {
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

  return {
    ok: true,
    anatomy,
    graft: model,
    oversizeFraction: fit.oversizeFraction,
    depthLimit,
    solution,
    openings:
      solution.map === null
        ? []
        : placeOpenings(anatomy, solution.pose, model.circumferenceMm),
    requiredLengthMm,
    considered,
  };
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
  const scanIds = options.scanId
    ? [options.scanId]
    : CT_SCAN_REFERENCES.map((reference) => reference.id);

  const considered = scanIds.map((scanId) =>
    assessFit(
      cachedGraftModel(scanId, modelCache),
      anatomyCase.aorta.sealZoneDiameterMm,
      requiredLengthMm,
      options.allowAnyOversize ?? false,
    ),
  );

  const usable = considered.filter((fit) => fit.rejection === null);
  if (usable.length === 0) {
    return {
      ok: false,
      anatomy,
      reason: `None of the ${considered.length} scanned endografts suit a ${anatomyCase.aorta.sealZoneDiameterMm.toFixed(0)} mm seal zone needing ${requiredLengthMm.toFixed(0)} mm of fabric.`,
      considered,
    };
  }

  const plans = usable.map((fit) =>
    planWithModel(
      anatomy,
      fit,
      requiredLengthMm,
      anatomyCase.aorta.proximalLandingLengthMm,
      considered,
      options,
    ),
  );

  // Prefer a plan that actually clears; among those the shallowest, since every
  // extra millimetre of push-in is aorta covered for nothing.
  return plans.reduce((best, candidate) => {
    const bestClears = best.solution.marginMm > 0;
    const candidateClears = candidate.solution.marginMm > 0;
    if (bestClears !== candidateClears) return candidateClears ? candidate : best;
    if (!candidateClears) {
      return candidate.solution.marginMm > best.solution.marginMm
        ? candidate
        : best;
    }
    if (
      best.solution.meetsTargetClearance !==
      candidate.solution.meetsTargetClearance
    ) {
      return candidate.solution.meetsTargetClearance ? candidate : best;
    }
    return candidate.solution.pose.proximalDepthMm <
      best.solution.pose.proximalDepthMm
      ? candidate
      : best;
  });
}
