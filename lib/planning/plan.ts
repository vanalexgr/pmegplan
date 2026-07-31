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
  CT_PLATFORMS,
  isCtSizeSelection,
  selectCtComponent,
  type CtPlatformId,
  type CtSizeSelection,
  type CtSizeSelectionFailure,
} from "@/lib/ctDeviceCatalog";
import { buildBenchCtRenderModel } from "@/lib/geometry/benchCtRenderModel";
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
 * Clearance fields cost a few hundred milliseconds to build and depend only on
 * the catalog component, so they are shared process-wide rather than rebuilt
 * per caller. Nothing here varies with the anatomy being planned.
 */
const sharedModelCache = new Map<string, GraftModel>();

export interface PlanOptions {
  /** Restrict to one platform. Omit to take whichever plans better. */
  platformId?: CtPlatformId;
  /** Aortic diameter at the distal end of the component, in mm. */
  distalAorticDiameterMm?: number;
  targetClearanceMm?: number;
  maxRotationDeg?: number;
  distalAllowanceMm?: number;
  /** Scan resolution in mm. Coarser trades accuracy for responsiveness. */
  stepMm?: number;
}

/** Everything the graft contributes, resolved from one catalog selection. */
export interface GraftModel {
  selection: CtSizeSelection;
  circumferenceMm: number;
  fabricLengthMm: number;
  wireRadiusMm: number;
  /** Measured wire on the unrolled graft, in (arc mm, depth-below-edge mm). */
  segments: StrutSegment[];
  field: ClearanceField;
}

export interface GraftPlan {
  ok: true;
  anatomy: NormalizedAnatomy;
  graft: GraftModel;
  depthLimit: ProximalDepthLimit;
  solution: PoseSolution;
  /** The fenestrations at the solved pose, ready to mark out. */
  openings: PlacedOpening[];
  /** Length of graft the plan needs, in mm; drove the catalog length choice. */
  requiredLengthMm: number;
}

export interface PlanFailure {
  ok: false;
  /** Present whenever the anatomy itself parsed; absent on an input error. */
  anatomy: NormalizedAnatomy | null;
  reason: string;
  /** Per-platform sizing failures, when that is what went wrong. */
  sizingFailures: CtSizeSelectionFailure[];
}

export type PlanResult = GraftPlan | PlanFailure;

/**
 * Resolve one catalog selection into the geometry the solver needs.
 *
 * The clearance field is the expensive part — a few hundred milliseconds — so
 * this is kept separate from `planGraft` to let callers cache it against the
 * selected component rather than rebuild it on every anatomy keystroke.
 */
export function buildGraftModel(selection: CtSizeSelection): GraftModel {
  const circumferenceMm =
    Math.PI * selection.component.proximalGraftDiameterMm;
  const renderModel = buildBenchCtRenderModel(selection.descriptor);
  const segments = buildBenchCtStrutSegments(
    selection.descriptor,
    circumferenceMm,
  );

  return {
    selection,
    circumferenceMm,
    fabricLengthMm: renderModel.fabricLengthMm,
    wireRadiusMm: selection.device.wireRadius,
    segments,
    field: buildClearanceField(segments, circumferenceMm),
  };
}

/**
 * Shortest component that can carry the pattern: the seal above the first
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

function planWithModel(
  anatomy: NormalizedAnatomy,
  graft: GraftModel,
  requiredLengthMm: number,
  proximalLandingLengthMm: number | undefined,
  options: PlanOptions,
): GraftPlan {
  const depthLimit = proximalDepthLimit(anatomy, proximalLandingLengthMm);
  const solution = solvePose(anatomy, graft.circumferenceMm, graft.field, {
    maxProximalDepthMm: depthLimit.maxDepthMm,
    fabricLengthMm: graft.fabricLengthMm,
    wireRadiusMm: graft.wireRadiusMm,
    targetClearanceMm: options.targetClearanceMm,
    maxRotationDeg: options.maxRotationDeg,
    stepMm: options.stepMm,
  });

  return {
    ok: true,
    anatomy,
    graft,
    depthLimit,
    solution,
    openings:
      solution.map === null
        ? []
        : placeOpenings(anatomy, solution.pose, graft.circumferenceMm),
    requiredLengthMm,
  };
}

/**
 * Plan a PMEG from measured anatomy.
 *
 * The surgeon supplies the vessel chain, which vessels are being fenestrated,
 * and the seal-zone diameter. Sizing follows from the diameter and the length
 * the pattern needs; the pose follows from the selected device's measured
 * lattice. Nothing here asks for a device-space measurement.
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
      sizingFailures: [],
    };
  }

  const requiredLengthMm = requiredGraftLengthMm(
    anatomy,
    options.distalAllowanceMm,
  );
  const proximalDiameterMm = anatomyCase.aorta.sealZoneDiameterMm;
  const distalDiameterMm =
    options.distalAorticDiameterMm ?? proximalDiameterMm;

  const platformIds = options.platformId
    ? [options.platformId]
    : CT_PLATFORMS.map((platform) => platform.id);

  const sizingFailures: CtSizeSelectionFailure[] = [];
  const plans: GraftPlan[] = [];

  for (const platformId of platformIds) {
    const selection = selectCtComponent(
      platformId,
      proximalDiameterMm,
      distalDiameterMm,
      requiredLengthMm,
    );
    if (!isCtSizeSelection(selection)) {
      sizingFailures.push(selection);
      continue;
    }

    const cacheKey = `${platformId}:${selection.component.code}:${selection.selectedLengthMm}`;
    let model = modelCache.get(cacheKey);
    if (!model) {
      model = buildGraftModel(selection);
      modelCache.set(cacheKey, model);
    }

    plans.push(
      planWithModel(
        anatomy,
        model,
        requiredLengthMm,
        anatomyCase.aorta.proximalLandingLengthMm,
        options,
      ),
    );
  }

  if (plans.length === 0) {
    return {
      ok: false,
      anatomy,
      reason:
        sizingFailures[0]?.reason ??
        "No catalog component matches this seal-zone diameter.",
      sizingFailures,
    };
  }

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
