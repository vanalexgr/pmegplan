"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Download,
  Loader2,
  Share2,
} from "lucide-react";

import { AnatomyForm } from "@/components/AnatomyForm";
import { ComparisonGrid } from "@/components/ComparisonGrid";
import { DeviceCard } from "@/components/DeviceCard";
import { PlanningWorkspace } from "@/components/PlanningWorkspace";
import { RecommendationOverview } from "@/components/RecommendationOverview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ALL_DEVICES } from "@/lib/devices";
import { downloadAllPdfs } from "@/lib/pdfExport";
import type { SavedPlannerProject } from "@/lib/planning/persistence";
import type { DeviceAnalysisResult } from "@/lib/types";
import { caseSchema } from "@/lib/validation";
import { usePlannerStore } from "@/store/plannerStore";

type FeedbackTone = "info" | "success" | "warning";

function SummaryTable({ results }: { results: DeviceAnalysisResult[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted-foreground)]">
          <tr>
            <th className="pb-3 pr-4">Rank</th>
            <th className="pb-3 pr-4">Device</th>
            <th className="pb-3 pr-4">Selected size</th>
            <th className="pb-3 pr-4">Score</th>
            <th className="pb-3 pr-4">Status</th>
            <th className="pb-3 pr-4">Robust</th>
            <th className="pb-3 pr-4">Rotation</th>
            <th className="pb-3 pr-4">Valid window</th>
            <th className="pb-3">Clearance</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result, index) => (
            <tr
              key={result.device.id}
              className="border-t border-[color:var(--border)] text-[color:var(--foreground)]"
            >
              <td className="py-4 pr-4 font-semibold">{index + 1}</td>
              <td className="py-4 pr-4">{result.device.shortName}</td>
              <td className="py-4 pr-4">
                {result.size ? `${result.size.graftDiameter} mm` : "Unavailable"}
              </td>
              <td className="py-4 pr-4">{result.manufacturabilityScore.toFixed(1)}</td>
              <td className="py-4 pr-4">
                {result.rotation.hasConflictFreeRotation ? (
                  <span className="font-medium text-emerald-700">Conflict-free</span>
                ) : (
                  <span className="text-amber-700">Compromise</span>
                )}
              </td>
              <td className="py-4 pr-4">
                {result.robustness
                  ? `${Math.round(result.robustness.conflictFreeRate * 100)}%`
                  : "N/A"}
              </td>
              <td className="py-4 pr-4">{result.rotation.optimalDeltaDeg.toFixed(1)}°</td>
              <td className="py-4 pr-4">{result.totalValidWindowMm.toFixed(1)} mm</td>
              <td className="py-4">
                {Number.isFinite(result.minClearanceAtOptimal)
                  ? `${result.minClearanceAtOptimal.toFixed(1)} mm`
                  : "Scallops only"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function StatusCard({
  tone,
  title,
  message,
  progress,
  progressLabel,
  progressMeta,
  timestamp,
}: {
  tone: FeedbackTone;
  title: string;
  message: string;
  progress?: number;
  progressLabel?: string | null;
  progressMeta?: string | null;
  timestamp?: string | null;
}) {
  const palette =
    tone === "success"
      ? {
          border: "border-emerald-200",
          background: "bg-emerald-50/80",
          text: "text-emerald-800",
          subtext: "text-emerald-700/85",
          bar: "bg-emerald-600",
          icon: <CheckCircle2 className="mt-0.5 size-5 shrink-0" />,
        }
      : tone === "warning"
        ? {
            border: "border-amber-200",
            background: "bg-amber-50/80",
            text: "text-amber-900",
            subtext: "text-amber-800/90",
            bar: "bg-amber-500",
            icon: <AlertCircle className="mt-0.5 size-5 shrink-0" />,
          }
        : {
            border: "border-sky-200",
            background: "bg-sky-50/80",
            text: "text-sky-900",
            subtext: "text-sky-800/90",
            bar: "bg-[color:var(--brand)]",
            icon:
              progress !== undefined ? (
                <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin" />
              ) : (
                <ClipboardList className="mt-0.5 size-5 shrink-0" />
              ),
          };

  return (
    <Card className={`${palette.border} ${palette.background}`}>
      <CardHeader>
        <CardTitle className={`flex items-center gap-3 ${palette.text}`}>
          {palette.icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className={`space-y-4 text-sm leading-6 ${palette.subtext}`}>
        <p>{message}</p>
        {progress !== undefined ? (
          <div className="space-y-2">
            <div className="h-3 overflow-hidden rounded-full bg-white/70">
              <div
                className={`h-full rounded-full transition-[width] duration-300 ease-out ${palette.bar}`}
                style={{ width: `${Math.max(progress, 6)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium uppercase tracking-[0.14em]">
              <span>{progressLabel ?? "Starting analysis..."}</span>
              <span>{progressMeta ?? `${progress}% complete`}</span>
            </div>
          </div>
        ) : null}
        {timestamp ? (
          <p className="text-xs uppercase tracking-[0.16em]">{timestamp}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AnalysisLogPanel({
  entries,
}: {
  entries: Array<{
    id: string;
    completedAt: string;
    patientId?: string;
    surgeonName?: string;
    neckDiameterMm: number;
    fenestrationCount: number;
    selectedDeviceNames: string[];
    recommendedDeviceName: string | null;
    recommendedGraftDiameterMm: number | null;
    recommendedScore: number | null;
  }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Analysis log</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-[color:var(--muted-foreground)]">
          Recent runs are stored locally in this browser so the team can review who
          planned what, when the case was analysed, and what the top recommendation was.
        </p>
        {entries.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[color:var(--border)] bg-[rgba(255,255,255,0.6)] p-5 text-sm text-[color:var(--muted-foreground)]">
            Completed analyses will appear here after the first run.
          </div>
        ) : (
          <div className="grid gap-3">
            {entries.slice(0, 8).map((entry) => (
              <div
                key={entry.id}
                className="rounded-[24px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.82)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[color:var(--foreground)]">
                      {entry.patientId || "Unnamed case"}
                    </p>
                    <p className="text-sm text-[color:var(--muted-foreground)]">
                      Surgeon {entry.surgeonName || "Not recorded"} ·{" "}
                      {formatTimestamp(entry.completedAt) ?? entry.completedAt}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-[color:var(--brand)]">
                    {entry.recommendedDeviceName
                      ? `${entry.recommendedDeviceName}${entry.recommendedGraftDiameterMm ? ` ${entry.recommendedGraftDiameterMm} mm` : ""}`
                      : "No compatible recommendation"}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-[color:var(--muted-foreground)]">
                  <span>Neck {entry.neckDiameterMm.toFixed(1)} mm</span>
                  <span>
                    {entry.fenestrationCount} fenestration
                    {entry.fenestrationCount === 1 ? "" : "s"}
                  </span>
                  <span>{entry.selectedDeviceNames.join(", ")}</span>
                  {entry.recommendedScore !== null ? (
                    <span>Score {entry.recommendedScore.toFixed(1)}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PlannerClient() {
  const {
    caseInput,
    planningProject,
    selectedDeviceIds,
    results,
    analysisStatus,
    analysisProgress,
    analysisLabel,
    analysisCompleted,
    analysisTotal,
    lastCompletedAt,
    analysisLogEntries,
    runAnalysis,
    stageCaseInput,
    refreshAnalysisLog,
    loadSampleCase,
    loadSavedProject,
    canUndo,
    canRedo,
    redo,
    setSelectedDeviceIds,
    toggleDeviceSelection,
    undo,
    updateFenestration,
    updateFenestrations,
  } = usePlannerStore();
  const [, startTransition] = useTransition();
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [hasFormDraftChanges, setHasFormDraftChanges] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: FeedbackTone;
    message: string;
  } | null>(null);
  const hasCompletedAnalysis = lastCompletedAt !== null;
  const showWorkspace = hasCompletedAnalysis && !hasFormDraftChanges;
  const showResults = analysisStatus === "ready" && !hasFormDraftChanges;
  const visibleResults = showResults ? results : [];
  const availableResults = visibleResults.filter((result) => result.size);
  const unavailableResults = visibleResults.filter((result) => !result.size);
  const recommendedResult = availableResults[0] ?? null;
  const progressPercent = Math.round(analysisProgress * 100);
  const lastCompletedLabel = formatTimestamp(lastCompletedAt);

  const copyShareLink = useCallback(async () => {
    try {
      const shareToken = btoa(JSON.stringify(caseInput));
      const shareUrl = `${window.location.origin}${window.location.pathname}?case=${shareToken}`;
      await navigator.clipboard.writeText(shareUrl);
      setFeedback({
        tone: "success",
        message: "Share link copied to the clipboard.",
      });
    } catch (error) {
      console.error("Failed to generate share link", error);
      setFeedback({
        tone: "warning",
        message: "Could not copy a share link for this case.",
      });
    }
  }, [caseInput]);

  useEffect(() => {
    refreshAnalysisLog();

    if (typeof window === "undefined") {
      return;
    }

    const caseParam = new URLSearchParams(window.location.search).get("case");
    if (!caseParam) {
      return;
    }

    try {
      const decodedCase = JSON.parse(atob(caseParam)) as unknown;
      const parsedCase = caseSchema.safeParse(decodedCase);

      if (!parsedCase.success) {
        setFeedback({
          tone: "warning",
          message: "The shared case link could not be read.",
        });
        return;
      }

      stageCaseInput(parsedCase.data);
      setHasFormDraftChanges(false);
      setFeedback({
        tone: "info",
        message: "Shared case loaded. Review it, then press Run planning analysis.",
      });
    } catch (error) {
      console.error("Failed to parse case from URL", error);
      setFeedback({
        tone: "warning",
        message: "The shared case link could not be read.",
      });
    }
  }, [refreshAnalysisLog, stageCaseInput]);

  const handleDownloadAll = async () => {
    setIsDownloadingAll(true);

    try {
      await downloadAllPdfs(availableResults, caseInput);
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const handleDraftStateChange = useCallback((hasDraftChanges: boolean) => {
    setHasFormDraftChanges((current) => {
      if (hasDraftChanges && !current) {
        setFeedback({
          tone: "warning",
          message:
            "Inputs changed. Previous recommendations are hidden until the planner is run again.",
        });
      }

      return hasDraftChanges;
    });
  }, []);

  const statusTone: FeedbackTone =
    analysisStatus === "ready"
      ? "success"
      : analysisStatus === "stale" || hasFormDraftChanges
        ? "warning"
        : feedback?.tone ?? "info";

  const statusTitle =
    analysisStatus === "running"
      ? "Planning analysis running"
      : analysisStatus === "ready"
        ? "Latest analysis ready"
        : analysisStatus === "stale" || hasFormDraftChanges
          ? "Analysis needs rerun"
          : "Planner ready";

  const statusMessage =
    analysisStatus === "running"
      ? "The planner is scanning the selected platforms. Recommendations will appear only after this run completes."
      : analysisStatus === "ready"
        ? recommendedResult?.size
          ? `The latest run is complete. Current best fit is ${recommendedResult.device.shortName} ${recommendedResult.size.graftDiameter} mm.`
          : "The latest run completed, but no device produced a compatible graft recommendation."
        : analysisStatus === "stale" || hasFormDraftChanges
          ? "Fenestrations, measurements, or device choices changed, so the previous analysis was cleared. Press Run planning analysis to recalculate from the current draft."
          : feedback?.message ??
            "The planner opens in draft mode. Enter or review the anatomy, then press Run planning analysis when you want recommendations.";

  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
      <section className="grid gap-6 rounded-[34px] border border-[color:var(--border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(238,246,243,0.9))] px-6 py-8 shadow-[0_32px_90px_-46px_rgba(7,31,28,0.5)] lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--brand)]">
            Clinical planning workspace
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance text-[color:var(--foreground)] sm:text-5xl">
            Compare PMEG platforms, optimise rotation, and export back-table punch cards.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-[color:var(--muted-foreground)]">
            The MVP planner hard-codes the four main devices that are used for PMEG from the
            technical specification, runs full-circumference strut conflict scans,
            and generates printable device-specific templates for the selected anatomy.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {[
            ["4", "OTS infrarenal platforms"],
            ["0.1 mm", "rotation scan resolution"],
            ["1:1", "punch-card export scale"],
          ].map(([value, label]) => (
            <div
              key={label}
              className="rounded-[26px] border border-[color:var(--border)] bg-white/80 px-5 py-4"
            >
              <p className="text-2xl font-semibold text-[color:var(--foreground)]">{value}</p>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <AnatomyForm
        initialValue={caseInput}
        selectedDeviceIds={selectedDeviceIds}
        isPending={analysisStatus === "running"}
        onDraftStateChange={handleDraftStateChange}
        onSubmit={(values) => {
          setHasFormDraftChanges(false);
          setFeedback({
            tone: "info",
            message: "Planning analysis started.",
          });
          void runAnalysis(values);
        }}
        onToggleDevice={(deviceId) => {
          setFeedback({
            tone: "info",
            message: "Device selection updated. Run planning analysis to refresh the comparison.",
          });
          startTransition(() => {
            toggleDeviceSelection(deviceId);
          });
        }}
        onSelectAllDevices={() => {
          setFeedback({
            tone: "success",
            message: "All device platforms enabled for the next run.",
          });
          startTransition(() => {
            setSelectedDeviceIds(ALL_DEVICES.map((device) => device.id));
          });
        }}
        onLoadSample={() => {
          setHasFormDraftChanges(false);
          setFeedback({
            tone: "info",
            message: "Sample case loaded. Press Run planning analysis when you are ready.",
          });
          startTransition(() => {
            loadSampleCase();
          });
        }}
      />

      <StatusCard
        tone={statusTone}
        title={statusTitle}
        message={statusMessage}
        progress={analysisStatus === "running" ? progressPercent : undefined}
        progressLabel={analysisStatus === "running" ? analysisLabel : null}
        progressMeta={
          analysisStatus === "running"
            ? analysisTotal > 0
              ? `${analysisCompleted}/${analysisTotal} devices · ${progressPercent}%`
              : `${progressPercent}% complete`
            : null
        }
        timestamp={
          analysisStatus === "ready" && lastCompletedLabel
            ? `Completed ${lastCompletedLabel}`
            : null
        }
      />

      {showWorkspace ? (
        <PlanningWorkspace
          caseInput={caseInput}
          project={planningProject}
          selectedDeviceIds={selectedDeviceIds}
          results={analysisStatus === "ready" ? results : []}
          recommendedResult={analysisStatus === "ready" ? recommendedResult : null}
          canUndo={canUndo}
          canRedo={canRedo}
          onUpdateFenestration={(index, patch) => {
            setFeedback({
              tone: "warning",
              message: "Workspace edits applied. Run planning analysis to refresh recommendations.",
            });
            startTransition(() => {
              updateFenestration(index, patch);
            });
          }}
          onMoveAllFenestrations={(patches) => {
            setFeedback({
              tone: "warning",
              message:
                "Fenestration positions changed together. Run planning analysis to refresh recommendations.",
            });
            startTransition(() => {
              updateFenestrations(patches);
            });
          }}
          onUndo={() => {
            startTransition(() => {
              undo();
            });
          }}
          onRedo={() => {
            startTransition(() => {
              redo();
            });
          }}
          onLoadSavedProject={(savedProject: SavedPlannerProject) => {
            setHasFormDraftChanges(false);
            setFeedback({
              tone: "info",
              message: "Saved project loaded. Run planning analysis to generate fresh recommendations.",
            });
            startTransition(() => {
              loadSavedProject(savedProject);
            });
          }}
        />
      ) : null}

      {showResults ? (
        <>
          <RecommendationOverview results={visibleResults} />

          <details open className="rounded-2xl border bg-white/50 p-6 open:pb-8">
            <summary className="mb-4 cursor-pointer select-none text-xl font-semibold text-[color:var(--brand)]">
              Side-by-side comparison
            </summary>
            <ComparisonGrid results={visibleResults} caseInput={caseInput} />
          </details>
        </>
      ) : null}

      {showResults ? (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--brand)]">
                Ranked analysis
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--foreground)]">
                Device recommendations
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-[color:var(--muted-foreground)]">
              Ranking now prioritises manufacturability under realistic planning error,
              then wider valid windows, better clearance, and finally the published
              platform hierarchy.
            </p>
          </div>

          <div className="grid gap-6">
            {availableResults.map((result, index) => (
              <DeviceCard
                key={result.device.id}
                result={result}
                caseInput={caseInput}
                rank={index}
              />
            ))}

            {unavailableResults.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {unavailableResults.map((result) => (
                  <Card key={result.device.id}>
                    <CardHeader>
                      <CardTitle>{result.device.shortName}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-[color:var(--muted-foreground)]">
                      {result.unsupportedReason}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {showResults ? (
        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle>Comparative summary</CardTitle>
            </CardHeader>
            <CardContent>
              <SummaryTable results={availableResults} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Export bundle</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-[color:var(--muted-foreground)]">
                Download a ZIP archive with one PDF per compatible device, a ranking
                summary, structured coordinate exports, and a print-calibration checklist
                for the current case.
              </p>
              <p className="text-sm leading-6 text-[color:var(--muted-foreground)]">
                Before clinical use, print at 100% and measure the calibration square and
                ruler on the generated punch card.
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={handleDownloadAll}
                  disabled={availableResults.length === 0 || isDownloadingAll}
                >
                  <Download className="mr-2 size-4" />
                  {isDownloadingAll ? "Building archive..." : "Download all PDFs"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void copyShareLink();
                  }}
                  disabled={availableResults.length === 0}
                >
                  <Share2 className="mr-2 size-4" />
                  Share Case
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <AnalysisLogPanel entries={analysisLogEntries} />
    </main>
  );
}
