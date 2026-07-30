"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Crosshair,
  Layers3,
  Ruler,
  ScanLine,
} from "lucide-react";

import { GraftSketchCanvas } from "@/components/GraftSketchCanvas";
import { buildBenchCtRenderModel } from "@/lib/geometry/benchCtRenderModel";
import { circumferenceMm, wrapMm } from "@/lib/planning/geometry";
import { selectPlanarFenestrationsForDiameter } from "@/lib/planning/selectors";
import type { PlanningFenestration, PlanningProject } from "@/lib/planning/types";
import type {
  CaseInput,
  DeviceAnalysisResult,
  StrutSegment,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface PlanarTarget {
  fenestration: PlanningFenestration;
  point: {
    xMm: number;
    yMm: number;
  };
}

interface Landmark {
  xMm: number;
  yMm: number;
}

interface NearestSegmentResult extends Landmark {
  distanceMm: number;
}

interface Measurement {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone?: "accent" | "success";
}

function roundToTenth(value: number) {
  return Math.round(value * 10) / 10;
}

function formatMm(value: number) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return `${roundToTenth(Math.max(0, value)).toFixed(1)} mm`;
}

function signedWrappedDelta(value: number, circumference: number) {
  const normalized = wrapMm(value + circumference / 2, circumference);
  return normalized - circumference / 2;
}

function getStrutExtrema(segments: StrutSegment[]) {
  const vertices = new Map<
    string,
    {
      point: Landmark;
      neighbourDeltas: number[];
    }
  >();

  const addVertex = (
    xMm: number,
    yMm: number,
    neighbourY: number,
  ) => {
    const key = `${xMm.toFixed(2)}:${yMm.toFixed(2)}`;
    const current = vertices.get(key) ?? {
      point: { xMm, yMm },
      neighbourDeltas: [],
    };
    current.neighbourDeltas.push(neighbourY - yMm);
    vertices.set(key, current);
  };

  for (const [ax, ay, bx, by] of segments) {
    addVertex(ax, ay, by);
    addVertex(bx, by, ay);
  }

  const proximal: Landmark[] = [];
  const distal: Landmark[] = [];

  for (const { point, neighbourDeltas } of vertices.values()) {
    if (
      neighbourDeltas.length >= 2 &&
      neighbourDeltas.every((delta) => delta >= -0.02)
    ) {
      proximal.push(point);
    }

    if (
      neighbourDeltas.length >= 2 &&
      neighbourDeltas.every((delta) => delta <= 0.02)
    ) {
      distal.push(point);
    }
  }

  return { proximal, distal };
}

function buildMeasuredSegments(
  result: DeviceAnalysisResult,
  circumference: number,
): StrutSegment[] {
  const descriptor = result.device.benchCtDescriptor;
  if (!descriptor) {
    return result.strutSegments;
  }

  const model = buildBenchCtRenderModel(descriptor);
  return model.rings.flatMap((ring) => {
    if (ring.points.length < 2) {
      return [];
    }

    const ordered = [...ring.points].sort(
      (a, b) => a.thetaRad - b.thetaRad,
    );
    const unwrapped = ordered.map((point, index) => {
      let theta = point.thetaRad;
      if (index > 0) {
        while (theta <= ordered[index - 1].thetaRad) {
          theta += Math.PI * 2;
        }
      }
      return {
        xMm: (theta / (Math.PI * 2)) * circumference,
        yMm: point.zMm,
      };
    });
    const closed = [
      ...unwrapped,
      {
        xMm: unwrapped[0].xMm + circumference,
        yMm: unwrapped[0].yMm,
      },
    ];

    return closed.slice(0, -1).map((point, index) => {
      const next = closed[index + 1];
      return [point.xMm, point.yMm, next.xMm, next.yMm] as StrutSegment;
    });
  });
}

