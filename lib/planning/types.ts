import type { FenestrationType, VesselName } from "@/lib/types";

export type BaselineMode = "top" | "bottom";
export type GraftConfiguration = "tube" | "bifurcated";

export type PlanningFenestrationKind =
  | "scallop"
  | "large_fenestration"
  | "small_fenestration";

export interface PlanningPatient {
  displayName: string;
  patientId?: string;
  surgeonName?: string;
  note?: string;
}

export interface PlanningGraft {
  deviceProfileId: string | null;
  configuration: GraftConfiguration;
  neckDiameterMm: number;
  selectedGraftDiameterMm: number | null;
  templateHeightMm: number;
  baselineMode: BaselineMode;
  secondaryBaselineMm: number | null;
  xAdjustMm: number;
}

export interface PlanningFenestration {
  id: string;
  vessel: VesselName;
  sourceType: FenestrationType;
  label: string;
  kind: PlanningFenestrationKind;
  clockText: string;
  clockFraction: number;
  distanceMm: number;
  widthMm: number;
  heightMm: number;
}

export interface PlanningProject {
  schemaVersion: 1;
  projectId: string;
  patient: PlanningPatient;
  graft: PlanningGraft;
  fenestrations: PlanningFenestration[];
}

export interface PlanarPointMm {
  xMm: number;
  yMm: number;
}

export interface CylinderPointMm {
  x: number;
  y: number;
  z: number;
  thetaRad: number;
}

export interface PlanningDeviceProfile {
  id: string;
  label: string;
  manufacturer: string;
  supportedConfigurations: GraftConfiguration[];
  supportedNeckRangeMm: {
    min: number;
    max: number;
  } | null;
  selectedGraftDiameterMm: number | null;
  templateHeightMm: number;
  seamDeg: number;
  wireRadiusMm: number;
  nPeaks: number | null;
  notes: string;
}
