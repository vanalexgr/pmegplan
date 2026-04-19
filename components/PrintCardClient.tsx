"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PunchCardCanvas } from "@/components/PunchCardCanvas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { analyseCase, getRotationSummary } from "@/lib/analysis";
import { downloadDevicePdf } from "@/lib/pdfExport";
import { sampleCase } from "@/lib/sampleCase";
import type { CaseInput } from "@/lib/types";

function parseCasePayload(caseParam: string | null): CaseInput {
  if (!caseParam) {
    return sampleCase;
  }

  try {
    return JSON.parse(caseParam) as CaseInput;
  } catch {
    return sampleCase;
  }
}

export function PrintCardClient() {
  const searchParams = useSearchParams();
  const deviceId = searchParams.get("deviceId");
  const caseInput = parseCasePayload(searchParams.get("case"));
  const result = deviceId ? analyseCase(caseInput, [deviceId])[0] : null;
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (searchParams.get("autoprint") === "1" && result) {
      window.setTimeout(async () => {
        try {
          setIsExporting(true);
          await downloadDevicePdf(result, caseInput);
        } finally {
          setIsExporting(false);
        }
      }, 250);
    }
  }, [caseInput, result, searchParams]);

  if (!result) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-6 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Print payload missing</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[color:var(--muted-foreground)]">
            Open the print route from a device card so the selected case and
            platform are passed through correctly.
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-6 px-4 py-6 print:max-w-none print:px-0 print:py-0">
      <div className="print:hidden flex flex-wrap items-center gap-3">
        <Button
          onClick={async () => {
            try {
              setIsExporting(true);
              await downloadDevicePdf(result, caseInput);
            } finally {
              setIsExporting(false);
            }
          }}
          disabled={isExporting}
        >
          {isExporting ? "Building clean PDF..." : "Download Clean PDF"}
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          Browser Print
        </Button>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Browser print may add its own headers and footers. Use the PDF download for a clean card.
        </p>
      </div>

      <section className="print-card-page grid gap-6 rounded-[30px] border border-[color:var(--border)] bg-white/90 p-4 print:block print:rounded-none print:border-none print:bg-white print:p-0">
        <PunchCardCanvas result={result} caseInput={caseInput} />
      </section>

      <section className="print-details-page grid gap-4 rounded-[26px] border border-[color:var(--border)] bg-[rgba(248,244,237,0.6)] p-5">
        <div className="print:hidden grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-[color:var(--foreground)]">Patient</p>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              {caseInput.patientId || "N/A"}
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-[color:var(--foreground)]">Device</p>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              {result.device.name}
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-[color:var(--foreground)]">
              Rotation instruction
            </p>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              {getRotationSummary(result)}
            </p>
          </div>
        </div>

        <div className="hidden print:block">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-[color:var(--foreground)]">
              Planning Summary
            </h1>
            <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
              Supplementary patient, device, and printing notes for the punch card.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm font-semibold text-[color:var(--foreground)]">Patient</p>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                {caseInput.patientId || "N/A"}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-[color:var(--foreground)]">Device</p>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                {result.device.name}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-[color:var(--foreground)]">
                Rotation instruction
              </p>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                {getRotationSummary(result)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-2 text-sm text-[color:var(--muted-foreground)]">
          <p>Print at 100%. Do not scale to fit.</p>
          <p>Measure the 10 mm scale bar before clinical use to confirm print scale is correct.</p>
          <p>For research and planning use only. Clinical responsibility remains with the surgeon.</p>
          {caseInput.surgeonNote ? <p>Note: {caseInput.surgeonNote}</p> : null}
        </div>
      </section>
    </main>
  );
}
