"use client";

import { useEffect, useRef } from "react";

import type { PlacedOpening } from "@/lib/planning/anatomy";
import { arcMmToClockText } from "@/lib/planning/clock";
import { measureHole } from "@/lib/planning/holeMeasurements";
import type { GraftModel } from "@/lib/planning/plan";
import { cn } from "@/lib/utils";

const PADDING = { top: 20, right: 18, bottom: 30, left: 46 };
/** Breathing room past the most proximal metal, in mm. */
const HEADROOM_MM = 4;

export interface UnrolledGraftCanvasProps {
  graft: GraftModel;
  openings: PlacedOpening[];
  /** Depth of the most proximal opening below the fabric edge, in mm. */
  proximalDepthMm: number;
  selectedVessel?: string | null;
  onSelect?: (vesselName: string | null) => void;
}

interface HitTarget {
  vesselName: string;
  x: number;
  y: number;
  radiusPx: number;
}

/**
 * The graft laid flat: measured wire, the bare fixation ring above the fabric,
 * the seal band, and the openings at the solved pose.
 *
 * This is what the modification is marked from, so it is drawn to one scale in
 * both axes and every feature on it is measured rather than schematic. The
 * region above the fabric edge is drawn rather than clipped, because on both
 * Zenith Alpha scans the fixation ring and its barbs sit proximal to the fabric
 * and the surgeon needs to see where the fabric actually starts.
 */
