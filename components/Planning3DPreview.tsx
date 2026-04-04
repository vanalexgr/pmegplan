"use client";

import { Badge } from "@/components/ui/badge";
import { circumferenceMm, planarToCylinderPoint } from "@/lib/planning/geometry";
import { selectPlanarFenestrationsForDiameter } from "@/lib/planning/selectors";
import type { PlanningFenestration, PlanningProject } from "@/lib/planning/types";
import type { DeviceAnalysisResult, StrutSegment } from "@/lib/types";

function formatMm(value: number): string {
  return `${value.toFixed(1)} mm`;
}

function roundSvgCoordinate(value: number): number {
  return Number(value.toFixed(3));
}

function buildCylinderPath(
  centerX: number,
  topY: number,
  bodyHeight: number,
  radiusX: number,
): string {
  const leftX = roundSvgCoordinate(centerX - radiusX);
  const rightX = roundSvgCoordinate(centerX + radiusX);
  const bottomY = roundSvgCoordinate(topY + bodyHeight);
  const normalizedTopY = roundSvgCoordinate(topY);

  return [
    `M ${leftX} ${normalizedTopY}`,
    `L ${leftX} ${bottomY}`,
    `L ${rightX} ${bottomY}`,
    `L ${rightX} ${normalizedTopY}`,
    "Z",
  ].join(" ");
}

function projectCylinderPoint(
  point: ReturnType<typeof planarToCylinderPoint>,
  centerX: number,
  topY: number,
  heightScale: number,
  radiusX: number,
  radiusY: number,
) {
  const radiusMm = Math.max(Math.hypot(point.x, point.z), 1);

  return {
    x: roundSvgCoordinate(centerX + (point.x / radiusMm) * radiusX),
    y: roundSvgCoordinate(
      topY + point.y * heightScale + (point.z / radiusMm) * radiusY * 0.5,
    ),
    front: point.z >= 0,
  };
}

function projectPlanarPoint(
  xMm: number,
  yMm: number,
  graftDiameterMm: number,
  centerX: number,
  topY: number,
  heightScale: number,
  radiusX: number,
  radiusY: number,
) {
  return projectCylinderPoint(
    planarToCylinderPoint({
      xMm,
      yMm,
      graftDiameterMm,
    }),
    centerX,
    topY,
    heightScale,
    radiusX,
    radiusY,
  );
}

function projectFenestrationFootprint(
  fenestration: PlanningFenestration,
  point: { xMm: number; yMm: number },
  graftDiameterMm: number,
  centerX: number,
  topY: number,
  heightScale: number,
  radiusX: number,
  radiusY: number,
) {
  const center = projectPlanarPoint(
    point.xMm,
    point.yMm,
    graftDiameterMm,
    centerX,
    topY,
    heightScale,
    radiusX,
    radiusY,
  );
  const left = projectPlanarPoint(
    point.xMm - fenestration.widthMm / 2,
    point.yMm,
    graftDiameterMm,
    centerX,
    topY,
    heightScale,
    radiusX,
    radiusY,
  );
  const right = projectPlanarPoint(
    point.xMm + fenestration.widthMm / 2,
    point.yMm,
    graftDiameterMm,
    centerX,
    topY,
    heightScale,
    radiusX,
    radiusY,
  );
  const top = projectPlanarPoint(
    point.xMm,
    point.yMm - fenestration.heightMm / 2,
    graftDiameterMm,
    centerX,
    topY,
    heightScale,
    radiusX,
    radiusY,
  );
  const bottom = projectPlanarPoint(
    point.xMm,
    point.yMm + fenestration.heightMm / 2,
    graftDiameterMm,
    centerX,
    topY,
    heightScale,
    radiusX,
    radiusY,
  );

  return {
    center,
    rx: Math.max(
      4,
      roundSvgCoordinate(Math.hypot(right.x - left.x, right.y - left.y) / 2),
    ),
    ry: Math.max(
      4,
      roundSvgCoordinate(Math.hypot(bottom.x - top.x, bottom.y - top.y) / 2),
    ),
    rotationDeg: roundSvgCoordinate(
      (Math.atan2(right.y - left.y, right.x - left.x) * 180) / Math.PI,
    ),
  };
}

