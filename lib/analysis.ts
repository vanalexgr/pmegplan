import { ALL_DEVICES, getDeviceById, getEffectiveRingGeometry, getNPeaks, selectSize } from "@/lib/devices";

import {
  arcToClockString,
  checkConflict,
  clockToArc,
  getSafeThreshold,
  wrapMm,
} from "@/lib/conflictDetection";
import { optimiseDepth } from "@/lib/depthOptimizer";
import { optimiseRotation } from "@/lib/rotationOptimizer";
import { buildStrutSegmentsForDevice, getSealZoneHeightMm } from "@/lib/stentGeometry";
import type {
  CaseInput,
  ConflictResult,
  DepthResult,
  DeviceAnalysisResult,
  DeviceGeometry,
  Fenestration,
  RobustnessSummary,
} from "@/lib/types";

const ROBUSTNESS_CIRCUMFERENTIAL_ERROR_MM = 0.5;
const ROBUSTNESS_LONGITUDINAL_ERROR_MM = 1;

export interface AnalysisProgress {
  completed: number;
  total: number;
  fraction: number;
  deviceId: string;
  deviceName: string;
}

interface ScenarioEvaluation {
  conflictFree: boolean;
  minClearanceAtOptimal: number;
  totalValidWindowMm: number;
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function shiftFenestration(
  fenestration: Fenestration,
  circumferenceMm: number,
  deltaArcMm: number,
  deltaDepthMm: number,
): Fenestration {
  return {
    ...fenestration,
    clock: arcToClockString(
      wrapMm(clockToArc(fenestration.clock, circumferenceMm) + deltaArcMm, circumferenceMm),
      circumferenceMm,
    ),
    depthMm: roundToTenth(clamp(fenestration.depthMm + deltaDepthMm, 0, 200)),
  };
}

function evaluateScenario(
  fenestrations: Fenestration[],
  segs: DeviceAnalysisResult["strutSegments"],
  circumferenceMm: number,
  wireRadius: number,
): ScenarioEvaluation {
  const rotation = optimiseRotation(
    fenestrations,
    segs,
    circumferenceMm,
    wireRadius,
  );
  const optimalConflicts = fenestrations.map((fenestration) =>
    checkConflict(
      fenestration,
      segs,
      circumferenceMm,
      wireRadius,
      rotation.optimalDeltaMm,
    ),
  );
  const minimumOptimalDistance = optimalConflicts
    .map((result) => result.minDist)
    .filter(Number.isFinite);

  return {
    conflictFree: rotation.hasConflictFreeRotation,
    minClearanceAtOptimal:
      minimumOptimalDistance.length > 0
        ? Math.min(...minimumOptimalDistance)
        : Number.POSITIVE_INFINITY,
    totalValidWindowMm: rotation.validWindows.reduce(
      (sum, window) => sum + (window.endMm - window.startMm),
      0,
    ),
  };
}

function buildRobustnessSummary(
  caseInput: CaseInput,
  segs: DeviceAnalysisResult["strutSegments"],
  circumferenceMm: number,
  wireRadius: number,
): RobustnessSummary {
  const circumferentialDeltas = [
    -ROBUSTNESS_CIRCUMFERENTIAL_ERROR_MM,
    0,
    ROBUSTNESS_CIRCUMFERENTIAL_ERROR_MM,
  ];
  const longitudinalDeltas = [
    -ROBUSTNESS_LONGITUDINAL_ERROR_MM,
    0,
    ROBUSTNESS_LONGITUDINAL_ERROR_MM,
  ];
  const evaluations: Array<ScenarioEvaluation & { kind: "global" | "local"; vessel: Fenestration["vessel"] | null }> = [];
  const localTotals = new Map<Fenestration["vessel"], { count: number; success: number }>();

  for (const deltaArcMm of circumferentialDeltas) {
    for (const deltaDepthMm of longitudinalDeltas) {
      const shiftedFenestrations = caseInput.fenestrations.map((fenestration) =>
        shiftFenestration(fenestration, circumferenceMm, deltaArcMm, deltaDepthMm),
      );
      evaluations.push({
        kind: "global",
        vessel: null,
        ...evaluateScenario(shiftedFenestrations, segs, circumferenceMm, wireRadius),
      });
    }
  }

  for (const fenestration of caseInput.fenestrations) {
    if (!localTotals.has(fenestration.vessel)) {
      localTotals.set(fenestration.vessel, { count: 0, success: 0 });
    }

    for (const deltaArcMm of circumferentialDeltas) {
      for (const deltaDepthMm of longitudinalDeltas) {
        if (deltaArcMm === 0 && deltaDepthMm === 0) {
          continue;
        }

        const shiftedFenestrations = caseInput.fenestrations.map((currentFenestration) =>
          currentFenestration === fenestration
            ? shiftFenestration(
                currentFenestration,
                circumferenceMm,
                deltaArcMm,
                deltaDepthMm,
              )
            : currentFenestration,
        );
        const evaluation = evaluateScenario(
          shiftedFenestrations,
          segs,
          circumferenceMm,
          wireRadius,
        );
        const localSummary = localTotals.get(fenestration.vessel);

        if (localSummary) {
          localSummary.count += 1;
          if (evaluation.conflictFree) {
            localSummary.success += 1;
          }
        }

        evaluations.push({
          kind: "local",
          vessel: fenestration.vessel,
          ...evaluation,
        });
      }
    }
  }

  const globalEvaluations = evaluations.filter((evaluation) => evaluation.kind === "global");
  const localEvaluations = evaluations.filter((evaluation) => evaluation.kind === "local");
  const conflictFreeCount = evaluations.filter((evaluation) => evaluation.conflictFree).length;
  const averageMinClearanceAtOptimal =
    evaluations.reduce((sum, evaluation) => sum + evaluation.minClearanceAtOptimal, 0) /
    evaluations.length;
  const averageValidWindowMm =
    evaluations.reduce((sum, evaluation) => sum + evaluation.totalValidWindowMm, 0) /
    evaluations.length;

  let mostSensitiveVessel: Fenestration["vessel"] | null = null;
  let mostSensitiveRate = Number.POSITIVE_INFINITY;

  for (const [vessel, summary] of localTotals.entries()) {
    const successRate = summary.count > 0 ? summary.success / summary.count : 1;
    if (successRate < mostSensitiveRate) {
      mostSensitiveRate = successRate;
      mostSensitiveVessel = vessel;
    }
  }

  return {
    scenarioCount: evaluations.length,
    conflictFreeCount,
    conflictFreeRate: conflictFreeCount / evaluations.length,
    globalScenarioCount: globalEvaluations.length,
    globalConflictFreeRate:
      globalEvaluations.filter((evaluation) => evaluation.conflictFree).length /
      Math.max(globalEvaluations.length, 1),
    localScenarioCount: localEvaluations.length,
    localConflictFreeRate:
      localEvaluations.filter((evaluation) => evaluation.conflictFree).length /
      Math.max(localEvaluations.length, 1),
    averageMinClearanceAtOptimal,
    worstMinClearanceAtOptimal: Math.min(
      ...evaluations.map((evaluation) => evaluation.minClearanceAtOptimal),
    ),
    averageValidWindowMm,
    worstValidWindowMm: Math.min(
      ...evaluations.map((evaluation) => evaluation.totalValidWindowMm),
    ),
    mostSensitiveVessel,
    simulatedCircumferentialErrorMm: ROBUSTNESS_CIRCUMFERENTIAL_ERROR_MM,
    simulatedLongitudinalErrorMm: ROBUSTNESS_LONGITUDINAL_ERROR_MM,
  };
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

export function normalizeRotationDeltaDeg(rotationDeg: number): number {
  const normalized = ((rotationDeg % 360) + 360) % 360;
  return normalized > 180 ? 360 - normalized : normalized;
}

export function getDeploymentTorqueInfo(deltaDeg: number) {
  const normalized = ((deltaDeg % 360) + 360) % 360;
  let burden = normalized;
  let direction: "clockwise" | "counter-clockwise" | "none" = "none";

  if (normalized === 0) {
    burden = 0;
  } else if (normalized > 180) {
    // delta > 180° means the shorter path is clockwise
    burden = 360 - normalized;
    direction = "clockwise";
  } else {
    // positive delta = graft rotates CCW in patient space
    burden = normalized;
    direction = "counter-clockwise";
  }

  return {
    deploymentTorqueDeg: burden,
    deploymentTorqueDirection: direction,
    targetAlignmentDeg: normalized,
  };
}

export function getRotationBurdenDeg(
  rotation: Pick<
    DeviceAnalysisResult["rotation"],
    "optimalDeltaDeg" | "bestCompromiseDeg"
  >,
): number {
  const alignDeg = Number.isFinite(rotation.optimalDeltaDeg)
    ? rotation.optimalDeltaDeg
    : rotation.bestCompromiseDeg;
  return getDeploymentTorqueInfo(alignDeg).deploymentTorqueDeg;
}

function getRotationBurdenScore(
  rotation: Pick<
    DeviceAnalysisResult["rotation"],
    "optimalDeltaDeg" | "bestCompromiseDeg"
  >,
): number {
  const burdenDeg = getRotationBurdenDeg(rotation);

  if (burdenDeg <= 20) {
    return 1;
  }

  if (burdenDeg >= 90) {
    return 0;
  }

  return clamp01((90 - burdenDeg) / 70);
}

function buildManufacturabilityScore(
  result: Pick<
    DeviceAnalysisResult,
    | "size"
    | "rotation"
    | "totalValidWindowMm"
    | "minClearanceAtOptimal"
    | "robustness"
    | "device"
  >,
): number {
  if (!result.size || !result.robustness) {
    return 0;
  }

  const clearanceScore = Number.isFinite(result.minClearanceAtOptimal)
    ? 10 * clamp01(result.minClearanceAtOptimal / 6)
    : 10;
  const worstCaseClearanceScore = Number.isFinite(result.robustness.worstMinClearanceAtOptimal)
    ? 10 * clamp01(result.robustness.worstMinClearanceAtOptimal / 6)
    : 10;
  const sheathScore = 5 * clamp01((20 - result.size.sheathFr) / 4);
  const platformScore = 5 * ((5 - result.device.pmegSuitability) / 4);
  const rotationBurdenScore = 12 * getRotationBurdenScore(result.rotation);

  return roundToTenth(
    (result.rotation.hasConflictFreeRotation ? 20 : 0) +
      25 * result.robustness.conflictFreeRate +
      10 * result.robustness.localConflictFreeRate +
      15 * clamp01(result.totalValidWindowMm / 20) +
      rotationBurdenScore +
      clearanceScore +
      worstCaseClearanceScore +
      sheathScore +
      platformScore,
  );
}

function buildConflictResult(
  caseInput: CaseInput,
  device: DeviceGeometry,
  circumferenceMm: number,
  minDist: number,
  conflict: boolean,
  index: number,
  deltaMm: number,
): ConflictResult {
  const fenestration = caseInput.fenestrations[index];
  return {
    conflict,
    minDist,
    safeThreshold: getSafeThreshold(fenestration, device.wireRadius),
    adjustedClock: arcToClockString(
      wrapMm(
        clockToArc(fenestration.clock, circumferenceMm) + deltaMm,
        circumferenceMm,
      ),
      circumferenceMm,
    ),
    deltaMm,
  };
}

function analyseDevice(
  caseInput: CaseInput,
  device: DeviceGeometry,
): DeviceAnalysisResult {
  const size = selectSize(device, caseInput.neckDiameterMm);

  if (!size) {
    return {
      device,
      size: null,
      circumferenceMm: 0,
      nPeaks: 0,
      strutSegments: [],
      baselineConflicts: [],
      optimalConflicts: [],
      depthOptimisation: {
        optimalDeltaMm: 0,
        hasConflictFreeDepth: false,
        validWindows: [],
        bestCompromiseDeltaMm: 0,
        adjustedDepths: [],
        clearancePerFen: [],
        scanMin: 0,
        scanMax: 0,
      },
      rotation: {
        optimalDeltaMm: 0,
        optimalDeltaDeg: 0,
        validWindows: [],
        hasConflictFreeRotation: false,
        bestCompromiseMm: 0,
        bestCompromiseDeg: 0,
        scanData: [],
        hasTorqueExcludedConflictFreeSolution: false,
      },
      minClearanceAtOptimal: 0,
      totalValidWindowMm: 0,
      robustness: null,
      manufacturabilityScore: 0,
      unsupportedReason:
        "No available graft size matches the requested neck diameter with standard oversizing.",
    };
  }

  const circumferenceMm = Math.PI * size.graftDiameter;
  const nPeaks = getNPeaks(device, size.graftDiameter);
  const { ringHeight, interRingGap } = getEffectiveRingGeometry(device, size);
  const strutSegments = buildStrutSegmentsForDevice(
    device,
    circumferenceMm,
    ringHeight,
    interRingGap,
    device.nRings,
    nPeaks,
  );

  const rotation = optimiseRotation(
    caseInput.fenestrations,
    strutSegments,
    circumferenceMm,
    device.wireRadius,
  );
  const baselineConflicts = caseInput.fenestrations.map((fenestration, index) => {
    const baseline = checkConflict(
      fenestration,
      strutSegments,
      circumferenceMm,
      device.wireRadius,
      0,
    );

    return buildConflictResult(
      caseInput,
      device,
      circumferenceMm,
      baseline.minDist,
      baseline.conflict,
      index,
      0,
    );
  });
  const optimalConflicts = caseInput.fenestrations.map((fenestration, index) => {
    const optimal = checkConflict(
      fenestration,
      strutSegments,
      circumferenceMm,
      device.wireRadius,
      rotation.optimalDeltaMm,
    );

    return buildConflictResult(
      caseInput,
      device,
      circumferenceMm,
      optimal.minDist,
      optimal.conflict,
      index,
      rotation.optimalDeltaMm,
    );
  });

  // ── Global depth-offset optimisation (all fens shift together) ───────────
  const sealZoneH = getSealZoneHeightMm(device);
  const depthOptimisation: DepthResult = optimiseDepth(
    caseInput.fenestrations,
    rotation.optimalDeltaMm,
    strutSegments,
    circumferenceMm,
    device.wireRadius,
    sealZoneH,
  );

  const minimumOptimalDistance = optimalConflicts
    .map((result) => result.minDist)
    .filter(Number.isFinite);
  const minClearanceAtOptimal =
    minimumOptimalDistance.length > 0
      ? Math.min(...minimumOptimalDistance)
      : Number.POSITIVE_INFINITY;
  const totalValidWindowMm = rotation.validWindows.reduce(
    (sum, window) => sum + (window.endMm - window.startMm),
    0,
  );
  const robustness = buildRobustnessSummary(
    caseInput,
    strutSegments,
    circumferenceMm,
    device.wireRadius,
  );
  const manufacturabilityScore = buildManufacturabilityScore({
    device,
    size,
    rotation,
    totalValidWindowMm,
    minClearanceAtOptimal,
    robustness,
  });

  return {
    device,
    size,
    circumferenceMm,
    nPeaks,
    strutSegments,
    baselineConflicts,
    optimalConflicts,
    depthOptimisation,
    rotation,
    minClearanceAtOptimal,
    totalValidWindowMm,
    robustness,
    manufacturabilityScore,
  };
}

function resolveDevices(deviceIds?: string[]) {
  return deviceIds?.length
    ? deviceIds
        .map((deviceId) => getDeviceById(deviceId))
        .filter((device): device is DeviceGeometry => Boolean(device))
    : ALL_DEVICES;
}

export function rankDevices(results: DeviceAnalysisResult[]) {
  return [...results].sort((left, right) => {
    if (!!left.size !== !!right.size) {
      return left.size ? -1 : 1;
    }

    if (!left.size || !right.size) {
      return left.device.clinicalRank - right.device.clinicalRank;
    }

    if (
      Math.abs(left.manufacturabilityScore - right.manufacturabilityScore) > 0.1
    ) {
      return right.manufacturabilityScore - left.manufacturabilityScore;
    }

    if (
      left.rotation.hasConflictFreeRotation !== right.rotation.hasConflictFreeRotation
    ) {
      return left.rotation.hasConflictFreeRotation ? -1 : 1;
    }

    if (Math.abs(left.totalValidWindowMm - right.totalValidWindowMm) > 0.5) {
      return right.totalValidWindowMm - left.totalValidWindowMm;
    }

    if (
      Math.abs(left.minClearanceAtOptimal - right.minClearanceAtOptimal) > 0.1
    ) {
      return right.minClearanceAtOptimal - left.minClearanceAtOptimal;
    }

    return left.device.clinicalRank - right.device.clinicalRank;
  });
}

export function analyseCase(caseInput: CaseInput, deviceIds?: string[]) {
  const devices = resolveDevices(deviceIds);

  return rankDevices(devices.map((device) => analyseDevice(caseInput, device)));
}

export async function analyseCaseProgressive(
  caseInput: CaseInput,
  deviceIds?: string[],
  onProgress?: (progress: AnalysisProgress) => void,
) {
  const devices = resolveDevices(deviceIds);
  const results: DeviceAnalysisResult[] = [];

  for (const [index, device] of devices.entries()) {
    results.push(analyseDevice(caseInput, device));
    onProgress?.({
      completed: index + 1,
      total: devices.length,
      fraction: (index + 1) / Math.max(devices.length, 1),
      deviceId: device.id,
      deviceName: device.shortName,
    });

    if (index < devices.length - 1) {
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 0);
      });
    }
  }

  return rankDevices(results);
}

