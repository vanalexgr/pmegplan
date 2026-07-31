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
  circumferenceMm: number;
  fabricLengthMm: number;
  wireRadiusMm: number;
  /**
   * Measured wire on the unrolled graft, in (arc mm, depth-below-fabric-edge mm).
   * Depths above the proximal fabric edge are negative: on both Zenith Alpha
   * scans the bare fixation ring sits about 12 mm proximal to the fabric.
   */
  segments: StrutSegment[];
  field: ClearanceField;
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

/**
 * Resolve one scanned device into the geometry the solver needs.
 *
 * Everything here comes from the bench CT of an actual endograft: the strut
 * lattice, the fabric edges, the bare fixation ring and its barbs. Nothing is
 * interpolated to an unscanned size.
 */
export function buildGraftModel(scanId: CtScanId): GraftModel {
  const scan = getMeasuredCtScanModel(scanId);
  const renderModel = buildBenchCtRenderModel(scan.reference.descriptor);
  const proximalDiameterMm = renderModel.diameterAt(0);
  const circumferenceMm = Math.PI * proximalDiameterMm;
  const segments = buildBenchCtStrutSegments(
    scan.reference.descriptor,
    circumferenceMm,
  );

  return {
    scan,
    renderModel,
    proximalDiameterMm,
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