function projectStrutSegment(
  segment: StrutSegment,
  graftDiameterMm: number,
  centerX: number,
  topY: number,
  heightScale: number,
  radiusX: number,
  radiusY: number,
) {
  const start = planarToCylinderPoint({
    xMm: segment[0],
    yMm: segment[1],
    graftDiameterMm,
  });
  const end = planarToCylinderPoint({
    xMm: segment[2],
    yMm: segment[3],
    graftDiameterMm,
  });

  const projectedStart = projectCylinderPoint(
    start,
    centerX,
    topY,
    heightScale,
    radiusX,
    radiusY,
  );
  const projectedEnd = projectCylinderPoint(
    end,
    centerX,
    topY,
    heightScale,
    radiusX,
    radiusY,
  );

  return {
    start: projectedStart,
    end: projectedEnd,
    front: (start.z + end.z) / 2 >= 0,
  };
}

export function Planning3DPreview({
  project,
  overlayResult,
  selectedFenestrationId,
}: {
  project: PlanningProject;
  overlayResult?: DeviceAnalysisResult | null;
  selectedFenestrationId?: string | null;
}) {
  const graftDiameterMm =
    overlayResult?.size?.graftDiameter ??
    project.graft.selectedGraftDiameterMm ??
    project.graft.neckDiameterMm;
  const circumference =
    overlayResult?.circumferenceMm ?? circumferenceMm(graftDiameterMm);
  const planarFenestrations = selectPlanarFenestrationsForDiameter(
    project,
    graftDiameterMm,
  );
  const centerX = 210;
  const topY = 48;
  const radiusX = 112;
  const radiusY = 28;
  const bodyHeight = 284;
  const heightScale = bodyHeight / Math.max(project.graft.templateHeightMm, 1);
  const bodyPath = buildCylinderPath(centerX, topY, bodyHeight, radiusX);
  const projectedFenestrations = planarFenestrations.map(({ fenestration, point }) => ({
    fenestration,
    projected: projectFenestrationFootprint(
      fenestration,
      point,
      graftDiameterMm,
      centerX,
      topY,
      heightScale,
      radiusX,
      radiusY,
    ),
  }));
  const projectedStruts = overlayResult?.size
    ? overlayResult.strutSegments.map((segment) =>
        projectStrutSegment(
          segment,
          graftDiameterMm,
          centerX,
          topY,
          heightScale,
          radiusX,
          radiusY,
        ),
      )
    : [];

  return (
    <div className="rounded-[28px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.88)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[color:var(--foreground)]">
            3D graft preview
          </p>
          <p className="mt-1 text-sm leading-6 text-[color:var(--muted-foreground)]">
            Cylindrical view of the current planning template, with the chosen
            device overlay projected onto the graft body.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {overlayResult?.size ? (
            <Badge className="bg-white text-[color:var(--foreground)]">
              {overlayResult.device.shortName}
            </Badge>
          ) : null}
          <Badge className="bg-white text-[color:var(--foreground)]">
            Diameter {formatMm(graftDiameterMm)}
          </Badge>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-[24px] border border-[color:var(--border)] bg-[radial-gradient(circle_at_top,rgba(245,251,249,1),rgba(236,244,241,0.98))] p-3">
        <svg viewBox="0 0 420 372" className="aspect-[1.02/1] w-full sm:aspect-[1.15/1]">
          {projectedStruts
            .filter((segment) => !segment.front)
            .map((segment, index) => (
              <line
                key={`back-${index}`}
                x1={segment.start.x}
                y1={segment.start.y}
                x2={segment.end.x}
                y2={segment.end.y}
                stroke={overlayResult?.device.color ?? "rgba(12,84,72,0.22)"}
                strokeOpacity={0.18}
                strokeWidth={1.6}
                strokeDasharray="5 6"
              />
            ))}

          {projectedFenestrations
            .filter(({ projected }) => !projected.center.front)
            .map(({ fenestration, projected }) => {
              const ellipseTransform = `rotate(${projected.rotationDeg} ${projected.center.x} ${projected.center.y})`;

              return (
                <ellipse
                  key={`back-fen-${fenestration.id}`}
                  cx={projected.center.x}
                  cy={projected.center.y}
                  rx={projected.rx}
                  ry={projected.ry}
                  transform={ellipseTransform}
                  fill="rgba(12,84,72,0.12)"
                  stroke="rgba(12,84,72,0.24)"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
              );
            })}

          <path
            d={bodyPath}
            fill="rgba(255,255,255,0.8)"
            stroke="rgba(16,33,31,0.08)"
            strokeWidth={1.5}
          />
          <ellipse
            cx={centerX}
            cy={topY}
            rx={radiusX}
            ry={radiusY}
            fill="rgba(255,255,255,0.9)"
            stroke="rgba(16,33,31,0.15)"
            strokeWidth={1.8}
          />
          <ellipse
            cx={centerX}
            cy={topY + bodyHeight}
            rx={radiusX}
            ry={radiusY}
            fill="rgba(238,245,242,0.92)"
            stroke="rgba(16,33,31,0.12)"
            strokeWidth={1.8}
          />
          <line
            x1={centerX - radiusX}
            y1={topY}
            x2={centerX - radiusX}
            y2={topY + bodyHeight}
            stroke="rgba(16,33,31,0.12)"
            strokeWidth={1.8}
          />
          <line
            x1={centerX + radiusX}
            y1={topY}
            x2={centerX + radiusX}
            y2={topY + bodyHeight}
            stroke="rgba(16,33,31,0.12)"
            strokeWidth={1.8}
          />

          {projectedStruts
            .filter((segment) => segment.front)
            .map((segment, index) => (
              <line
                key={`front-${index}`}
                x1={segment.start.x}
                y1={segment.start.y}
                x2={segment.end.x}
                y2={segment.end.y}
                stroke={overlayResult?.device.color ?? "rgba(12,84,72,0.36)"}
                strokeOpacity={0.44}
                strokeWidth={2}
              />
            ))}

          {projectedFenestrations.map(({ fenestration, projected }, index) => {
            const isSelected = selectedFenestrationId === fenestration.id;
            const ellipseTransform = `rotate(${projected.rotationDeg} ${projected.center.x} ${projected.center.y})`;

            return (
              <g key={fenestration.id}>
                <ellipse
                  cx={projected.center.x}
                  cy={projected.center.y}
                  rx={isSelected ? projected.rx + 1.5 : projected.rx}
                  ry={isSelected ? projected.ry + 1.5 : projected.ry}
                  transform={ellipseTransform}
                  fill={projected.center.front ? "#0c5448" : "rgba(12,84,72,0.2)"}
                  stroke={isSelected ? "#f0b13a" : "rgba(255,255,255,0.94)"}
                  strokeWidth={isSelected ? 3 : 2}
                />
                {projected.center.front ? (
                  <>
                    <text
                      x={projected.center.x}
                      y={roundSvgCoordinate(projected.center.y + 4)}
                      fill="white"
                      fontSize={11}
                      fontWeight={700}
                      textAnchor="middle"
                    >
                      {index + 1}
                    </text>
                    <text
                      x={projected.center.x}
                      y={roundSvgCoordinate(projected.center.y - projected.ry - 8)}
                      fill="rgba(16,33,31,0.86)"
                      fontSize={11}
                      fontWeight={600}
                      textAnchor="middle"
                    >
                      {fenestration.vessel}
                    </text>
                  </>
                ) : null}
              </g>
            );
          })}

          <text
            x="24"
            y="344"
            fill="rgba(69,96,91,0.88)"
            fontSize={13}
            fontWeight={500}
          >
            Circumference {formatMm(circumference)}
          </text>
          <text
            x="396"
            y="344"
            fill="rgba(69,96,91,0.88)"
            fontSize={13}
            fontWeight={500}
            textAnchor="end"
          >
            Back markers are muted
          </text>
        </svg>
      </div>
    </div>
  );
}
