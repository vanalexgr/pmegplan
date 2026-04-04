"use client";

import { create } from "zustand";

import { analyseCase } from "@/lib/analysis";
import { ALL_DEVICES } from "@/lib/devices";
import { createPlanningProjectFromCaseInput } from "@/lib/planning/project";
import { sampleCase } from "@/lib/sampleCase";
import type { CaseInput, DeviceAnalysisResult, Fenestration } from "@/lib/types";
import type { PlanningProject } from "@/lib/planning/types";

interface PlannerStore {
  caseInput: CaseInput;
  planningProject: PlanningProject;
  selectedDeviceIds: string[];
  results: DeviceAnalysisResult[];
  analyse: (caseInput: CaseInput) => void;
  updateFenestration: (
    index: number,
    patch: Partial<Pick<Fenestration, "clock" | "depthMm" | "widthMm" | "heightMm">>,
  ) => void;
  toggleDeviceSelection: (deviceId: string) => void;
  setSelectedDeviceIds: (deviceIds: string[]) => void;
  loadSampleCase: () => void;
}

const defaultDeviceIds = ALL_DEVICES.map((device) => device.id);

function buildPlannerSnapshot(
  caseInput: CaseInput,
  selectedDeviceIds: string[],
  projectId?: string,
) {
  const results = analyseCase(caseInput, selectedDeviceIds);
  const preferredDeviceId =
    results.find((result) => result.size)?.device.id ?? selectedDeviceIds[0] ?? null;

  return {
    results,
    planningProject: createPlanningProjectFromCaseInput(
      caseInput,
      preferredDeviceId,
      projectId,
    ),
  };
}

const initialSnapshot = buildPlannerSnapshot(sampleCase, defaultDeviceIds);

export const usePlannerStore = create<PlannerStore>((set, get) => ({
  caseInput: sampleCase,
  planningProject: initialSnapshot.planningProject,
  selectedDeviceIds: defaultDeviceIds,
  results: initialSnapshot.results,
  analyse: (caseInput) =>
    set((state) => ({
      caseInput,
      ...buildPlannerSnapshot(
        caseInput,
        state.selectedDeviceIds,
        state.planningProject.projectId,
      ),
    })),
  updateFenestration: (index, patch) =>
    set((state) => {
      const nextCaseInput: CaseInput = {
        ...state.caseInput,
        fenestrations: state.caseInput.fenestrations.map((fenestration, currentIndex) =>
          currentIndex === index ? { ...fenestration, ...patch } : fenestration,
        ),
      };

      return {
        caseInput: nextCaseInput,
        ...buildPlannerSnapshot(
          nextCaseInput,
          state.selectedDeviceIds,
          state.planningProject.projectId,
        ),
      };
    }),
  toggleDeviceSelection: (deviceId) => {
    const selected = get().selectedDeviceIds;
    const next = selected.includes(deviceId)
      ? selected.filter((current) => current !== deviceId)
      : [...selected, deviceId];

    set({
      selectedDeviceIds: next,
      ...buildPlannerSnapshot(get().caseInput, next, get().planningProject.projectId),
    });
  },
  setSelectedDeviceIds: (deviceIds) =>
    set({
      selectedDeviceIds: deviceIds,
      ...buildPlannerSnapshot(
        get().caseInput,
        deviceIds,
        get().planningProject.projectId,
      ),
    }),
  loadSampleCase: () => {
    const snapshot = buildPlannerSnapshot(sampleCase, defaultDeviceIds);

    set({
      caseInput: sampleCase,
      planningProject: snapshot.planningProject,
      selectedDeviceIds: defaultDeviceIds,
      results: snapshot.results,
    });
  },
}));
