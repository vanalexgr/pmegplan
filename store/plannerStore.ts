"use client";

import { create } from "zustand";

import { analyseCase } from "@/lib/analysis";
import { normalizeCaseInput } from "@/lib/caseInput";
import { ALL_DEVICES } from "@/lib/devices";
import type { SavedPlannerProject } from "@/lib/planning/persistence";
import { createPlanningProjectFromCaseInput } from "@/lib/planning/project";
import { sampleCase } from "@/lib/sampleCase";
import type { CaseInput, DeviceAnalysisResult, Fenestration } from "@/lib/types";
import type { PlanningProject } from "@/lib/planning/types";

const HISTORY_LIMIT = 50;

type FenestrationPatch = Partial<Fenestration>;

interface PlannerSnapshot {
  caseInput: CaseInput;
  selectedDeviceIds: string[];
  projectId: string;
}

interface PlannerStore {
  caseInput: CaseInput;
  planningProject: PlanningProject;
  selectedDeviceIds: string[];
  results: DeviceAnalysisResult[];
  isReady: boolean;
  historyPast: PlannerSnapshot[];
  historyFuture: PlannerSnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  bootstrap: () => void;
  analyse: (caseInput: CaseInput) => void;
  updateFenestration: (index: number, patch: FenestrationPatch) => void;
  updateFenestrations: (
    patches: Array<{ index: number; patch: FenestrationPatch }>,
  ) => void;
  toggleDeviceSelection: (deviceId: string) => void;
  setSelectedDeviceIds: (deviceIds: string[]) => void;
  undo: () => void;
  redo: () => void;
  loadSampleCase: () => void;
  loadSavedProject: (savedProject: SavedPlannerProject) => void;
}

const defaultDeviceIds = ALL_DEVICES.map((device) => device.id);

function cloneCaseInput(caseInput: CaseInput): CaseInput {
  const normalized = normalizeCaseInput(caseInput);

  return {
    ...normalized,
    fenestrations: normalized.fenestrations.map((fenestration) => ({
      ...fenestration,
    })),
  };
}

function cloneSnapshot(snapshot: PlannerSnapshot): PlannerSnapshot {
  return {
    caseInput: cloneCaseInput(snapshot.caseInput),
    selectedDeviceIds: [...snapshot.selectedDeviceIds],
    projectId: snapshot.projectId,
  };
}

function buildPlannerSnapshot(
  caseInput: CaseInput,
  selectedDeviceIds: string[],
  projectId?: string,
) {
  const normalizedCaseInput = normalizeCaseInput(caseInput);
  const results = analyseCase(normalizedCaseInput, selectedDeviceIds);
  const preferredDeviceId =
    results.find((result) => result.size)?.device.id ?? selectedDeviceIds[0] ?? null;

  return {
    results,
    planningProject: createPlanningProjectFromCaseInput(
      normalizedCaseInput,
      preferredDeviceId,
      projectId,
    ),
  };
}

function buildSnapshot(
  caseInput: CaseInput,
  selectedDeviceIds: string[],
  projectId: string,
): PlannerSnapshot {
  const normalizedCaseInput = cloneCaseInput(caseInput);

  return {
    caseInput: normalizedCaseInput,
    selectedDeviceIds: [...selectedDeviceIds],
    projectId,
  };
}

function buildStateFromSnapshot(snapshot: PlannerSnapshot) {
  const nextCaseInput = cloneCaseInput(snapshot.caseInput);
  const nextSelectedDeviceIds = [...snapshot.selectedDeviceIds];
  const derived = buildPlannerSnapshot(
    nextCaseInput,
    nextSelectedDeviceIds,
    snapshot.projectId,
  );

  return {
    caseInput: nextCaseInput,
    selectedDeviceIds: nextSelectedDeviceIds,
    results: derived.results,
    planningProject: derived.planningProject,
  };
}

