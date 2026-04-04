import type { Fenestration, StrutSegment } from "@/lib/types";
import {
  arcMmToClockText,
  clockTextToArcMm,
} from "@/lib/planning/clock";
import { wrapMm as wrapPlanarMm } from "@/lib/planning/geometry";

export function wrapMm(value: number, circ: number) {
  return wrapPlanarMm(value, circ);
}

function pointToSegmentDistLinear(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq),
  );

  const nearX = ax + t * dx;
  const nearY = ay + t * dy;
  return Math.hypot(px - nearX, py - nearY);
}

export function pointToSegmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  circ: number,
): number {
  return Math.min(
    pointToSegmentDistLinear(px, py, ax - circ, ay, bx - circ, by),
    pointToSegmentDistLinear(px, py, ax, ay, bx, by),
    pointToSegmentDistLinear(px, py, ax + circ, ay, bx + circ, by),
  );
}

export function minDistToStruts(
  cx: number,
  cy: number,
  segs: StrutSegment[],
  circ: number,
): number {
  return Math.min(
    ...segs.map(([ax, ay, bx, by]) =>
      pointToSegmentDist(cx, cy, ax, ay, bx, by, circ),
    ),
  );
}

export function clockToArc(clock: string, circ: number) {
  return clockTextToArcMm(clock, circ);
}

export function arcToClockString(arcMm: number, circ: number) {
  return arcMmToClockText(arcMm, circ, {
    separator: ":",
    padHour: false,
  });
}

export function getSafeThreshold(fenestration: Fenestration, wireRadius: number) {
  if (fenestration.ftype === "SCALLOP") {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(fenestration.widthMm, fenestration.heightMm) / 2 + wireRadius;
}

export function checkConflict(
  fen: Fenestration,
  segs: StrutSegment[],
  circ: number,
  wireRadius: number,
  deltaArcMm = 0,
) {
  if (fen.ftype === "SCALLOP") {
    return { conflict: false, minDist: Number.POSITIVE_INFINITY };
  }

  const cx = wrapMm(clockToArc(fen.clock, circ) + deltaArcMm, circ);
  const cy = fen.depthMm;
  const minDist = minDistToStruts(cx, cy, segs, circ);
  const safeThreshold = getSafeThreshold(fen, wireRadius);
  return { conflict: minDist < safeThreshold, minDist };
}
