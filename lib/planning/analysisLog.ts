import { z } from "zod";

import { ALL_DEVICES } from "@/lib/devices";
import { hashString } from "@/lib/planning/hash";
import type { CaseInput, DeviceAnalysisResult } from "@/lib/types";

const ANALYSIS_LOG_STORAGE_KEY = "pmegplan.analysis-log";
const MAX_ANALYSIS_LOG_ENTRIES = 100;
const knownDeviceIds = new Set(ALL_DEVICES.map((device) => device.id));

export const analysisLogEntrySchema = z.object({
  id: z.string().min(1),
  completedAt: z.string().min(1),
  projectId: z.string().min(1),
  patientId: z.string().optional(),
  surgeonName: z.string().optional(),
  surgeonNote: z.string().optional(),
  neckDiameterMm: z.number(),
  fenestrationCount: z.number().int().min(1).max(4),
  selectedDeviceIds: z
    .array(z.string())
    .min(1)
    .refine(
      (deviceIds) => deviceIds.every((deviceId) => knownDeviceIds.has(deviceId)),
      "Analysis log contains an unknown device id.",
    ),
  selectedDeviceNames: z.array(z.string()).min(1),
  recommendedDeviceId: z.string().nullable(),
  recommendedDeviceName: z.string().nullable(),
  recommendedGraftDiameterMm: z.number().nullable(),
  recommendedScore: z.number().nullable(),
});

export type AnalysisLogEntry = z.output<typeof analysisLogEntrySchema>;

function canUseStorage() {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function trimOptionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function readAnalysisLog(): AnalysisLogEntry[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(ANALYSIS_LOG_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    return z.array(analysisLogEntrySchema).parse(parsed);
  } catch {
    return [];
  }
}

export function appendAnalysisLog(input: {
  projectId: string;
  caseInput: CaseInput;
  selectedDeviceIds: string[];
  results: DeviceAnalysisResult[];
  completedAt?: string;
}): AnalysisLogEntry[] {
  if (!canUseStorage()) {
    return [];
  }

  const completedAt = input.completedAt ?? new Date().toISOString();
  const recommendedResult =
    input.results.find((result) => result.size) ?? input.results[0] ?? null;
  const selectedDevices = input.selectedDeviceIds
    .map((deviceId) => ALL_DEVICES.find((device) => device.id === deviceId))
    .filter((device) => device !== undefined);

  const entry = analysisLogEntrySchema.parse({
    id: hashString(
      JSON.stringify({
        completedAt,
        projectId: input.projectId,
        patientId: trimOptionalText(input.caseInput.patientId),
        surgeonName: trimOptionalText(input.caseInput.surgeonName),
        selectedDeviceIds: input.selectedDeviceIds,
      }),
    ),
    completedAt,
    projectId: input.projectId,
    patientId: trimOptionalText(input.caseInput.patientId),
    surgeonName: trimOptionalText(input.caseInput.surgeonName),
    surgeonNote: trimOptionalText(input.caseInput.surgeonNote),
    neckDiameterMm: input.caseInput.neckDiameterMm,
    fenestrationCount: input.caseInput.fenestrations.length,
    selectedDeviceIds: input.selectedDeviceIds,
    selectedDeviceNames: selectedDevices.map((device) => device.shortName),
    recommendedDeviceId: recommendedResult?.device.id ?? null,
    recommendedDeviceName: recommendedResult?.device.shortName ?? null,
    recommendedGraftDiameterMm: recommendedResult?.size?.graftDiameter ?? null,
    recommendedScore: recommendedResult
      ? Number(recommendedResult.manufacturabilityScore.toFixed(1))
      : null,
  });

  const nextEntries = [entry, ...readAnalysisLog()].slice(0, MAX_ANALYSIS_LOG_ENTRIES);
  window.localStorage.setItem(
    ANALYSIS_LOG_STORAGE_KEY,
    JSON.stringify(nextEntries),
  );

  return nextEntries;
}
