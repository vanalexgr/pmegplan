import type { DeviceAnalysisResult } from "@/lib/types";

export interface DeviceRecommendationSummary {
  top: DeviceAnalysisResult | null;
  compatibleResults: DeviceAnalysisResult[];
  alternatives: DeviceAnalysisResult[];
  confidenceLabel: "Strong fit" | "Moderate fit" | "Compromise only" | "No fit";
  headline: string;
  reasons: string[];
  cautions: string[];
}

function formatMm(value: number): string {
  return `${value.toFixed(1)} mm`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSuitability(result: DeviceAnalysisResult): string {
  switch (result.device.pmegSuitability) {
    case 1:
      return "Top-tier PMEG base platform";
    case 2:
      return "Common PMEG alternative";
    case 3:
      return "Selective PMEG option";
    default:
      return "Lower-preference PMEG platform";
  }
}

function buildReasons(
  top: DeviceAnalysisResult,
  runnerUp: DeviceAnalysisResult | null,
  compatibleResults: DeviceAnalysisResult[],
): string[] {
  const reasons: string[] = [];
  const minimumSheath = Math.min(
    ...compatibleResults
      .map((result) => result.size?.sheathFr)
      .filter((value): value is number => typeof value === "number"),
  );

  if (top.rotation.hasConflictFreeRotation) {
    if (runnerUp && !runnerUp.rotation.hasConflictFreeRotation) {
      reasons.push("Only compatible platform with a conflict-free rotation strategy.");
    } else {
      reasons.push(
        `Conflict-free rotation with ${formatMm(top.totalValidWindowMm)} of usable rotational window.`,
      );
    }
  } else {
    reasons.push("Best compromise platform when no device achieves a conflict-free rotation.");
  }

  if (top.robustness) {
    reasons.push(
      `Remains conflict-free in ${formatPercent(top.robustness.conflictFreeRate)} of simulated ±${top.robustness.simulatedLongitudinalErrorMm.toFixed(1)} mm longitudinal and ±${top.robustness.simulatedCircumferentialErrorMm.toFixed(1)} mm circumferential perturbation scenarios.`,
    );
  }

  if (
    runnerUp &&
    top.manufacturabilityScore > runnerUp.manufacturabilityScore + 0.5
  ) {
    reasons.push(
      `Highest manufacturability score in the shortlist (${top.manufacturabilityScore.toFixed(1)}), ahead of the runner-up by ${(top.manufacturabilityScore - runnerUp.manufacturabilityScore).toFixed(1)} points.`,
    );
  } else if (
    runnerUp &&
    top.totalValidWindowMm > runnerUp.totalValidWindowMm + 0.5
  ) {
    reasons.push(
      `Widest valid rotation window in the shortlist, by ${formatMm(top.totalValidWindowMm - runnerUp.totalValidWindowMm)} over the runner-up.`,
    );
  }

  if (
    runnerUp &&
    Number.isFinite(top.minClearanceAtOptimal) &&
    Number.isFinite(runnerUp.minClearanceAtOptimal) &&
    top.minClearanceAtOptimal > runnerUp.minClearanceAtOptimal + 0.1
  ) {
    reasons.push(
      `Best minimum strut clearance at the preferred rotation (${formatMm(top.minClearanceAtOptimal)}).`,
    );
  } else if (Number.isFinite(top.minClearanceAtOptimal)) {
    reasons.push(
      `Maintains ${formatMm(top.minClearanceAtOptimal)} minimum clearance at the preferred rotation.`,
    );
  }

  if (top.size && top.size.sheathFr === minimumSheath) {
    reasons.push(
      `Matches the lowest delivery profile among compatible devices (${top.size.sheathFr} Fr).`,
    );
  }

  reasons.push(formatSuitability(top));
  return reasons;
}

function buildCautions(
  top: DeviceAnalysisResult,
  runnerUp: DeviceAnalysisResult | null,
): string[] {
  const cautions: string[] = [];

  if (!top.rotation.hasConflictFreeRotation) {
    cautions.push(
      `Requires compromise rotation at ${top.rotation.bestCompromiseDeg.toFixed(1)}° rather than a fully clear window.`,
    );
  }

  if (top.robustness && top.robustness.conflictFreeRate < 0.6) {
    cautions.push(
      `Limited perturbation tolerance: remains conflict-free in only ${formatPercent(top.robustness.conflictFreeRate)} of simulated planning-error scenarios.`,
    );
  }

  if (top.robustness && top.robustness.localConflictFreeRate < 0.65) {
    cautions.push(
      `Single-fenestration edits are relatively sensitive, especially around ${top.robustness.mostSensitiveVessel ?? "the current target set"}.`,
    );
  }

  if (top.totalValidWindowMm < 8) {
    cautions.push("Narrow rotation window: indexing accuracy will matter during planning and back-table work.");
  }

  if (Number.isFinite(top.minClearanceAtOptimal) && top.minClearanceAtOptimal < 2.5) {
    cautions.push("Low clearance margin at the preferred rotation, so confirm measurements carefully.");
  }

  if (top.device.pmegSuitability >= 3) {
    cautions.push("This platform is not one of the preferred PMEG base grafts in the current device database.");
  }

  if (
    runnerUp &&
    runnerUp.rotation.hasConflictFreeRotation === top.rotation.hasConflictFreeRotation &&
    Math.abs(runnerUp.totalValidWindowMm - top.totalValidWindowMm) < 3 &&
    Math.abs(runnerUp.minClearanceAtOptimal - top.minClearanceAtOptimal) < 1
  ) {
    cautions.push(`Runner-up option ${runnerUp.device.shortName} remains competitively close for this anatomy.`);
  }

  return cautions;
}

function getConfidenceLabel(
  top: DeviceAnalysisResult,
  runnerUp: DeviceAnalysisResult | null,
): DeviceRecommendationSummary["confidenceLabel"] {
  if (!top.size) {
    return "No fit";
  }

  if (!top.rotation.hasConflictFreeRotation) {
    return "Compromise only";
  }

  const robustnessRate = top.robustness?.conflictFreeRate ?? 0;
  const runnerUpScore = runnerUp?.manufacturabilityScore ?? 0;

  if (robustnessRate < 0.55) {
    return "Moderate fit";
  }

  if (!runnerUp || !runnerUp.rotation.hasConflictFreeRotation) {
    return "Strong fit";
  }

  if (
    robustnessRate >= 0.8 &&
    (top.manufacturabilityScore >= runnerUpScore + 8 ||
      top.totalValidWindowMm >= runnerUp.totalValidWindowMm + 8 ||
      top.minClearanceAtOptimal >= runnerUp.minClearanceAtOptimal + 2)
  ) {
    return "Strong fit";
  }

  return "Moderate fit";
}

export function summarizeAlternative(
  alternative: DeviceAnalysisResult,
  top: DeviceAnalysisResult,
): string {
  if (!alternative.size) {
    return alternative.unsupportedReason ?? "No compatible graft size.";
  }

  if (top.rotation.hasConflictFreeRotation && !alternative.rotation.hasConflictFreeRotation) {
    return "Needs compromise rotation for this anatomy.";
  }

  if (
    alternative.rotation.hasConflictFreeRotation &&
    alternative.robustness &&
    top.robustness &&
    alternative.robustness.conflictFreeRate < top.robustness.conflictFreeRate - 0.05
  ) {
    return `Conflict-free, but less tolerant of planning error (${formatPercent(alternative.robustness.conflictFreeRate)} perturbation survival).`;
  }

  if (
    alternative.rotation.hasConflictFreeRotation &&
    alternative.totalValidWindowMm < top.totalValidWindowMm - 0.5
  ) {
    return `Conflict-free, but with a narrower valid window (${formatMm(alternative.totalValidWindowMm)}).`;
  }

  if (
    Number.isFinite(alternative.minClearanceAtOptimal) &&
    Number.isFinite(top.minClearanceAtOptimal) &&
    alternative.minClearanceAtOptimal < top.minClearanceAtOptimal - 0.1
  ) {
    return `Lower clearance at the preferred rotation (${formatMm(alternative.minClearanceAtOptimal)}).`;
  }

  if (alternative.size.sheathFr > (top.size?.sheathFr ?? alternative.size.sheathFr)) {
    return `Similar fit, but with a larger delivery profile (${alternative.size.sheathFr} Fr).`;
  }

  return "Reasonable fallback with broadly similar rotation behavior.";
}

export function buildDeviceRecommendationSummary(
  results: DeviceAnalysisResult[],
): DeviceRecommendationSummary {
  const compatibleResults = results.filter((result) => result.size);
  const top = compatibleResults[0] ?? null;

  if (!top) {
    return {
      top: null,
      compatibleResults,
      alternatives: [],
      confidenceLabel: "No fit",
      headline: "No compatible off-the-shelf graft",
      reasons: [],
      cautions: [
        "None of the enabled devices has a size match for the entered neck diameter with the current sizing tables.",
      ],
    };
  }

  const runnerUp = compatibleResults[1] ?? null;
  return {
    top,
    compatibleResults,
    alternatives: compatibleResults.slice(1, 4),
    confidenceLabel: getConfidenceLabel(top, runnerUp),
    headline:
      top.rotation.hasConflictFreeRotation
        ? "Best off-the-shelf PMEG candidate"
        : "Best available compromise graft",
    reasons: buildReasons(top, runnerUp, compatibleResults),
    cautions: buildCautions(top, runnerUp),
  };
}
