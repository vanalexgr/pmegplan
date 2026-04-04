"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Compass,
  Crosshair,
  Download,
  Layers3,
  Move,
  Orbit,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GraftSketchCanvas } from "@/components/GraftSketchCanvas";
import { isValidClockText, normalizeClockText } from "@/lib/planning/clock";
import {
  isLikelyCompatibleTextExport,
  parseCompatibleTextExport,
} from "@/lib/planning/compatibleTextImport";
import {
  createSavedPlannerProject,
  getSavedPlannerProjectFilename,
  parseSavedPlannerProject,
  serializeSavedPlannerProject,
  type SavedPlannerProject,
} from "@/lib/planning/persistence";
import { arcMmToClockText } from "@/lib/planning/clock";
import {
  circumferenceMm,
  displacementMetrics,
  planarYToDistanceMm,
  wrapMm,
} from "@/lib/planning/geometry";
import { selectPlanarFenestrationsForDiameter } from "@/lib/planning/selectors";
import type { PlanarPointMm, PlanningProject } from "@/lib/planning/types";
import type { CaseInput, DeviceAnalysisResult, Fenestration } from "@/lib/types";
import { cn } from "@/lib/utils";

type FenestrationPatch = Partial<Fenestration>;
type FenestrationPositionPatch = Pick<Fenestration, "clock" | "depthMm">;

interface FenestrationEditDraft {
  vessel: Fenestration["vessel"];
  ftype: Fenestration["ftype"];
  clock: string;
  depthMm: string;
  widthMm: string;
  heightMm: string;
}

