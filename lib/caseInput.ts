import { normalizeClockText } from "@/lib/planning/clock";
import type { CaseInput, Fenestration } from "@/lib/types";

export function normalizeFenestration(fenestration: Fenestration): Fenestration {
  return {
    ...fenestration,
    clock: normalizeClockText(fenestration.clock, {
      separator: ":",
      padHour: false,
    }),
    depthMm: fenestration.ftype === "SCALLOP" ? 0 : fenestration.depthMm,
  };
}

export function normalizeCaseInput(caseInput: CaseInput): CaseInput {
  return {
    ...caseInput,
    fenestrations: caseInput.fenestrations.map(normalizeFenestration),
  };
}
