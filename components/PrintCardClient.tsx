"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { PunchCardCanvas } from "@/components/PunchCardCanvas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { analyseCase, getRotationSummary } from "@/lib/analysis";
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

  useEffect(() => {
    if (searchParams.get("autoprint") === "1") {
      window.setTimeout(() => window.print(), 250);
    }
  }, [searchParams]);

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
      <div className="print:hidden">
        <Button onClick={() => window.print()}>Print / Save as PDF</Button>
      </div>

      <section className="grid gap-6 rounded-[30px] border border-[color:var(--border)] bg-white/90 p-4 print:rounded-none print:border-none print:bg-white print:p-0">
        <PunchCardCanvas result={result} caseInput={caseInput} />

        <div className="grid gap-4 rounded-[26px] border border-[color:var(--border)] bg-[rgba(248,244,237,0.6)] p-5 print:border print:bg-white">
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

          <div className="grid gap-2 text-sm text-[color:var(--muted-foreground)]">
            <p>Print at 100%. Do not scale to fit.</p>
            <p>Measure the 10 mm scale bar before clinical use to confirm print scale is correct.</p>
            <p>For research and planning use only. Clinical responsibility remains with the surgeon.</p>
            {caseInput.surgeonNote ? <p>Note: {caseInput.surgeonNote}</p> : null}
          </div>
        </div>
      </section>
    </main>
  );
}