interface DragState {
  mode: "single" | "all";
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function getDimensionsForType(type: Fenestration["ftype"]) {
  switch (type) {
    case "SCALLOP":
      return { widthMm: 20, heightMm: 20 };
    case "LARGE_FEN":
      return { widthMm: 8, heightMm: 8 };
    default:
      return { widthMm: 6, heightMm: 6 };
  }
}

function toEditDraft(fenestration: Fenestration): FenestrationEditDraft {
  return {
    vessel: fenestration.vessel,
    ftype: fenestration.ftype,
    clock: fenestration.clock,
    depthMm: String(fenestration.ftype === "SCALLOP" ? 0 : fenestration.depthMm),
    widthMm: String(fenestration.widthMm),
    heightMm: String(fenestration.heightMm),
  };
}

export function PlanningWorkspace({
  caseInput,
  project,
  selectedDeviceIds,
  results,
  recommendedResult,
  canUndo,
  canRedo,
  onUpdateFenestration,
  onMoveAllFenestrations,
  onUndo,
  onRedo,
  onLoadSavedProject,
}: {
  caseInput: CaseInput;
  project: PlanningProject;
  selectedDeviceIds: string[];
  results: DeviceAnalysisResult[];
  recommendedResult?: DeviceAnalysisResult | null;
  canUndo: boolean;
  canRedo: boolean;
  onUpdateFenestration: (index: number, patch: FenestrationPatch) => void;
  onMoveAllFenestrations: (
    patches: Array<{ index: number; patch: FenestrationPatch }>,
  ) => void;
  onUndo: () => void;
  onRedo: () => void;
  onLoadSavedProject: (savedProject: SavedPlannerProject) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [ghosts, setGhosts] = useState<Record<string, GhostState>>({});
  const [showStruts, setShowStruts] = useState(true);
  const [showGhosts, setShowGhosts] = useState(true);
  const [moveAllMode, setMoveAllMode] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [overlayDeviceId, setOverlayDeviceId] = useState<string | null>(
    recommendedResult?.device.id ?? null,
  );
  const [editDraft, setEditDraft] = useState<FenestrationEditDraft | null>(null);
  const [editorStatus, setEditorStatus] = useState<string | null>(null);
  const [projectStatus, setProjectStatus] = useState<string | null>(null);
  const viewBoxWidth = 920;
  const viewBoxHeight = 540;
  const projectGraftDiameterMm =
    project.graft.selectedGraftDiameterMm ?? project.graft.neckDiameterMm;
  const compatibleResults = results.filter((result) => result.size);
  const overlayResults = compatibleResults.length > 0 ? compatibleResults : results;
  const overlayResult =
    overlayResults.find((result) => result.device.id === overlayDeviceId) ??
    recommendedResult ??
    overlayResults[0] ??
    null;
  const graftDiameterMm = overlayResult?.size?.graftDiameter ?? projectGraftDiameterMm;
  const circumference =
    overlayResult?.circumferenceMm ?? circumferenceMm(graftDiameterMm);
  const templateHeight = project.graft.templateHeightMm;
  const contentScale = Math.min(760 / circumference, 360 / templateHeight);
  const plotWidth = circumference * contentScale;
  const plotHeight = templateHeight * contentScale;
  const plotLeft = 44 + (832 - plotWidth) / 2;
  const plotTop = 112;
  const plotBottom = plotTop + plotHeight;
  const planarFenestrations = selectPlanarFenestrationsForDiameter(
    project,
    graftDiameterMm,
  );
  const visibleStrutSegments =
    showStruts && overlayResult?.size
      ? overlayResult.strutSegments.flatMap((segment, segmentIndex) =>
          [-circumference, 0, circumference].flatMap((offset) => {
            const ax = segment[0] + offset;
            const bx = segment[2] + offset;
            const minX = Math.min(ax, bx);
            const maxX = Math.max(ax, bx);

            if (maxX < 0 || minX > circumference) {
              return [];
            }

            return [
              {
                key: `${segmentIndex}-${offset}`,
                ax,
                ay: segment[1],
                bx,
                by: segment[3],
              },
            ];
          }),
        )
      : [];
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
  const selectedCaseFenestration = caseInput.fenestrations[activeSelectedIndex] ?? null;

  const activeDelta =
    dragState ? displacementMetrics(dragState.origin, dragState.point) : null;

  useEffect(() => {
    if (!overlayResults.some((result) => result.device.id === overlayDeviceId)) {
      setOverlayDeviceId(recommendedResult?.device.id ?? overlayResults[0]?.device.id ?? null);
    }
  }, [overlayDeviceId, overlayResults, recommendedResult]);

  useEffect(() => {
    if (!selectedCaseFenestration) {
      setEditDraft(null);
      setEditorStatus(null);
      return;
    }

    setEditDraft(toEditDraft(selectedCaseFenestration));
    setEditorStatus(null);
  }, [selectedCaseFenestration, activeSelectedIndex]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const applyViewportMode = (matches: boolean) => {
      setIsCompactViewport(matches);
    };

    applyViewportMode(mediaQuery.matches);
    const handleChange = (event: MediaQueryListEvent) => {
      applyViewportMode(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  const applyDeltaToPoint = (
    point: PlanarPointMm,
    delta: { dxMm: number; dyMm: number },
  ): PlanarPointMm => ({
    xMm: point.xMm + delta.dxMm,
    yMm: clamp(point.yMm + delta.dyMm, 0, templateHeight),
  });

  const buildPositionPatch = (point: PlanarPointMm): FenestrationPositionPatch => ({
    clock: arcMmToClockText(point.xMm, circumference, {
      separator: ":",
      padHour: false,
    }),
    depthMm: roundToTenth(
      planarYToDistanceMm(
        project.graft.baselineMode,
        point.yMm,
        project.graft.templateHeightMm,
      ),
    ),
  });

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

    if (state.mode === "all") {
      const delta = displacementMetrics(state.origin, state.point);
      const nextGhosts: Record<string, GhostState> = {};
      const patches: Array<{ index: number; patch: FenestrationPositionPatch }> = [];

      for (const [index, { fenestration: currentFenestration, point }] of planarFenestrations.entries()) {
        const nextPoint = applyDeltaToPoint(point, delta);
        const nextPatch = buildPositionPatch(nextPoint);
        const nextMetrics = displacementMetrics(point, nextPoint);

        nextGhosts[currentFenestration.id] = {
          point,
          nextClock: nextPatch.clock,
          nextDepthMm: nextPatch.depthMm,
          metrics: {
            dxMm: roundToTenth(nextMetrics.dxMm),
            dyMm: roundToTenth(nextMetrics.dyMm),
            distMm: roundToTenth(nextMetrics.distMm),
          },
        };

        if (
          currentFenestration.clockText !== nextPatch.clock ||
          roundToTenth(currentFenestration.distanceMm) !== nextPatch.depthMm
        ) {
          patches.push({ index, patch: nextPatch });
        }
      }

      setGhosts(nextGhosts);
      setDragState(null);
      setSelectedIndex(state.index);

      if (patches.length > 0) {
        onMoveAllFenestrations(patches);
      }

      return;
    }

    const nextPatch = buildPositionPatch(state.point);
    const metrics = displacementMetrics(state.origin, state.point);

    setGhosts((current) => ({
      ...current,
      [fenestration.id]: {
        point: state.origin,
        nextClock: nextPatch.clock,
        nextDepthMm: nextPatch.depthMm,
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
      fenestration.clockText !== nextPatch.clock ||
      roundToTenth(fenestration.distanceMm) !== nextPatch.depthMm
    ) {
      onUpdateFenestration(state.index, nextPatch);
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

  const handleSaveProject = () => {
    const savedProject = createSavedPlannerProject({
      project,
      caseInput,
      selectedDeviceIds,
    });
    const blob = new Blob([serializeSavedPlannerProject(savedProject)], {
      type: "application/json",
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = getSavedPlannerProjectFilename(savedProject);
    anchor.click();
    URL.revokeObjectURL(objectUrl);
    setProjectStatus(`Saved ${anchor.download}.`);
  };

  const handleLoadProject = async (
    event: ReactChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const fileText = await file.text();
      const nativeJsonImport =
        file.name.toLowerCase().endsWith(".json") &&
        !isLikelyCompatibleTextExport(fileText);
      const imported = nativeJsonImport
        ? {
            savedProject: parseSavedPlannerProject(fileText),
            importSummary: null,
          }
        : parseCompatibleTextExport(file.name, fileText);
      setGhosts({});
      setDragState(null);
      setMoveAllMode(false);
      setSelectedIndex(0);
      onLoadSavedProject(imported.savedProject);
      setProjectStatus(
        nativeJsonImport
          ? `Loaded ${file.name}.`
          : `Imported compatible text export ${file.name}. ${imported.importSummary ?? ""}`.trim(),
      );
    } catch (error) {
      setProjectStatus(
        error instanceof Error
          ? `${error.message} PMEGPlan imports its own saved JSON plus supported planning text exports.`
          : "Could not load the file. PMEGPlan imports its own saved JSON plus supported planning text exports.",
      );
    } finally {
      event.target.value = "";
    }
  };

  const handleApplyEditorChanges = () => {
    if (!editDraft || !selectedCaseFenestration) {
      return;
    }

    if (!isValidClockText(editDraft.clock)) {
      setEditorStatus("Clock must use H:MM, HH:MM, HhMM, or HHhMM.");
      return;
    }

    const isScallop = editDraft.ftype === "SCALLOP";
    const depthMm = isScallop ? 0 : Number(editDraft.depthMm);
    const widthMm = Number(editDraft.widthMm);
    const heightMm = Number(editDraft.heightMm);

    if (!isScallop && (!Number.isFinite(depthMm) || depthMm < 0 || depthMm > 200)) {
      setEditorStatus("Depth must be between 0 and 200 mm.");
      return;
    }

    if (!Number.isFinite(widthMm) || widthMm < 4 || widthMm > 25) {
      setEditorStatus("Width must be between 4 and 25 mm.");
      return;
    }

    if (!Number.isFinite(heightMm) || heightMm < 4 || heightMm > 20) {
      setEditorStatus("Height must be between 4 and 20 mm.");
      return;
    }

    onUpdateFenestration(activeSelectedIndex, {
      vessel: editDraft.vessel,
      ftype: editDraft.ftype,
      clock: normalizeClockText(editDraft.clock, {
        separator: ":",
        padHour: false,
      }),
      depthMm: roundToTenth(depthMm),
      widthMm: roundToTenth(widthMm),
      heightMm: roundToTenth(heightMm),
    });
    setEditorStatus("Workspace edits applied to the planner.");
  };

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
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant={showStruts ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowStruts((current) => !current)}
            >
              <Layers3 className="mr-2 size-4" />
              {showStruts ? "Hide struts" : "Show struts"}
            </Button>
            <Button
              type="button"
              variant={showGhosts ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowGhosts((current) => !current)}
            >
              <Move className="mr-2 size-4" />
              {showGhosts ? "Hide ghosts" : "Show ghosts"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setGhosts({})}
              disabled={Object.keys(ghosts).length === 0}
            >
              <RefreshCw className="mr-2 size-4" />
              Clear ghosts
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 px-0 py-0 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="border-b border-[color:var(--border)] p-4 xl:border-b-0 xl:border-r">
          <div className="overflow-hidden rounded-[28px] border border-[color:var(--border)] bg-[radial-gradient(circle_at_top,rgba(245,251,249,0.98),rgba(232,242,239,0.96))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
              className="aspect-[1.18/1] w-full touch-none select-none sm:aspect-[1.7/1]"
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

              {visibleStrutSegments.map((segment) => (
                <line
                  key={segment.key}
                  x1={plotLeft + segment.ax * contentScale}
                  y1={plotTop + segment.ay * contentScale}
                  x2={plotLeft + segment.bx * contentScale}
                  y2={plotTop + segment.by * contentScale}
                  stroke={overlayResult?.device.color ?? "rgba(12,84,72,0.36)"}
                  strokeOpacity={0.45}
                  strokeWidth={2}
                />
              ))}

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
                {moveAllMode ? "Move-all mode active" : "Drag to reposition"}
              </text>

              {planarFenestrations.map(({ fenestration, point }, index) => {
                const ghost = ghosts[fenestration.id];
                const displayPoint =
                  dragState && activeDelta
                    ? dragState.mode === "all"
                      ? applyDeltaToPoint(point, activeDelta)
                      : dragState.index === index
                        ? dragState.point
                        : point
                    : point;
                const svgPoint = pointToSvg(displayPoint);
                const ghostPoint = ghost ? pointToSvg(ghost.point) : null;
                const isSelected = activeSelectedIndex === index;
                const markerFill = isSelected ? "#0c5448" : "#145f53";
                const markerStroke = isSelected ? "#f0b13a" : "rgba(255,255,255,0.95)";

                return (
                  <g key={fenestration.id}>
                    {showGhosts && ghostPoint ? (
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
                          mode: moveAllMode ? "all" : "single",
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

          {overlayResult?.size ? (
            <div className="mt-6 rounded-[28px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.9)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-[color:var(--brand)]">
                    <Orbit className="size-4" />
                    <p className="text-xs font-semibold uppercase tracking-[0.2em]">
                      Interactive 3D view
                    </p>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[color:var(--foreground)]">
                    Device sketch for {overlayResult.device.shortName}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--muted-foreground)]">
                    Use this as the main device-specific review view. Switch between
                    rotate and move, use the zoom controls, and inspect strut windows
                    before dropping back to the summary cards.
                  </p>
                </div>
                <Badge className="bg-white text-[color:var(--foreground)]">
                  {overlayResult.size.graftDiameter} mm graft
                </Badge>
              </div>

              <div className="mt-4">
                <GraftSketchCanvas
                  result={overlayResult}
                  caseInput={caseInput}
                  height={isCompactViewport ? 360 : 520}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-5 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
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
                <Layers3 className="size-4" />
                <p className="text-xs font-semibold uppercase tracking-[0.2em]">
                  Overlay graft
                </p>
              </div>
              <div className="mt-3 space-y-2">
                <Select
                  value={overlayDeviceId ?? ""}
                  onChange={(event) => {
                    setOverlayDeviceId(event.target.value || null);
                    setProjectStatus(null);
                  }}
                >
                  {overlayResults.map((result) => (
                    <option key={result.device.id} value={result.device.id}>
                      {result.device.shortName}
                      {result.size ? ` · ${result.size.graftDiameter} mm` : " · unavailable"}
                    </option>
                  ))}
                </Select>
                <p className="text-sm text-[color:var(--muted-foreground)]">
                  {overlayResult?.size
                    ? `Previewing ${overlayResult.device.shortName} on a ${overlayResult.size.graftDiameter} mm graft.`
                    : "No compatible device is available for a device-specific overlay."}
                </p>
              </div>
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
                {recommendedResult?.size
                  ? `Recommended graft ${recommendedResult.device.shortName} ${recommendedResult.size.graftDiameter} mm`
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
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                {overlayResult?.size
                  ? `${overlayResult.device.shortName} strut overlay is shown on the active planning circumference.`
                  : "Strut overlay appears when a compatible recommended graft is available."}
              </p>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                {moveAllMode
                  ? "Dragging any marker shifts the whole fenestration set together."
                  : "Single-marker mode is active."}
              </p>
            </div>
          </div>

          <div className="rounded-[28px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.86)] p-5">
            <div className="flex items-center gap-2">
              <Compass className="size-4 text-[color:var(--brand)]" />
              <p className="text-sm font-semibold text-[color:var(--foreground)]">
                Project actions
              </p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setGhosts({});
                  setDragState(null);
                  setMoveAllMode(false);
                  onUndo();
                }}
                disabled={!canUndo}
              >
                <RotateCcw className="mr-2 size-4" />
                Undo
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setGhosts({});
                  setDragState(null);
                  setMoveAllMode(false);
                  onRedo();
                }}
                disabled={!canRedo}
              >
                <RotateCw className="mr-2 size-4" />
                Redo
              </Button>
              <Button
                type="button"
                variant={moveAllMode ? "secondary" : "outline"}
                onClick={() => setMoveAllMode((current) => !current)}
              >
                <Move className="mr-2 size-4" />
                {moveAllMode ? "Exit move-all" : "Move all"}
              </Button>
              <Button type="button" variant="outline" onClick={handleSaveProject}>
                <Download className="mr-2 size-4" />
                Save project
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="sm:col-span-2"
              >
                <Upload className="mr-2 size-4" />
                Load project JSON
              </Button>
            </div>

            {projectStatus ? (
              <p className="mt-4 text-sm leading-6 text-[color:var(--muted-foreground)]">
                {projectStatus}
              </p>
            ) : (
              <p className="mt-4 text-sm leading-6 text-[color:var(--muted-foreground)]">
                Save PMEGPlan schema v1 JSON, or import a supported planning `.txt` export to recover geometry.
              </p>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.txt,application/json,text/plain"
              className="hidden"
              onChange={handleLoadProject}
            />
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
                  {moveAllMode ? (
                    <Badge className="bg-white text-[color:var(--brand)]">
                      Move-all mode
                    </Badge>
                  ) : null}
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

          <div className="rounded-[28px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.86)] p-5">
            <div className="flex items-center gap-2">
              <Crosshair className="size-4 text-[color:var(--brand)]" />
              <p className="text-sm font-semibold text-[color:var(--foreground)]">
                Workspace editor
              </p>
            </div>

            {editDraft ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="workspace-vessel">Vessel</Label>
                    <Select
                      id="workspace-vessel"
                      value={editDraft.vessel}
                      onChange={(event) =>
                        setEditDraft((current) =>
                          current
                            ? {
                                ...current,
                                vessel: event.target.value as Fenestration["vessel"],
                              }
                            : current,
                        )
                      }
                    >
                      <option value="SMA">SMA</option>
                      <option value="LRA">Left renal</option>
                      <option value="RRA">Right renal</option>
                      <option value="CELIAC">Celiac</option>
                      <option value="LMA">IMA / LMA</option>
                      <option value="CUSTOM">Custom</option>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="workspace-type">Fenestration type</Label>
                    <Select
                      id="workspace-type"
                      value={editDraft.ftype}
                      onChange={(event) => {
                        const nextType = event.target.value as Fenestration["ftype"];
                        const defaults = getDimensionsForType(nextType);
                        setEditDraft((current) =>
                          current
                            ? {
                                ...current,
                                ftype: nextType,
                                depthMm:
                                  nextType === "SCALLOP"
                                    ? "0"
                                    : current.depthMm,
                                widthMm: String(defaults.widthMm),
                                heightMm: String(defaults.heightMm),
                              }
                            : current,
                        );
                      }}
                    >
                      <option value="SCALLOP">Scallop</option>
                      <option value="LARGE_FEN">Large fenestration</option>
                      <option value="SMALL_FEN">Small fenestration</option>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="workspace-clock">Clock</Label>
                    <Input
                      id="workspace-clock"
                      value={editDraft.clock}
                      onChange={(event) =>
                        setEditDraft((current) =>
                          current ? { ...current, clock: event.target.value } : current,
                        )
                      }
                      onBlur={(event) => {
                        if (!isValidClockText(event.target.value)) {
                          return;
                        }

                        setEditDraft((current) =>
                          current
                            ? {
                                ...current,
                                clock: normalizeClockText(event.target.value, {
                                  separator: ":",
                                  padHour: false,
                                }),
                              }
                            : current,
                        );
                      }}
                    />
                  </div>

                  {editDraft.ftype === "SCALLOP" ? (
                    <div className="space-y-2">
                      <Label htmlFor="workspace-depth">Depth from proximal edge (mm)</Label>
                      <div className="flex h-11 items-center rounded-2xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.72)] px-4 text-sm text-[color:var(--muted-foreground)]">
                        Scallops are fixed at the proximal edge: 0.0 mm
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="workspace-depth">Depth from proximal edge (mm)</Label>
                      <Input
                        id="workspace-depth"
                        type="number"
                        step="0.1"
                        value={editDraft.depthMm}
                        onChange={(event) =>
                          setEditDraft((current) =>
                            current ? { ...current, depthMm: event.target.value } : current,
                          )
                        }
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="workspace-width">Width (mm)</Label>
                    <Input
                      id="workspace-width"
                      type="number"
                      step="0.1"
                      value={editDraft.widthMm}
                      onChange={(event) =>
                        setEditDraft((current) =>
                          current ? { ...current, widthMm: event.target.value } : current,
                        )
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="workspace-height">Height (mm)</Label>
                    <Input
                      id="workspace-height"
                      type="number"
                      step="0.1"
                      value={editDraft.heightMm}
                      onChange={(event) =>
                        setEditDraft((current) =>
                          current ? { ...current, heightMm: event.target.value } : current,
                        )
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const defaults = getDimensionsForType(editDraft.ftype);
                      setEditDraft((current) =>
                        current
                          ? {
                              ...current,
                              depthMm:
                                current.ftype === "SCALLOP" ? "0" : current.depthMm,
                              widthMm: String(defaults.widthMm),
                              heightMm: String(defaults.heightMm),
                            }
                          : current,
                      );
                    }}
                  >
                    Reset dimensions for type
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      selectedCaseFenestration
                        ? setEditDraft(toEditDraft(selectedCaseFenestration))
                        : null
                    }
                  >
                    Revert draft
                  </Button>
                  <Button type="button" onClick={handleApplyEditorChanges}>
                    Apply workspace edits
                  </Button>
                </div>

                <p className="text-sm leading-6 text-[color:var(--muted-foreground)]">
                  {editorStatus ??
                    "Edit the selected fenestration here without leaving the planning workspace."}
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[color:var(--muted-foreground)]">
                Select a fenestration marker to edit its vessel, type, clock, depth,
                and punch dimensions here.
              </p>
            )}
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
