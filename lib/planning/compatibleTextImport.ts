import { ALL_DEVICES, getDeviceById } from "@/lib/devices";
import { normalizeClockText } from "@/lib/planning/clock";
import {
  savedPlannerProjectSchema,
  type SavedPlannerProject,
} from "@/lib/planning/persistence";
import type {
  CaseInput,
  DeviceGeometry,
  DeviceSize,
  Fenestration,
  FenestrationType,
  VesselName,
} from "@/lib/types";

const COMPATIBLE_TEXT_HEADER = "Fenestrations:";
const DEFAULT_DEVICE_IDS = ALL_DEVICES.map((device) => device.id);

interface NeckEstimateCandidate {
  device: DeviceGeometry;
  size: DeviceSize;
  deltaMm: number;
}

interface NeckDiameterEstimate {
  neckDiameterMm: number;
  summary: string;
}

export interface CompatibleTextImportResult {
  savedProject: SavedPlannerProject;
  importSummary: string;
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function basenameWithoutExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatMm(value: number): string {
  return `${roundToTenth(value).toFixed(1)} mm`;
}

function inferSelectedDeviceIds(fileName: string): string[] {
  const upperName = fileName.toUpperCase();

  if (upperName.startsWith("TREO")) {
    return ["treo"];
  }

  if (upperName.startsWith("ENDURANT")) {
    return ["endurant_ii"];
  }

  return DEFAULT_DEVICE_IDS;
}

function mapVesselName(rawName: string): VesselName {
  const normalized = rawName.trim().toUpperCase();

  switch (normalized) {
    case "SMA":
      return "SMA";
    case "LRA":
      return "LRA";
    case "RRA":
      return "RRA";
    case "CELIAC":
    case "CA":
      return "CELIAC";
    case "LMA":
    case "IMA":
      return "LMA";
    default:
      return "CUSTOM";
  }
}

function inferFenestrationType(diameterMm: number): FenestrationType {
  return diameterMm >= 10 ? "LARGE_FEN" : "SMALL_FEN";
}

function parsePatientName(text: string): string {
  const match = /^Patient name:[ \t]*([^\r\n]*)$/im.exec(text);
  return match?.[1]?.trim() ?? "";
}

function parseGraftDiameter(text: string): number {
  const match = /^Graft diameter:\s*([0-9.]+)\s*mm$/im.exec(text);
  if (!match?.[1]) {
    throw new Error("Compatible text export is missing graft diameter.");
  }

  const diameterMm = Number(match[1]);
  if (!Number.isFinite(diameterMm) || diameterMm <= 0) {
    throw new Error("Compatible text export contains an invalid graft diameter.");
  }

  return diameterMm;
}

function parseFenestrations(text: string): Fenestration[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const startIndex = lines.findIndex((line) => line === COMPATIBLE_TEXT_HEADER);

  if (startIndex === -1) {
    throw new Error("Compatible text export is missing the fenestration section.");
  }

  const fenestrationLines = lines.slice(startIndex + 1);
  const fenestrations = fenestrationLines.map((line) => {
    const match =
      /^Name:\s*(.+?),\s*Clock pos:\s*([^,]+),\s*Dist(?: 2nd)?:\s*([0-9.]+)\s*mm,\s*Diameter:\s*([0-9.]+)\s*mm$/i.exec(
        line,
      );

    if (!match) {
      throw new Error(`Could not parse fenestration line: "${line}"`);
    }

    const [, rawName, rawClock, rawDistance, rawDiameter] = match;
    const diameterMm = Number(rawDiameter);
    const distanceMm = Number(rawDistance);

    if (!Number.isFinite(diameterMm) || !Number.isFinite(distanceMm)) {
      throw new Error(`Invalid numeric values in fenestration line: "${line}"`);
    }

    return {
      vessel: mapVesselName(rawName),
      ftype: inferFenestrationType(diameterMm),
      clock: normalizeClockText(rawClock, { separator: ":", padHour: false }),
      depthMm: distanceMm,
      widthMm: diameterMm,
      heightMm: diameterMm,
    } satisfies Fenestration;
  });

  if (fenestrations.length === 0) {
    throw new Error("Compatible text export does not contain any fenestrations.");
  }

  if (fenestrations.length > 4) {
    throw new Error("PMEGPlan currently supports importing up to 4 fenestrations.");
  }

  return fenestrations;
}

function buildCandidateLabel(candidate: NeckEstimateCandidate): string {
  return `${candidate.device.shortName} ${candidate.size.graftDiameter} mm (${candidate.size.neckDiameterMin}-${candidate.size.neckDiameterMax} mm neck)`;
}

function estimateNeckDiameterFromGraftDiameter(
  graftDiameterMm: number,
  selectedDeviceIds: string[],
): NeckDiameterEstimate {
  const candidateDevices =
    selectedDeviceIds
      .map((deviceId) => getDeviceById(deviceId))
      .filter((device): device is DeviceGeometry => Boolean(device)) || [];
  const devices = candidateDevices.length > 0 ? candidateDevices : ALL_DEVICES;
  const allCandidates = devices.flatMap((device) =>
    device.sizes.map((size) => ({
      device,
      size,
      deltaMm: Math.abs(size.graftDiameter - graftDiameterMm),
    })),
  );
  const exactCandidates = allCandidates.filter(
    (candidate) => candidate.deltaMm === 0,
  );
  const candidates =
    exactCandidates.length > 0
      ? exactCandidates
      : allCandidates.filter(
          (candidate) =>
            candidate.deltaMm ===
            Math.min(...allCandidates.map((entry) => entry.deltaMm)),
        );

  const overlapMin = Math.max(
    ...candidates.map((candidate) => candidate.size.neckDiameterMin),
  );
  const overlapMax = Math.min(
    ...candidates.map((candidate) => candidate.size.neckDiameterMax),
  );

  if (overlapMin <= overlapMax) {
    const neckDiameterMm = roundToTenth((overlapMin + overlapMax) / 2);
    const summary =
      exactCandidates.length > 0
        ? `Estimated neck diameter ${formatMm(neckDiameterMm)} from imported graft diameter ${formatMm(graftDiameterMm)} using exact size-table overlap ${formatMm(overlapMin)}-${formatMm(overlapMax)} across ${candidates.map(buildCandidateLabel).join(", ")}.`
        : `Estimated neck diameter ${formatMm(neckDiameterMm)} from imported graft diameter ${formatMm(graftDiameterMm)} using nearest available size-table overlap ${formatMm(overlapMin)}-${formatMm(overlapMax)} across ${candidates.map(buildCandidateLabel).join(", ")}.`;

    return {
      neckDiameterMm,
      summary,
    };
  }

  const rangeMidpoints = candidates.map(
    (candidate) =>
      (candidate.size.neckDiameterMin + candidate.size.neckDiameterMax) / 2,
  );
  const neckDiameterMm = roundToTenth(
    rangeMidpoints.reduce((sum, value) => sum + value, 0) / rangeMidpoints.length,
  );

  return {
    neckDiameterMm,
    summary:
      exactCandidates.length > 0
        ? `Estimated neck diameter ${formatMm(neckDiameterMm)} from imported graft diameter ${formatMm(graftDiameterMm)} by averaging conflicting exact size-table matches: ${candidates.map(buildCandidateLabel).join(", ")}.`
        : `Estimated neck diameter ${formatMm(neckDiameterMm)} from imported graft diameter ${formatMm(graftDiameterMm)} using the nearest available device size tables: ${candidates.map(buildCandidateLabel).join(", ")}.`,
  };
}

export function parseCompatibleTextExport(
  fileName: string,
  text: string,
): CompatibleTextImportResult {
  const graftDiameterMm = parseGraftDiameter(text);
  const selectedDeviceIds = inferSelectedDeviceIds(fileName);
  const neckEstimate = estimateNeckDiameterFromGraftDiameter(
    graftDiameterMm,
    selectedDeviceIds,
  );
  const caseInput: CaseInput = {
    neckDiameterMm: neckEstimate.neckDiameterMm,
    patientId: parsePatientName(text) || basenameWithoutExtension(fileName),
    surgeonNote: `Imported from compatible text export (${fileName}). ${neckEstimate.summary}`,
    fenestrations: parseFenestrations(text),
  };

  return {
    savedProject: savedPlannerProjectSchema.parse({
      schemaVersion: 1,
      projectId: `imported_${hashString(`${fileName}\n${text}`)}`,
      savedAt: new Date().toISOString(),
      selectedDeviceIds,
      caseInput,
    }),
    importSummary: neckEstimate.summary,
  };
}

export function isLikelyCompatibleTextExport(text: string): boolean {
  return (
    /^Graft diameter:\s*[0-9.]+\s*mm$/im.test(text) &&
    /^Fenestrations:\s*$/im.test(text) &&
    /^Name:\s*.+,\s*Clock pos:\s*.+,\s*Dist(?: 2nd)?:\s*[0-9.]+\s*mm,\s*Diameter:\s*[0-9.]+\s*mm$/im.test(
      text,
    )
  );
}
