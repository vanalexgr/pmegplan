"use client";

import { useMemo, useRef, useState, type PointerEvent } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Crosshair,
  Eye,
  EyeOff,
  Layers3,
  RotateCcw,
  RotateCw,
  Ruler,
} from "lucide-react";

import { circumferenceMm, wrapMm } from "@/lib/planning/geometry";
import { selectPlanarFenestrationsForDiameter } from "@/lib/planning/selectors";
import type { PlanningFenestration, PlanningProject } from "@/lib/planning/types";
import type { DeviceAnalysisResult, StrutSegment } from "@/lib/types";
import { cn } from "@/lib/utils";

type ViewMode = "cylinder" | "unrolled";

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

const SURFACE_WIDTH = 780;
const SURFACE_HEIGHT = 560;

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

function surfaceDistance(
  a: Landmark,
  b: Landmark,
  circumference: number,
) {
  return Math.hypot(
    signedWrappedDelta(a.xMm - b.xMm, circumference),
    a.yMm - b.yMm,
  );
}

function nearestPointOnSegments(
  point: Landmark,
  segments: StrutSegment[],
  circumference: number,
): NearestSegmentResult | null {
  let nearest: NearestSegmentResult | null = null;

  for (const [ax, ay, bx, by] of segments) {
    for (const offset of [-circumference, 0, circumference]) {
      const shiftedAx = ax + offset;
      const shiftedBx = bx + offset;
      const dx = shiftedBx - shiftedAx;
      const dy = by - ay;
      const lengthSquared = dx * dx + dy * dy;
      const t =
        lengthSquared === 0
          ? 0
          : Math.max(
              0,
              Math.min(
                1,
                ((point.xMm - shiftedAx) * dx + (point.yMm - ay) * dy) /
                  lengthSquared,
              ),
            );
      const xMm = shiftedAx + t * dx;
      const yMm = ay + t * dy;
      const distanceMm = Math.hypot(point.xMm - xMm, point.yMm - yMm);

      if (!nearest || distanceMm < nearest.distanceMm) {
        nearest = {
          xMm: wrapMm(xMm, circumference),
          yMm,
          distanceMm,
        };
      }
    }
  }

  return nearest;
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

function nearestLandmark(
  point: Landmark,
  landmarks: Landmark[],
  circumference: number,
  predicate: (landmark: Landmark) => boolean,
) {
  let nearest: (Landmark & { distanceMm: number }) | null = null;

  for (const landmark of landmarks) {
    if (!predicate(landmark)) {
      continue;
    }

    const distanceMm = surfaceDistance(point, landmark, circumference);
    if (!nearest || distanceMm < nearest.distanceMm) {
      nearest = { ...landmark, distanceMm };
    }
  }

  return nearest;
}

function projectCylinderPoint(
  point: Landmark,
  circumference: number,
  templateHeightMm: number,
  rotationDeg: number,
) {
  const centerX = 360;
  const topY = 58;
  const radiusX = 150;
  const radiusY = 34;
  const bodyHeight = 420;
  const angle =
    (point.xMm / circumference) * Math.PI * 2 +
    (rotationDeg / 180) * Math.PI;
  const depth = Math.cos(angle);

  return {
    x: centerX + Math.sin(angle) * radiusX,
    y:
      topY +
      (point.yMm / Math.max(templateHeightMm, 1)) * bodyHeight +
      depth * radiusY * 0.5,
    front: depth >= 0,
    depth,
  };
}

function projectUnrolledPoint(
  point: Landmark,
  circumference: number,
  templateHeightMm: number,
) {
  const left = 74;
  const top = 58;
  const width = 620;
  const height = 420;

  return {
    x: left + (wrapMm(point.xMm, circumference) / circumference) * width,
    y: top + (point.yMm / Math.max(templateHeightMm, 1)) * height,
    front: true,
    depth: 1,
  };
}

function MeasurementCell({ measurement }: { measurement: Measurement }) {
  return (
    <div
      className={cn(
        "min-h-[102px] border-b border-r border-white/10 px-4 py-3.5",
        measurement.tone === "accent" && "bg-[#ff8a72]/10",
        measurement.tone === "success" && "bg-emerald-300/5",
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
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
  project,
  overlayResult,
}: {
  project: PlanningProject;
  overlayResult?: DeviceAnalysisResult | null;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("cylinder");
  const [showStruts, setShowStruts] = useState(true);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startRotation: number;
  } | null>(null);

  const graftDiameterMm =
    overlayResult?.size?.graftDiameter ??
    project.graft.selectedGraftDiameterMm ??
    project.graft.neckDiameterMm;
  const circumference =
    overlayResult?.circumferenceMm ?? circumferenceMm(graftDiameterMm);
  const templateHeightMm = project.graft.templateHeightMm;
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
  const strutSegments = useMemo(
    () => overlayResult?.strutSegments ?? [],
    [overlayResult?.strutSegments],
  );
  const strutExtrema = useMemo(
    () => getStrutExtrema(strutSegments),
    [strutSegments],
  );

  const measurementData = useMemo(() => {
    if (!selectedTarget) {
      return null;
    }

    const selectedPoint = selectedTarget.point;
    const proximalApex =
      nearestLandmark(
        selectedPoint,
        strutExtrema.proximal,
        circumference,
        (landmark) => landmark.yMm <= selectedPoint.yMm + 0.2,
      ) ??
      nearestLandmark(
        selectedPoint,
        strutExtrema.proximal,
        circumference,
        () => true,
      );
    const distalValley =
      nearestLandmark(
        selectedPoint,
        strutExtrema.distal,
        circumference,
        (landmark) => landmark.yMm >= selectedPoint.yMm - 0.2,
      ) ??
      nearestLandmark(
        selectedPoint,
        strutExtrema.distal,
        circumference,
        () => true,
      );
    const nearestStrut = nearestPointOnSegments(
      selectedPoint,
      strutSegments,
      circumference,
    );
    const nearestOther = targets
      .map((target, index) => ({
        target,
        index,
        distanceMm:
          index === activeIndex
            ? Number.POSITIVE_INFINITY
            : surfaceDistance(selectedPoint, target.point, circumference),
      }))
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
    const nearestOtherEdgeGap = nearestOther
      ? nearestOther.distanceMm - selectedRadius - otherRadius
      : Number.NaN;
    const safeThreshold =
      Math.max(
        selectedTarget.fenestration.widthMm,
        selectedTarget.fenestration.heightMm,
      ) /
        2 +
      (overlayResult?.device.wireRadius ?? 0);
    const reportedStrutDistance =
      overlayResult?.optimalConflicts[activeIndex]?.minDist ??
      nearestStrut?.distanceMm ??
      Number.NaN;
    const strutClearance = reportedStrutDistance - safeThreshold;
    const proximalEdgeToFenestration =
      selectedPoint.yMm - selectedTarget.fenestration.heightMm / 2;
    const seamArc = Math.min(
      wrapMm(selectedPoint.xMm, circumference),
      circumference - wrapMm(selectedPoint.xMm, circumference),
    );

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
        value: formatMm(selectedPoint.yMm),
        detail: `At ${selectedTarget.fenestration.clockText} graft position`,
      },
      {
        id: "proximal-apex",
        label: "Center → proximal apex",
        value: formatMm(proximalApex?.distanceMm ?? Number.NaN),
        detail: "Surface triangulation anchor",
      },
      {
        id: "distal-valley",
        label: "Center → distal valley",
        value: formatMm(distalValley?.distanceMm ?? Number.NaN),
        detail: "Second strut landmark",
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
        detail: "Center-to-center cross-check",
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
        detail: "Shortest surface arc to 12:00 seam",
      },
    ];

    return {
      proximalApex,
      distalValley,
      nearestStrut,
      nearestOther,
      strutClearance,
      proximalEdgeToFenestration,
      measurements,
    };
  }, [
    activeIndex,
    circumference,
    overlayResult,
    selectedTarget,
    strutExtrema.distal,
    strutExtrema.proximal,
    strutSegments,
    targets,
  ]);

  const projectPoint = (point: Landmark) =>
    viewMode === "cylinder"
      ? projectCylinderPoint(
          point,
          circumference,
          templateHeightMm,
          rotationDeg,
        )
      : projectUnrolledPoint(point, circumference, templateHeightMm);

  const projectedStruts = strutSegments.map((segment, index) => {
    const start = projectPoint({ xMm: segment[0], yMm: segment[1] });
    const end = projectPoint({ xMm: segment[2], yMm: segment[3] });

    return {
      index,
      start,
      end,
      front: viewMode === "unrolled" || (start.depth + end.depth) / 2 >= 0,
    };
  });
  const projectedTargets = targets.map((target) => ({
    target,
    projected: projectPoint(target.point),
  }));
  const selectedProjected = selectedTarget
    ? projectPoint(selectedTarget.point)
    : null;
  const proximalProjected = measurementData?.proximalApex
    ? projectPoint(measurementData.proximalApex)
    : null;
  const distalProjected = measurementData?.distalValley
    ? projectPoint(measurementData.distalValley)
    : null;

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (viewMode !== "cylinder") {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startRotation: rotationDeg,
    };
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    setRotationDeg(drag.startRotation + (event.clientX - drag.startX) * 0.42);
  };

  const handlePointerEnd = (event: PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  };

  if (!overlayResult?.size || !selectedTarget || !measurementData) {
    return (
      <section className="flex min-h-[420px] items-center justify-center rounded-[28px] bg-[#071a27] p-8 text-center text-white">
        <div className="max-w-md">
          <Crosshair className="mx-auto size-8 text-[#ff8a72]" />
          <h3 className="mt-5 text-2xl font-semibold">
            Measurement cockpit becomes available after analysis
          </h3>
          <p className="mt-3 text-sm leading-6 text-white/55">
            Select a compatible graft so the reconstruction can bind each
            fenestration to its device-specific fabric and strut landmarks.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[30px] border border-[#173748] bg-[#071a27] text-white shadow-[0_32px_100px_-46px_rgba(4,21,32,0.9)]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-[#0a2231] px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full bg-[#ff8a72] text-[#071a27]">
            <Crosshair className="size-4" strokeWidth={2.6} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold tracking-tight">
                Dimensional PMEG reconstruction
              </p>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
                Geometry linked
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-white/40">
              {overlayResult.device.shortName} ·{" "}
              {overlayResult.size.graftDiameter} mm · Project{" "}
              {project.projectId.replace("project_", "").slice(0, 8)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            className={cn(
              "rounded-lg px-3 py-1.5 text-[11px] font-semibold transition",
              viewMode === "cylinder"
                ? "bg-white text-[#071a27]"
                : "text-white/55 hover:text-white",
            )}
            onClick={() => setViewMode("cylinder")}
          >
            3D shell
          </button>
          <button
            type="button"
            className={cn(
              "rounded-lg px-3 py-1.5 text-[11px] font-semibold transition",
              viewMode === "unrolled"
                ? "bg-white text-[#071a27]"
                : "text-white/55 hover:text-white",
            )}
            onClick={() => setViewMode("unrolled")}
          >
            Unrolled
          </button>
        </div>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.72fr)]">
        <div className="min-w-0 border-b border-white/10 xl:border-b-0 xl:border-r">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3 sm:px-6">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
                Select a fenestration
              </span>
              <span className="h-3 w-px bg-white/15" />
              <span className="text-[11px] text-white/55">
                {viewMode === "cylinder"
                  ? "Drag reconstruction to rotate"
                  : "Exact cylindrical surface coordinates"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label={showStruts ? "Hide struts" : "Show struts"}
                className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/65 transition hover:bg-white/10 hover:text-white"
                onClick={() => setShowStruts((current) => !current)}
              >
                {showStruts ? (
                  <Eye className="size-3.5" />
                ) : (
                  <EyeOff className="size-3.5" />
                )}
              </button>
              <button
                type="button"
                aria-label="Rotate left"
                disabled={viewMode !== "cylinder"}
                className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/65 transition hover:bg-white/10 hover:text-white disabled:opacity-25"
                onClick={() => setRotationDeg((current) => current - 18)}
              >
                <RotateCcw className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Rotate right"
                disabled={viewMode !== "cylinder"}
                className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/65 transition hover:bg-white/10 hover:text-white disabled:opacity-25"
                onClick={() => setRotationDeg((current) => current + 18)}
              >
                <RotateCw className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="relative min-h-[520px] overflow-hidden bg-[radial-gradient(circle_at_50%_35%,rgba(40,92,108,0.42),transparent_46%)]">
            <div className="pointer-events-none absolute inset-x-6 top-5 z-10 flex items-start justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ffab98]">
                  Active target {String(activeIndex + 1).padStart(2, "0")}
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {selectedTarget.fenestration.label}
                </p>
                <p className="mt-1 text-xs text-white/45">
                  {selectedTarget.fenestration.widthMm} ×{" "}
                  {selectedTarget.fenestration.heightMm} mm ·{" "}
                  {selectedTarget.fenestration.clockText}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#071a27]/70 px-3 py-2 text-right backdrop-blur">
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
                  Final optimisation
                </p>
                <p className="mt-1 text-xs font-semibold text-white/75">
                  {overlayResult.rotation.optimalDeltaDeg >= 0 ? "+" : ""}
                  {overlayResult.rotation.optimalDeltaDeg.toFixed(1)}° rotation
                </p>
              </div>
            </div>

            <svg
              viewBox={`0 0 ${SURFACE_WIDTH} ${SURFACE_HEIGHT}`}
              className={cn(
                "h-full min-h-[520px] w-full touch-none select-none",
                viewMode === "cylinder" && "cursor-ew-resize",
              )}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              aria-label={`Interactive ${viewMode === "cylinder" ? "three-dimensional" : "unrolled"} PMEG reconstruction`}
            >
              <defs>
                <linearGradient
                  id="pmeg-fabric"
                  x1="0"
                  x2="1"
                  y1="0"
                  y2="0"
                >
                  <stop offset="0%" stopColor="#d8e7e7" stopOpacity="0.12" />
                  <stop offset="48%" stopColor="#eff8f6" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#8eb1b7" stopOpacity="0.1" />
                </linearGradient>
                <filter
                  id="selected-glow"
                  x="-100%"
                  y="-100%"
                  width="300%"
                  height="300%"
                >
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {viewMode === "cylinder" ? (
                <>
                  <path
                    d="M 210 58 L 210 478 L 510 478 L 510 58 Z"
                    fill="url(#pmeg-fabric)"
                    stroke="rgba(193,226,227,0.16)"
                    strokeWidth="1.5"
                  />
                  <ellipse
                    cx="360"
                    cy="58"
                    rx="150"
                    ry="34"
                    fill="rgba(217,239,237,0.08)"
                    stroke="rgba(207,235,234,0.28)"
                    strokeWidth="1.5"
                  />
                  <ellipse
                    cx="360"
                    cy="478"
                    rx="150"
                    ry="34"
                    fill="rgba(8,27,40,0.72)"
                    stroke="rgba(207,235,234,0.12)"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M 210 58 L 210 478 M 510 58 L 510 478"
                    stroke="rgba(207,235,234,0.14)"
                    strokeWidth="1.5"
                  />
                </>
              ) : (
                <>
                  <rect
                    x="74"
                    y="58"
                    width="620"
                    height="420"
                    rx="8"
                    fill="url(#pmeg-fabric)"
                    stroke="rgba(207,235,234,0.24)"
                  />
                  {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
                    <g key={fraction}>
                      <line
                        x1={74 + 620 * fraction}
                        x2={74 + 620 * fraction}
                        y1="58"
                        y2="478"
                        stroke="rgba(207,235,234,0.1)"
                        strokeDasharray="5 7"
                      />
                      <text
                        x={74 + 620 * fraction}
                        y="502"
                        fill="rgba(255,255,255,0.36)"
                        fontFamily="monospace"
                        fontSize="10"
                        textAnchor="middle"
                      >
                        {formatMm(circumference * fraction)}
                      </text>
                    </g>
                  ))}
                </>
              )}

              {showStruts
                ? projectedStruts
                    .filter((segment) => !segment.front)
                    .map((segment) => (
                      <line
                        key={`back-${segment.index}`}
                        x1={segment.start.x}
                        y1={segment.start.y}
                        x2={segment.end.x}
                        y2={segment.end.y}
                        stroke="#93aeb2"
                        strokeOpacity="0.16"
                        strokeWidth="1.35"
                        strokeDasharray="4 5"
                      />
                    ))
                : null}

              {showStruts
                ? projectedStruts
                    .filter((segment) => segment.front)
                    .map((segment) => (
                      <line
                        key={`front-${segment.index}`}
                        x1={segment.start.x}
                        y1={segment.start.y}
                        x2={segment.end.x}
                        y2={segment.end.y}
                        stroke="#bdd0d1"
                        strokeOpacity={viewMode === "unrolled" ? "0.44" : "0.56"}
                        strokeWidth="1.55"
                      />
                    ))
                : null}

              {selectedProjected && proximalProjected ? (
                <line
                  x1={selectedProjected.x}
                  y1={selectedProjected.y}
                  x2={proximalProjected.x}
                  y2={proximalProjected.y}
                  stroke="#ff9a83"
                  strokeWidth="1.5"
                  strokeDasharray="5 5"
                />
              ) : null}
              {selectedProjected && distalProjected ? (
                <line
                  x1={selectedProjected.x}
                  y1={selectedProjected.y}
                  x2={distalProjected.x}
                  y2={distalProjected.y}
                  stroke="#7dd3c7"
                  strokeWidth="1.5"
                  strokeDasharray="5 5"
                />
              ) : null}

              {proximalProjected ? (
                <g>
                  <circle
                    cx={proximalProjected.x}
                    cy={proximalProjected.y}
                    r="4"
                    fill="#ff9a83"
                  />
                  <text
                    x={proximalProjected.x + 8}
                    y={proximalProjected.y - 7}
                    fill="#ffb5a5"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    APEX
                  </text>
                </g>
              ) : null}
              {distalProjected ? (
                <g>
                  <circle
                    cx={distalProjected.x}
                    cy={distalProjected.y}
                    r="4"
                    fill="#7dd3c7"
                  />
                  <text
                    x={distalProjected.x + 8}
                    y={distalProjected.y + 13}
                    fill="#9be1d8"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    VALLEY
                  </text>
                </g>
              ) : null}

              {projectedTargets.map(({ target, projected }, index) => {
                const isSelected = index === activeIndex;
                const isBack = viewMode === "cylinder" && !projected.front;

                return (
                  <g
                    key={target.fenestration.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${target.fenestration.label}`}
                    className="cursor-pointer outline-none"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => setSelectedIndex(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedIndex(index);
                      }
                    }}
                  >
                    {isSelected ? (
                      <circle
                        cx={projected.x}
                        cy={projected.y}
                        r="24"
                        fill="none"
                        stroke="#ff8a72"
                        strokeOpacity="0.42"
                        strokeWidth="1.5"
                        filter="url(#selected-glow)"
                      />
                    ) : null}
                    <ellipse
                      cx={projected.x}
                      cy={projected.y}
                      rx={Math.max(9, target.fenestration.widthMm * 1.25)}
                      ry={Math.max(9, target.fenestration.heightMm * 1.25)}
                      fill={
                        isSelected
                          ? "#ff8a72"
                          : isBack
                            ? "rgba(115,164,169,0.28)"
                            : "#d8f0ec"
                      }
                      stroke={isSelected ? "#ffd5ca" : "#071a27"}
                      strokeWidth={isSelected ? "2.5" : "2"}
                      strokeDasharray={isBack ? "3 3" : undefined}
                    />
                    <text
                      x={projected.x}
                      y={projected.y + 4}
                      fill={isSelected ? "#071a27" : "#12303a"}
                      fontSize="11"
                      fontWeight="800"
                      textAnchor="middle"
                    >
                      {index + 1}
                    </text>
                    <text
                      x={projected.x}
                      y={projected.y - 18}
                      fill={
                        isSelected
                          ? "#ffb5a5"
                          : isBack
                            ? "rgba(255,255,255,0.28)"
                            : "rgba(255,255,255,0.7)"
                      }
                      fontSize="10"
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      {target.fenestration.vessel}
                    </text>
                  </g>
                );
              })}

              <g transform="translate(26 518)">
                <circle cx="4" cy="4" r="3.5" fill="#ff8a72" />
                <text
                  x="16"
                  y="8"
                  fill="rgba(255,255,255,0.42)"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  PROXIMAL EDGE DATUM · 0.0 MM
                </text>
              </g>
            </svg>

            <div className="absolute bottom-5 right-5 flex items-center gap-2 rounded-xl border border-white/10 bg-[#071a27]/75 px-3 py-2 text-[10px] text-white/45 backdrop-blur">
              <Layers3 className="size-3.5 text-[#7dd3c7]" />
              DICOM-informed lattice · free state
            </div>
          </div>

          <div className="grid border-t border-white/10 sm:grid-cols-[1fr_auto]">
            <div className="flex gap-2 overflow-x-auto px-5 py-4 sm:px-6">
              {targets.map((target, index) => (
                <button
                  key={target.fenestration.id}
                  type="button"
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition",
                    index === activeIndex
                      ? "border-[#ff8a72]/50 bg-[#ff8a72]/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
                  )}
                  onClick={() => setSelectedIndex(index)}
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full font-mono text-[10px] font-semibold",
                      index === activeIndex
                        ? "bg-[#ff8a72] text-[#071a27]"
                        : "bg-white/10 text-white/65",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span>
                    <span className="block text-[11px] font-semibold">
                      {target.fenestration.vessel}
                    </span>
                    <span className="block font-mono text-[9px] text-white/35">
                      {formatMm(target.point.yMm)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center border-t border-white/10 px-5 py-3 sm:border-l sm:border-t-0">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">
                {circumference.toFixed(1)} mm circumference
              </p>
            </div>
          </div>
        </div>

        <aside className="min-w-0 bg-[#091f2e]">
          <div className="border-b border-white/10 px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ffab98]">
                  Measurement stack
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                  {selectedTarget.fenestration.label}
                </h3>
                <p className="mt-1 text-xs text-white/45">
                  Eight-point geometry check for direct fabric marking
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
                  Fast triangulation, no template transfer
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
                    : "Use the seam datum as the independent circumferential check.",
                },
                {
                  title: "Trace and verify",
                  body: `Mark ${selectedTarget.fenestration.widthMm} × ${selectedTarget.fenestration.heightMm} mm; confirm ${formatMm(measurementData.strutClearance)} wire clearance.`,
                },
              ].map((step, index) => (
                <li
                  key={step.title}
                  className="group grid grid-cols-[28px_1fr_auto] gap-3 rounded-xl px-1 py-2.5"
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