function snapshotEquals(left: PlannerSnapshot, right: PlannerSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pushPast(
  history: PlannerSnapshot[],
  snapshot: PlannerSnapshot,
): PlannerSnapshot[] {
  return [...history.slice(-(HISTORY_LIMIT - 1)), cloneSnapshot(snapshot)];
}

function pushFuture(
  history: PlannerSnapshot[],
  snapshot: PlannerSnapshot,
): PlannerSnapshot[] {
  return [cloneSnapshot(snapshot), ...history].slice(0, HISTORY_LIMIT);
}

function commitSnapshotChange(
  state: PlannerStore,
  nextSnapshot: PlannerSnapshot,
): Partial<PlannerStore> | PlannerStore {
  const currentSnapshot = buildSnapshot(
    state.caseInput,
    state.selectedDeviceIds,
    state.planningProject.projectId,
  );

  if (snapshotEquals(currentSnapshot, nextSnapshot)) {
    return state;
  }

  return {
    ...buildStateFromSnapshot(nextSnapshot),
    isReady: true,
    historyPast: pushPast(state.historyPast, currentSnapshot),
    historyFuture: [],
    canUndo: true,
    canRedo: false,
  };
}

const initialProject = createPlanningProjectFromCaseInput(
  sampleCase,
  defaultDeviceIds[0] ?? null,
);
const initialSnapshot = buildSnapshot(
  sampleCase,
  defaultDeviceIds,
  initialProject.projectId,
);

export const usePlannerStore = create<PlannerStore>((set, get) => ({
  caseInput: cloneCaseInput(initialSnapshot.caseInput),
  planningProject: initialProject,
  selectedDeviceIds: [...initialSnapshot.selectedDeviceIds],
  results: [],
  isReady: false,
  historyPast: [],
  historyFuture: [],
  canUndo: false,
  canRedo: false,
  bootstrap: () =>
    set((state) => {
      if (state.isReady) {
        return state;
      }

      const derived = buildPlannerSnapshot(
        state.caseInput,
        state.selectedDeviceIds,
        state.planningProject.projectId,
      );

      return {
        ...derived,
        isReady: true,
      };
    }),
  analyse: (caseInput) =>
    set((state) =>
      commitSnapshotChange(
        state,
        buildSnapshot(
          caseInput,
          state.selectedDeviceIds,
          state.planningProject.projectId,
        ),
      ),
    ),
  updateFenestration: (index, patch) =>
    get().updateFenestrations([{ index, patch }]),
  updateFenestrations: (patches) =>
    set((state) => {
      const patchMap = new Map<number, FenestrationPatch>();
      for (const { index, patch } of patches) {
        patchMap.set(index, { ...patchMap.get(index), ...patch });
      }

      const nextCaseInput: CaseInput = {
        ...state.caseInput,
        fenestrations: state.caseInput.fenestrations.map((fenestration, index) => {
          const patch = patchMap.get(index);
          return patch ? { ...fenestration, ...patch } : fenestration;
        }),
      };

      return commitSnapshotChange(
        state,
        buildSnapshot(
          nextCaseInput,
          state.selectedDeviceIds,
          state.planningProject.projectId,
        ),
      );
    }),
  toggleDeviceSelection: (deviceId) =>
    set((state) => {
      const nextSelectedDeviceIds = state.selectedDeviceIds.includes(deviceId)
        ? state.selectedDeviceIds.filter((current) => current !== deviceId)
        : [...state.selectedDeviceIds, deviceId];

      if (nextSelectedDeviceIds.length === 0) {
        return state;
      }

      return commitSnapshotChange(
        state,
        buildSnapshot(
          state.caseInput,
          nextSelectedDeviceIds,
          state.planningProject.projectId,
        ),
      );
    }),
  setSelectedDeviceIds: (deviceIds) =>
    set((state) => {
      if (deviceIds.length === 0) {
        return state;
      }

      return commitSnapshotChange(
        state,
        buildSnapshot(
          state.caseInput,
          deviceIds,
          state.planningProject.projectId,
        ),
      );
    }),
  undo: () =>
    set((state) => {
      const previousSnapshot = state.historyPast.at(-1);
      if (!previousSnapshot) {
        return state;
      }

      const currentSnapshot = buildSnapshot(
        state.caseInput,
        state.selectedDeviceIds,
        state.planningProject.projectId,
      );
      const nextPast = state.historyPast.slice(0, -1);
      const nextFuture = pushFuture(state.historyFuture, currentSnapshot);

      return {
        ...buildStateFromSnapshot(previousSnapshot),
        historyPast: nextPast,
        historyFuture: nextFuture,
        canUndo: nextPast.length > 0,
        canRedo: nextFuture.length > 0,
      };
    }),
  redo: () =>
    set((state) => {
      const [nextSnapshot, ...remainingFuture] = state.historyFuture;
      if (!nextSnapshot) {
        return state;
      }

      const currentSnapshot = buildSnapshot(
        state.caseInput,
        state.selectedDeviceIds,
        state.planningProject.projectId,
      );
      const nextPast = pushPast(state.historyPast, currentSnapshot);

      return {
        ...buildStateFromSnapshot(nextSnapshot),
        historyPast: nextPast,
        historyFuture: remainingFuture,
        canUndo: nextPast.length > 0,
        canRedo: remainingFuture.length > 0,
      };
    }),
  loadSampleCase: () =>
    set((state) =>
      commitSnapshotChange(
        state,
        buildSnapshot(
          sampleCase,
          defaultDeviceIds,
          state.planningProject.projectId,
        ),
      ),
    ),
  loadSavedProject: (savedProject) =>
    set((state) =>
      commitSnapshotChange(
        state,
        buildSnapshot(
          savedProject.caseInput,
          savedProject.selectedDeviceIds,
          savedProject.projectId,
        ),
      ),
    ),
}));
