"use client";

import { Badge } from "@/components/ui/badge";
import { circumferenceMm, planarToCylinderPoint } from "@/lib/planning/geometry";
import { selectCylinderFenestrationsForDiameter } from "@/lib/planning/selectors";
import type { PlanningProject } from "@/lib/planning/types";
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
  const cylinderFenestrations = selectCylinderFenestrationsForDiameter(
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
        <svg viewBox="0 0 420 372" className="aspect-[1.15/1] w-full">
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

          {cylinderFenestrations
            .filter(({ point }) => point.z < 0)
            .map(({ fenestration, point }) => {
              const projected = projectCylinderPoint(
                point,
                centerX,
                topY,
                heightScale,
                radiusX,
                radiusY,
              );

              return (
                <circle
                  key={`back-fen-${fenestration.id}`}
                  cx={projected.x}
                  cy={projected.y}
                  r={7}
                  fill="rgba(12,84,72,0.12)"
                  stroke="rgba(12,84,72,0.24)"
                  strokeWidth={1.5}
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

          {cylinderFenestrations.map(({ fenestration, point }, index) => {
            const projected = projectCylinderPoint(
              point,
              centerX,
              topY,
              heightScale,
              radiusX,
              radiusY,
            );
            const isSelected = selectedFenestrationId === fenestration.id;

            return (
              <g key={fenestration.id}>
                <circle
                  cx={projected.x}
                  cy={projected.y}
                  r={isSelected ? 11 : 9}
                  fill={projected.front ? "#0c5448" : "rgba(12,84,72,0.2)"}
                  stroke={isSelected ? "#f0b13a" : "rgba(255,255,255,0.94)"}
                  strokeWidth={isSelected ? 3 : 2}
                />
                {projected.front ? (
                  <>
                    <text
                      x={projected.x}
                      y={roundSvgCoordinate(projected.y + 4)}
                      fill="white"
                      fontSize={11}
                      fontWeight={700}
                      textAnchor="middle"
                    >
                      {index + 1}
                    </text>
                    <text
                      x={projected.x}
                      y={roundSvgCoordinate(projected.y - 15)}
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
