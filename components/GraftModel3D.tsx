"use client";

import { useEffect, useRef, useState } from "react";

import { sampleBenchCtRing } from "@/lib/geometry/benchCtRenderModel";
import type { PlacedOpening } from "@/lib/planning/anatomy";
import type { GraftModel } from "@/lib/planning/plan";

const SURFACE_FACETS = 72;
const HOLE_SAMPLES = 36;
const DEFAULT_ELEVATION = 0.2;
/** Fabric shown below the deepest opening, in mm. */
const WORKING_ZONE_TAIL_MM = 22;

export interface GraftModel3DProps {
  graft: GraftModel;
  openings: PlacedOpening[];
  proximalDepthMm: number;
}

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
}: GraftModel3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [azimuth, setAzimuth] = useState(0.5);
  const drag = useRef<{ x: number; azimuth: number } | null>(null);

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
      const elevation = DEFAULT_ELEVATION;

      const scale =
        0.9 *
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

      // Fabric surface, as a quad strip so a tapered device tapers correctly.
      // Only near-side facets are filled, otherwise the translucency doubles up.
      const drawSurface = (nearSide: boolean) => {
        for (let facet = 0; facet < SURFACE_FACETS; facet += 1) {
          const t0 = (facet / SURFACE_FACETS) * Math.PI * 2;
          const t1 = ((facet + 1) / SURFACE_FACETS) * Math.PI * 2;
          if (facesViewer((t0 + t1) / 2) !== nearSide) continue;

          const a = project(t0, 0, radiusAt(0));
          const b = project(t1, 0, radiusAt(0));
          const c = project(t1, bottomMm, radiusAt(bottomMm));
          const d = project(t0, bottomMm, radiusAt(bottomMm));

          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
          ctx.lineTo(c.sx, c.sy);
          ctx.lineTo(d.sx, d.sy);
          ctx.closePath();
          ctx.fillStyle = nearSide
            ? "rgba(232,224,210,0.55)"
            : "rgba(232,224,210,0.30)";
          ctx.fill();
        }
      };

      // Seal band, on the near side only, so it reads as a band on the surface.
      const drawSealBand = () => {
        if (proximalDepthMm <= 0) return;
        for (let facet = 0; facet < SURFACE_FACETS; facet += 1) {
          const t0 = (facet / SURFACE_FACETS) * Math.PI * 2;
          const t1 = ((facet + 1) / SURFACE_FACETS) * Math.PI * 2;
          if (!facesViewer((t0 + t1) / 2)) continue;

          const a = project(t0, 0, radiusAt(0));
          const b = project(t1, 0, radiusAt(0));
          const c = project(t1, proximalDepthMm, radiusAt(proximalDepthMm));
          const d = project(t0, proximalDepthMm, radiusAt(proximalDepthMm));

          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
          ctx.lineTo(c.sx, c.sy);
          ctx.lineTo(d.sx, d.sy);
          ctx.closePath();
          ctx.fillStyle = "rgba(15,118,110,0.16)";
          ctx.fill();
        }
      };

      const drawRings = (nearSide: boolean) => {
        for (const ring of renderModel.rings) {
          const points = sampleBenchCtRing(ring.points);
          if (points.length < 2) continue;
          // Rings past the crop belong to fabric that is not shown.
          if (Math.min(...points.map((point) => point.zMm)) > bottomMm) continue;

          const bare = ring.kind === "bare_fixation";
          ctx.strokeStyle = bare
            ? nearSide
              ? "rgba(180,83,9,0.95)"
              : "rgba(180,83,9,0.28)"
            : nearSide
              ? "rgba(16,33,31,0.8)"
              : "rgba(16,33,31,0.20)";
          ctx.lineWidth = Math.max(1, graft.wireRadiusMm * 2 * scale);
          ctx.lineCap = "round";
          ctx.lineJoin = "round";

          // Close the ring by repeating the first point one turn on.
          const loop = [
            ...points,
            { ...points[0], thetaRad: points[0].thetaRad + Math.PI * 2 },
          ];

          ctx.beginPath();
          let penDown = false;
          for (let index = 0; index < loop.length - 1; index += 1) {
            const from = loop[index];
            const to = loop[index + 1];
            const midTheta = (from.thetaRad + to.thetaRad) / 2;
            if (facesViewer(midTheta) !== nearSide) {
              penDown = false;
              continue;
            }
            const a = project(from.thetaRad, from.zMm, from.radiusMm);
            const b = project(to.thetaRad, to.zMm, to.radiusMm);
            if (!penDown) {
              ctx.moveTo(a.sx, a.sy);
              penDown = true;
            }
            ctx.lineTo(b.sx, b.sy);
          }
          ctx.stroke();
        }
      };

      const drawBarbs = (nearSide: boolean) => {
        if (renderModel.barbs.length === 0) return;
        ctx.strokeStyle = nearSide
          ? "rgba(180,83,9,0.95)"
          : "rgba(180,83,9,0.25)";
        ctx.lineWidth = Math.max(1, graft.wireRadiusMm * 1.6 * scale);
        ctx.beginPath();
        for (const barb of renderModel.barbs) {
          if (facesViewer(barb.base.thetaRad) !== nearSide) continue;
          const base = project(barb.base.thetaRad, barb.base.zMm, barb.base.radiusMm);
          const tip = project(barb.tip.thetaRad, barb.tip.zMm, barb.tip.radiusMm);
          const hook = project(barb.hook.thetaRad, barb.hook.zMm, barb.hook.radiusMm);
          ctx.moveTo(base.sx, base.sy);
          ctx.lineTo(tip.sx, tip.sy);
          ctx.lineTo(hook.sx, hook.sy);
        }
        ctx.stroke();
      };

      const drawFabricEdges = () => {
        // The proximal edge is a real boundary; the distal one is only where
        // the view was cropped, so it is dashed to say so.
        for (const zMm of [0, bottomMm]) {
          const cropped = zMm === bottomMm && bottomMm < fabricLengthMm;
          ctx.strokeStyle = cropped ? "rgba(15,118,110,0.4)" : "#0f766e";
          ctx.setLineDash(cropped ? [4, 4] : []);
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          for (let facet = 0; facet <= SURFACE_FACETS; facet += 1) {
            const theta = (facet / SURFACE_FACETS) * Math.PI * 2;
            const point = project(theta, zMm, radiusAt(zMm));
            if (facet === 0) ctx.moveTo(point.sx, point.sy);
            else ctx.lineTo(point.sx, point.sy);
          }
          ctx.closePath();
          ctx.stroke();
        }
        ctx.setLineDash([]);

        const edge = project(Math.PI, 0, radiusAt(0));
        ctx.fillStyle = "#0f766e";
        ctx.font = "600 10px var(--font-ibm-plex-mono), monospace";
        ctx.textAlign = "center";
        ctx.fillText("FABRIC EDGE", edge.sx, edge.sy - 10);
      };

      const drawOpenings = () => {
        for (const opening of openings) {
          const theta0 = (opening.arcMm / circumferenceMm) * Math.PI * 2;
          if (!facesViewer(theta0)) continue;

          const radiusMm = radiusAt(opening.depthMm);
          ctx.beginPath();
          for (let sample = 0; sample <= HOLE_SAMPLES; sample += 1) {
            const phi = (sample / HOLE_SAMPLES) * Math.PI * 2;
            const theta = theta0 + (opening.radiusMm * Math.cos(phi)) / radiusMm;
            const zMm = opening.depthMm + opening.radiusMm * Math.sin(phi);
            const point = project(theta, zMm, radiusAt(zMm));
            if (sample === 0) ctx.moveTo(point.sx, point.sy);
            else ctx.lineTo(point.sx, point.sy);
          }
          ctx.closePath();
          ctx.fillStyle = "rgba(217,119,6,0.35)";
          ctx.fill();
          ctx.strokeStyle = "#b45309";
          ctx.lineWidth = 1.6;
          ctx.stroke();

          const label = project(theta0, opening.depthMm, radiusMm);
          ctx.fillStyle = "#7c2d12";
          ctx.font = "600 11px var(--font-ibm-plex-mono), monospace";
          ctx.textAlign = "center";
          ctx.fillText(opening.vessel.name, label.sx, label.sy - 4);
        }
      };

      // Far side first, then the surface, then the near side over it.
      drawRings(false);
      drawBarbs(false);
      drawSurface(false);
      drawSurface(true);
      drawSealBand();
      drawFabricEdges();
      drawRings(true);
      drawBarbs(true);
      drawOpenings();
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [graft, openings, proximalDepthMm, azimuth]);

  return (
    <div ref={wrapperRef} className="w-full select-none">
      <canvas
        ref={canvasRef}
        className="block w-full cursor-ew-resize touch-none"
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, azimuth };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start) return;
          setAzimuth(start.azimuth + (event.clientX - start.x) * 0.01);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      />
      <p className="mt-1 text-center text-[11px] text-[color:var(--muted-foreground)]">
        Drag to rotate. Cropped below the last opening; the dashed ring is the
        crop, not the end of the graft.
      </p>
    </div>
  );
}
