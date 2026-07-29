"use client";

import { Badge } from "@/components/ui/badge";
import { circumferenceMm } from "@/lib/planning/geometry";
import { selectPlanarFenestrationsForDiameter } from "@/lib/planning/selectors";
import type { PlanningFenestration, PlanningProject } from "@/lib/planning/types";
import type { DeviceAnalysisResult, StrutSegment } from "@/lib/types";

function formatMm(value: number): string {
  return `${value.toFixed(1)} mm`;
}

function roundSvgCoordinate(value: number): number {
  return Number(value.toFixed(3));
}

function buildGraftBodyPath(
  centerX: number,
  topY: number,
  bodyHeight: number,
  topRadiusX: number,
  bottomRadiusX: number,
): string {
  const leftTopX = roundSvgCoordinate(centerX - topRadiusX);
  const rightTopX = roundSvgCoordinate(centerX + topRadiusX);
  const leftBottomX = roundSvgCoordinate(centerX - bottomRadiusX);
  const rightBottomX = roundSvgCoordinate(centerX + bottomRadiusX);
  const bottomY = roundSvgCoordinate(topY + bodyHeight);
  const normalizedTopY = roundSvgCoordinate(topY);

  return [
    `M ${leftTopX} ${normalizedTopY}`,
    `L ${leftBottomX} ${bottomY}`,
    `L ${rightBottomX} ${bottomY}`,
    `L ${rightTopX} ${normalizedTopY}`,
    "Z",
  ].join(" ");
}

function projectPolarPoint(
  thetaRad: number,
  depthMm: number,
  centerX: number,
  topY: number,
  heightScale: number,
  radiusX: number,
  radiusY: number,
) {
  return {
    x: roundSvgCoordinate(centerX + Math.sin(thetaRad) * radiusX),
    y: roundSvgCoordinate(
      topY + depthMm * heightScale - Math.cos(thetaRad) * radiusY * 0.5,
    ),
    front: -Math.cos(thetaRad) >= 0,
  };
}

function projectPlanarPoint(
  xMm: number,
  yMm: number,
  graftDiameterMm: number,
  centerX: number,
  topY: number,
  heightScale: number,
  radiusAtDepth: (depthMm: number) => { x: number; y: number },
) {
  const thetaRad = (xMm / circumferenceMm(graftDiameterMm)) * 2 * Math.PI;
  const radius = radiusAtDepth(yMm);
  return projectPolarPoint(
    thetaRad,
    yMm,
    centerX,
    topY,
    heightScale,
    radius.x,
    radius.y,
  );
}

