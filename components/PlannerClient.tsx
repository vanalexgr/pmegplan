"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";

import { AnatomyForm } from "@/components/AnatomyForm";
import { DeviceCard } from "@/components/DeviceCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ALL_DEVICES } from "@/lib/devices";
import { downloadAllPdfs } from "@/lib/pdfExport";
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
            <th className="pb-3 pr-4">Status</th>
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
              <td className="py-4 pr-4">
                {result.rotation.hasConflictFreeRotation ? (
                  <span className="font-medium text-emerald-700">Conflict-free</span>
                ) : (
                  <span className="text-amber-700">Compromise</span>
                )}
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
    selectedDeviceIds,
    results,
    analyse,
    loadSampleCase,
    setSelectedDeviceIds,
    toggleDeviceSelection,
  } = usePlannerStore();
  const [isPending, startTransition] = useTransition();
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const availableResults = results.filter((result) => result.size);
  const unavailableResults = results.filter((result) => !result.size);

  const handleDownloadAll = async () => {
    setIsDownloadingAll(true);
    try {
      await downloadAllPdfs(availableResults, caseInput);
    } finally {
      setIsDownloadingAll(false);
    }
  };

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
            The MVP planner hard-codes the four main infrarenal devices from the
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
            Ranking prioritises conflict-free windows, wider valid rotation
            ranges, greater minimum clearance, and finally the published clinical hierarchy.
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
              Download a ZIP archive with one PDF per compatible device plus an
              index summary for the current case.
            </p>
            <Button
              onClick={handleDownloadAll}
              disabled={availableResults.length === 0 || isDownloadingAll}
            >
              <Download className="mr-2 size-4" />
              {isDownloadingAll ? "Building archive..." : "Download all PDFs"}
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