export function getRotationSummary(result: DeviceAnalysisResult) {
  if (!result.size) {
    return "No compatible graft size for this anatomy.";
  }

  const { rotation } = result;
  
  if (rotation.hasConflictFreeRotation) {
    const info = getDeploymentTorqueInfo(rotation.optimalDeltaDeg);
    const category = info.deploymentTorqueDeg <= 45 ? "low" : "high";
    const dirString = info.deploymentTorqueDirection !== "none" ? ` ${info.deploymentTorqueDirection}` : "";
    
    return `Conflict-free deployable alignment found.\nTarget alignment: ${info.targetAlignmentDeg.toFixed(1)}°.\nDeployment torque: ${info.deploymentTorqueDeg.toFixed(1)}°${dirString}.\nTorque category: ${category}.`;
  }

  const info = getDeploymentTorqueInfo(rotation.bestCompromiseDeg);
  const category = info.deploymentTorqueDeg <= 45 ? "low" : "high";
  const dirString = info.deploymentTorqueDirection !== "none" ? ` ${info.deploymentTorqueDirection}` : "";
  
  let baseString = `No conflict-free alignment within the deployment-torque limit.\nBest compromise selected within deployable range.\nTarget alignment: ${info.targetAlignmentDeg.toFixed(1)}°.\nDeployment torque: ${info.deploymentTorqueDeg.toFixed(1)}°${dirString}.\nTorque category: ${category}.`;
  
  if (rotation.hasTorqueExcludedConflictFreeSolution) {
    baseString += `\n*A conflict-free alignment existed outside the torque limit and was excluded.`;
  }
  
  return baseString;
}

