"use client";

import { useMemo, useState } from "react";
import { Crosshair, ScanLine } from "lucide-react";

import { GraftSketchCanvas } from "@/components/GraftSketchCanvas";
import {
  attachPmegCaseTargets,
  type PmegMeasurement,
} from "@/lib/pmegMeasurements";
import type { CaseInput, DeviceAnalysisResult } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatMm(value: number) {
  return Number.isFinite(value) ? `${Math.max(0, value).toFixed(1)} mm` : "—";
}

function MeasurementValue({
  measurement,
}: {
  measurement: PmegMeasurement;
}) {
  return (
    <div>
      <p className="truncate text-[9px] font-semibold uppercase tracking-[0.11em] text-white/45">
        {measurement.label}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-[15px] font-semibold text-white",
          measurement.state === "primary" && "text-[#ffab98]",
          measurement.state === "safe" && "text-emerald-300",
          measurement.state === "review" && "text-amber-300",
        )}
      >
        {formatMm(measurement.valueMm)}
      </p>
    </div>
  );
}

export function CtModelViewport({
  caseInput,
  result,
}: {
  caseInput: CaseInput;
  result: DeviceAnalysisResult;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const measurementSet = useMemo(
    () =>
      attachPmegCaseTargets(result, caseInput.fenestrations, selectedIndex),
    [caseInput.fenestrations, result, selectedIndex],
  );
  const activeIndex = measurementSet?.activeIndex ?? 0;
  const activeFenestration = caseInput.fenestrations[activeIndex] ?? null;
  const activeConflict = result.optimalConflicts[activeIndex];
  const ctMarkClock = activeConflict?.adjustedClock ?? activeFenestration?.clock;
  const ctMarkDepth = activeFenestration
    ? activeFenestration.ftype === "SCALLOP"
      ? 0
      : result.depthOptimisation.adjustedDepths[activeIndex] ??
        activeFenestration.depthMm
    : 0;

  return (
    <section className="relative min-h-0 flex-1 overflow-hidden bg-[#dfe8e5]">
      <div className="absolute left-5 top-5 z-20 flex items-center gap-2 rounded-full border border-[#b7cac5] bg-white/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#315852] shadow-sm backdrop-blur-md">
        <ScanLine className="size-3.5 text-[#e96f58]" />
        CT-derived geometry
      </div>

      <GraftSketchCanvas
        result={result}
        caseInput={caseInput}
        height={720}
        layout="model-only"
        fenestrationFrame="graft"
        selectedFenestrationIndex={activeIndex}
        onSelectFenestration={setSelectedIndex}
        className="h-full"
        canvasClassName="rounded-none border-0"
        selectedFenestrationOverlay={
          measurementSet && activeFenestration ? (
            <div className="overflow-hidden rounded-[18px] border border-white/15 bg-[#071a27]/94 text-white shadow-[0_22px_70px_-25px_rgba(0,0,0,0.8)] backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold">
                    {activeFenestration.vessel}
                  </p>
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/40">
                    {activeFenestration.widthMm} ×{" "}
                    {activeFenestration.heightMm} mm opening
                  </p>
                </div>
                <Crosshair className="size-4 text-[#ff8a72]" />
              </div>
              <div className="grid grid-cols-2 gap-3 border-b border-white/10 px-4 py-3 font-mono text-[10px]">
                <div>
                  <p className="text-[8px] font-semibold uppercase tracking-[0.11em] text-white/40">
                    Requested target
                  </p>
                  <p className="mt-1 text-white/85">
                    {activeFenestration.clock} · {activeFenestration.depthMm.toFixed(1)} mm
                  </p>
                </div>
                <div>
                  <p className="text-[8px] font-semibold uppercase tracking-[0.11em] text-[#ffab98]/75">
                    CT mark position
                  </p>
                  <p className="mt-1 text-[#ffab98]">
                    {ctMarkClock} · {ctMarkDepth.toFixed(1)} mm
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3.5">
                {measurementSet.measurements
                  .filter((measurement) =>
                    [
                      "edge-opening",
                      "edge-center",
                      "proximal-peak",
                      "distal-valley",
                      "wire-clearance",
                      "other-opening",
                    ].includes(measurement.id),
                  )
                  .map((measurement) => (
                    <MeasurementValue
                      key={measurement.id}
                      measurement={measurement}
                    />
                  ))}
              </div>
            </div>
          ) : null
        }
      />

      <div className="absolute inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-[#b5c8c3] bg-[#edf3f1]/92 px-4 py-3 backdrop-blur-xl">
        <div className="flex min-w-0 gap-2 overflow-x-auto">
          {caseInput.fenestrations.map((fenestration, index) => (
            <button
              key={`${fenestration.vessel}-${index}`}
              type="button"
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-left text-[11px] font-semibold transition",
                index === activeIndex
                  ? "border-[#e96f58] bg-[#ff8a72] text-[#10262f]"
                  : "border-[#b7c9c4] bg-white/75 text-[#315852] hover:bg-white",
              )}
              onClick={() => setSelectedIndex(index)}
            >
              <span className="font-mono text-[9px] opacity-60">
                {String(index + 1).padStart(2, "0")}
              </span>
              {fenestration.vessel}
            </button>
          ))}
        </div>
        <p className="hidden shrink-0 text-[10px] text-[#58706d] sm:block">
          Drag to rotate · click an opening for distances
        </p>
      </div>
    </section>
  );
}