export function UnrolledGraftCanvas({
  graft,
  openings,
  proximalDepthMm,
  selectedVessel = null,
  onSelect,
}: UnrolledGraftCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hitTargets = useRef<HitTarget[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const { circumferenceMm, fabricLengthMm, segments, wireRadiusMm, renderModel } =
      graft;

    const draw = () => {
      const cssWidth = wrapper.clientWidth;
      const plotWidth = cssWidth - PADDING.left - PADDING.right;
      if (plotWidth <= 0) return;

      // Metal above the fabric edge sits at negative depth; make room for it.
      const topMm = Math.min(0, renderModel.minimumZMm) - HEADROOM_MM;
      const bottomMm = fabricLengthMm + HEADROOM_MM;

      // One scale for both axes: a hole that looks round on screen is round.
      const scale = plotWidth / circumferenceMm;
      const cssHeight = (bottomMm - topMm) * scale + PADDING.top + PADDING.bottom;

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
      const y = (depthMm: number) => PADDING.top + (depthMm - topMm) * scale;

      // Fabric — the only part that can be cut.
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(x(0), y(0), plotWidth, fabricLengthMm * scale);

      // Seal band: fabric above the first hole that has to appose the aorta.
      ctx.fillStyle = "rgba(15,118,110,0.10)";
      ctx.fillRect(x(0), y(0), plotWidth, proximalDepthMm * scale);

      // Wire. Segments can run past the seam because the closing wire is
      // emitted one circumference on; draw a wrapped copy so rings read as
      // continuous rather than stopping at the edge.
      ctx.strokeStyle = "rgba(16,33,31,0.5)";
      ctx.lineWidth = Math.max(1, wireRadiusMm * 2 * scale);
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const [x1, y1, x2, y2] of segments) {
        // Both neighbouring copies, so wire near either seam is never dropped.
        for (const shift of [0, -circumferenceMm, circumferenceMm]) {
          const a = x1 + shift;
          const b = x2 + shift;
          if (Math.max(a, b) < 0 || Math.min(a, b) > circumferenceMm) continue;
          ctx.moveTo(x(a), y(y1));
          ctx.lineTo(x(b), y(y2));
        }
      }
      ctx.stroke();

      // Barbs are deliberately not drawn. They were extruded from an annotated
      // 5.5 mm length, but the segmentation resolves no metal at all beyond the
      // fixation ring's own apices, so drawing them would put wire on the
      // template where the scan found none.

      // Fabric edges, drawn over the wire so they read as boundaries.
      ctx.strokeStyle = "#0f766e";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x(0), y(0));
      ctx.lineTo(x(circumferenceMm), y(0));
      ctx.moveTo(x(0), y(fabricLengthMm));
      ctx.lineTo(x(circumferenceMm), y(fabricLengthMm));
      ctx.stroke();

      ctx.fillStyle = "#0f766e";
      ctx.font = "600 10px \"IBM Plex Mono\", ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText("FABRIC EDGE", x(0) + 5, y(0) - 5);
      ctx.fillText("FABRIC END", x(0) + 5, y(fabricLengthMm) + 13);

      // Only when the device actually has one. A covered device still segments
      // a fraction of a millimetre past its fabric edge, and calling that a
      // fixation ring would invent a feature the TX2 does not have.
      const hasBareRing = renderModel.rings.some(
        (ring) => ring.kind === "bare_fixation",
      );
      if (hasBareRing) {
        ctx.fillStyle = "rgba(77,101,97,0.9)";
        ctx.font = "500 9px \"IBM Plex Mono\", ui-monospace, monospace";
        ctx.textAlign = "right";
        ctx.fillText(
          `bare fixation ring · ${Math.abs(renderModel.minimumZMm).toFixed(1)} mm above fabric`,
          x(circumferenceMm) - 4,
          y(topMm) + 12,
        );
      }

      // Seal depth marker.
      ctx.strokeStyle = "rgba(15,118,110,0.6)";
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x(0), y(proximalDepthMm));
      ctx.lineTo(x(circumferenceMm), y(proximalDepthMm));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(15,118,110,0.95)";
      ctx.font = "600 10px \"IBM Plex Mono\", ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText(
        `seal ${proximalDepthMm.toFixed(1)} mm`,
        x(0) + 5,
        y(proximalDepthMm) - 5,
      );

      // Openings.
      hitTargets.current = [];
      for (const opening of openings) {
        const selected = opening.vessel.name === selectedVessel;
        for (const shift of [0, -circumferenceMm, circumferenceMm]) {
          const centreArc = opening.arcMm + shift;
          if (
            centreArc + opening.radiusMm < 0 ||
            centreArc - opening.radiusMm > circumferenceMm
          ) {
            continue;
          }

          hitTargets.current.push({
            vesselName: opening.vessel.name,
            x: x(centreArc),
            y: y(opening.depthMm),
            radiusPx: Math.max(10, opening.radiusMm * scale),
          });

          ctx.beginPath();
          ctx.ellipse(
            x(centreArc),
            y(opening.depthMm),
            opening.semiArcMm * scale,
            opening.semiDepthMm * scale,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = selected
            ? "rgba(217,119,6,0.42)"
            : "rgba(217,119,6,0.22)";
          ctx.fill();
          ctx.strokeStyle = "#b45309";
          ctx.lineWidth = selected ? 3 : 1.5;
          ctx.stroke();

          const arm = Math.min(5, opening.radiusMm * scale * 0.7);
          ctx.beginPath();
          ctx.moveTo(x(centreArc) - arm, y(opening.depthMm));
          ctx.lineTo(x(centreArc) + arm, y(opening.depthMm));
          ctx.moveTo(x(centreArc), y(opening.depthMm) - arm);
          ctx.lineTo(x(centreArc), y(opening.depthMm) + arm);
          ctx.stroke();

          ctx.fillStyle = "#7c2d12";
          ctx.font = "600 10px \"IBM Plex Mono\", ui-monospace, monospace";
          ctx.textAlign = "left";
          const clock = arcMmToClockText(opening.arcMm, circumferenceMm);
          ctx.fillText(
            `${opening.vessel.name} ${clock}`,
            x(centreArc) + opening.semiArcMm * scale + 4,
            y(opening.depthMm) + 3,
          );
        }
      }

      // Measurements for the selected hole, drawn as the lines the numbers were
      // taken along so the panel and the template cannot disagree.
      const selected = openings.find(
        (opening) => opening.vessel.name === selectedVessel,
      );
      if (selected) {
        const measurement = measureHole(graft, selected, 0);
        const shift = measurement.arcMm > circumferenceMm / 2 ? -circumferenceMm : 0;

        const rule = (
          fromArc: number,
          fromDepth: number,
          toArc: number,
          toDepth: number,
          label: string,
        ) => {
          const ax = x(fromArc);
          const ay = y(fromDepth);
          const bx = x(toArc);
          const by = y(toDepth);

          ctx.strokeStyle = "#0f766e";
          ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.setLineDash([]);

          // End ticks, so the span being measured is unambiguous.
          const angle = Math.atan2(by - ay, bx - ax) + Math.PI / 2;
          for (const [px, py] of [
            [ax, ay],
            [bx, by],
          ]) {
            ctx.beginPath();
            ctx.moveTo(px - Math.cos(angle) * 4, py - Math.sin(angle) * 4);
            ctx.lineTo(px + Math.cos(angle) * 4, py + Math.sin(angle) * 4);
            ctx.stroke();
          }

          const midX = (ax + bx) / 2;
          const midY = (ay + by) / 2;
          ctx.font = "600 10px \"IBM Plex Mono\", ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const width = ctx.measureText(label).width + 6;
          ctx.fillStyle = "rgba(255,255,255,0.92)";
          ctx.fillRect(midX - width / 2, midY - 7, width, 14);
          ctx.fillStyle = "#0f766e";
          ctx.fillText(label, midX, midY);
          ctx.textBaseline = "alphabetic";
        };

        const centreArc = measurement.arcMm + shift;
        const rimMm = selected.radiusMm + graft.wireRadiusMm;

        if (measurement.gaps.above) {
          const gap = measurement.gaps.above;
          rule(
            centreArc,
            measurement.depthMm - rimMm,
            centreArc,
            gap.atDepthMm,
            `${gap.distanceMm.toFixed(1)}`,
          );
        }
        if (measurement.gaps.below) {
          const gap = measurement.gaps.below;
          rule(
            centreArc,
            measurement.depthMm + rimMm,
            centreArc,
            gap.atDepthMm,
            `${gap.distanceMm.toFixed(1)}`,
          );
        }
        for (const gap of [measurement.gaps.left, measurement.gaps.right]) {
          if (!gap) continue;
          const target = centreArc + (gap.atArcMm - measurement.arcMm);
          const sign = Math.sign(target - centreArc) || 1;
          rule(
            centreArc + sign * rimMm,
            measurement.depthMm,
            target,
            measurement.depthMm,
            `${gap.distanceMm.toFixed(1)}`,
          );
        }

        for (const landmark of [measurement.apexAbove, measurement.valleyBelow]) {
          if (!landmark) continue;
          const target = centreArc + landmark.arcOffsetMm;
          ctx.strokeStyle = "rgba(180,83,9,0.8)";
          ctx.lineWidth = 1.2;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(x(centreArc), y(measurement.depthMm));
          ctx.lineTo(x(target), y(landmark.depthMm));
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "#b45309";
          ctx.font = "600 9px \"IBM Plex Mono\", ui-monospace, monospace";
          ctx.textAlign = "left";
          ctx.fillText(
            `${landmark.kind} ${landmark.distanceMm.toFixed(1)}`,
            x(target) + 4,
            y(landmark.depthMm) - 3,
          );
        }
      }

      // Clock grid, every hour. The quarters are drawn heavier because they are
      // what a graft's markers are read against.
      ctx.font = "500 9px \"IBM Plex Mono\", ui-monospace, monospace";
      ctx.textAlign = "center";
      for (let hour = 0; hour < 12; hour += 1) {
        const arcMm = (hour / 12) * circumferenceMm;
        const quarter = hour % 3 === 0;
        ctx.strokeStyle = quarter
          ? "rgba(16,33,31,0.22)"
          : "rgba(16,33,31,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x(arcMm), y(topMm));
        ctx.lineTo(x(arcMm), y(bottomMm));
        ctx.stroke();

        ctx.fillStyle = quarter
          ? "rgba(77,101,97,0.95)"
          : "rgba(77,101,97,0.6)";
        ctx.font = `${quarter ? 600 : 500} 9px "IBM Plex Mono", ui-monospace, monospace`;
        ctx.fillText(`${hour === 0 ? 12 : hour}`, x(arcMm), y(bottomMm) + 14);
      }
      ctx.fillStyle = "rgba(77,101,97,0.85)";
      ctx.font = "500 9px \"IBM Plex Mono\", ui-monospace, monospace";

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
  }, [graft, openings, proximalDepthMm, selectedVessel]);

  return (
    <div ref={wrapperRef} className="w-full">
      <canvas
        ref={canvasRef}
        className={cn("block w-full", onSelect && "cursor-pointer")}
        onClick={(event) => {
          if (!onSelect) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const clickX = event.clientX - bounds.left;
          const clickY = event.clientY - bounds.top;
          const hit = hitTargets.current.find(
            (target) =>
              Math.hypot(target.x - clickX, target.y - clickY) <= target.radiusPx,
          );
          onSelect(hit ? hit.vesselName : null);
        }}
      />
    </div>
  );
}
