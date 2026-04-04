"use client";

import { useState } from "react";
import { Download, Eye, LineChart as LineChartIcon } from "lucide-react";

import { PunchCardCanvas } from "@/components/PunchCardCanvas";
import { RecommendationBadge } from "@/components/RecommendationBadge";
import { RotationChart } from "@/components/RotationChart";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getConflictCount, getRotationSummary } from "@/lib/analysis";
import { buildPrintUrl, downloadDevicePdf } from "@/lib/pdfExport";
import { normalizeClockText } from "@/lib/planning/clock";
import type { CaseInput, DeviceAnalysisResult } from "@/lib/types";

function formatConflictLabel(conflict: boolean) {
  return conflict ? "Conflict" : "Clear";
}

export function DeviceCard({
  result,
  caseInput,
  rank,
}: {
  result: DeviceAnalysisResult;
  caseInput: CaseInput;
  rank: number;
}) {
  const [showChart, setShowChart] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const baselineCount = getConflictCount(result.baselineConflicts);
  const optimalCount = getConflictCount(result.optimalConflicts);

  const handleExport = async () => {
    if (!result.size) {
      return;
    }

    setIsExporting(true);
    try {
      await downloadDevicePdf(result, caseInput);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-4 border-b border-[color:var(--border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.88),rgba(243,238,226,0.82))]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle>{result.device.name}</CardTitle>
            <CardDescription>{result.device.manufacturer}</CardDescription>
          </div>
          <RecommendationBadge result={result} rank={rank} />
        </div>

        {result.size ? (
          <div className="grid gap-3 text-sm text-[color:var(--muted-foreground)] sm:grid-cols-4">
            <div>
              <p className="font-medium text-[color:var(--foreground)]">Manufacturability</p>
              <p>{result.manufacturabilityScore.toFixed(1)}</p>
            </div>
            <div>
              <p className="font-medium text-[color:var(--foreground)]">Selected size</p>
              <p>{result.size.graftDiameter} mm</p>
            </div>
            <div>
              <p className="font-medium text-[color:var(--foreground)]">Robustness</p>
              <p>
                {result.robustness
                  ? `${Math.round(result.robustness.conflictFreeRate * 100)}%`
                  : "N/A"}
              </p>
            </div>
            <div>
              <p className="font-medium text-[color:var(--foreground)]">Sheath</p>
              <p>{result.size.sheathFr} Fr</p>
            </div>
            <div>
              <p className="font-medium text-[color:var(--foreground)]">Valid window</p>
              <p>{result.totalValidWindowMm.toFixed(1)} mm</p>
            </div>
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-[#d6c6b4] bg-[#fff8ef] p-4 text-sm text-[#7a5b34]">
            {result.unsupportedReason}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {result.size ? (
          <>
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <PunchCardCanvas result={result} caseInput={caseInput} />

              <div className="space-y-4">
                <div className="rounded-[24px] border border-[color:var(--border)] bg-[rgba(248,244,237,0.76)] p-4">
                  <p className="text-sm font-semibold text-[color:var(--foreground)]">
                    Rotation result
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                    {getRotationSummary(result)}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[22px] border border-[color:var(--border)] bg-white p-4">
                    <p className="text-sm font-semibold text-[color:var(--foreground)]">
                      Conflicts at δ=0
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[color:var(--foreground)]">
                      {baselineCount}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-[color:var(--border)] bg-white p-4">
                    <p className="text-sm font-semibold text-[color:var(--foreground)]">
                      Conflicts at optimal
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[color:var(--foreground)]">
                      {optimalCount}
                    </p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[color:var(--border)] bg-white p-4">
                  <p className="text-sm font-semibold text-[color:var(--foreground)]">
                    Robustness check
                  </p>
                  <div className="mt-4 space-y-3 text-sm text-[color:var(--muted-foreground)]">
                    {result.robustness ? (
                      <>
                        <p>
                          Conflict-free in{" "}
                          {Math.round(result.robustness.conflictFreeRate * 100)}% of
                          simulated perturbation scenarios.
                        </p>
                        <p>
                          Global shift tolerance{" "}
                          {Math.round(result.robustness.globalConflictFreeRate * 100)}% ·
                          single-fenestration tolerance{" "}
                          {Math.round(result.robustness.localConflictFreeRate * 100)}%.
                        </p>
                        <p>
                          Most sensitive target:{" "}
                          {result.robustness.mostSensitiveVessel ?? "None identified"}.
                        </p>
                      </>
                    ) : (
                      <p>Robustness simulation is not available for this device.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[color:var(--border)] bg-white p-4">
                  <p className="text-sm font-semibold text-[color:var(--foreground)]">
                    Fenestration comparison
                  </p>
                  <div className="mt-4 space-y-3 text-sm">
                    {caseInput.fenestrations.map((fenestration, index) => {
                      const normalizedClock = normalizeClockText(fenestration.clock, {
                        separator: ":",
                        padHour: false,
                      });
                      const adjustedClock = normalizeClockText(
                        result.optimalConflicts[index].adjustedClock,
                        {
                          separator: ":",
                          padHour: false,
                        },
                      );

                      return (
                        <div
                          key={`${fenestration.vessel}-${index}`}
                          className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-2xl bg-[rgba(248,244,237,0.66)] px-3 py-2"
                        >
                          <div>
                            <p className="font-medium text-[color:var(--foreground)]">
                              {fenestration.vessel}
                            </p>
                            <p className="text-xs text-[color:var(--muted-foreground)]">
                              {normalizedClock}
                              {" -> "}
                              {adjustedClock}
                            </p>
                          </div>
                          <span className="text-xs text-[color:var(--muted-foreground)]">
                            {formatConflictLabel(result.baselineConflicts[index].conflict)}
                          </span>
                          <span className="text-xs font-medium text-[color:var(--foreground)]">
                            {formatConflictLabel(result.optimalConflicts[index].conflict)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  window.open(
                    buildPrintUrl(caseInput, result.device.id),
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
              >
                <Eye className="mr-2 size-4" />
                View full card
              </Button>
              <Button variant="secondary" onClick={handleExport} disabled={isExporting}>
                <Download className="mr-2 size-4" />
                {isExporting ? "Building PDF..." : "Download PDF"}
              </Button>
              <Button variant="ghost" onClick={() => setShowChart((current) => !current)}>
                <LineChartIcon className="mr-2 size-4" />
                {showChart ? "Hide rotation analysis" : "Show rotation analysis"}
              </Button>
            </div>

            {showChart ? <RotationChart result={result} caseInput={caseInput} /> : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
