"use client";

import { useEffect, useRef, useState } from "react";
import {
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
} from "lucide-react";

import {
  scallopEdgeDepthMm,
  type PlacedOpening,
  type PlacedScallop,
} from "@/lib/planning/anatomy";
import { arcMmToClockText } from "@/lib/planning/clock";
import { measureHole } from "@/lib/planning/holeMeasurements";
import type { GraftModel } from "@/lib/planning/plan";
import { cn } from "@/lib/utils";

/**
 * Facets round the cylinder. Fine enough that a scallop — a couple of dozen
 * degrees at most — is cut as a curve rather than as three flat steps.
 */
const SURFACE_FACETS = 180;
const HOLE_SAMPLES = 36;
const DEFAULT_ELEVATION = 0.2;
/** Fabric shown below the deepest opening, in mm. */
const WORKING_ZONE_TAIL_MM = 22;

export interface GraftModel3DProps {
  graft: GraftModel;
  openings: PlacedOpening[];
  proximalDepthMm: number;
  /** The edge cut, when the plan has one. */
  scallop?: PlacedScallop | null;
  selectedVessel?: string | null;
  onSelect?: (vesselName: string | null) => void;
}

interface HitTarget {
  vesselName: string;
  x: number;
  y: number;
  radiusPx: number;
}

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 6;

interface Projected {
  sx: number;
  sy: number;
  /** Larger is further from the viewer. */
  depth: number;
}

/**
 * The scanned endograft in three dimensions, with the planned openings on it.
 *
 * Every element is measured: ring apices and their phase drift, the fabric
 * extent, the bare fixation ring and its barbs all come from the bench CT of
 * the selected device. The cylinder is drawn from the scan's own diameter
 * profile, so a tapered device tapers because it was measured to.
 */