function MeasurementCell({ measurement }: { measurement: Measurement }) {
  return (
    <div
      className={cn(
        "min-h-[104px] border-b border-r border-white/10 px-4 py-3.5",
        measurement.tone === "accent" && "bg-[#ff8a72]/10",
        measurement.tone === "success" && "bg-emerald-300/5",
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/45">
        {measurement.label}
      </p>
      <p
        className={cn(
          "mt-2 font-mono text-xl font-medium tracking-tight text-white",
          measurement.tone === "accent" && "text-[#ffab98]",
          measurement.tone === "success" && "text-emerald-300",
        )}
      >
        {measurement.value}
      </p>
      <p className="mt-1.5 text-[11px] leading-4 text-white/45">
        {measurement.detail}
      </p>
    </div>
  );
}

export function PmegMeasurementCockpit({
  caseInput,
  project,
  overlayResult,
}: {
  caseInput: CaseInput;
  project: PlanningProject;
  overlayResult?: DeviceAnalysisResult | null;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const graftDiameterMm =
    overlayResult?.size?.graftDiameter ??
    project.graft.selectedGraftDiameterMm ??
    project.graft.neckDiameterMm;
  const circumference =
    overlayResult?.circumferenceMm ?? circumferenceMm(graftDiameterMm);
  const rawTargets = selectPlanarFenestrationsForDiameter(
    project,
    graftDiameterMm,
  );
  const rotationDeltaMm = overlayResult?.rotation.optimalDeltaMm ?? 0;
  const adjustedDepths = overlayResult?.depthOptimisation.adjustedDepths ?? [];
  const targets: PlanarTarget[] = rawTargets.map(
    ({ fenestration, point }, index) => ({
      fenestration,
      point: {
        xMm: wrapMm(point.xMm + rotationDeltaMm, circumference),
        yMm:
          fenestration.kind === "scallop"
            ? point.yMm
            : adjustedDepths[index] ?? point.yMm,
      },
    }),
  );
  const activeIndex =
    targets.length === 0 ? 0 : Math.min(selectedIndex, targets.length - 1);
  const selectedTarget = targets[activeIndex] ?? null;
  const benchModel = useMemo(
    () =>
      overlayResult?.device.benchCtDescriptor
        ? buildBenchCtRenderModel(overlayResult.device.benchCtDescriptor)
        : null,
    [overlayResult],
  );
  const measurementSegments = useMemo(
    () =>
      overlayResult
        ? buildMeasuredSegments(overlayResult, circumference)
        : [],
    [circumference, overlayResult],
  );
  const strutExtrema = useMemo(
    () => getStrutExtrema(measurementSegments),
    [measurementSegments],
  );

  const measurementData = useMemo(() => {
    if (!selectedTarget || !overlayResult) {
      return null;
    }

    const radiusAt = (yMm: number) =>
      benchModel
        ? benchModel.diameterAt(yMm) / 2
        : circumference / (Math.PI * 2);
    const distance = (a: Landmark, b: Landmark) => {
      const nominalArcDelta = signedWrappedDelta(
        a.xMm - b.xMm,
        circumference,
      );
      const angleDelta =
        (nominalArcDelta / circumference) * Math.PI * 2;
      const surfaceArc =
        angleDelta * ((radiusAt(a.yMm) + radiusAt(b.yMm)) / 2);
      return Math.hypot(surfaceArc, a.yMm - b.yMm);
    };
    const nearestLandmark = (
      landmarks: Landmark[],
      predicate: (landmark: Landmark) => boolean,
    ) => {
      let nearest: (Landmark & { distanceMm: number }) | null = null;
      for (const landmark of landmarks) {
        if (!predicate(landmark)) {
          continue;
        }
        const distanceMm = distance(selectedTarget.point, landmark);
        if (!nearest || distanceMm < nearest.distanceMm) {
          nearest = { ...landmark, distanceMm };
        }
      }
      return nearest;
    };
    const proximalApex =
      nearestLandmark(
        strutExtrema.proximal,
        (landmark) => landmark.yMm <= selectedTarget.point.yMm + 0.2,
      ) ?? nearestLandmark(strutExtrema.proximal, () => true);
    const distalValley =
      nearestLandmark(
        strutExtrema.distal,
        (landmark) => landmark.yMm >= selectedTarget.point.yMm - 0.2,
      ) ?? nearestLandmark(strutExtrema.distal, () => true);
    let nearestStrut: NearestSegmentResult | null = null;

    for (const [ax, ay, bx, by] of measurementSegments) {
      for (let sample = 0; sample <= 16; sample += 1) {
        const t = sample / 16;
        const point = {
          xMm: wrapMm(ax + (bx - ax) * t, circumference),
          yMm: ay + (by - ay) * t,
        };
        const distanceMm = distance(selectedTarget.point, point);
        if (!nearestStrut || distanceMm < nearestStrut.distanceMm) {
          nearestStrut = { ...point, distanceMm };
        }
      }
    }

    const nearestOther = targets
      .flatMap((target, index) =>
        index === activeIndex
          ? []
          : [{
        target,
        index,
        distanceMm: distance(selectedTarget.point, target.point),
      }],
      )
      .sort((a, b) => a.distanceMm - b.distanceMm)[0];
    const selectedRadius =
      (selectedTarget.fenestration.widthMm +
        selectedTarget.fenestration.heightMm) /
      4;
    const otherRadius = nearestOther
      ? (nearestOther.target.fenestration.widthMm +
          nearestOther.target.fenestration.heightMm) /
        4
      : 0;
    const safeThreshold =
      Math.max(
        selectedTarget.fenestration.widthMm,
        selectedTarget.fenestration.heightMm,
      ) /
        2 +
      overlayResult.device.wireRadius;
    const strutClearance =
      (nearestStrut?.distanceMm ?? Number.NaN) - safeThreshold;
    const proximalEdgeToFenestration =
      selectedTarget.point.yMm -
      selectedTarget.fenestration.heightMm / 2;
    const localCircumference =
      radiusAt(selectedTarget.point.yMm) * Math.PI * 2;
    const seamFraction =
      wrapMm(selectedTarget.point.xMm, circumference) / circumference;
    const seamArc =
      Math.min(seamFraction, 1 - seamFraction) * localCircumference;
    const nearestOtherEdgeGap = nearestOther
      ? nearestOther.distanceMm - selectedRadius - otherRadius
      : Number.NaN;
    const measurements: Measurement[] = [
      {
        id: "fabric-edge",
        label: "Fabric edge → fen edge",
        value: formatMm(proximalEdgeToFenestration),
        detail: "Primary axial ruler mark",
        tone: "accent",
      },
      {
        id: "center-depth",
        label: "Fabric edge → center",
        value: formatMm(selectedTarget.point.yMm),
        detail: "Final graft-frame depth",
      },
      {
        id: "proximal-apex",
        label: "Center → proximal apex",
        value: formatMm(proximalApex?.distanceMm ?? Number.NaN),
        detail: benchModel ? "Measured CT apex" : "Device-model apex",
      },
      {
        id: "distal-valley",
        label: "Center → distal valley",
        value: formatMm(distalValley?.distanceMm ?? Number.NaN),
        detail: benchModel ? "Measured CT valley" : "Device-model valley",
      },
      {
        id: "strut-clearance",
        label: "Minimum strut clearance",
        value: formatMm(strutClearance),
        detail:
          strutClearance >= 1
            ? "Fenestration perimeter to wire"
            : "Review before marking",
        tone: strutClearance >= 1 ? "success" : "accent",
      },
      {
        id: "adjacent-center",
        label: `Center → ${nearestOther?.target.fenestration.label ?? "next fen"}`,
        value: formatMm(nearestOther?.distanceMm ?? Number.NaN),
        detail: "Surface center-to-center",
      },
      {
        id: "adjacent-edge",
        label: "Fen edge → fen edge",
        value: formatMm(nearestOtherEdgeGap),
        detail: "Nearest opening separation",
      },
      {
        id: "seam",
        label: "Center → device datum",
        value: formatMm(seamArc),
        detail: "Shortest local surface arc",
      },
    ];

    return {
      proximalApex,
      distalValley,
      nearestOther,
      proximalEdgeToFenestration,
      strutClearance,
      measurements,
    };
  }, [
    activeIndex,
    benchModel,
    circumference,
    measurementSegments,
    overlayResult,
    selectedTarget,
    strutExtrema.distal,
    strutExtrema.proximal,
    targets,
  ]);

  if (!overlayResult?.size || !selectedTarget || !measurementData) {
    return (
      <section className="flex min-h-[420px] items-center justify-center rounded-[28px] bg-[#071a27] p-8 text-center text-white">
        <div className="max-w-md">
          <Crosshair className="mx-auto size-8 text-[#ff8a72]" />
          <h3 className="mt-5 text-2xl font-semibold">
            Measurement cockpit becomes available after analysis
          </h3>
          <p className="mt-3 text-sm leading-6 text-white/55">
            Select a compatible graft to bind each fenestration to the
            device-specific fabric and strut landmarks.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[30px] border border-[#173748] bg-[#071a27] text-white shadow-[0_32px_100px_-46px_rgba(4,21,32,0.9)]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-[#0a2231] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-[#ff8a72] text-[#071a27]">
            <Crosshair className="size-4" strokeWidth={2.6} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold tracking-tight">
                Dimensional PMEG reconstruction
              </p>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
                {benchModel ? "Bench CT geometry" : "Device geometry"}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-white/40">
              {overlayResult.device.shortName} · final graft-frame openings ·
              project {project.projectId.replace("project_", "").slice(0, 8)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-white/45">
          <ScanLine className="size-3.5 text-[#7dd3c7]" />
          Click an opening to inspect its measurements
        </div>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.5fr)_minmax(370px,0.72fr)]">
        <div className="min-w-0 border-b border-white/10 bg-[#e8efed] xl:border-b-0 xl:border-r">
          <div className="border-b border-[#b9cbc7] bg-white px-5 py-3 text-[#17333b] sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold">
                  Accurate Interactive 3D engine
                </p>
                <p className="mt-0.5 text-[11px] text-[#58706d]">
                  Measured taper, ring paths, fixation zone, barbs, and
                  anatomical orientation are preserved.
                </p>
              </div>
              <span className="rounded-full bg-[#e6f2ef] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.13em] text-[#37615d]">
                Drag · rotate · zoom · select
              </span>
            </div>
          </div>

          <GraftSketchCanvas
            result={overlayResult}
            caseInput={caseInput}
            height={680}
            layout="model-only"
            fenestrationFrame="graft"
            selectedFenestrationIndex={activeIndex}
            onSelectFenestration={setSelectedIndex}
            canvasClassName="rounded-none border-0"
          />

          <div className="grid border-t border-[#b9cbc7] bg-[#dce7e3] sm:grid-cols-[1fr_auto]">
            <div className="flex gap-2 overflow-x-auto px-5 py-4 sm:px-6">
              {targets.map((target, index) => (
                <button
                  key={target.fenestration.id}
                  type="button"
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition",
                    index === activeIndex
                      ? "border-[#e96f58] bg-[#ff8a72] text-[#10262f]"
                      : "border-[#b7c9c4] bg-white/70 text-[#24424a] hover:bg-white",
                  )}
                  onClick={() => setSelectedIndex(index)}
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full font-mono text-[10px] font-semibold",
                      index === activeIndex
                        ? "bg-[#10262f] text-white"
                        : "bg-[#dbe7e3] text-[#315854]",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span>
                    <span className="block text-[11px] font-semibold">
                      {target.fenestration.vessel}
                    </span>
                    <span className="block font-mono text-[9px] opacity-65">
                      {formatMm(target.point.yMm)} depth
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center border-t border-[#b9cbc7] px-5 py-3 text-[#58706d] sm:border-l sm:border-t-0">
              <Layers3 className="mr-2 size-3.5" />
              <p className="font-mono text-[9px] uppercase tracking-[0.13em]">
                {benchModel
                  ? `${benchModel.shape} measured profile`
                  : `${circumference.toFixed(1)} mm circumference`}
              </p>
            </div>
          </div>
        </div>

        <aside className="min-w-0 bg-[#091f2e]">
          <div className="border-b border-white/10 px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ffab98]">
                  Active opening {String(activeIndex + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                  {selectedTarget.fenestration.label}
                </h3>
                <p className="mt-1 text-xs text-white/45">
                  {selectedTarget.fenestration.widthMm} ×{" "}
                  {selectedTarget.fenestration.heightMm} mm · graft-frame
                  triangulation
                </p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-full border border-[#ff8a72]/30 bg-[#ff8a72]/10 text-[#ff9a83]">
                <Ruler className="size-4" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 border-b border-white/10">
            {measurementData.measurements.map((measurement) => (
              <MeasurementCell key={measurement.id} measurement={measurement} />
            ))}
          </div>

          <div className="px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                  Marking sequence
                </p>
                <p className="mt-1 text-sm font-semibold">
                  Triangulate from visible landmarks
                </p>
              </div>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-300">
                3 anchors
              </span>
            </div>

            <ol className="mt-5 space-y-1">
              {[
                {
                  title: "Set the axial mark",
                  body: `${formatMm(measurementData.proximalEdgeToFenestration)} from the proximal fabric edge to the near edge.`,
                },
                {
                  title: "Triangulate in the strut bay",
                  body: `${formatMm(measurementData.proximalApex?.distanceMm ?? Number.NaN)} from the proximal apex; ${formatMm(measurementData.distalValley?.distanceMm ?? Number.NaN)} from the distal valley.`,
                },
                {
                  title: "Cross-check the next opening",
                  body: measurementData.nearestOther
                    ? `${formatMm(measurementData.nearestOther.distanceMm)} center-to-center from ${measurementData.nearestOther.target.fenestration.label}.`
                    : "Use the device datum as the independent circumferential check.",
                },
                {
                  title: "Trace and verify",
                  body: `Mark ${selectedTarget.fenestration.widthMm} × ${selectedTarget.fenestration.heightMm} mm; confirm ${formatMm(measurementData.strutClearance)} wire clearance.`,
                },
              ].map((step, index) => (
                <li
                  key={step.title}
                  className="grid grid-cols-[28px_1fr_auto] gap-3 rounded-xl px-1 py-2.5"
                >
                  <span className="flex size-7 items-center justify-center rounded-full border border-white/10 bg-white/5 font-mono text-[9px] text-white/55">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <span className="block text-xs font-semibold text-white/85">
                      {step.title}
                    </span>
                    <span className="mt-1 block text-[11px] leading-4 text-white/40">
                      {step.body}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 size-3.5 text-white/20" />
                </li>
              ))}
            </ol>

            <div className="mt-5 flex items-start gap-3 border-t border-white/10 pt-4">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />
              <p className="text-[10px] leading-4 text-white/38">
                Planning reference only. Confirm measurements against the
                source reconstruction, device markings, institutional process,
                and applicable IFU before modification.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