/**
 * Plain-English deployment plan combining rotation AND depth adjustment.
 * Used in both the DeviceCard UI and the punch card renderer.
 */
export function getDeploymentPlanSummary(
  result: DeviceAnalysisResult,
  caseInput: CaseInput,
): string {
  if (!result.size) return "No compatible graft size for this anatomy.";

  const { rotation, depthOptimisation } = result;
  const rotInfo    = getDeploymentTorqueInfo(rotation.optimalDeltaDeg);
  const dirLabel   = rotInfo.deploymentTorqueDirection === "clockwise"  ? " CW"
                   : rotInfo.deploymentTorqueDirection === "counter-clockwise" ? " CCW"
                   : "";
  const noRotation = rotInfo.deploymentTorqueDirection === "none";

  // ── Rotation part ──────────────────────────────────────────────────────────
  const rotStr = noRotation
    ? "No graft rotation needed."
    : `Rotate ${rotInfo.deploymentTorqueDeg.toFixed(0)}°${dirLabel} (${rotation.optimalDeltaMm.toFixed(1)} mm).`;

  // ── Depth part ─────────────────────────────────────────────────────────────
  const needsDepth = Math.abs(depthOptimisation.optimalDeltaMm) >= 0.1;
  const depthSign  = depthOptimisation.optimalDeltaMm > 0 ? "+" : "";
  const depthStr   = needsDepth
    ? `Shift all fenestrations ${depthSign}${depthOptimisation.optimalDeltaMm.toFixed(1)} mm from proximal edge.`
    : "No depth adjustment needed.";

  // ── Per-fenestration adjusted positions ────────────────────────────────────
  const fenLines = caseInput.fenestrations
    .filter((f) => f.ftype !== "SCALLOP")
    .map((fen, i) => {
      const idx        = caseInput.fenestrations.indexOf(fen);
      const adjClock   = result.optimalConflicts[idx]?.adjustedClock ?? fen.clock;
      const adjDepth   = depthOptimisation.adjustedDepths[idx] ?? fen.depthMm;
      const depthPart  = needsDepth ? ` · depth ${fen.depthMm}→${adjDepth} mm` : ` · depth ${fen.depthMm} mm`;
      return `${fen.vessel}: clock ${fen.clock}→${adjClock}${depthPart}`;
    })
    .join("\n");

  // ── Overall outcome ────────────────────────────────────────────────────────
  const rotClear   = rotation.hasConflictFreeRotation;
  const depthClear = depthOptimisation.hasConflictFreeDepth;
  const outcome    = rotClear
    ? "✓ Conflict-free placement achieved."
    : depthClear
      ? "✓ Conflict-free with combined rotation + depth adjustment."
      : "⚠ Best compromise — strut bending may be required.";

  return [rotStr, depthStr, "", fenLines, "", outcome].join("\n");
}

export function getConflictCount(results: ConflictResult[]) {
  return results.filter((result) => result.conflict).length;
}
