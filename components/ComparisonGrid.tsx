import React, { useEffect, useRef } from "react";
import type { CaseInput, DeviceAnalysisResult } from "@/lib/types";
import { computePunchCardHeight, renderPunchCard } from "@/lib/punchCardRenderer";

interface PunchCardCanvasProps {
  result: DeviceAnalysisResult;
  caseInput: CaseInput;
}

const PunchCardCanvas = React.memo(
  ({ result, caseInput }: PunchCardCanvasProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = 600;
      const h = computePunchCardHeight(w, result, caseInput, "preview");
      canvas.width = w;
      canvas.height = h;

      renderPunchCard({
        ctx,
        width: w,
        height: h,
        result,
        caseInput,
        mode: "preview",
        cutMarginMm: 8,
        showCalibration: false,
      });
    }, [result, caseInput]);

    return (
      <div className="flex flex-col gap-2 rounded-xl border p-4 bg-white/50">
        <h3 className="font-semibold text-sm">{result.device.shortName}</h3>
        {result.size ? (
          <canvas
            ref={canvasRef}
            className="w-full h-auto rounded-lg border bg-white shadow-sm"
          />
        ) : (
          <div className="w-full aspect-[600/424] flex items-center justify-center rounded-lg border border-dashed bg-white shadow-sm p-6 text-center text-sm text-red-600">
            {result.unsupportedReason ?? "No compatible primary components."}
          </div>
        )}
      </div>
    );
  }
);
PunchCardCanvas.displayName = "PunchCardCanvas";

export interface ComparisonGridProps {
  results: DeviceAnalysisResult[];
  caseInput: CaseInput;
}

export function ComparisonGrid({ results, caseInput }: ComparisonGridProps) {
  // Always render available results or unsupported results
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: "1.5rem",
      }}
    >
      {results.map((result, i) => (
        <div
          key={result.device.id}
          className={
            i === 0
              ? "ring-2 ring-[color:var(--brand)] rounded-xl"
              : ""
          }
        >
          <PunchCardCanvas result={result} caseInput={caseInput} />
        </div>
      ))}
    </div>
  );
}
