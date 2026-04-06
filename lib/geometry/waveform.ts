/**
 * Parametric waveform builders for endograft strut patterns.
 *
 * Pure functions — no device coupling, no rendering, no state.
 * Each builder returns StrutSegment[] for one ring zone, given the
 * ring's top y-coordinate and a WaveformPreset descriptor.
 *
 * Three supported patterns:
 *   "zigzag"     — Z-stent (Zenith Alpha)
 *   "sinusoidal" — smooth sinusoidal frame (Valiant, TREO)
 *   "m-shaped"   — M-stent calligraphic wave (generic fallback)
 */

import type { StrutSegment } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type WaveformPattern = "zigzag" | "sinusoidal" | "m-shaped";

/**
 * Fully parametric description of one ring's waveform geometry.
 * All lengths in mm.
 */
export interface WaveformPreset {
  pattern: WaveformPattern;
  /** Circumferential period of one full wave in mm (peak-to-peak distance). */
  waveWidthMm: number;
  /** Projected vertical ring height in mm (peak-to-valley vertical extent). */
  ringHeightMm: number;
  /** Phase fraction [0, 1): shifts wave start along circumference. 0 = peaks at top. */
  phaseFraction?: number;
  /** Sinusoidal pattern only: sample points per full wave period. Default 16. */
  sinusoidSamples?: number;
  /** M-shaped pattern only: shoulder depth ratio [0, 1). Default 0.42. */
  mShoulderRatio?: number;
}

// ── Internal utilities ────────────────────────────────────────────────────────

function pushPoint(
  points: Array<[number, number]>,
  point: [number, number],
): void {
  const prev = points[points.length - 1];
  if (
    prev &&
    Math.abs(prev[0] - point[0]) < 1e-6 &&
    Math.abs(prev[1] - point[1]) < 1e-6
  ) {
    return;
  }
  points.push(point);
}

function pointsToSegments(points: Array<[number, number]>): StrutSegment[] {
  const segs: StrutSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segs.push([points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]]);
  }
  return segs;
}

// ── Pattern builders ──────────────────────────────────────────────────────────

function buildZigZag(
  circ: number,
  yTop: number,
  rH: number,
  nPeaks: number,
  phase: number,
): StrutSegment[] {
  const waveWidth = circ / nPeaks;
  const step = waveWidth / 2;
  const startX = -waveWidth + phase * waveWidth;
  const steps = Math.ceil((circ + waveWidth * 2) / step);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    pushPoint(pts, [startX + i * step, i % 2 === 0 ? yTop : yTop + rH]);
  }
  return pointsToSegments(pts);
}

function buildSinusoidal(
  circ: number,
  yTop: number,
  rH: number,
  nPeaks: number,
  phase: number,
  samples: number,
): StrutSegment[] {
  const waveWidth = circ / nPeaks;
  const amp = rH / 2;
  const yMid = yTop + amp;
  const phaseShift = phase * waveWidth;
  const totalSamples = Math.ceil((nPeaks + 4) * samples);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= totalSamples; i++) {
    const wavPos = -2 + i / samples;
    pushPoint(pts, [
      wavPos * waveWidth + phaseShift,
      yMid - amp * Math.cos(wavPos * 2 * Math.PI),
    ]);
  }
  return pointsToSegments(pts);
}

function buildMShaped(
  circ: number,
  yTop: number,
  rH: number,
  nPeaks: number,
  phase: number,
  shoulderRatio: number,
): StrutSegment[] {
  const waveWidth = circ / nPeaks;
  const phaseShift = phase * waveWidth;
  const shoulderY = yTop + rH * shoulderRatio;
  const yBottom = yTop + rH;
  const pts: Array<[number, number]> = [];
  for (let wi = -2; wi <= nPeaks + 1; wi++) {
    const bx = wi * waveWidth + phaseShift;
    pushPoint(pts, [bx, yTop]);
    pushPoint(pts, [bx + waveWidth * 0.25, yBottom]);
    pushPoint(pts, [bx + waveWidth * 0.5, shoulderY]);
    pushPoint(pts, [bx + waveWidth * 0.75, yBottom]);
    pushPoint(pts, [bx + waveWidth, yTop]);
  }
  return pointsToSegments(pts);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build strut segments for a single ring zone from a WaveformPreset.
 *
 * @param circ    Graft circumference in mm.
 * @param yTop    Y-coordinate of the ring top in mm (0 = proximal fabric edge).
 * @param preset  Waveform descriptor.
 * @param nPeaks  Number of wave peaks around the full circumference.
 * @returns       Array of line segments [ax, ay, bx, by] in mm coordinates.
 */
export function buildRingSegments(
  circ: number,
  yTop: number,
  preset: WaveformPreset,
  nPeaks: number,
): StrutSegment[] {
  const phase = preset.phaseFraction ?? 0;
  const rH = preset.ringHeightMm;
  switch (preset.pattern) {
    case "sinusoidal":
      return buildSinusoidal(circ, yTop, rH, nPeaks, phase, preset.sinusoidSamples ?? 16);
    case "m-shaped":
      return buildMShaped(circ, yTop, rH, nPeaks, phase, preset.mShoulderRatio ?? 0.42);
    case "zigzag":
    default:
      return buildZigZag(circ, yTop, rH, nPeaks, phase);
  }
}

// Re-export internal utilities for use in stentGeometry.ts device-specific builders
export { pushPoint, pointsToSegments };
