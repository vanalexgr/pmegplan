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
  /**
   * Per-size ring row height override (mm). When set, takes precedence over
   * `DeviceGeometry.ringHeight` for this graft diameter. Used for devices
   * such as Endurant II where the M-stent amplitude scales with diameter
   * (sourced from IFU template measurements).
   */
  ringHeightMm?: number;
  /**
   * Per-size inter-ring gap override (mm). When set, takes precedence over
   * `DeviceGeometry.interRingGap` for this graft diameter.
   */
  interRingGapMm?: number;
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
  /** Clock positions (1–12) for reduction tie guides on punch card, e.g. [4, 6, 8]. */
  tieClock?: number[];
  /** Height of transparent film in mm. When set, draws a reference line on punch card. */
  filmHeightMm?: number;
}

export type StrutSegment = [number, number, number, number];

/**
 * A contiguous window of global depth-shift delta (mm) where all
 * fenestrations are simultaneously clear of struts.
 */
export interface DepthWindow {
  startMm: number;
  endMm: number;
}

/**
 * Result of global depth-offset optimisation.
 * All fenestrations are shifted by the same delta (mm) to maintain
 * their relative axial spacing.
 */
export interface DepthResult {
  /** Best depth-shift delta (mm). 0 means no adjustment needed. */
  optimalDeltaMm: number;
  /** True if at least one conflict-free delta exists. */
  hasConflictFreeDepth: boolean;
  /** Windows of delta (mm) where all fens are simultaneously clear. */
  validWindows: DepthWindow[];
  /** Best delta even when no conflict-free solution exists. */
  bestCompromiseDeltaMm: number;
  /** Absolute depth (mm) for each fenestration after applying optimalDeltaMm. */
  adjustedDepths: number[];
  /** Clearance (mm) for each fenestration at the optimal delta. */
  clearancePerFen: number[];
  /** Minimum valid delta (mm) — determined by MIN_PROX_DEPTH_MM constraint. */
  scanMin: number;
  /** Maximum valid delta (mm) — determined by seal-zone height. */
  scanMax: number;
}

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
  withinTorqueLimit: boolean;
  excludedByTorqueCap: boolean;
  deploymentTorqueDeg: number;
  deploymentTorqueDirection: "clockwise" | "counter-clockwise" | "none";
  targetAlignmentDeg: number;
}

export interface RotationResult {
  optimalDeltaMm: number;
  optimalDeltaDeg: number;
  validWindows: ValidWindow[];
  hasConflictFreeRotation: boolean;
  bestCompromiseMm: number;
  bestCompromiseDeg: number;
  scanData: RotationScanPoint[];
  hasTorqueExcludedConflictFreeSolution: boolean;
  bestTorqueExcludedConflictFreeAlignmentDeg?: number;
  bestTorqueExcludedConflictFreeTorqueDeg?: number;
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
  /** Global depth-shift optimisation (all fens shifted together). */
  depthOptimisation: DepthResult;
  rotation: RotationResult;
  minClearanceAtOptimal: number;
  totalValidWindowMm: number;
  robustness: RobustnessSummary | null;
  manufacturabilityScore: number;
  unsupportedReason?: string;
}
