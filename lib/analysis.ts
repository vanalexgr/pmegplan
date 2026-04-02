import { ALL_DEVICES, getDeviceById, getNPeaks, selectSize } from "@/lib/devices";
import {
  arcToClockString,
  checkConflict,
  clockToArc,
  getSafeThreshold,
  wrapMm,
} from "@/lib/conflictDetection";
import { optimiseRotation } from "@/lib/rotationOptimizer";
import { buildStrutSegments } from "@/lib/stentGeometry";
import type {
  CaseInput,
  ConflictResult,
  DeviceAnalysisResult,
  DeviceGeometry,
} from "@/lib/types";

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
    adjustedClock:
      fenestration.ftype === "SCALLOP"
        ? fenestration.clock
        : arcToClockString(
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
      rotation: {
        optimalDeltaMm: 0,
        optimalDeltaDeg: 0,
        validWindows: [],
        hasConflictFreeRotation: false,
        bestCompromiseMm: 0,
        bestCompromiseDeg: 0,
        scanData: [],
      },
      minClearanceAtOptimal: 0,
      totalValidWindowMm: 0,
      unsupportedReason:
        "No available graft size matches the requested neck diameter with standard oversizing.",
    };
  }

  const circumferenceMm = Math.PI * size.graftDiameter;
  const nPeaks = getNPeaks(device, size.graftDiameter);
  const strutSegments = buildStrutSegments(
    circumferenceMm,
    device.ringHeight,
    device.interRingGap,
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

  const minimumOptimalDistance = optimalConflicts
    .map((result) => result.minDist)
    .filter(Number.isFinite);

  return {
    device,
    size,
    circumferenceMm,
    nPeaks,
    strutSegments,
    baselineConflicts,
    optimalConflicts,
    rotation,
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

export function rankDevices(results: DeviceAnalysisResult[]) {
  return [...results].sort((left, right) => {
    if (!!left.size !== !!right.size) {
      return left.size ? -1 : 1;
    }

    if (!left.size || !right.size) {
      return left.device.clinicalRank - right.device.clinicalRank;
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
  const devices = deviceIds?.length
    ? deviceIds
        .map((deviceId) => getDeviceById(deviceId))
        .filter((device): device is DeviceGeometry => Boolean(device))
    : ALL_DEVICES;

  return rankDevices(devices.map((device) => analyseDevice(caseInput, device)));
}

export function getRotationSummary(result: DeviceAnalysisResult) {
  if (!result.size) {
    return "No compatible graft size for this anatomy.";
  }

  if (result.rotation.hasConflictFreeRotation) {
    const primaryWindow = result.rotation.validWindows[0];
    return `Conflict-free rotation: +${result.rotation.optimalDeltaDeg.toFixed(1)}° (${result.rotation.optimalDeltaMm.toFixed(1)} mm)${
      primaryWindow
        ? `, window ${primaryWindow.startDeg.toFixed(1)}°–${primaryWindow.endDeg.toFixed(1)}°`
        : ""
    }.`;
  }

  return `No conflict-free rotation. Best compromise: +${result.rotation.bestCompromiseDeg.toFixed(1)}° (${result.rotation.bestCompromiseMm.toFixed(1)} mm).`;
}

export function getConflictCount(results: ConflictResult[]) {
  return results.filter((result) => result.conflict).length;
}
