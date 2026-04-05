import { useMemo, useDeferredValue } from "react";
import { buildStrutSegments } from "@/lib/stentGeometry";
import { checkConflict } from "@/lib/conflictDetection";
import { selectSize, getNPeaks, ALL_DEVICES } from "@/lib/devices";
import { isValidClockText } from "@/lib/planning/clock";
import { circumferenceMm } from "@/lib/planning/geometry";
import type { CaseInput, ConflictResult, Fenestration } from "@/lib/types";

export interface LiveConflictResult {
  /** Index matches caseInput.fenestrations */
  perFenestration: Array<ConflictResult | null>;
  anyConflict: boolean;
}

function isReadyForLiveConflict(fenestration: Fenestration): boolean {
  if (fenestration.ftype === "SCALLOP") {
    return true;
  }

  return (
    isValidClockText(fenestration.clock) &&
    Number.isFinite(fenestration.depthMm) &&
    Number.isFinite(fenestration.widthMm) &&
    Number.isFinite(fenestration.heightMm)
  );
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

    const perFenestration = deferred.fenestrations.map((fen) => {
      if (!isReadyForLiveConflict(fen)) {
        return null;
      }

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
      anyConflict: perFenestration.some((result) => result?.conflict ?? false),
    };
  }, [deferred, selectedDeviceIds]);

  return result;
}
