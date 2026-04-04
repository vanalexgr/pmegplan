import { useMemo, useDeferredValue } from "react";
import { buildStrutSegments } from "@/lib/stentGeometry";
import { checkConflict } from "@/lib/conflictDetection";
import { selectSize, getNPeaks, ALL_DEVICES } from "@/lib/devices";
import { circumferenceMm } from "@/lib/planning/geometry";
import type { CaseInput, ConflictResult } from "@/lib/types";

export interface LiveConflictResult {
  /** Index matches caseInput.fenestrations */
  perFenestration: ConflictResult[];
  anyConflict: boolean;
}

/**
 * Runs conflict detection synchronously on every caseInput change, for the
 * first compatible device in the provided list.
 * Returns null until the first result is available.
 */
export function useLiveConflict(
  caseInput: CaseInput,
  selectedDeviceIds: string[],
): LiveConflictResult | null {
  const deferred = useDeferredValue(caseInput);

  const result = useMemo(() => {
    if (selectedDeviceIds.length === 0 || !deferred.neckDiameterMm) {
      return null;
    }

    const device = ALL_DEVICES.find((d) => selectedDeviceIds.includes(d.id));
    if (!device) {
      return null;
    }

    const size = selectSize(device, deferred.neckDiameterMm);
    if (!size) {
      return null;
    }

    const nPeaks = getNPeaks(device, size.graftDiameter);
    const circ = circumferenceMm(size.graftDiameter);
    const segs = buildStrutSegments(device, circ, size.graftDiameter, nPeaks);

    const perFenestration: ConflictResult[] = deferred.fenestrations.map((fen) => {
      const { conflict, minDist } = checkConflict(fen, segs, circ, device.wireRadius);
      const safeThreshold = Math.max(fen.widthMm, fen.heightMm) / 2 + device.wireRadius;
      return {
        conflict,
        minDist,
        safeThreshold,
        adjustedClock: fen.clock,
        deltaMm: 0,
      };
    });

    return {
      perFenestration,
      anyConflict: perFenestration.some((r) => r.conflict),
    };
  }, [deferred, selectedDeviceIds]);

  return result;
}
