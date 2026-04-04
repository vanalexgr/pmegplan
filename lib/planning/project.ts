import { getDeviceById, getNPeaks, selectSize } from "@/lib/devices";
import { normalizeCaseInput } from "@/lib/caseInput";
import type { CaseInput, DeviceGeometry, Fenestration } from "@/lib/types";
import { normalizeClockText, parseClockFraction } from "@/lib/planning/clock";
import type {
  PlanningDeviceProfile,
  PlanningFenestration,
  PlanningFenestrationKind,
  PlanningProject,
} from "@/lib/planning/types";

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createProjectId(caseInput: CaseInput, deviceId?: string | null): string {
  const seed = JSON.stringify({
    patientId: caseInput.patientId ?? "",
    surgeonName: caseInput.surgeonName ?? "",
    surgeonNote: caseInput.surgeonNote ?? "",
    neckDiameterMm: caseInput.neckDiameterMm,
    fenestrations: caseInput.fenestrations.map((fenestration) => ({
      vessel: fenestration.vessel,
      ftype: fenestration.ftype,
      clock: fenestration.clock,
      depthMm: fenestration.depthMm,
      widthMm: fenestration.widthMm,
      heightMm: fenestration.heightMm,
    })),
    deviceId: deviceId ?? "",
  });

  return `project_${hashString(seed)}`;
}

function fenestrationTypeToKind(
  type: Fenestration["ftype"],
): PlanningFenestrationKind {
  switch (type) {
    case "SCALLOP":
      return "scallop";
    case "LARGE_FEN":
      return "large_fenestration";
    default:
      return "small_fenestration";
  }
}

function vesselToLabel(vessel: Fenestration["vessel"]): string {
  switch (vessel) {
    case "LRA":
      return "Left renal";
    case "RRA":
      return "Right renal";
    case "LMA":
      return "IMA / LMA";
    case "CELIAC":
      return "Celiac";
    case "CUSTOM":
      return "Custom";
    default:
      return vessel;
  }
}

function toPlanningFenestration(
  fenestration: Fenestration,
  index: number,
): PlanningFenestration {
  const normalizedClock = normalizeClockText(fenestration.clock, {
    separator: ":",
    padHour: false,
  });

  return {
    id: `fen_${index + 1}`,
    vessel: fenestration.vessel,
    sourceType: fenestration.ftype,
    label: vesselToLabel(fenestration.vessel),
    kind: fenestrationTypeToKind(fenestration.ftype),
    clockText: normalizedClock,
    clockFraction: parseClockFraction(normalizedClock),
    distanceMm: fenestration.ftype === "SCALLOP" ? 0 : fenestration.depthMm,
    widthMm: fenestration.widthMm,
    heightMm: fenestration.heightMm,
  };
}

function estimateTemplateHeightMm(caseInput: CaseInput): number {
  return Math.max(
    120,
    ...caseInput.fenestrations.map((fenestration) => fenestration.depthMm + 28),
  );
}

export function buildPlanningDeviceProfile(
  device: DeviceGeometry,
  neckDiameterMm: number,
): PlanningDeviceProfile {
  const size = selectSize(device, neckDiameterMm);
  const supportedNeckRangeMm =
    device.sizes.length > 0
      ? {
          min: Math.min(...device.sizes.map((candidate) => candidate.neckDiameterMin)),
          max: Math.max(...device.sizes.map((candidate) => candidate.neckDiameterMax)),
        }
      : null;

  return {
    id: device.id,
    label: device.shortName,
    manufacturer: device.manufacturer,
    supportedConfigurations: ["bifurcated"],
    supportedNeckRangeMm,
    selectedGraftDiameterMm: size?.graftDiameter ?? null,
    templateHeightMm:
      device.nRings * device.ringHeight +
      Math.max(0, device.nRings - 1) * device.interRingGap +
      28,
    seamDeg: device.seamDeg,
    wireRadiusMm: device.wireRadius,
    nPeaks: size ? getNPeaks(device, size.graftDiameter) : null,
    notes: device.pmegNotes,
  };
}

export function createPlanningProjectFromCaseInput(
  caseInput: CaseInput,
  deviceId?: string | null,
  projectId?: string,
): PlanningProject {
  const normalizedCaseInput = normalizeCaseInput(caseInput);
  const selectedDevice = deviceId ? getDeviceById(deviceId) : null;
  const deviceProfileId = selectedDevice?.id ?? null;
  const selectedSize = selectedDevice
    ? selectSize(selectedDevice, normalizedCaseInput.neckDiameterMm)
    : null;

  return {
    schemaVersion: 1,
    projectId: projectId ?? createProjectId(normalizedCaseInput, deviceProfileId),
    patient: {
      displayName: normalizedCaseInput.patientId?.trim() || "Untitled PMEG case",
      patientId: normalizedCaseInput.patientId,
      surgeonName: normalizedCaseInput.surgeonName,
      note: normalizedCaseInput.surgeonNote,
    },
    graft: {
      deviceProfileId,
      configuration: "bifurcated",
      neckDiameterMm: normalizedCaseInput.neckDiameterMm,
      selectedGraftDiameterMm:
        selectedSize?.graftDiameter ?? normalizedCaseInput.neckDiameterMm,
      templateHeightMm: estimateTemplateHeightMm(normalizedCaseInput),
      baselineMode: "top",
      secondaryBaselineMm: null,
      xAdjustMm: 0,
    },
    fenestrations: normalizedCaseInput.fenestrations.map(toPlanningFenestration),
  };
}