function projectFenestrationFootprint(
  fenestration: PlanningFenestration,
  point: { xMm: number; yMm: number },
  graftDiameterMm: number,
  centerX: number,
  topY: number,
  heightScale: number,
  radiusAtDepth: (depthMm: number) => { x: number; y: number },
) {
  const center = projectPlanarPoint(
    point.xMm,
    point.yMm,
    graftDiameterMm,
    centerX,
    topY,
    heightScale,
    radiusAtDepth,
  );
  const left = projectPlanarPoint(
    point.xMm - fenestration.widthMm / 2,
    point.yMm,
    graftDiameterMm,
    centerX,
    topY,
    heightScale,
    radiusAtDepth,
  );
  const right = projectPlanarPoint(
    point.xMm + fenestration.widthMm / 2,
    point.yMm,
    graftDiameterMm,
    centerX,
    topY,
    heightScale,
    radiusAtDepth,
  );
  const top = projectPlanarPoint(
    point.xMm,
    point.yMm - fenestration.heightMm / 2,
    graftDiameterMm,
    centerX,
    topY,
    heightScale,
    radiusAtDepth,
  );
  const bottom = projectPlanarPoint(
    point.xMm,
    point.yMm + fenestration.heightMm / 2,
    graftDiameterMm,
    centerX,
    topY,
    heightScale,
    radiusAtDepth,
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
  referenceCircumferenceMm: number,
  centerX: number,
  topY: number,
  heightScale: number,
  radiusAtDepth: (depthMm: number) => { x: number; y: number },
) {
  const startTheta = (segment[0] / referenceCircumferenceMm) * 2 * Math.PI;
  const endTheta = (segment[2] / referenceCircumferenceMm) * 2 * Math.PI;
  const startRadius = radiusAtDepth(segment[1]);
  const endRadius = radiusAtDepth(segment[3]);
  const projectedStart = projectPolarPoint(
    startTheta,
    segment[1],
    centerX,
    topY,
    heightScale,
    startRadius.x,
    startRadius.y,
  );
  const projectedEnd = projectPolarPoint(
    endTheta,
    segment[3],
    centerX,
    topY,
    heightScale,
    endRadius.x,
    endRadius.y,
  );

  return {
    start: projectedStart,
    end: projectedEnd,
    front: -Math.cos((startTheta + endTheta) / 2) >= 0,
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
  const benchDescriptor = overlayResult?.device.benchCtDescriptor;
  const measuredDiameters = benchDescriptor?.diameter_profile?.length
    ? benchDescriptor.diameter_profile
    : benchDescriptor?.rings.map((ring) => ({
        z: (ring.z_proximal_apices_mm ?? 0) + ring.ring_height_mm / 2,
        d: ring.diameter_mm,
      })) ?? [];
  const profile = [...measuredDiameters].sort((a, b) => a.z - b.z);
  const profileLengthMm = profile.at(-1)?.z ?? project.graft.templateHeightMm;
  const renderLengthMm = Math.max(project.graft.templateHeightMm, profileLengthMm + 12);

  function diameterAtDepth(depthMm: number): number {
    if (profile.length === 0) return graftDiameterMm;
    if (depthMm <= profile[0].z) return profile[0].d;
    if (depthMm >= profile[profile.length - 1].z) return profile[profile.length - 1].d;
    for (let index = 1; index < profile.length; index += 1) {
      const upper = profile[index];
      const lower = profile[index - 1];
      if (depthMm <= upper.z) {
        const fraction = (depthMm - lower.z) / (upper.z - lower.z);
        return lower.d + (upper.d - lower.d) * fraction;
      }
    }
    return graftDiameterMm;
  }

  const planarFenestrations = selectPlanarFenestrationsForDiameter(
    project,
    graftDiameterMm,
  );
  const centerX = 210;
  const topY = 48;
  const bodyHeight = 284;
  const maxDiameterMm = Math.max(graftDiameterMm, ...profile.map((point) => point.d));
  const radiusScale = 112 / Math.max(maxDiameterMm / 2, 1);
  const radiusAtDepth = (depthMm: number) => {
    const radiusX = (diameterAtDepth(depthMm) / 2) * radiusScale;
    return { x: radiusX, y: radiusX * 0.25 };
  };
  const topRadius = radiusAtDepth(0);
  const bottomRadius = radiusAtDepth(renderLengthMm);
  const heightScale = bodyHeight / Math.max(renderLengthMm, 1);
  const fixationSegmentCount = benchDescriptor?.geometry?.proximal_fixation.ring_count
    ? benchDescriptor.rings
      .slice(0, benchDescriptor.geometry.proximal_fixation.ring_count)
      .reduce((count, ring) => count + ring.proximal_apices.length + ring.distal_apices.length, 0)
    : 0;
  const bodyPath = buildGraftBodyPath(
    centerX, topY, bodyHeight, topRadius.x, bottomRadius.x,
  );
  const projectedFenestrations = planarFenestrations.map(({ fenestration, point }) => ({
    fenestration,
    projected: projectFenestrationFootprint(
      fenestration,
      point,
      graftDiameterMm,
      centerX,
      topY,
      heightScale,
      radiusAtDepth,
    ),
  }));
  const projectedStruts = overlayResult?.size
    ? overlayResult.strutSegments.map((segment, index) => ({
        ...projectStrutSegment(
          segment,
          circumference,
          centerX,
          topY,
          heightScale,
          radiusAtDepth,
        ),
        fixation: index < fixationSegmentCount,
      }))
    : [];

  return (
    <div className="rounded-[28px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.88)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[color:var(--foreground)]">
            3D graft preview
          </p>
          <p className="mt-1 text-sm leading-6 text-[color:var(--muted-foreground)]">
            {benchDescriptor?.geometry?.shape === "conical"
              ? "CT-derived conical view: radius and struts vary with measured axial depth."
              : "CT-derived graft view with measured struts projected onto the graft body."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {overlayResult?.size ? (
            <Badge className="bg-white text-[color:var(--foreground)]">
              {overlayResult.device.shortName}
            </Badge>
          ) : null}
          <Badge className="bg-white text-[color:var(--foreground)]">
            {benchDescriptor?.geometry?.shape === "conical"
              ? `Diameter ${formatMm(diameterAtDepth(0))} → ${formatMm(diameterAtDepth(renderLengthMm))}`
              : `Diameter ${formatMm(graftDiameterMm)}`}
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
                stroke={segment.fixation ? "#b45309" : overlayResult?.device.color ?? "rgba(12,84,72,0.22)"}
                strokeOpacity={0.18}
                strokeWidth={1.6}
                strokeDasharray={segment.fixation ? "3 4" : "5 6"}
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
            rx={topRadius.x}
            ry={topRadius.y}
            fill="rgba(255,255,255,0.9)"
            stroke="rgba(16,33,31,0.15)"
            strokeWidth={1.8}
          />
          <ellipse
            cx={centerX}
            cy={topY + bodyHeight}
            rx={bottomRadius.x}
            ry={bottomRadius.y}
            fill="rgba(238,245,242,0.92)"
            stroke="rgba(16,33,31,0.12)"
            strokeWidth={1.8}
          />
          <line
            x1={centerX - topRadius.x}
            y1={topY}
            x2={centerX - bottomRadius.x}
            y2={topY + bodyHeight}
            stroke="rgba(16,33,31,0.12)"
            strokeWidth={1.8}
          />
          <line
            x1={centerX + topRadius.x}
            y1={topY}
            x2={centerX + bottomRadius.x}
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
                stroke={segment.fixation ? "#b45309" : overlayResult?.device.color ?? "rgba(12,84,72,0.36)"}
                strokeOpacity={0.44}
                strokeWidth={2}
                strokeDasharray={segment.fixation ? "4 3" : undefined}
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
            {benchDescriptor?.geometry?.shape === "conical"
              ? "Measured conical profile"
              : `Circumference ${formatMm(circumference)}`}
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
