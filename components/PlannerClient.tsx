"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { Download, Share2 } from "lucide-react";

import { AnatomyForm } from "@/components/AnatomyForm";
import { DeviceCard } from "@/components/DeviceCard";
import { PlanningWorkspace } from "@/components/PlanningWorkspace";
import { RecommendationOverview } from "@/components/RecommendationOverview";
import { ComparisonGrid } from "@/components/ComparisonGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ALL_DEVICES } from "@/lib/devices";
import { downloadAllPdfs } from "@/lib/pdfExport";
import type { SavedPlannerProject } from "@/lib/planning/persistence";
import type { DeviceAnalysisResult } from "@/lib/types";
import { usePlannerStore } from "@/store/plannerStore";

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

export function PlannerClient() {
  const {
    caseInput,
    planningProject,
    selectedDeviceIds,
    results,
    isReady,
    isBootstrapping,
    bootstrapProgress,
    bootstrapLabel,
    bootstrapCompleted,
    bootstrapTotal,
    bootstrap,
    analyse,
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
  const [isPending, startTransition] = useTransition();
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const availableResults = results.filter((result) => result.size);
  const unavailableResults = results.filter((result) => !result.size);
  const recommendedResult = availableResults[0] ?? null;
  const [hasLoadedInitialCase, setHasLoadedInitialCase] = useState(false);

  const copyShareLink = useCallback(() => {
    try {
      const shareToken = btoa(JSON.stringify(caseInput));
      const shareUrl = `${window.location.origin}${window.location.pathname}?case=${shareToken}`;
      navigator.clipboard.writeText(shareUrl);
      alert("Share link copied to clipboard!");
    } catch (err) {
      console.error("Failed to generate share link", err);
      alert("Failed to generate share link.");
    }
  }, [caseInput]);

  useEffect(() => {
    if (isReady || isBootstrapping) {
      return;
    }

    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    let idleId: number | null = null;

    const runBootstrap = () => {
      if (!hasLoadedInitialCase && typeof window !== "undefined") {
        setHasLoadedInitialCase(true);
        const searchParams = new URLSearchParams(window.location.search);
        const caseParam = searchParams.get("case");
        if (caseParam) {
          try {
            const decodedCase = JSON.parse(atob(caseParam));
            analyse(decodedCase);
            return;
          } catch (err) {
            console.error("Failed to parse case from URL", err);
          }
        }
      }
      bootstrap();
    };

    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(runBootstrap, { timeout: 250 });
    } else {
      timeoutId = globalThis.setTimeout(runBootstrap, 32);
    }

    return () => {
      if (idleId !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, [bootstrap, isBootstrapping, isReady]);

  const handleDownloadAll = async () => {
    setIsDownloadingAll(true);
    try {
      await downloadAllPdfs(availableResults, caseInput);
    } finally {
      setIsDownloadingAll(false);
    }
  };
  const bootstrapPercent = Math.round(bootstrapProgress * 100);

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
        isPending={isPending}
        onSubmit={(values) => {
          startTransition(() => {
            analyse(values);
          });
        }}
        onToggleDevice={toggleDeviceSelection}
        onSelectAllDevices={() =>
          setSelectedDeviceIds(ALL_DEVICES.map((device) => device.id))
        }
        onLoadSample={() => {
          startTransition(() => {
            loadSampleCase();
          });
        }}
      />

      {isReady ? (
        <>
          <RecommendationOverview results={results} />

          <PlanningWorkspace
            caseInput={caseInput}
            project={planningProject}
            selectedDeviceIds={selectedDeviceIds}
            results={results}
            recommendedResult={recommendedResult}
            canUndo={canUndo}
            canRedo={canRedo}
            onUpdateFenestration={(index, patch) => {
              startTransition(() => {
                updateFenestration(index, patch);
              });
            }}
            onMoveAllFenestrations={(patches) => {
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
              startTransition(() => {
                loadSavedProject(savedProject);
              });
            }}
          />
          
          <details open className="bg-white/50 border rounded-2xl p-6 open:pb-8">
            <summary className="cursor-pointer font-semibold mb-4 text-xl select-none text-[color:var(--brand)]">
              Side-by-side comparison
            </summary>
            <ComparisonGrid results={results} caseInput={caseInput} />
          </details>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Preparing planner analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-[color:var(--muted-foreground)]">
            <p>
              Loading the four-device rotation and robustness comparison. The form
              is ready now, and the heavier device analysis will appear as soon as
              the first client-side pass completes.
            </p>
            <div className="space-y-2">
              <div className="h-3 overflow-hidden rounded-full bg-[rgba(12,84,72,0.12)]">
                <div
                  className="h-full rounded-full bg-[color:var(--brand)] transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.max(bootstrapPercent, 6)}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--muted-foreground)]">
                <span>{bootstrapLabel ?? "Starting analysis..."}</span>
                <span>
                  {bootstrapTotal > 0
                    ? `${bootstrapCompleted}/${bootstrapTotal} devices`
                    : "Preparing"}
                </span>
              </div>
              <p className="text-xs text-[color:var(--muted-foreground)]">
                {bootstrapPercent}% complete
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isReady ? (
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

      {isReady ? (
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
                onClick={copyShareLink}
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
    </main>
  );
}
