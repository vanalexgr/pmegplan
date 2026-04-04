"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Compass, Crosshair, Move, Orbit } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDeviceById } from "@/lib/devices";
import { arcMmToClockText } from "@/lib/planning/clock";
import {
  circumferenceMm,
  displacementMetrics,
  planarYToDistanceMm,
  wrapMm,
} from "@/lib/planning/geometry";
import { buildPlanningDeviceProfile } from "@/lib/planning/project";
import { selectPlanarFenestrations } from "@/lib/planning/selectors";
import type { PlanarPointMm, PlanningProject } from "@/lib/planning/types";
import type { Fenestration } from "@/lib/types";
import { cn } from "@/lib/utils";

type FenestrationPositionPatch = Pick<Fenestration, "clock" | "depthMm">;

interface DragState {
  index: number;
  pointerId: number;
  origin: PlanarPointMm;
  point: PlanarPointMm;
}

interface GhostState {
  point: PlanarPointMm;
  nextClock: string;
  nextDepthMm: number;
  metrics: {
    dxMm: number;
    dyMm: number;
    distMm: number;
  };
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatMm(value: number): string {
  return `${roundToTenth(value).toFixed(1)} mm`;
}

export function PlanningWorkspace({
  project,
  onMoveFenestration,
}: {
  project: PlanningProject;
  onMoveFenestration: (index: number, patch: FenestrationPositionPatch) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [ghosts, setGhosts] = useState<Record<string, GhostState>>({});
  const viewBoxWidth = 920;
  const viewBoxHeight = 540;
  const circumference = circumferenceMm(project.graft.neckDiameterMm);
  const templateHeight = project.graft.templateHeightMm;
  const contentScale = Math.min(760 / circumference, 360 / templateHeight);
  const plotWidth = circumference * contentScale;
  const plotHeight = templateHeight * contentScale;
  const plotLeft = 44 + (832 - plotWidth) / 2;
  const plotTop = 112;
  const plotBottom = plotTop + plotHeight;
  const device = project.graft.deviceProfileId
    ? getDeviceById(project.graft.deviceProfileId)
    : null;
  const deviceProfile = device
    ? buildPlanningDeviceProfile(device, project.graft.neckDiameterMm)
    : null;
  const planarFenestrations = selectPlanarFenestrations(project);
  const guideFractions = [
    { label: "12:00", fraction: 0 },
    { label: "3:00", fraction: 0.25 },
    { label: "6:00", fraction: 0.5 },
    { label: "9:00", fraction: 0.75 },
  ];

  const activeSelectedIndex =
    project.fenestrations.length === 0
      ? 0
      : Math.min(selectedIndex, project.fenestrations.length - 1);

  const pointToSvg = (point: PlanarPointMm) => ({
    x:
      plotLeft +
      (point.xMm >= circumference ? circumference : wrapMm(point.xMm, circumference)) *
        contentScale,
    y: plotTop + point.yMm * contentScale,
  });

  const pointerToPlanarPoint = (
    event: ReactPointerEvent<SVGSVGElement>,
  ): PlanarPointMm | null => {
    const svg = svgRef.current;
    if (!svg) {
      return null;
    }

    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }

    const svgX = ((event.clientX - rect.left) / rect.width) * viewBoxWidth;
    const svgY = ((event.clientY - rect.top) / rect.height) * viewBoxHeight;
    const xMm = Math.min(Math.max((svgX - plotLeft) / contentScale, 0), circumference);
    const yMm = Math.min(
      Math.max((svgY - plotTop) / contentScale, 0),
      templateHeight,
    );

    return { xMm, yMm };
  };

  const commitDrag = (state: DragState | null) => {
    if (!state) {
      return;
    }

    const fenestration = project.fenestrations[state.index];
    if (!fenestration) {
      setDragState(null);
      return;
    }

    const nextClock = arcMmToClockText(state.point.xMm, circumference, {
      separator: ":",
      padHour: false,
    });
    const nextDepthMm = roundToTenth(
      planarYToDistanceMm(
        project.graft.baselineMode,
        state.point.yMm,
        project.graft.templateHeightMm,
      ),
    );
    const metrics = displacementMetrics(state.origin, state.point);

    setGhosts((current) => ({
      ...current,
      [fenestration.id]: {
        point: state.origin,
        nextClock,
        nextDepthMm,
        metrics: {
          dxMm: roundToTenth(metrics.dxMm),
          dyMm: roundToTenth(metrics.dyMm),
          distMm: roundToTenth(metrics.distMm),
        },
      },
    }));
    setDragState(null);
    setSelectedIndex(state.index);

    if (
      fenestration.clockText !== nextClock ||
      roundToTenth(fenestration.distanceMm) !== nextDepthMm
    ) {
      onMoveFenestration(state.index, {
        clock: nextClock,
        depthMm: nextDepthMm,
      });
    }
  };

  const selectedFenestration = project.fenestrations[activeSelectedIndex] ?? null;
  const selectedPlanarPoint = selectedFenestration
    ? planarFenestrations[activeSelectedIndex]?.point ?? null
    : null;
  const previewPoint =
    dragState && dragState.index === activeSelectedIndex
      ? dragState.point
      : selectedPlanarPoint;
  const liveMetrics =
    dragState && dragState.index === activeSelectedIndex
      ? displacementMetrics(dragState.origin, dragState.point)
      : null;
  const liveClock =
    dragState && dragState.index === activeSelectedIndex
      ? arcMmToClockText(dragState.point.xMm, circumference, {
          separator: ":",
          padHour: false,
        })
      : selectedFenestration?.clockText ?? null;
  const liveDepth =
    dragState && dragState.index === activeSelectedIndex
      ? roundToTenth(
          planarYToDistanceMm(
            project.graft.baselineMode,
            dragState.point.yMm,
            project.graft.templateHeightMm,
          ),
        )
      : selectedFenestration
        ? roundToTenth(selectedFenestration.distanceMm)
        : null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-4 border-b border-[color:var(--border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(232,244,240,0.88))]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Planning project</Badge>
              <Badge className="bg-[rgba(12,84,72,0.08)] text-[color:var(--brand)]">
                {project.fenestrations.length} fenestration
                {project.fenestrations.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <CardTitle>Interactive graft workspace</CardTitle>
            <CardDescription>
              Drag any fenestration on the unrolled graft map to update its normalized
              clock position and proximal depth, with the previous location kept as a
              ghost marker for reference.
            </CardDescription>
          </div>
          <div className="rounded-[24px] border border-[color:var(--border)] bg-white/85 px-4 py-3 text-sm text-[color:var(--muted-foreground)]">
            <p className="font-medium text-[color:var(--foreground)]">
              {deviceProfile?.label ?? "Project template"}
            </p>
            <p>
              {project.graft.baselineMode === "top"
                ? "Top baseline"
                : "Bottom baseline"}
              {" · "}
              {formatMm(project.graft.templateHeightMm)} template height
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 px-0 py-0 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="border-b border-[color:var(--border)] p-4 lg:border-b-0 lg:border-r">
          <div className="overflow-hidden rounded-[28px] border border-[color:var(--border)] bg-[radial-gradient(circle_at_top,rgba(245,251,249,0.98),rgba(232,242,239,0.96))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
              className="aspect-[1.7/1] w-full touch-none select-none"
              onPointerMove={(event) => {
                if (!dragState || event.pointerId !== dragState.pointerId) {
                  return;
                }

                const nextPoint = pointerToPlanarPoint(event);
                if (!nextPoint) {
                  return;
                }

                setDragState((current) =>
                  current ? { ...current, point: nextPoint } : current,
                );
              }}
              onPointerUp={(event) => {
                if (!dragState || event.pointerId !== dragState.pointerId) {
                  return;
                }

                svgRef.current?.releasePointerCapture(event.pointerId);
                commitDrag(dragState);
              }}
              onPointerCancel={(event) => {
                if (!dragState || event.pointerId !== dragState.pointerId) {
                  return;
                }

                svgRef.current?.releasePointerCapture(event.pointerId);
                setDragState(null);
              }}
            >
              <rect
                x={plotLeft}
                y={plotTop}
                width={plotWidth}
                height={plotHeight}
                rx={26}
                fill="rgba(255,255,255,0.92)"
                stroke="rgba(16,33,31,0.12)"
                strokeWidth={2}
              />

              {guideFractions.map(({ label, fraction }) => {
                const x = plotLeft + fraction * plotWidth;

                return (
                  <g key={label}>
                    <line
                      x1={x}
                      x2={x}
                      y1={plotTop}
                      y2={plotBottom}
                      stroke="rgba(12,84,72,0.14)"
                      strokeDasharray="7 8"
                      strokeWidth={1.5}
                    />
                    <text
                      x={x}
                      y={plotTop - 18}
                      fill="rgba(12,84,72,0.85)"
                      fontSize={14}
                      fontWeight={600}
                      textAnchor="middle"
                    >
                      {label}
                    </text>
                  </g>
                );
              })}

              {[0.25, 0.5, 0.75].map((fraction) => {
                const y = plotTop + fraction * plotHeight;

                return (
                  <line
                    key={fraction}
                    x1={plotLeft}
                    x2={plotLeft + plotWidth}
                    y1={y}
                    y2={y}
                    stroke="rgba(16,33,31,0.08)"
                    strokeDasharray="6 10"
                    strokeWidth={1}
                  />
                );
              })}

              <text
                x={plotLeft}
                y={plotBottom + 34}
                fill="rgba(69,96,91,0.9)"
                fontSize={15}
                fontWeight={500}
              >
                Circumference {formatMm(circumference)}
              </text>
              <text
                x={plotLeft + plotWidth}
                y={plotBottom + 34}
                fill="rgba(69,96,91,0.9)"
                fontSize={15}
                fontWeight={500}
                textAnchor="end"
              >
                Drag to reposition
              </text>

              {planarFenestrations.map(({ fenestration, point }, index) => {
                const ghost = ghosts[fenestration.id];
                const displayPoint =
                  dragState?.index === index ? dragState.point : point;
                const svgPoint = pointToSvg(displayPoint);
                const ghostPoint = ghost ? pointToSvg(ghost.point) : null;
                const isSelected = activeSelectedIndex === index;
                const markerFill = isSelected ? "#0c5448" : "#145f53";
                const markerStroke = isSelected ? "#f0b13a" : "rgba(255,255,255,0.95)";

                return (
                  <g key={fenestration.id}>
                    {ghostPoint ? (
                      <g opacity={0.85}>
                        <line
                          x1={ghostPoint.x}
                          y1={ghostPoint.y}
                          x2={svgPoint.x}
                          y2={svgPoint.y}
                          stroke="rgba(240,177,58,0.45)"
                          strokeDasharray="7 5"
                          strokeWidth={2}
                        />
                        <circle
                          cx={ghostPoint.x}
                          cy={ghostPoint.y}
                          r={12}
                          fill="rgba(240,177,58,0.08)"
                          stroke="rgba(240,177,58,0.8)"
                          strokeDasharray="4 4"
                          strokeWidth={2}
                        />
                      </g>
                    ) : null}

                    <g
                      className="cursor-grab active:cursor-grabbing"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        svgRef.current?.setPointerCapture(event.pointerId);
                        setSelectedIndex(index);
                        setDragState({
                          index,
                          pointerId: event.pointerId,
                          origin: point,
                          point,
                        });
                      }}
                    >
                      <circle
                        cx={svgPoint.x}
                        cy={svgPoint.y}
                        r={16}
                        fill={markerFill}
                        stroke={markerStroke}
                        strokeWidth={isSelected ? 3 : 2}
                      />
                      <text
                        x={svgPoint.x}
                        y={svgPoint.y + 5}
                        fill="white"
                        fontSize={13}
                        fontWeight={700}
                        textAnchor="middle"
                      >
                        {index + 1}
                      </text>
                    </g>

                    <text
                      x={svgPoint.x}
                      y={svgPoint.y - 24}
                      fill="rgba(16,33,31,0.88)"
                      fontSize={13}
                      fontWeight={600}
                      textAnchor="middle"
                    >
                      {fenestration.vessel}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        <div className="space-y-5 p-4">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-[24px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.82)] p-4">
              <div className="flex items-center gap-2 text-[color:var(--brand)]">
                <Compass className="size-4" />
                <p className="text-xs font-semibold uppercase tracking-[0.2em]">
                  Project state
                </p>
              </div>
              <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">
                ID {project.projectId.slice(0, 8)} · schema v{project.schemaVersion}
              </p>
              <p className="mt-1 text-sm text-[color:var(--foreground)]">
                {project.patient.displayName}
              </p>
            </div>

            <div className="rounded-[24px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.82)] p-4">
              <div className="flex items-center gap-2 text-[color:var(--brand)]">
                <Orbit className="size-4" />
                <p className="text-xs font-semibold uppercase tracking-[0.2em]">
                  Template
                </p>
              </div>
              <p className="mt-3 text-sm text-[color:var(--foreground)]">
                Neck diameter {formatMm(project.graft.neckDiameterMm)}
              </p>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                {deviceProfile?.selectedGraftDiameterMm
                  ? `Suggested graft ${deviceProfile.selectedGraftDiameterMm} mm`
                  : "No device-specific graft size selected yet"}
              </p>
            </div>

            <div className="rounded-[24px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.82)] p-4">
              <div className="flex items-center gap-2 text-[color:var(--brand)]">
                <Move className="size-4" />
                <p className="text-xs font-semibold uppercase tracking-[0.2em]">
                  Interaction
                </p>
              </div>
              <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">
                Drag markers on the template to rewrite clock and depth values in the
                planner form and rerun analysis from the updated geometry.
              </p>
            </div>
          </div>

          <div className="rounded-[28px] border border-[color:var(--border)] bg-[rgba(250,247,240,0.82)] p-5">
            <div className="flex items-center gap-2">
              <Crosshair className="size-4 text-[color:var(--brand)]" />
              <p className="text-sm font-semibold text-[color:var(--foreground)]">
                Selected fenestration
              </p>
            </div>

            {selectedFenestration && previewPoint && liveClock && liveDepth !== null ? (
              <div className="mt-4 space-y-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-white text-[color:var(--foreground)]">
                    {selectedFenestration.vessel}
                  </Badge>
                  <Badge className="bg-white text-[color:var(--foreground)]">
                    {selectedFenestration.kind.replaceAll("_", " ")}
                  </Badge>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[20px] bg-white/90 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                      Clock
                    </p>
                    <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">
                      {liveClock}
                    </p>
                  </div>
                  <div className="rounded-[20px] bg-white/90 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                      Depth
                    </p>
                    <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">
                      {formatMm(liveDepth)}
                    </p>
                  </div>
                </div>

                <div className="rounded-[20px] bg-white/90 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                    Planar coordinates
                  </p>
                  <p className="mt-2 text-sm text-[color:var(--foreground)]">
                    x {formatMm(previewPoint.xMm)} · y {formatMm(previewPoint.yMm)}
                  </p>
                </div>

                <div className="rounded-[20px] bg-white/90 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                    Displacement
                  </p>
                  {liveMetrics ? (
                    <p className="mt-2 text-sm text-[color:var(--foreground)]">
                      dX {formatMm(liveMetrics.dxMm)} · dY {formatMm(liveMetrics.dyMm)} ·
                      Dist {formatMm(liveMetrics.distMm)}
                    </p>
                  ) : ghosts[selectedFenestration.id] ? (
                    <p className="mt-2 text-sm text-[color:var(--foreground)]">
                      Last move dX {formatMm(ghosts[selectedFenestration.id].metrics.dxMm)} ·
                      dY {formatMm(ghosts[selectedFenestration.id].metrics.dyMm)} · Dist{" "}
                      {formatMm(ghosts[selectedFenestration.id].metrics.distMm)}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                      Start dragging to preview live displacement metrics.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            {planarFenestrations.map(({ fenestration }, index) => {
              const isSelected = activeSelectedIndex === index;
              const ghost = ghosts[fenestration.id];

              return (
                <button
                  key={fenestration.id}
                  type="button"
                  className={cn(
                    "w-full rounded-[22px] border p-4 text-left transition-colors",
                    isSelected
                      ? "border-[color:var(--brand)] bg-[rgba(12,84,72,0.08)]"
                      : "border-[color:var(--border)] bg-white/80 hover:bg-white",
                  )}
                  onClick={() => setSelectedIndex(index)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-[color:var(--foreground)]">
                      {fenestration.label}
                    </p>
                    <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                      {fenestration.clockText}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                    {formatMm(fenestration.distanceMm)} deep · {fenestration.widthMm} ×{" "}
                    {fenestration.heightMm} mm
                  </p>
                  {ghost ? (
                    <p className="mt-2 text-xs text-[color:var(--brand)]">
                      Ghost at {ghost.nextClock} · {formatMm(ghost.nextDepthMm)} target
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
