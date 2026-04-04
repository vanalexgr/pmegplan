import type {
  BaselineMode,
  CylinderPointMm,
  PlanarPointMm,
} from "@/lib/planning/types";

export function circumferenceMm(diameterMm: number): number {
  return Math.PI * diameterMm;
}

export function wrapMm(value: number, circumference: number): number {
  const result = value % circumference;
  return result < 0 ? result + circumference : result;
}

export function distanceToPlanarY(
  baselineMode: BaselineMode,
  distanceMm: number,
  templateHeightMm: number,
): number {
  return baselineMode === "top" ? distanceMm : templateHeightMm - distanceMm;
}

export function fenestrationToPlanarPoint(input: {
  clockFraction: number;
  distanceMm: number;
  graftDiameterMm: number;
  baselineMode: BaselineMode;
  templateHeightMm: number;
  xAdjustMm?: number;
}): PlanarPointMm {
  return {
    xMm:
      input.clockFraction * circumferenceMm(input.graftDiameterMm) +
      (input.xAdjustMm ?? 0),
    yMm: distanceToPlanarY(
      input.baselineMode,
      input.distanceMm,
      input.templateHeightMm,
    ),
  };
}

export function planarToCylinderPoint(input: {
  xMm: number;
  yMm: number;
  graftDiameterMm: number;
}): CylinderPointMm {
  const radius = input.graftDiameterMm / 2;
  const thetaRad = (input.xMm / circumferenceMm(input.graftDiameterMm)) * 2 * Math.PI;

  return {
    x: radius * Math.sin(thetaRad),
    y: input.yMm,
    z: -radius * Math.cos(thetaRad),
    thetaRad,
  };
}

export function displacementMetrics(
  start: PlanarPointMm,
  end: PlanarPointMm,
) {
  const dxMm = end.xMm - start.xMm;
  const dyMm = end.yMm - start.yMm;

  return {
    dxMm,
    dyMm,
    distMm: Math.hypot(dxMm, dyMm),
  };
}