export function GraftModel3D({
  graft,
  openings,
  proximalDepthMm,
  scallop = null,
  selectedVessel = null,
  onSelect,
}: GraftModel3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [azimuth, setAzimuth] = useState(0.5);
  const [elevation, setElevation] = useState(DEFAULT_ELEVATION);
  const [zoom, setZoom] = useState(1);
  const hitTargets = useRef<HitTarget[]>([]);
  const drag = useRef<{
    x: number;
    y: number;
    azimuth: number;
    elevation: number;
    moved: boolean;
  } | null>(null);

  // Turn the graft to face a newly selected hole. Half the openings are on the
  // far side at any one time, and a selection that leaves the model looking
  // unchanged reads as the click having failed. Adjusted during render rather
  // than in an effect, so the first paint after a selection already faces it.
  const [facedVessel, setFacedVessel] = useState<string | null>(null);
  if (selectedVessel !== facedVessel) {
    setFacedVessel(selectedVessel);
    const opening = openings.find(
      (candidate) => candidate.vessel.name === selectedVessel,
    );
    if (opening) {
      const theta = (opening.arcMm / graft.circumferenceMm) * Math.PI * 2;
      const target = theta - Math.PI;
      // The nearest equivalent angle, so the graft takes the short way round.
      const turns = Math.round((azimuth - target) / (Math.PI * 2));
      setAzimuth(target + turns * Math.PI * 2);
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const { renderModel, circumferenceMm, fabricLengthMm } = graft;

    const draw = () => {
      const cssWidth = wrapper.clientWidth;
      const cssHeight = Math.max(380, Math.min(680, cssWidth * 0.95));
      if (cssWidth <= 0) return;

      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(cssWidth * ratio);
      canvas.height = Math.round(cssHeight * ratio);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const topMm = Math.min(0, renderModel.minimumZMm);
      // Crop to the part being planned. A thoracic device is four times longer
      // than it is wide, so framing all 167 mm of it leaves a sliver too narrow
      // to read; nothing below the last opening informs the modification.
      const deepestOpeningMm = openings.reduce(
        (deepest, opening) => Math.max(deepest, opening.depthMm),
        proximalDepthMm,
      );
      const bottomMm = Math.min(
        fabricLengthMm,
        deepestOpeningMm + WORKING_ZONE_TAIL_MM,
      );
      const spanMm = bottomMm - topMm;
      const maxRadiusMm = graft.proximalDiameterMm / 2;

      const scale =
        0.9 *
        zoom *
        Math.min(
          cssWidth / (maxRadiusMm * 2.4),
          cssHeight / (spanMm * Math.cos(elevation) + maxRadiusMm * 1.6),
        );
      const originX = cssWidth / 2;
      const originY =
        cssHeight / 2 - ((topMm + bottomMm) / 2) * Math.cos(elevation) * scale;

      const cosAz = Math.cos(azimuth);
      const sinAz = Math.sin(azimuth);
      const cosEl = Math.cos(elevation);
      const sinEl = Math.sin(elevation);

      const project = (
        thetaRad: number,
        zMm: number,
        radiusMm: number,
      ): Projected => {
        const px = radiusMm * Math.sin(thetaRad);
        const py = radiusMm * Math.cos(thetaRad);
        const rx = px * cosAz - py * sinAz;
        const ry = px * sinAz + py * cosAz;
        return {
          sx: originX + rx * scale,
          sy: originY + (ry * sinEl + zMm * cosEl) * scale,
          depth: ry * cosEl - zMm * sinEl,
        };
      };

      /** Outward normal faces the viewer on the near half of the cylinder. */
      const facesViewer = (thetaRad: number) =>
        Math.sin(thetaRad) * sinAz + Math.cos(thetaRad) * cosAz < 0;

      const radiusAt = (zMm: number) => renderModel.diameterAt(zMm) / 2;

      /**
       * Where the fabric starts at a given angle, in mm below the nominal edge.
       *
       * Zero everywhere except across a scallop, where the edge has been cut
       * away — so every band that starts at the fabric edge starts here instead
       * and the cut appears once rather than having to be drawn over the top.
       */
      const edgeDepthMm = (thetaRad: number) => {
        if (!scallop) return 0;
        const arcMm = (thetaRad / (Math.PI * 2)) * circumferenceMm;
        let offsetMm =
          (((arcMm - scallop.arcMm) % circumferenceMm) + circumferenceMm) %
          circumferenceMm;
        if (offsetMm > circumferenceMm / 2) offsetMm -= circumferenceMm;
        return scallopEdgeDepthMm(scallop, offsetMm);
      };

      /** One band of fabric, from the cut edge down to a given depth. */
      const drawBand = (
        nearSide: boolean,
        bottomOf: (thetaRad: number) => number,
        fill: string,
      ) => {
        for (let facet = 0; facet < SURFACE_FACETS; facet += 1) {
          const t0 = (facet / SURFACE_FACETS) * Math.PI * 2;
          const t1 = ((facet + 1) / SURFACE_FACETS) * Math.PI * 2;
          if (facesViewer((t0 + t1) / 2) !== nearSide) continue;

          const top0 = edgeDepthMm(t0);
          const top1 = edgeDepthMm(t1);
          const base0 = bottomOf(t0);
          const base1 = bottomOf(t1);
          if (top0 >= base0 && top1 >= base1) continue;

          const a = project(t0, top0, radiusAt(top0));
          const b = project(t1, top1, radiusAt(top1));
          const c = project(t1, base1, radiusAt(base1));
          const d = project(t0, base0, radiusAt(base0));

          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
          ctx.lineTo(c.sx, c.sy);
          ctx.lineTo(d.sx, d.sy);
          ctx.closePath();
          ctx.fillStyle = fill;
          ctx.fill();
        }
      };

      // Fabric surface, as a quad strip so a tapered device tapers correctly.
      // Only near-side facets are filled, otherwise the translucency doubles up.
      const drawSurface = (nearSide: boolean) =>
        drawBand(
          nearSide,
          () => bottomMm,
          nearSide ? "rgba(232,224,210,0.55)" : "rgba(232,224,210,0.30)",
        );

      // Seal band, on the near side only, so it reads as a band on the surface.
      // Under a scallop it starts at the cut, since nothing above the cut is
      // there to appose — the cut itself seals nothing.
      const drawSealBand = () => {
        if (proximalDepthMm <= 0) return;
        drawBand(true, () => proximalDepthMm, "rgba(15,118,110,0.16)");
      };

      /**
       * The same measured wire the flat view and the clearance field use, so
       * all three agree about where metal is. Each stroke is one angular bin's
       * interval of segmented metal; nothing is interpolated between them.
       */
      const drawWire = (nearSide: boolean) => {
        ctx.lineCap = "round";
        ctx.lineWidth = Math.max(0.8, graft.wireRadiusMm * 1.6 * scale);

        // Metal proximal to the fabric edge is the bare fixation ring.
        for (const fixation of [false, true]) {
          ctx.strokeStyle = fixation
            ? nearSide
              ? "rgba(180,83,9,0.95)"
              : "rgba(180,83,9,0.25)"
            : nearSide
              ? "rgba(16,33,31,0.75)"
              : "rgba(16,33,31,0.18)";
          ctx.beginPath();
          for (const [arcMm, fromZ, , toZ] of graft.segments) {
            if (fromZ > bottomMm) continue;
            if (fromZ < 0 !== fixation) continue;
            const theta = (arcMm / circumferenceMm) * Math.PI * 2;
            if (facesViewer(theta) !== nearSide) continue;
            const a = project(theta, fromZ, radiusAt(fromZ));
            const b = project(theta, toZ, radiusAt(toZ));
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
          }
          ctx.stroke();
        }
      };

      /**
       * Clock positions read off the graft itself.
       *
       * Hour lines run down the near surface and the label sits on the fabric
       * edge ring, so an opening's clock can be checked against the model
       * rather than only against the cut list.
       */
      const drawClock = () => {
        for (let hour = 0; hour < 12; hour += 1) {
          const theta = (hour / 12) * Math.PI * 2;
          if (!facesViewer(theta)) continue;
          const anterior = hour === 0;

          ctx.strokeStyle = anterior
            ? "rgba(15,118,110,0.55)"
            : "rgba(16,33,31,0.16)";
          ctx.lineWidth = anterior ? 1.2 : 0.8;
          ctx.setLineDash(anterior ? [] : [3, 3]);
          ctx.beginPath();
          const fromMm = edgeDepthMm(theta);
          for (let step = 0; step <= 12; step += 1) {
            const zMm = fromMm + (step / 12) * (bottomMm - fromMm);
            const point = project(theta, zMm, radiusAt(zMm));
            if (step === 0) ctx.moveTo(point.sx, point.sy);
            else ctx.lineTo(point.sx, point.sy);
          }
          ctx.stroke();
          ctx.setLineDash([]);

          const label = project(theta, 0, radiusAt(0));
          ctx.fillStyle = anterior ? "#0f766e" : "rgba(77,101,97,0.85)";
          ctx.font = `${anterior ? 700 : 500} 10px "IBM Plex Mono", ui-monospace, monospace`;
          ctx.textAlign = "center";
          ctx.fillText(`${hour === 0 ? 12 : hour}`, label.sx, label.sy - 6);
        }
      };

      const drawFabricEdges = () => {
        // The proximal edge is a real boundary and dips into any scallop, since
        // after the cut that is where the fabric edge is. The distal one is
        // only where the view was cropped, so it is dashed to say so.
        for (const zMm of [0, bottomMm]) {
          const cropped = zMm === bottomMm && bottomMm < fabricLengthMm;
          ctx.strokeStyle = cropped ? "rgba(15,118,110,0.4)" : "#0f766e";
          ctx.setLineDash(cropped ? [4, 4] : []);
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          for (let facet = 0; facet <= SURFACE_FACETS; facet += 1) {
            const theta = (facet / SURFACE_FACETS) * Math.PI * 2;
            const atMm = cropped ? zMm : zMm + edgeDepthMm(theta);
            const point = project(theta, atMm, radiusAt(atMm));
            if (facet === 0) ctx.moveTo(point.sx, point.sy);
            else ctx.lineTo(point.sx, point.sy);
          }
          ctx.closePath();
          ctx.stroke();
        }
        ctx.setLineDash([]);

        const edge = project(Math.PI, 0, radiusAt(0));
        ctx.fillStyle = "#0f766e";
        ctx.font = "600 10px \"IBM Plex Mono\", ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("FABRIC EDGE", edge.sx, edge.sy - 10);

        // Name the cut where it faces the viewer, so turning the graft to the
        // scallop tells you it is one rather than a gap in the render.
        if (scallop) {
          const theta = (scallop.arcMm / circumferenceMm) * Math.PI * 2;
          if (facesViewer(theta)) {
            const point = project(theta, scallop.heightMm / 2, radiusAt(0));
            ctx.fillStyle = "#0f766e";
            ctx.font = "600 10px \"IBM Plex Mono\", ui-monospace, monospace";
            ctx.textAlign = "center";
            ctx.fillText(
              `${scallop.vessel.name} SCALLOP ${scallop.heightMm.toFixed(1)} mm`,
              point.sx,
              point.sy,
            );
          }
        }
      };

      const drawOpenings = () => {
        hitTargets.current = [];
        for (const opening of openings) {
          const theta0 = (opening.arcMm / circumferenceMm) * Math.PI * 2;
          if (!facesViewer(theta0)) continue;
          const selected = opening.vessel.name === selectedVessel;

          const radiusMm = radiusAt(opening.depthMm);
          ctx.beginPath();
          for (let sample = 0; sample <= HOLE_SAMPLES; sample += 1) {
            const phi = (sample / HOLE_SAMPLES) * Math.PI * 2;
            const theta = theta0 + (opening.semiArcMm * Math.cos(phi)) / radiusMm;
            const zMm = opening.depthMm + opening.semiDepthMm * Math.sin(phi);
            const point = project(theta, zMm, radiusAt(zMm));
            if (sample === 0) ctx.moveTo(point.sx, point.sy);
            else ctx.lineTo(point.sx, point.sy);
          }
          ctx.closePath();
          ctx.fillStyle = selected
            ? "rgba(217,119,6,0.6)"
            : "rgba(217,119,6,0.35)";
          ctx.fill();
          ctx.strokeStyle = "#b45309";
          ctx.lineWidth = selected ? 3 : 1.6;
          ctx.stroke();

          const label = project(theta0, opening.depthMm, radiusMm);
          hitTargets.current.push({
            vesselName: opening.vessel.name,
            x: label.sx,
            y: label.sy,
            radiusPx: Math.max(12, opening.radiusMm * scale),
          });
          ctx.fillStyle = "#7c2d12";
          ctx.font = "600 11px \"IBM Plex Mono\", ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.fillText(
            `${opening.vessel.name} ${arcMmToClockText(
              opening.arcMm,
              circumferenceMm,
            )}`,
            label.sx,
            label.sy - 4,
          );
        }
      };

      /**
       * The selected hole's measurements, laid on the cylinder surface.
       *
       * Each run is sampled along the surface rather than drawn as a straight
       * screen line, so a span that wraps round the graft curves with it and
       * still reads as the distance a tape would follow.
       */
      const drawMeasurements = () => {
        const selected = openings.find(
          (opening) => opening.vessel.name === selectedVessel,
        );
        if (!selected) return;

        const measurement = measureHole(graft, selected, 0);
        const centreTheta = (measurement.arcMm / circumferenceMm) * Math.PI * 2;
        const rimMm = selected.radiusMm + graft.wireRadiusMm;

        const surfaceRun = (
          fromTheta: number,
          fromZ: number,
          toTheta: number,
          toZ: number,
          label: string,
          colour: string,
        ) => {
          const steps = 24;
          const points: Projected[] = [];
          for (let step = 0; step <= steps; step += 1) {
            const t = step / steps;
            const theta = fromTheta + (toTheta - fromTheta) * t;
            const zMm = fromZ + (toZ - fromZ) * t;
            points.push(project(theta, zMm, radiusAt(zMm)));
          }
          // Hidden once it passes behind the graft.
          const visible = points.filter((_, index) => {
            const t = index / steps;
            return facesViewer(fromTheta + (toTheta - fromTheta) * t);
          });
          if (visible.length < 2) return;

          ctx.strokeStyle = colour;
          ctx.lineWidth = 1.4;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          visible.forEach((point, index) => {
            if (index === 0) ctx.moveTo(point.sx, point.sy);
            else ctx.lineTo(point.sx, point.sy);
          });
          ctx.stroke();
          ctx.setLineDash([]);

          const mid = visible[Math.floor(visible.length / 2)];
          ctx.font = "600 10px \"IBM Plex Mono\", ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const width = ctx.measureText(label).width + 6;
          ctx.fillStyle = "rgba(255,255,255,0.92)";
          ctx.fillRect(mid.sx - width / 2, mid.sy - 7, width, 14);
          ctx.fillStyle = colour;
          ctx.fillText(label, mid.sx, mid.sy);
          ctx.textBaseline = "alphabetic";
        };

        const teal = "#0f766e";
        if (measurement.gaps.above) {
          const gap = measurement.gaps.above;
          surfaceRun(
            centreTheta,
            measurement.depthMm - rimMm,
            centreTheta,
            gap.atDepthMm,
            gap.distanceMm.toFixed(1),
            teal,
          );
        }
        if (measurement.gaps.below) {
          const gap = measurement.gaps.below;
          surfaceRun(
            centreTheta,
            measurement.depthMm + rimMm,
            centreTheta,
            gap.atDepthMm,
            gap.distanceMm.toFixed(1),
            teal,
          );
        }
        for (const gap of [measurement.gaps.left, measurement.gaps.right]) {
          if (!gap) continue;
          const offsetMm = gap.atArcMm - measurement.arcMm;
          const wrapped =
            offsetMm > circumferenceMm / 2
              ? offsetMm - circumferenceMm
              : offsetMm < -circumferenceMm / 2
                ? offsetMm + circumferenceMm
                : offsetMm;
          const sign = Math.sign(wrapped) || 1;
          surfaceRun(
            centreTheta + ((sign * rimMm) / circumferenceMm) * Math.PI * 2,
            measurement.depthMm,
            centreTheta + (wrapped / circumferenceMm) * Math.PI * 2,
            measurement.depthMm,
            gap.distanceMm.toFixed(1),
            teal,
          );
        }

        for (const landmark of [measurement.apexAbove, measurement.valleyBelow]) {
          if (!landmark) continue;
          surfaceRun(
            centreTheta,
            measurement.depthMm,
            centreTheta + (landmark.arcOffsetMm / circumferenceMm) * Math.PI * 2,
            landmark.depthMm,
            `${landmark.kind} ${landmark.distanceMm.toFixed(1)}`,
            "#b45309",
          );
        }
      };

      // Far side first, then the surface, then the near side over it.
      drawWire(false);
      drawSurface(false);
      drawSurface(true);
      drawSealBand();
      drawClock();
      drawFabricEdges();
      drawWire(true);
      drawOpenings();
      drawMeasurements();
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [
    graft,
    openings,
    proximalDepthMm,
    scallop,
    azimuth,
    elevation,
    zoom,
    selectedVessel,
  ]);

  const spin = (deltaRad: number) => setAzimuth((current) => current + deltaRad);
  const clampZoom = (value: number) =>
    Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  return (
    <div ref={wrapperRef} className="w-full select-none">
      <canvas
        ref={canvasRef}
        className={cn(
          "block w-full touch-none",
          onSelect ? "cursor-crosshair" : "cursor-ew-resize",
        )}
        onPointerDown={(event) => {
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            azimuth,
            elevation,
            moved: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.hypot(dx, dy) > 3) start.moved = true;
          setAzimuth(start.azimuth + dx * 0.01);
          // Held short of vertical, where the cylinder degenerates to a disc.
          setElevation(
            Math.max(-1.2, Math.min(1.2, start.elevation + dy * 0.006)),
          );
        }}
        onPointerUp={(event) => {
          const start = drag.current;
          drag.current = null;
          // A drag rotates; only a click selects.
          if (!onSelect || !start || start.moved) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const clickX = event.clientX - bounds.left;
          const clickY = event.clientY - bounds.top;
          const hit = hitTargets.current.find(
            (target) =>
              Math.hypot(target.x - clickX, target.y - clickY) <= target.radiusPx,
          );
          onSelect(hit ? hit.vesselName : null);
        }}
        onWheel={(event) => {
          setZoom((current) =>
            clampZoom(current * (event.deltaY < 0 ? 1.12 : 1 / 1.12)),
          );
        }}
      />

      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px]">
        <div className="flex items-center gap-1">
          <ControlButton label="Rotate left" onClick={() => spin(-Math.PI / 8)}>
            <RotateCcw className="size-3.5" />
          </ControlButton>
          <span className="w-16 text-center font-mono text-[color:var(--muted-foreground)]">
            {(((azimuth * 180) / Math.PI) % 360).toFixed(0)}°
          </span>
          <ControlButton label="Rotate right" onClick={() => spin(Math.PI / 8)}>
            <RotateCw className="size-3.5" />
          </ControlButton>
        </div>

        <label className="flex items-center gap-2 text-[color:var(--muted-foreground)]">
          Tilt
          <input
            type="range"
            min={-1.2}
            max={1.2}
            step={0.02}
            value={elevation}
            aria-label="Viewing tilt"
            className="w-24 accent-[color:var(--brand)]"
            onChange={(event) => setElevation(Number(event.target.value))}
          />
        </label>

        <div className="flex items-center gap-1">
          <ControlButton
            label="Zoom out"
            onClick={() => setZoom((z) => clampZoom(z / 1.25))}
          >
            <Minus className="size-3.5" />
          </ControlButton>
          <span className="w-12 text-center font-mono text-[color:var(--muted-foreground)]">
            {zoom.toFixed(1)}×
          </span>
          <ControlButton
            label="Zoom in"
            onClick={() => setZoom((z) => clampZoom(z * 1.25))}
          >
            <Plus className="size-3.5" />
          </ControlButton>
        </div>

        <ControlButton
          label="Reset view"
          onClick={() => {
            setAzimuth(0.5);
            setElevation(DEFAULT_ELEVATION);
            setZoom(1);
          }}
        >
          <Maximize2 className="size-3.5" />
        </ControlButton>
      </div>

      <p className="mt-1 text-center text-[11px] text-[color:var(--muted-foreground)]">
        Drag to rotate and tilt, scroll to zoom, click a hole for its
        measurements. Cropped below the last opening; the dashed ring is the
        crop, not the end of the graft.
      </p>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-full border border-[color:var(--border)] bg-white/70 text-[color:var(--foreground)] transition-colors hover:bg-white"
    >
      {children}
    </button>
  );
}
