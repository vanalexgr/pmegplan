"use client";

import { create } from "zustand";

import { analyseCase } from "@/lib/analysis";
import { ALL_DEVICES } from "@/lib/devices";
import { sampleCase } from "@/lib/sampleCase";
import type { CaseInput, DeviceAnalysisResult } from "@/lib/types";

interface PlannerStore {
  caseInput: CaseInput;
  selectedDeviceIds: string[];
  results: DeviceAnalysisResult[];
  analyse: (caseInput: CaseInput) => void;
  toggleDeviceSelection: (deviceId: string) => void;
  setSelectedDeviceIds: (deviceIds: string[]) => void;
  loadSampleCase: () => void;
}

const defaultDeviceIds = ALL_DEVICES.map((device) => device.id);

export const usePlannerStore = create<PlannerStore>((set, get) => ({
  caseInput: sampleCase,
  selectedDeviceIds: defaultDeviceIds,
  results: analyseCase(sampleCase, defaultDeviceIds),
  analyse: (caseInput) =>
    set({
      caseInput,
      results: analyseCase(caseInput, get().selectedDeviceIds),
    }),
  toggleDeviceSelection: (deviceId) => {
    const selected = get().selectedDeviceIds;
    const next = selected.includes(deviceId)
      ? selected.filter((current) => current !== deviceId)
      : [...selected, deviceId];

    set({
      selectedDeviceIds: next,
      results: analyseCase(get().caseInput, next),
    });
  },
  setSelectedDeviceIds: (deviceIds) =>
    set({
      selectedDeviceIds: deviceIds,
      results: analyseCase(get().caseInput, deviceIds),
    }),
  loadSampleCase: () =>
    set({
      caseInput: sampleCase,
      selectedDeviceIds: defaultDeviceIds,
      results: analyseCase(sampleCase, defaultDeviceIds),
    }),
}));

