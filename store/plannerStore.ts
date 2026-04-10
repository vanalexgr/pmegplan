"use client";

import { create } from "zustand";

import { analyseCaseProgressive } from "@/lib/analysis";
import { normalizeCaseInput } from "@/lib/caseInput";
import { ALL_DEVICES } from "@/lib/devices";
import { hashSnapshot } from "@/lib/planning/hash";
import type { SavedPlannerProject } from "@/lib/planning/persistence";
import { createPlanningProjectFromCaseInput } from "@/lib/planning/project";
import type { PlanningProject } from "@/lib/planning/types";
import { sampleCase } from "@/lib/sampleCase";
import type { CaseInput, DeviceAnalysisResult, Fenestration } from "@/lib/types";

const HISTORY_LIMIT = 50;

type FenestrationPatch = Partial<Fenestration>;
type AnalysisStatus = "idle" | "running" | "ready" | "stale";

interface PlannerSnapshot {
  caseInput: CaseInput;
  selectedDeviceIds: string[];
  projectId: string;
}

interface CompletedAnalysis {
  snapshot: PlannerSnapshot;
  results: DeviceAnalysisResult[];
  completedAt: string;
}

interface PlannerStore {
  caseInput: CaseInput;
  planningProject: PlanningProject;
  selectedDeviceIds: string[];
  results: DeviceAnalysisResult[];
  analysisStatus: AnalysisStatus;
  analysisProgress: number;
  analysisLabel: string | null;
  analysisCompleted: number;
  analysisTotal: number;
  lastCompletedAt: string | null;
  historyPast: PlannerSnapshot[];
  historyFuture: PlannerSnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  lastCompletedAnalysis: CompletedAnalysis | null;
  runAnalysis: (caseInput: CaseInput) => Promise<void>;
  stageCaseInput: (caseInput: CaseInput) => void;
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

function buildSnapshot(
  caseInput: CaseInput,
  selectedDeviceIds: string[],
  projectId: string,
): PlannerSnapshot {
  return {
    caseInput: cloneCaseInput(caseInput),
    selectedDeviceIds: [...selectedDeviceIds],
    projectId,
  };
}

function snapshotEquals(left: PlannerSnapshot, right: PlannerSnapshot): boolean {
  return (
    hashSnapshot(left.caseInput, left.selectedDeviceIds, left.projectId) ===
    hashSnapshot(right.caseInput, right.selectedDeviceIds, right.projectId)
  );
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

function getPreferredDeviceId(
  results: DeviceAnalysisResult[],
  fallbackDeviceIds: string[],
): string | null {
  return results.find((result) => result.size)?.device.id ?? fallbackDeviceIds[0] ?? null;
}

function buildPlanningProject(
  snapshot: PlannerSnapshot,
  preferredDeviceId?: string | null,
): PlanningProject {
  return createPlanningProjectFromCaseInput(
    snapshot.caseInput,
    preferredDeviceId ?? snapshot.selectedDeviceIds[0] ?? null,
    snapshot.projectId,
  );
}

function buildStateFromSnapshot(
  snapshot: PlannerSnapshot,
  lastCompletedAnalysis: CompletedAnalysis | null,
) {
  const nextCaseInput = cloneCaseInput(snapshot.caseInput);
  const nextSelectedDeviceIds = [...snapshot.selectedDeviceIds];
  const matchesLastCompleted =
    lastCompletedAnalysis !== null &&
    snapshotEquals(snapshot, lastCompletedAnalysis.snapshot);
  const preferredDeviceId = matchesLastCompleted
    ? getPreferredDeviceId(lastCompletedAnalysis.results, nextSelectedDeviceIds)
    : nextSelectedDeviceIds[0] ?? null;

  return {
    caseInput: nextCaseInput,
    selectedDeviceIds: nextSelectedDeviceIds,
    planningProject: buildPlanningProject(snapshot, preferredDeviceId),
    results: matchesLastCompleted ? lastCompletedAnalysis.results : [],
    analysisStatus: matchesLastCompleted
      ? ("ready" as const)
      : lastCompletedAnalysis
        ? ("stale" as const)
        : ("idle" as const),
    analysisProgress: matchesLastCompleted ? 1 : 0,
    analysisLabel: matchesLastCompleted ? "Analysis restored from the latest run." : null,
    analysisCompleted: matchesLastCompleted ? nextSelectedDeviceIds.length : 0,
    analysisTotal: nextSelectedDeviceIds.length,
    lastCompletedAt: lastCompletedAnalysis?.completedAt ?? null,
  };
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
    ...buildStateFromSnapshot(nextSnapshot, state.lastCompletedAnalysis),
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
  analysisStatus: "idle",
  analysisProgress: 0,
  analysisLabel: null,
  analysisCompleted: 0,
  analysisTotal: defaultDeviceIds.length,
  lastCompletedAt: null,
  historyPast: [],
  historyFuture: [],
  canUndo: false,
  canRedo: false,
  lastCompletedAnalysis: null,
  runAnalysis: async (nextCaseInput) => {
    const state = get();
    const nextSnapshot = buildSnapshot(
      nextCaseInput,
      state.selectedDeviceIds,
      state.planningProject.projectId,
    );
    const currentSnapshot = buildSnapshot(
      state.caseInput,
      state.selectedDeviceIds,
      state.planningProject.projectId,
    );
    const snapshotChanged = !snapshotEquals(currentSnapshot, nextSnapshot);
    const selectedDeviceIds = [...nextSnapshot.selectedDeviceIds];
    const analysisKey = hashSnapshot(
      nextSnapshot.caseInput,
      nextSnapshot.selectedDeviceIds,
      nextSnapshot.projectId,
    );
    const nextHistoryPast = snapshotChanged
      ? pushPast(state.historyPast, currentSnapshot)
      : state.historyPast;

    set((current) => ({
      ...current,
      caseInput: cloneCaseInput(nextSnapshot.caseInput),
      selectedDeviceIds: selectedDeviceIds,
      planningProject: buildPlanningProject(nextSnapshot),
      results: [],
      analysisStatus: "running",
      analysisProgress: 0,
      analysisCompleted: 0,
      analysisTotal: selectedDeviceIds.length,
      analysisLabel:
        selectedDeviceIds.length > 0
          ? `Preparing device analysis (0/${selectedDeviceIds.length})`
          : "Preparing device analysis",
      historyPast: nextHistoryPast,
      historyFuture: snapshotChanged ? [] : current.historyFuture,
      canUndo: nextHistoryPast.length > 0,
      canRedo: snapshotChanged ? false : current.canRedo,
    }));

    const results = await analyseCaseProgressive(
      nextSnapshot.caseInput,
      selectedDeviceIds,
      (progress) => {
        set((current) => {
          const currentKey = hashSnapshot(
            current.caseInput,
            current.selectedDeviceIds,
            current.planningProject.projectId,
          );

          if (
            current.analysisStatus !== "running" ||
            currentKey !== analysisKey
          ) {
            return current;
          }

          return {
            ...current,
            analysisProgress: progress.fraction,
            analysisCompleted: progress.completed,
            analysisTotal: progress.total,
            analysisLabel: `Analysing ${progress.deviceName} (${progress.completed}/${progress.total})`,
          };
        });
      },
    );

    set((current) => {
      const currentKey = hashSnapshot(
        current.caseInput,
        current.selectedDeviceIds,
        current.planningProject.projectId,
      );

      if (current.analysisStatus !== "running" || currentKey !== analysisKey) {
        return current;
      }

      const completedAt = new Date().toISOString();
      const preferredDeviceId = getPreferredDeviceId(results, selectedDeviceIds);
      const completedAnalysis: CompletedAnalysis = {
        snapshot: cloneSnapshot(nextSnapshot),
        results,
        completedAt,
      };

      return {
        ...current,
        results,
        planningProject: buildPlanningProject(nextSnapshot, preferredDeviceId),
        analysisStatus: "ready",
        analysisProgress: 1,
        analysisCompleted: selectedDeviceIds.length,
        analysisTotal: selectedDeviceIds.length,
        analysisLabel: `Analysis complete (${selectedDeviceIds.length}/${selectedDeviceIds.length})`,
        lastCompletedAt: completedAt,
        lastCompletedAnalysis: completedAnalysis,
      };
    });
  },
  stageCaseInput: (caseInput) =>
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
        ...buildStateFromSnapshot(previousSnapshot, state.lastCompletedAnalysis),
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
        ...buildStateFromSnapshot(nextSnapshot, state.lastCompletedAnalysis),
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
