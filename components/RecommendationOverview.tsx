"use client";

import { CheckCircle2, ShieldAlert, Sparkles, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildDeviceRecommendationSummary,
  summarizeAlternative,
} from "@/lib/recommendation";
import type { DeviceAnalysisResult } from "@/lib/types";

function confidenceToneClass(label: string) {
  switch (label) {
    case "Strong fit":
      return "border-emerald-300 bg-emerald-50 text-emerald-800";
    case "Moderate fit":
      return "border-amber-300 bg-amber-50 text-amber-800";
    case "Compromise only":
      return "border-orange-300 bg-orange-50 text-orange-800";
    default:
      return "border-rose-300 bg-rose-50 text-rose-800";
  }
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function RecommendationOverview({
  results,
}: {
  results: DeviceAnalysisResult[];
}) {
  const summary = buildDeviceRecommendationSummary(results);
  const top = summary.top;

  if (!top || !top.size) {
    return (
      <Card className="overflow-hidden border-rose-200">
        <CardHeader className="gap-3 bg-[linear-gradient(135deg,rgba(255,250,250,0.98),rgba(255,237,237,0.94))]">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-rose-700" />
            <Badge className="border-rose-300 bg-rose-50 text-rose-800">
              No OTS fit
            </Badge>
          </div>
          <CardTitle>{summary.headline}</CardTitle>
          <CardDescription>{summary.cautions[0]}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-4 border-b border-[color:var(--border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(245,239,224,0.9))]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-emerald-300 bg-emerald-50 text-emerald-800">
                Best OTS graft
              </Badge>
              <Badge className={confidenceToneClass(summary.confidenceLabel)}>
                {summary.confidenceLabel}
              </Badge>
            </div>
            <CardTitle>{summary.headline}</CardTitle>
            <CardDescription>
              PMEGPlan now uses the same ranking model to explain why one platform
              is the best off-the-shelf base graft for this anatomy, not just where
              it lands in the sorted list.
            </CardDescription>
          </div>

          <div className="rounded-[24px] border border-[color:var(--border)] bg-white/90 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
              Recommended platform
            </p>
            <p className="mt-2 text-2xl font-semibold text-[color:var(--foreground)]">
              {top.device.shortName}
            </p>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              {top.size.graftDiameter} mm graft · {top.size.sheathFr} Fr sheath
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 pt-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Score", top.manufacturabilityScore.toFixed(1)],
              ["Window", `${top.totalValidWindowMm.toFixed(1)} mm`],
              [
                "Clearance",
                Number.isFinite(top.minClearanceAtOptimal)
                  ? `${top.minClearanceAtOptimal.toFixed(1)} mm`
                  : "Scallops only",
              ],
              [
                "Robustness",
                top.robustness
                  ? formatPercent(top.robustness.conflictFreeRate)
                  : "N/A",
              ],
              ["Rotation", `${top.rotation.optimalDeltaDeg.toFixed(1)}°`],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[22px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.82)] p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                  {label}
                </p>
                <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[26px] border border-[color:var(--border)] bg-[rgba(237,248,244,0.8)] p-5">
              <div className="flex items-center gap-2">
                <Trophy className="size-4 text-emerald-700" />
                <p className="text-sm font-semibold text-[color:var(--foreground)]">
                  Why it wins
                </p>
              </div>
              <div className="mt-4 space-y-3">
                {summary.reasons.map((reason) => (
                  <div key={reason} className="flex gap-3 text-sm leading-6 text-[color:var(--foreground)]">
                    <CheckCircle2 className="mt-1 size-4 shrink-0 text-emerald-700" />
                    <p>{reason}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] border border-[color:var(--border)] bg-[rgba(255,246,235,0.82)] p-5">
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-amber-700" />
                <p className="text-sm font-semibold text-[color:var(--foreground)]">
                  What to watch
                </p>
              </div>
              <div className="mt-4 space-y-3">
                {summary.cautions.length > 0 ? (
                  summary.cautions.map((caution) => (
                    <p key={caution} className="text-sm leading-6 text-[color:var(--foreground)]">
                      {caution}
                    </p>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-[color:var(--foreground)]">
                    No major caution flags surfaced beyond normal PMEG planning verification.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-[26px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.82)] p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-[color:var(--brand)]" />
              <p className="text-sm font-semibold text-[color:var(--foreground)]">
                Manufacturability note
              </p>
            </div>
            <div className="mt-3 space-y-3 text-sm leading-6 text-[color:var(--muted-foreground)]">
              <p>{top.device.pmegNotes}</p>
              {top.robustness ? (
                <>
                  <p>
                    This recommendation now stress-tests each platform against
                    simulated planning drift of ±
                    {top.robustness.simulatedLongitudinalErrorMm.toFixed(1)} mm
                    longitudinally and ±
                    {top.robustness.simulatedCircumferentialErrorMm.toFixed(1)} mm
                    circumferentially, based on the manual punch-card error envelope
                    reported in the published planning-validation literature.
                  </p>
                  <p>
                    Global perturbation survival:{" "}
                    {formatPercent(top.robustness.globalConflictFreeRate)}. Local
                    single-fenestration survival:{" "}
                    {formatPercent(top.robustness.localConflictFreeRate)}.
                    {top.robustness.mostSensitiveVessel
                      ? ` Most sensitive target: ${top.robustness.mostSensitiveVessel}.`
                      : ""}
                  </p>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[26px] border border-[color:var(--border)] bg-[rgba(248,244,237,0.82)] p-5">
            <p className="text-sm font-semibold text-[color:var(--foreground)]">
              Shortlist comparison
            </p>
            <div className="mt-4 space-y-3">
              {summary.alternatives.length > 0 ? (
                summary.alternatives.map((alternative) => (
                  <div
                    key={alternative.device.id}
                    className="rounded-[20px] border border-[color:var(--border)] bg-white/90 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-[color:var(--foreground)]">
                        {alternative.device.shortName}
                      </p>
                      <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                        {alternative.size ? `${alternative.size.graftDiameter} mm` : "Unavailable"}
                      </p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                      {summarizeAlternative(alternative, top)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-[color:var(--muted-foreground)]">
                  No runner-up platform remains after sizing and device filtering.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[26px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.82)] p-5">
            <p className="text-sm font-semibold text-[color:var(--foreground)]">
              Recommendation rule
            </p>
            <p className="mt-3 text-sm leading-6 text-[color:var(--muted-foreground)]">
              Ranking now prioritises manufacturability: baseline conflict-free
              behavior, robustness under small coordinate perturbations, valid
              window width, clearance, delivery profile, and only then the device’s
              PMEG hierarchy. That keeps the recommendation anatomy-first while
              accounting for real-world planning error.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
