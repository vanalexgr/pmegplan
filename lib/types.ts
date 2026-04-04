export type VesselName =
  | "SMA"
  | "LRA"
  | "RRA"
  | "LMA"
  | "CELIAC"
  | "CUSTOM";

export type FenestrationType = "SCALLOP" | "LARGE_FEN" | "SMALL_FEN";

export interface DeviceSize {
  graftDiameter: number;
  neckDiameterMin: number;
  neckDiameterMax: number;
  sheathFr: number;
  mainBodyLengths: number[];
  nPeaks: number;
}

export interface DeviceGeometry {
  id: string;
  name: string;
  shortName: string;
  manufacturer: string;
  ringHeight: number;
  interRingGap: number;
  nRings: number;
  foreshortening: number;
  seamDeg: number;
  wireRadius: number;
  stentType: "Z-stent" | "helical" | "sinusoidal" | "M-stent";
  fabricMaterial: "polyester" | "ePTFE";
  pmegSuitability: 1 | 2 | 3 | 4;
  pmegNotes: string;
  clinicalRank: number;
  color: string;
  waveWidthMm: number;
  sizes: DeviceSize[];
  sources: string[];
  /**
   * Distance from the proximal fabric edge to the first covered stent row.
   * Used for devices such as Zenith Alpha that have a short proximal fabric collar
   * below the suprarenal bare stent before the first covered Z-row begins.
   */
  proximalRingOffsetMm?: number;
  /** Device has a bare suprarenal stent with fixation barbs above the fabric. */
  hasBareSuprarenal?: boolean;
  /**
   * Height of the bare suprarenal fixation zone in mm (distance from proximal
   * fabric edge to the cranial tip of the suprarenal stent).
   * TREO: 16 mm (20-28 mm) / 18 mm (30-36 mm) — IFU PM-08467-ROW Fig.
   * Zenith Alpha: 18 mm — IFU T_ZALPHA_REV5.
   * Endurant II: 16 mm — IFU M985265A001DOC1.
   * Omit for devices without a bare suprarenal stent.
   */
  suprarenalHeightMm?: number;
  /** Device also has infrarenal barbs (in fabric valleys of proximal covered ring). */
  hasInfrarenalBarbs?: boolean;
  /** Minimum infrarenal neck length (mm) per IFU. */
  minNeckLengthMm?: number;
  /** Maximum infrarenal neck angulation (degrees) per IFU. */
  maxInfrarenalAngleDeg?: number;
  /** Maximum suprarenal neck angulation (degrees) per IFU. */
  maxSuprarenalAngleDeg?: number;
}

export interface Fenestration {
  vessel: VesselName;
  ftype: FenestrationType;
  clock: string;
  depthMm: number;
  widthMm: number;
  heightMm: number;
}

export interface CaseInput {
  neckDiameterMm: number;
  fenestrations: Fenestration[];
  patientId?: string;
  surgeonName?: string;
  surgeonNote?: string;
}

export type StrutSegment = [number, number, number, number];

export interface ConflictResult {
  conflict: boolean;
  minDist: number;
  safeThreshold: number;
  adjustedClock: string;
  deltaMm: number;
}

export interface ValidWindow {
  startMm: number;
  endMm: number;
  startDeg: number;
  endDeg: number;
}

export interface RotationScanPoint {
  deltaMm: number;
  deltaDeg: number;
  distPerFen: number[];
  allClear: boolean;
}

export interface RotationResult {
  optimalDeltaMm: number;
  optimalDeltaDeg: number;
  validWindows: ValidWindow[];
  hasConflictFreeRotation: boolean;
  bestCompromiseMm: number;
  bestCompromiseDeg: number;
  scanData: RotationScanPoint[];
}

export interface RobustnessSummary {
  scenarioCount: number;
  conflictFreeCount: number;
  conflictFreeRate: number;
  globalScenarioCount: number;
  globalConflictFreeRate: number;
  localScenarioCount: number;
  localConflictFreeRate: number;
  averageMinClearanceAtOptimal: number;
  worstMinClearanceAtOptimal: number;
  averageValidWindowMm: number;
  worstValidWindowMm: number;
  mostSensitiveVessel: VesselName | null;
  simulatedCircumferentialErrorMm: number;
  simulatedLongitudinalErrorMm: number;
}

export interface DeviceAnalysisResult {
  device: DeviceGeometry;
  size: DeviceSize | null;
  circumferenceMm: number;
  nPeaks: number;
  strutSegments: StrutSegment[];
  baselineConflicts: ConflictResult[];
  optimalConflicts: ConflictResult[];
  rotation: RotationResult;
  minClearanceAtOptimal: number;
  totalValidWindowMm: number;
  robustness: RobustnessSummary | null;
  manufacturabilityScore: number;
  unsupportedReason?: string;
}
