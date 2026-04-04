import { z } from "zod";

import { ALL_DEVICES } from "@/lib/devices";
import type { PlanningProject } from "@/lib/planning/types";
import type { CaseInput } from "@/lib/types";
import { caseSchema } from "@/lib/validation";

const knownDeviceIds = new Set(ALL_DEVICES.map((device) => device.id));

export const savedPlannerProjectSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.string().min(1),
  savedAt: z.string().min(1),
  selectedDeviceIds: z
    .array(z.string())
    .min(1)
    .refine(
      (deviceIds) => deviceIds.every((deviceId) => knownDeviceIds.has(deviceId)),
      "Saved project contains an unknown device id.",
    ),
  caseInput: caseSchema,
});

export type SavedPlannerProject = z.output<typeof savedPlannerProjectSchema>;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function createSavedPlannerProject(input: {
  project: PlanningProject;
  caseInput: CaseInput;
  selectedDeviceIds: string[];
}): SavedPlannerProject {
  return savedPlannerProjectSchema.parse({
    schemaVersion: 1,
    projectId: input.project.projectId,
    savedAt: new Date().toISOString(),
    selectedDeviceIds: input.selectedDeviceIds,
    caseInput: input.caseInput,
  });
}

export function serializeSavedPlannerProject(
  savedProject: SavedPlannerProject,
): string {
  return JSON.stringify(savedProject, null, 2);
}

export function parseSavedPlannerProject(jsonText: string): SavedPlannerProject {
  const parsed = JSON.parse(jsonText) as unknown;
  return savedPlannerProjectSchema.parse(parsed);
}

export function getSavedPlannerProjectFilename(
  savedProject: SavedPlannerProject,
): string {
  const caseLabel =
    savedProject.caseInput.patientId?.trim() ||
    savedProject.projectId ||
    "pmegplan-project";

  return `${slugify(caseLabel) || "pmegplan-project"}.json`;
}
