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
  stentType: "Z-stent" | "helical" | "sinusoidal";
  fabricMaterial: "polyester" | "ePTFE";
  pmegSuitability: 1 | 2 | 3 | 4;
  pmegNotes: string;
  clinicalRank: number;
  color: string;
  waveWidthMm: number;
  sizes: DeviceSize[];
  sources: string[];
  /** Device has a bare suprarenal stent with fixation barbs above the fabric. */
  hasBareSuprarenal?: boolean;
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
  unsupportedReason?: string;
}

