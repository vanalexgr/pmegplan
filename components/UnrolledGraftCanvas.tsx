"use client";

import { useEffect, useRef } from "react";

import type { PlacedOpening } from "@/lib/planning/anatomy";
import type { StrutSegment } from "@/lib/types";

const PADDING = { top: 26, right: 18, bottom: 30, left: 46 };
const CLOCK_TICKS = [0, 3, 6, 9];

export interface UnrolledGraftCanvasProps {
  segments: StrutSegment[];
  circumferenceMm: number;
  fabricLengthMm: number;
  openings: PlacedOpening[];
  wireRadiusMm: number;
  /** Depth of the most proximal opening below the fabric edge, in mm. */
  proximalDepthMm: number;
}

/**
 * The graft laid flat: measured wire, the seal band above the first hole, and
 * the openings at the solved pose. This is the view the modification is
 * actually marked from, so it is drawn to scale in both axes and nothing on it
 * is schematic.
 */
export function UnrolledGraftCanvas({
  segments,
  circumferenceMm,
  fabricLengthMm,
  openings,
  wireRadiusMm,
  proximalDepthMm,
}: UnrolledGraftCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const draw = () => {
      const cssWidth = wrapper.clientWidth;
      const plotWidth = cssWidth - PADDING.left - PADDING.right;
      if (plotWidth <= 0) return;

      // One scale for both axes: a hole that looks round on screen is round.
      const scale = plotWidth / circumferenceMm;
      const plotHeight = fabricLengthMm * scale;
      const cssHeight = plotHeight + PADDING.top + PADDING.bottom;

      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(cssWidth * ratio);
      canvas.height = Math.round(cssHeight * ratio);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const x = (arcMm: number) => PADDING.left + arcMm * scale;
      const y = (depthMm: number) => PADDING.top + depthMm * scale;

      // Fabric
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.fillRect(x(0), y(0), plotWidth, plotHeight);
      ctx.strokeStyle = "rgba(16,33,31,0.22)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x(0), y(0), plotWidth, plotHeight);

      // Seal band — fabric above the first hole that has to appose the aorta.
      ctx.fillStyle = "rgba(15,118,110,0.10)";
      ctx.fillRect(x(0), y(0), plotWidth, proximalDepthMm * scale);
      ctx.strokeStyle = "rgba(15,118,110,0.55)";
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x(0), y(proximalDepthMm));
      ctx.lineTo(x(circumferenceMm), y(proximalDepthMm));
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(15,118,110,0.9)";
      ctx.font = "500 10px var(--font-ibm-plex-mono), monospace";
      ctx.fillText(
        `seal ${proximalDepthMm.toFixed(1)} mm`,
        x(0) + 6,
        y(proximalDepthMm) - 5,
      );

      // Measured wire. Segments can run past the seam because the closing wire
      // is emitted one circumference on; draw a wrapped copy so it reads as a
      // continuous ring rather than stopping at the edge.
      ctx.strokeStyle = "rgba(16,33,31,0.5)";
      ctx.lineWidth = Math.max(1, wireRadiusMm * 2 * scale);
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const [x1, y1, x2, y2] of segments) {
        for (const shift of [0, -circumferenceMm]) {
          const a = x1 + shift;
          const b = x2 + shift;
          if (Math.max(a, b) < 0 || Math.min(a, b) > circumferenceMm) continue;
          ctx.moveTo(x(a), y(y1));
          ctx.lineTo(x(b), y(y2));
        }
      }
      ctx.stroke();

      // Openings
      for (const opening of openings) {
        for (const shift of [0, -circumferenceMm, circumferenceMm]) {
          const centreArc = opening.arcMm + shift;
          if (
            centreArc + opening.radiusMm < 0 ||
            centreArc - opening.radiusMm > circumferenceMm
          ) {
            continue;
          }

          ctx.beginPath();
          ctx.arc(
            x(centreArc),
            y(opening.depthMm),
            opening.radiusMm * scale,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = "rgba(217,119,6,0.20)";
          ctx.fill();
          ctx.strokeStyle = "#b45309";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Centre cross — the point that gets marked on the fabric.
          const arm = Math.min(5, opening.radiusMm * scale * 0.7);
          ctx.beginPath();
          ctx.moveTo(x(centreArc) - arm, y(opening.depthMm));
          ctx.lineTo(x(centreArc) + arm, y(opening.depthMm));
          ctx.moveTo(x(centreArc), y(opening.depthMm) - arm);
          ctx.lineTo(x(centreArc), y(opening.depthMm) + arm);
          ctx.stroke();

          ctx.fillStyle = "#7c2d12";
          ctx.font = "600 10px var(--font-ibm-plex-mono), monospace";
          ctx.fillText(
            opening.vessel.name,
            x(centreArc) + opening.radiusMm * scale + 4,
            y(opening.depthMm) + 3,
          );
        }
      }

      // Axes
      ctx.fillStyle = "rgba(77,101,97,0.85)";
      ctx.font = "500 9px var(--font-ibm-plex-mono), monospace";
      ctx.textAlign = "center";
      for (const hour of CLOCK_TICKS) {
        const arcMm = (hour / 12) * circumferenceMm;
        ctx.strokeStyle = "rgba(16,33,31,0.14)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x(arcMm), y(0));
        ctx.lineTo(x(arcMm), y(fabricLengthMm));
        ctx.stroke();
        ctx.fillText(
          `${hour === 0 ? 12 : hour}:00`,
          x(arcMm),
          y(fabricLengthMm) + 14,
        );
      }

      ctx.textAlign = "right";
      for (let depthMm = 0; depthMm <= fabricLengthMm; depthMm += 20) {
        ctx.fillText(`${depthMm}`, PADDING.left - 8, y(depthMm) + 3);
      }
      ctx.textAlign = "left";
      ctx.fillText("mm below proximal fabric edge", 4, 12);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [
    segments,
    circumferenceMm,
    fabricLengthMm,
    openings,
    wireRadiusMm,
    proximalDepthMm,
  ]);

  return (
    <div ref={wrapperRef} className="w-full">
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
}
