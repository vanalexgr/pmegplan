/**
 * PMEGplan.io — Graft Sketch Renderer  v2 (3-D cylinder projection)
 *
 * Drop-in replacement for lib/graftSketchRenderer.ts.
 * Export signature is IDENTICAL to v1 — no changes needed in any component.
 *
 * KEY CHANGE: replaces the flat Cook-CMD front-elevation with a true 3-D
 * cylinder rendered via rigid-body projection (azimuth + elevation angles),
 * based on the project3D22D principle from Zheng et al. ICRA 2019.
 *
 * Each Z-stent ring is built as 3-D surface points on the cylinder, then
 * projected to 2-D with hidden-line removal:
 *   - segments facing viewer  → solid, device colour
 *   - segments facing away    → dashed, faded
 *
 * Everything else (spec panel, ARCSEP, footer, imports) is unchanged from v1.
 */

import { clockToArc, wrapMm } from "@/lib/conflictDetection";
import { getEffectiveRingGeometry } from "@/lib/devices";
import { arcSepFromSeam, isStrutFreeDepth } from "@/lib/geometry";
import {
  evalMStentDepth,
  getEndurantProfile,
} from "@/lib/mstentProfile";
import {
  evalTreoDepth,
  TREO_PROFILE_Y_MAX,
} from "@/lib/treoProfile";
import { getRotationSummary } from "@/lib/analysis";
import type { CaseInput, DeviceAnalysisResult } from "@/lib/types";



export interface ScaleContext {
  isPrint: boolean;
  v_10_7: number;
  fontBack: number;
  v_4_3: number;
  fontBadge: number;
  fontSub: number;
  v_1_0: number;
  v_14_9: number;
  v_11_7: number;
  strokeCore: number;
  v_3_2: number;
  fontVessel: number;
  v_11_8: number;
  v_7_4: number;
  v_5_3_8: number;
  v_10_6_8: number;
  haloExpand: number;
  v_1_6_1_1: number;
  strokeGuide: number;
  v_5_3: number;
  v_1_2_0_9: number;
  v_13_9: number;
  v_1_8_1_4: number;
  v_2_6_2: number;
  v_7_5_6: number;
  margin: number;
  headerH: number;
  footerH: number;
  v_16_14: number;
  fontHeader: number;
  v_22_14: number;
  v_38_24: number;
  v_52_34: number;
  v_68_34: number;
  v_14_8: number;
  v_40_24: number;
  v_30_20: number;
  v_2_0_1_5: number;
  v_1_8_1_3: number;
  v_1_4_1_1: number;
  v_2_0_1_6: number;
  v_18_12: number;
  v_1_4_1_0: number;
  v_9_6_5: number;
  v_8_5: number;
  v_3_5_2_5: number;
  v_15_12: number;
  v_6_4: number;
}

export function buildScaleContext(mode: "preview" | "print"): ScaleContext {
  const isPrint = mode === "print";
  return {
    isPrint,
    v_10_7: isPrint ? 10 : 7,
    fontBack: isPrint ? 8.5 : 6.5,
    v_4_3: isPrint ? 4 : 3,
    fontBadge: isPrint ? 14 : 10,
    fontSub: isPrint ? 12 : 9,
    v_1_0: isPrint ? 1 : 0,
    v_14_9: isPrint ? 14 : 9,
    v_11_7: isPrint ? 11 : 7,
    strokeCore: isPrint ? 2.2 : 1.8,
    v_3_2: isPrint ? 3 : 2,
    fontVessel: isPrint ? 10 : 7.5,
    v_11_8: isPrint ? 11 : 8,
    v_7_4: isPrint ? 7 : 4,
    v_5_3_8: isPrint ? 5 : 3.8,
    v_10_6_8: isPrint ? 10 : 6.8,
    haloExpand: isPrint ? 4.5 : 3.6,
    v_1_6_1_1: isPrint ? 1.6 : 1.1,
    strokeGuide: isPrint ? 1.4 : 1.05,
    v_5_3: isPrint ? 5 : 3,
    v_1_2_0_9: isPrint ? 1.2 : 0.9,
    v_13_9: isPrint ? 13 : 9,
    v_1_8_1_4: isPrint ? 1.8 : 1.4,
    v_2_6_2: isPrint ? 2.6 : 2,
    v_7_5_6: isPrint ? 7.5 : 6,
    margin: isPrint ? 24 : 20,
    headerH: isPrint ? 54 : 44,
    footerH: isPrint ? 42 : 36,
    v_16_14: isPrint ? 16 : 14,
    fontHeader: isPrint ? 20 : 13,
    v_22_14: isPrint ? 22 : 14,
    v_38_24: isPrint ? 38 : 24,
    v_52_34: isPrint ? 52 : 34,
    v_68_34: isPrint ? 68 : 34,
    v_14_8: isPrint ? 14 : 8,
    v_40_24: isPrint ? 40 : 24,
    v_30_20: isPrint ? 30 : 20,
    v_2_0_1_5: isPrint ? 2.0 : 1.5,
    v_1_8_1_3: isPrint ? 1.8 : 1.3,
    v_1_4_1_1: isPrint ? 1.4 : 1.1,
    v_2_0_1_6: isPrint ? 2.0 : 1.6,
    v_18_12: isPrint ? 18 : 12,
    v_1_4_1_0: isPrint ? 1.4 : 1.0,
    v_9_6_5: isPrint ? 9 : 6.5,
    v_8_5: isPrint ? 8 : 5,
    v_3_5_2_5: isPrint ? 3.5 : 2.5,
    v_15_12: isPrint ? 15 : 12,
    v_6_4: isPrint ? 6 : 4,
  };
}

// ── Vessel colour map (unchanged) ─────────────────────────────────────────────
const VESSEL_COLORS: Record<string, string> = {
  SMA: "#b45309", LRA: "#1d4ed8", RRA: "#6d28d9",
  CELIAC: "#b91c1c", LMA: "#0f766e", CUSTOM: "#334155",
};

// ── Helpers preserved from v1 (used by spec panel) ───────────────────────────

function computeArcSep(
  adjustedClock: string, seamDeg: number, optimalDeltaMm: number, circ: number,
): number {
  return arcSepFromSeam(adjustedClock, seamDeg, optimalDeltaMm, circ);
}

function isInInterRingGap(
  depthMm: number,
  ringHeight: number,
  interRingGap: number,
  nRings: number,
  startOffset = 0,
): boolean {
  return isStrutFreeDepth(depthMm, {
    ringHeightMm: ringHeight,
    interRingGapMm: interRingGap,
    nRings,
    proximalOffsetMm: startOffset,
  });
}

function drawArrow(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  direction: "up" | "down", size: number,
): void {
  ctx.beginPath();
  if (direction === "up") {
    ctx.moveTo(x, y); ctx.lineTo(x - size / 2, y + size); ctx.lineTo(x + size / 2, y + size);
  } else {
    ctx.moveTo(x, y); ctx.lineTo(x - size / 2, y - size); ctx.lineTo(x + size / 2, y - size);
  }
  ctx.closePath(); ctx.fill();
}

function wrapText(
  ctx: CanvasRenderingContext2D, text: string, x: number, startY: number,
  maxWidth: number, lineHeight: number, maxLines = 6,
): number {
  const words = text.split(" ");
  let line = ""; let y = startY; let n = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y); y += lineHeight; n++; line = word;
      if (n >= maxLines - 1) break;
    } else { line = test; }
  }
  if (line) { ctx.fillText(line, x, y); y += lineHeight; }
  return y;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3-D PROJECTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════
//
// Coordinate system:
//   The graft long axis is Z (0 = proximal, positive = distal).
//   The cross-section lies in XY:  X = sin(theta), Y = cos(theta)
//     so theta = 0 → 12:00 (anterior), theta = pi/2 → 3:00 (patient left).
//
// Projection (simplified rigid body, Zheng et al. project3D22D principle):
//   az  = azimuth  — viewer rotates around Z-axis (radians)
//   el  = elevation — Z-axis tilts toward viewer (radians)
//
// Returns { sx, sy } = screen coordinates, d = signed depth
//   (positive d = point faces viewer, negative = behind cylinder).

interface Proj3D { sx: number; sy: number; d: number; }
interface SurfaceProj3D extends Proj3D { face: number; front: boolean; }
interface Pt3D   { x: number; y: number; z: number; }

function project3D(
  px: number, py: number, pz: number,
  az: number, el: number,
  originX: number, originY: number, scale: number,
): Proj3D {
  const ca = Math.cos(az), sa = Math.sin(az);
  const rx =  px * ca + py * sa;
  const ry = -px * sa + py * ca;
  return {
    sx: originX + rx * scale,
    sy: originY + (ry * Math.sin(el) + pz * Math.cos(el)) * scale,
    d:  ry * Math.cos(el) - pz * Math.sin(el),
  };
}

function projectSurfacePoint(
  arcMm: number,
  depthMm: number,
  circ: number,
  R: number,
  az: number,
  el: number,
  ox: number,
  oy: number,
  scale: number,
): SurfaceProj3D {
  const theta = (wrapMm(arcMm, circ) / circ) * 2 * Math.PI;
  const px = R * Math.sin(theta);
  const py = R * Math.cos(theta);
  const ca = Math.cos(az);
  const sa = Math.sin(az);
  const face = -px * sa + py * ca;
  const projected = project3D(px, py, depthMm, az, el, ox, oy, scale);

  return {
    ...projected,
    face,
    front: face >= 0,
  };
}

// ── Build Z-stent ring as 3-D surface points ──────────────────────────────────
// Zigzag wave: nPeaks peaks, each consisting of an ascending limb (z0 → z0+ringH)
// and a descending limb (z0+ringH → z0). Alternate rings are phase-shifted by half
// a wave width to produce the interlocking Z-stent pattern.
function buildRingPts(
  R: number, nPeaks: number, ringH: number, z0: number,
  ringIdx: number, delta: number, circ: number, N = 10,
  phaseFraction = (ringIdx % 2) * 0.5,
): Pt3D[] {
  const dt     = (2 * Math.PI) / nPeaks;
  const phase  = phaseFraction * dt;
  const dTheta = (delta / circ) * 2 * Math.PI;
  const pts: Pt3D[] = [];

  for (let i = 0; i < nPeaks; i++) {
    const t0 = dTheta + phase + i * dt;
    const tm = dTheta + phase + (i + 0.5) * dt;
    const t1 = dTheta + phase + (i + 1) * dt;

    // Ascending limb: peak → trough
    for (let s = 0; s <= N; s++) {
      const f = s / N;
      pts.push({ x: R * Math.sin(t0 + f * (tm - t0)), y: R * Math.cos(t0 + f * (tm - t0)), z: z0 + f * ringH });
    }
    // Descending limb: trough → next peak
    for (let s = 1; s <= N; s++) {
      const f = s / N;
      pts.push({ x: R * Math.sin(tm + f * (t1 - tm)), y: R * Math.cos(tm + f * (t1 - tm)), z: z0 + ringH * (1 - f) });
    }
  }
  pts.push({ ...pts[0] }); // close the ring
  return pts;
}

// ── Sinusoidal 3-D ring points ──────────────────────────────────────────────
function buildSinusoidalRingPts3D(
  R: number,
  nPeaks: number,
  ringH: number,
  z0: number,
  ringIdx: number,
  delta: number,
  circ: number,
  N = 14,
  phaseFraction = (ringIdx % 2) * 0.5,
): Pt3D[] {
  const total = nPeaks * N;
  const dTheta = (2 * Math.PI) / total;
  const phaseOffset = phaseFraction * ((2 * Math.PI) / nPeaks);
  const deltaTheta = (delta / circ) * 2 * Math.PI;
  const pts: Pt3D[] = [];

  for (let i = 0; i <= total; i += 1) {
    const theta = deltaTheta + phaseOffset + i * dTheta;
    const zz =
      z0 +
      (ringH / 2) *
        (1 -
          Math.cos(
            nPeaks * (i / total) * 2 * Math.PI + phaseOffset,
          ));
    pts.push({ x: R * Math.sin(theta), y: R * Math.cos(theta), z: zz });
  }

  return pts;
}

function buildMShapedRingPts3D(
  R: number,
  nPeaks: number,
  ringH: number,
  z0: number,
  delta: number,
  circ: number,
  phaseFraction = 0,
  shoulderRatio = 0.46,
  N = 24,
): Pt3D[] {
  const total = nPeaks * N;
  const deltaTheta = (delta / circ) * 2 * Math.PI;
  const phaseOffset = phaseFraction * ((2 * Math.PI) / nPeaks);
  const shoulderZ = ringH * shoulderRatio;
  const pts: Pt3D[] = [];

  for (let i = 0; i <= total; i += 1) {
    const progress = i / total;
    const theta = deltaTheta + phaseOffset + progress * 2 * Math.PI;
    const wavePosition = progress * nPeaks;
    const local = wavePosition - Math.floor(wavePosition);
    let ringZ = 0;

    if (local < 0.25) {
      ringZ = (local / 0.25) * ringH;
    } else if (local < 0.5) {
      ringZ = ringH + ((local - 0.25) / 0.25) * (shoulderZ - ringH);
    } else if (local < 0.75) {
      ringZ = shoulderZ + ((local - 0.5) / 0.25) * (ringH - shoulderZ);
    } else {
      ringZ = ringH + ((local - 0.75) / 0.25) * (0 - ringH);
    }

    pts.push({ x: R * Math.sin(theta), y: R * Math.cos(theta), z: z0 + ringZ });
  }

  return pts;
}

function buildEndurantRingPts3D(
  R: number,
  ringH: number,
  z0: number,
  ringIdx: number,
  delta: number,
  circ: number,
  samplesPerMm = 4,
): Pt3D[] {
  const profile = getEndurantProfile(ringIdx);
  const deltaTheta = (delta / circ) * 2 * Math.PI;
  const nSamples = Math.ceil(circ * samplesPerMm);
  const pts: Pt3D[] = [];

  for (let sampleIndex = 0; sampleIndex <= nSamples; sampleIndex += 1) {
    const arcMm = (sampleIndex / nSamples) * circ;
    const theta = deltaTheta + (arcMm / circ) * 2 * Math.PI;
    const rawDepth = evalMStentDepth(arcMm, profile, circ);
    const ringZ = (rawDepth / 10) * ringH;
    pts.push({ x: R * Math.sin(theta), y: R * Math.cos(theta), z: z0 + ringZ });
  }

  return pts;
}

function buildTreoRingPts3D(
  R: number,
  ringHeightMm: number,
  z0: number,
  delta: number,
  circMm: number,
  nPeaks: number,
  ringIdx: number,
  N = 120,
): Pt3D[] {
  const pts: Pt3D[] = [];

  for (let index = 0; index <= N; index += 1) {
    const arcMm = ((index / N) * circMm + delta + circMm) % circMm;
    const theta = (arcMm / circMm) * 2 * Math.PI;
    const refDepth = evalTreoDepth(arcMm, circMm, nPeaks, ringIdx);
    const zz = z0 + (refDepth / TREO_PROFILE_Y_MAX) * ringHeightMm;
    pts.push({
      x: R * Math.sin(theta),
      y: R * Math.cos(theta),
      z: zz,
    });
  }

  pts.push({ ...pts[0] });
  return pts;
}

function getRingPhaseFraction(deviceId: string, ringIdx: number): number {
  switch (deviceId) {
    case "treo":
      return 0;  // TREO: all rings in-phase (peaks align with peaks)
    case "valiant":
      return 0;  // Valiant: all rings in-phase (IFU shows valleys aligned)
    case "zenith_alpha":
    default:
      return 0;  // IFU: valleys follow valleys (all rings in-phase)
  }
}

function buildRingPtsForDevice(
  deviceId: string,
  stentType: string,
  R: number,
  nPeaks: number,
  ringH: number,
  z0: number,
  ringIdx: number,
  delta: number,
  circ: number,
): Pt3D[] {
  if (deviceId === "treo") {
    return buildTreoRingPts3D(
      R,
      ringH,
      z0,
      delta,
      circ,
      nPeaks,
      ringIdx,
    );
  }

  if (deviceId === "endurant_ii") {
    return buildEndurantRingPts3D(
      R,
      ringH,
      z0,
      ringIdx,
      delta,
      circ,
    );
  }

  const phaseFraction = getRingPhaseFraction(deviceId, ringIdx);

  if (stentType === "M-stent") {
    return buildMShapedRingPts3D(
      R,
      nPeaks,
      ringH,
      z0,
      delta,
      circ,
      phaseFraction,
      0.46,
    );
  }

  if (stentType === "sinusoidal" || stentType === "helical") {
    return buildSinusoidalRingPts3D(
      R,
      nPeaks,
      ringH,
      z0,
      ringIdx,
      delta,
      circ,
      14,
      phaseFraction,
    );
  }

  return buildRingPts(
    R,
    nPeaks,
    ringH,
    z0,
    ringIdx,
    delta,
    circ,
    10,
    phaseFraction,
  );
}

// ── Draw ring with front/back hidden-line removal ─────────────────────────────
function drawRing3D(
  ctx: CanvasRenderingContext2D, pts: Pt3D[],
  az: number, el: number, ox: number, oy: number, scale: number,
  color: string, lw: number,
): void {
  const prj = pts.map((p) => project3D(p.x, p.y, p.z, az, el, ox, oy, scale));
  const front = new Path2D(), back = new Path2D();

  for (let i = 0; i < prj.length - 1; i++) {
    const a = prj[i], b = prj[i + 1];
    if ((a.d + b.d) / 2 >= 0) {
      front.moveTo(a.sx, a.sy); front.lineTo(b.sx, b.sy);
    } else {
      back.moveTo(a.sx, a.sy);  back.lineTo(b.sx, b.sy);
    }
  }

  ctx.save();
  // Back face: dashed, very faint
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = color + "35"; ctx.lineWidth = lw * 0.55; ctx.stroke(back);
  ctx.setLineDash([]);
  // Front face: white halo then device colour
  ctx.strokeStyle = "rgba(255,255,255,0.82)"; ctx.lineWidth = lw + 1.9; ctx.stroke(front);
  ctx.strokeStyle = color;                     ctx.lineWidth = lw;       ctx.stroke(front);
  ctx.restore();
}

function drawSegment3D(
  ctx: CanvasRenderingContext2D,
  start: Pt3D,
  end: Pt3D,
  az: number,
  el: number,
  ox: number,
  oy: number,
  scale: number,
  color: string,
  lw: number,
  backDash: number[] = [3, 4],
): void {
  const a = project3D(start.x, start.y, start.z, az, el, ox, oy, scale);
  const b = project3D(end.x, end.y, end.z, az, el, ox, oy, scale);

  ctx.save();
  if ((a.d + b.d) / 2 >= 0) {
    ctx.strokeStyle = "rgba(255,255,255,0.82)";
    ctx.lineWidth = lw + 1.9;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  } else {
    ctx.setLineDash(backDash);
    ctx.strokeStyle = color + "35";
    ctx.lineWidth = lw * 0.55;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }
  ctx.restore();
}

// ── Cylinder body shading (subtle 3-D depth) ──────────────────────────────────
function drawCylinderBody(
  ctx: CanvasRenderingContext2D,
  ox: number, topY: number, botY: number, cylW: number, rimRY: number,
): void {
  const path = new Path2D();
  path.moveTo(ox - cylW, topY);
  path.lineTo(ox - cylW, botY);
  path.ellipse(ox, botY, cylW, rimRY, 0, Math.PI, 0, false);
  path.lineTo(ox + cylW, topY);
  path.ellipse(ox, topY, cylW, rimRY, 0, 0, Math.PI * 2, false);
  path.closePath();

  ctx.save(); ctx.clip(path);
  const g = ctx.createLinearGradient(ox - cylW, 0, ox + cylW, 0);
  g.addColorStop(0.00, "rgba(18,18,22,0.52)");
  g.addColorStop(0.10, "rgba(80,85,98,0.28)");
  g.addColorStop(0.32, "rgba(205,210,215,0.15)");
  g.addColorStop(0.50, "rgba(242,245,247,0.09)");
  g.addColorStop(0.68, "rgba(205,210,215,0.15)");
  g.addColorStop(0.90, "rgba(80,85,98,0.28)");
  g.addColorStop(1.00, "rgba(18,18,22,0.52)");
  ctx.fillStyle = g;
  ctx.fillRect(ox - cylW, topY, cylW * 2, botY - topY);
  ctx.restore();
}

// ── Ring zone tints clipped to cylinder width ─────────────────────────────────
function drawZoneTints(
  ctx: CanvasRenderingContext2D,
  ox: number, topY: number, cylW: number, scale: number,
  ringH: number, gapH: number, nRings: number, el: number, sc: ScaleContext,
  startOffset = 0,
): void {
  const cosEl = Math.cos(el);
  ctx.save();
  ctx.beginPath(); ctx.rect(ox - cylW, topY, cylW * 2, 9999); ctx.clip();

  let bZ = startOffset;
  for (let r = 0; r < nRings; r++) {
    // Ring band (danger - light red)
    const rTop = topY + bZ * cosEl * scale;
    const rH   = ringH * cosEl * scale;
    ctx.fillStyle = "rgba(220,38,38,0.08)";
    ctx.fillRect(ox - cylW, rTop, cylW * 2, rH);
    bZ += ringH;

    if (r < nRings - 1) {
      // Safe gap (light green)
      const gTop = topY + bZ * cosEl * scale;
      const gH   = gapH * cosEl * scale;
      ctx.fillStyle = "rgba(15,118,110,0.11)";
      ctx.fillRect(ox - cylW, gTop, cylW * 2, gH);
      if (gH > (sc.v_10_7)) {
        ctx.fillStyle = "rgba(15,118,110,0.60)";
        ctx.font      = `400 ${sc.fontBack}px sans-serif`;
        ctx.textAlign = "left";
        ctx.fillText(`gap ${gapH} mm`, ox + cylW + (sc.v_4_3), gTop + gH / 2 + 3);
      }
      bZ += gapH;
    }
  }
  ctx.restore();
}

// ── Suprarenal stent (device-specific) ───────────────────────────────────────
function drawSuprarenal(
  ctx: CanvasRenderingContext2D,
  R: number, nPeaks: number, delta: number, circ: number,
  az: number, el: number, ox: number, oy: number, scale: number,
  color: string, suprType: "crown" | "zstent" | "cook_lattice" | "barbs_only" | "none",
  suprarenalHeightMm = 18,
): void {
  if (suprType === "none") return;
  const SUPRA_Z = -suprarenalHeightMm;
  // Suprarenal crown uses fewer, broader peaks than the main body rings
  const crownPeaks = (suprType === "zstent") ? 6 : nPeaks;
  const dt      = (2 * Math.PI) / crownPeaks;
  const dTheta  = (delta / circ) * 2 * Math.PI;

  if (suprType === "cook_lattice") {
    ctx.save();
    for (let i = 0; i < nPeaks; i += 1) {
      const thetaA = dTheta + i * dt;
      const thetaB = dTheta + (i + 1) * dt;
      const thetaMid = dTheta + (i + 0.5) * dt;
      const topA: Pt3D = { x: R * Math.sin(thetaA), y: R * Math.cos(thetaA), z: SUPRA_Z };
      const topB: Pt3D = { x: R * Math.sin(thetaB), y: R * Math.cos(thetaB), z: SUPRA_Z };
      const mid: Pt3D = {
        x: R * Math.sin(thetaMid),
        y: R * Math.cos(thetaMid),
        z: SUPRA_Z * 0.52,
      };
      const baseA: Pt3D = { x: R * Math.sin(thetaA), y: R * Math.cos(thetaA), z: 0 };
      const baseB: Pt3D = { x: R * Math.sin(thetaB), y: R * Math.cos(thetaB), z: 0 };

      drawSegment3D(ctx, topA, mid, az, el, ox, oy, scale, color + "cc", 1.2);
      drawSegment3D(ctx, topB, mid, az, el, ox, oy, scale, color + "cc", 1.2);
      drawSegment3D(ctx, mid, baseA, az, el, ox, oy, scale, color + "cc", 1.2);
      drawSegment3D(ctx, mid, baseB, az, el, ox, oy, scale, color + "cc", 1.2);
    }
    ctx.restore();
  } else if (suprType === "crown") {
    // TREO: the suprarenal Z-stent is one continuous wire. Its peaks rise above
    // the fabric (at SUPRA_Z) and its valleys are sewn INTO the fabric to 4.6 mm
    // depth (the crown). Total ring height = |SUPRA_Z| + 4.6.
    // delta=0 aligns with TREO Ring 1 (buildTreoRingPts3D uses absolute theta).
    const CROWN_DEPTH = 4.6;
    const totalH = Math.abs(SUPRA_Z) + CROWN_DEPTH;
    ctx.save(); ctx.setLineDash([3.5, 2.5]);
    drawRing3D(ctx, buildRingPts(R, nPeaks, totalH, SUPRA_Z, 0, 0, circ), az, el, ox, oy, scale, color + "80", 1.1);
    ctx.setLineDash([]); ctx.restore();
  } else if (suprType === "barbs_only") {
    // Valiant: no Z-stent ring — barbs only (drawn in barb section below)
  } else {
    // Zenith Alpha / Endurant / Valiant: sinusoidal suprarenal crown above fabric
    ctx.save(); ctx.setLineDash([3.5, 2.5]);
    drawRing3D(ctx, buildSinusoidalRingPts3D(R, crownPeaks, Math.abs(SUPRA_Z), SUPRA_Z, 0, delta, circ, 20, 0), az, el, ox, oy, scale, color + "80", 1.1);
    ctx.setLineDash([]); ctx.restore();
  }

  // Fixation barbs
  ctx.save(); ctx.strokeStyle = "#222"; ctx.lineWidth = 0.9;
  const bLen = 4 * scale / 26;
  if (suprType === "crown") {
    // TREO: barbs at Z-stent valley = crown apex (z=4.6, inside fabric)
    for (let i = 0; i < nPeaks; i++) {
      const theta = (i + 0.5) * dt;
      const apex = project3D(R * Math.sin(theta), R * Math.cos(theta), 4.6, az, el, ox, oy, scale);
      if (apex.d < 0) continue;
      ctx.beginPath(); ctx.moveTo(apex.sx, apex.sy);
      ctx.lineTo(apex.sx - bLen * 1.2, apex.sy + bLen * 2.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(apex.sx, apex.sy);
      ctx.lineTo(apex.sx + bLen * 1.2, apex.sy + bLen * 2.2); ctx.stroke();
    }
  } else if (suprType === "barbs_only") {
    // Valiant IFU: paired angled spikes at Ring 1 peaks (narrow inverted-V form)
    // Use suprarenalHeightMm to scale spike length so they clear the rim
    ctx.lineWidth = 1.5;
    const spikeH = suprarenalHeightMm * scale * Math.cos(el);
    const spikeW = spikeH * 0.4;
    for (let i = 0; i < nPeaks; i++) {
      const theta = dTheta + i * dt;
      const q = project3D(R * Math.sin(theta), R * Math.cos(theta), 0, az, el, ox, oy, scale);
      if (q.d < 0) continue;
      // Left spike
      ctx.beginPath(); ctx.moveTo(q.sx, q.sy);
      ctx.lineTo(q.sx - spikeW, q.sy - spikeH); ctx.stroke();
      // Right spike
      ctx.beginPath(); ctx.moveTo(q.sx, q.sy);
      ctx.lineTo(q.sx + spikeW, q.sy - spikeH); ctx.stroke();
    }
  } else {
    // Zenith Alpha / Endurant / Valiant: fishhook barbs at Z-stent peaks
    // One barb per peak, alternating direction, with retrograde hook tip
    for (let i = 0; i < crownPeaks; i++) {
      const theta = dTheta + i * dt;
      const q = project3D(R * Math.sin(theta), R * Math.cos(theta), SUPRA_Z, az, el, ox, oy, scale);
      if (q.d < 0) continue;
      const dir = i % 2 === 0 ? 1 : -1;
      const tipX = q.sx + dir * bLen * 0.9;
      const tipY = q.sy - bLen * 2.6;
      // Shank: from peak upward and outward
      ctx.beginPath(); ctx.moveTo(q.sx, q.sy);
      ctx.lineTo(tipX, tipY); ctx.stroke();
      // Retrograde hook: curves back inward from tip
      ctx.beginPath(); ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - dir * bLen * 0.6, tipY + bLen * 0.7); ctx.stroke();
    }
  }
  ctx.restore();
}

// ── Fenestration on cylinder surface ─────────────────────────────────────────
function drawFenestration3D(
  ctx: CanvasRenderingContext2D,
  R: number, clockDeg: number, depthMm: number, widthMm: number, heightMm: number,
  vessel: string, ftype: string, isConflicted: boolean, minDist: number, isStrFree: boolean,
  _delta: number, circ: number, az: number, el: number, ox: number, oy: number, scale: number, sc: ScaleContext,
): { sy: number; label: string; color: string } | null {
  const color  = VESSEL_COLORS[vessel] ?? "#334155";
  const arcMm = (clockDeg / 360) * circ;
  const q = projectSurfacePoint(arcMm, depthMm, circ, R, az, el, ox, oy, scale);
  const fore = Math.max(0.25, Math.abs(q.face) / R);
  const backLabelY = q.sy - (sc.fontBadge);
  const backMetaY = q.sy + (sc.fontBadge);
  const backTagX = q.sx + (sc.fontSub);
  const backTagY = q.sy - (sc.v_1_0);

  if (ftype === "SCALLOP") {
    const qRim = projectSurfacePoint(arcMm, 0, circ, R, az, el, ox, oy, scale);
    const nW   = Math.max(widthMm * scale * 0.30 * fore, sc.v_14_9);
    const nH   = Math.max(heightMm * scale * 0.32, sc.v_11_7);
    ctx.save();
    ctx.fillStyle = qRim.front ? color + "28" : color + "12";
    ctx.strokeStyle = qRim.front ? color : color + "80";
    ctx.lineWidth = sc.strokeCore;
    if (!qRim.front) {
      ctx.setLineDash([sc.v_4_3, sc.v_3_2]);
    }
    ctx.beginPath();
    ctx.moveTo(qRim.sx - nW, qRim.sy); ctx.lineTo(qRim.sx - nW, qRim.sy + nH);
    ctx.quadraticCurveTo(qRim.sx, qRim.sy + nH * 1.6, qRim.sx + nW, qRim.sy + nH);
    ctx.lineTo(qRim.sx + nW, qRim.sy); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    if (qRim.front) {
      ctx.fillStyle = color; ctx.font = `700 ${sc.fontVessel}px sans-serif`; ctx.textAlign = "center";
      ctx.fillText(vessel, qRim.sx, qRim.sy - (sc.fontBadge));
    } else {
      ctx.fillStyle = color + "c0";
      ctx.font = `700 ${sc.fontBack}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`${vessel} back`, qRim.sx, qRim.sy - (sc.v_11_8));
    }
    ctx.textAlign = "left"; ctx.restore();
    return null;
  }

  const left = projectSurfacePoint(arcMm - widthMm / 2, depthMm, circ, R, az, el, ox, oy, scale);
  const right = projectSurfacePoint(arcMm + widthMm / 2, depthMm, circ, R, az, el, ox, oy, scale);
  const top = projectSurfacePoint(
    arcMm,
    Math.max(0, depthMm - heightMm / 2),
    circ,
    R,
    az,
    el,
    ox,
    oy,
    scale,
  );
  const bottom = projectSurfacePoint(
    arcMm,
    depthMm + heightMm / 2,
    circ,
    R,
    az,
    el,
    ox,
    oy,
    scale,
  );
  const rx = Math.max(
    Math.hypot(right.sx - left.sx, right.sy - left.sy) / 2,
    sc.v_7_4,
  );
  const ry = Math.max(
    Math.hypot(bottom.sx - top.sx, bottom.sy - top.sy) / 2,
    sc.v_7_4,
  );
  const rotation = Math.atan2(right.sy - left.sy, right.sx - left.sx);
  const guideRx = rx;
  const guideRy = ry;
  const coreRx = Math.max(sc.v_5_3_8, Math.min(rx * 0.54, sc.v_10_6_8));
  const coreRy = Math.max(sc.v_5_3_8, Math.min(ry * 0.54, sc.v_10_6_8));
  const haloRx = guideRx + (sc.haloExpand);
  const haloRy = guideRy + (sc.haloExpand);

  ctx.save();
  if (isConflicted) {
    ctx.beginPath(); ctx.ellipse(q.sx, q.sy, haloRx, haloRy, rotation, 0, 2 * Math.PI);
    ctx.strokeStyle = "#dc262672"; ctx.lineWidth = sc.v_1_6_1_1;
    ctx.setLineDash([sc.v_4_3, sc.v_3_2]); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.beginPath(); ctx.ellipse(q.sx, q.sy, guideRx, guideRy, rotation, 0, 2 * Math.PI);
  ctx.strokeStyle = q.front ? color + "8c" : color + "5c";
  ctx.lineWidth = sc.strokeGuide;
  ctx.setLineDash([sc.v_4_3, sc.v_3_2]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath(); ctx.ellipse(q.sx, q.sy, coreRx, coreRy, rotation, 0, 2 * Math.PI);
  if (q.front) {
    ctx.fillStyle = "#ffffff"; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = sc.strokeCore; ctx.stroke();

    const csx = Math.max(sc.v_5_3, coreRx * 0.72);
    const csy = Math.max(sc.v_5_3, coreRy * 0.72);
    ctx.strokeStyle = color; ctx.lineWidth = sc.v_1_2_0_9;
    ctx.beginPath();
    ctx.moveTo(q.sx - csx, q.sy); ctx.lineTo(q.sx + csx, q.sy);
    ctx.moveTo(q.sx, q.sy - csy); ctx.lineTo(q.sx, q.sy + csy);
    ctx.stroke();

    if (isStrFree) {
      ctx.fillStyle = "#111827"; ctx.font = `900 ${sc.fontBadge}px sans-serif`; ctx.textAlign = "center";
      ctx.fillText("A", q.sx, q.sy + ry + (sc.v_13_9));
    }
    ctx.fillStyle = color; ctx.font = `700 ${sc.fontVessel}px sans-serif`;
    ctx.fillText(vessel, q.sx + rx + (sc.v_3_2), q.sy + 3);
  } else {
    ctx.fillStyle = color + "14";
    ctx.fill();
    ctx.strokeStyle = color + "c0";
    ctx.lineWidth = sc.v_1_8_1_4;
    ctx.setLineDash([sc.v_4_3, sc.v_3_2]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(q.sx, q.sy, Math.max(sc.v_2_6_2, Math.min(rx, ry) * 0.32), 0, 2 * Math.PI);
    ctx.fillStyle = color + "d0";
    ctx.fill();

    ctx.fillStyle = color + "d0";
    ctx.font = `700 ${sc.fontBack}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(vessel, q.sx, backLabelY);

    ctx.fillStyle = "rgba(17,24,39,0.62)";
    ctx.font = `600 ${sc.v_7_5_6}px sans-serif`;
    ctx.fillText("BACK", backTagX, backTagY);

    if (isConflicted) {
      ctx.fillStyle = "#dc2626c8";
      ctx.font = `600 ${sc.v_7_5_6}px sans-serif`;
      ctx.fillText("conflict", q.sx, backMetaY);
    }
  }

  ctx.textAlign = "left";
  ctx.restore();
  return { sy: q.sy, label: `${depthMm}`, color };
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC INTERFACE  —  SAME SIGNATURE AS v1, NO CHANGES IN COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

export interface GraftSketchOptions {
  ctx:       CanvasRenderingContext2D;
  width:     number;
  height:    number;
  result:    DeviceAnalysisResult;
  caseInput: CaseInput;
  mode?:     "preview" | "print";
  az?:       number;
  el?:       number;
  zoom?:     number;
  panX?:     number;
  panY?:     number;
}

export function renderGraftSketch({
  ctx,
  width,
  height,
  result,
  caseInput,
  mode = "preview",
  az = 0.28,
  el = 0.17,
  zoom = 1,
  panX = 0,
  panY = 0,
}: GraftSketchOptions): void {

  ctx.clearRect(0, 0, width, height);

  if (!result.size) {
    const s = mode === "print" ? width / 600 : 1;
    ctx.fillStyle = "#f8f4ed"; ctx.fillRect(0, 0, width, height);
    if (s !== 1) ctx.scale(s, s);
    ctx.fillStyle = "#45605b"; ctx.font = "400 14px sans-serif";
    ctx.fillText("No compatible graft size for this anatomy.", 24, 40);
    return;
  }

  const sc = buildScaleContext(mode);
  const printScale = sc.isPrint ? width / 600 : 1;
  const lw         = Math.round(width  / printScale);
  const lh         = Math.round(height / printScale);

  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
  if (sc.isPrint) ctx.scale(printScale, printScale);

  const margin  = sc.margin;
  const headerH = sc.headerH;
  const footerH = sc.footerH;

  // Same 52/48 layout split as v1
  const totalBodyW = lw - margin * 2;
  const drawPanelW = Math.round(totalBodyW * 0.52);
  const specPanelX = margin + drawPanelW + (sc.v_16_14);
  const specPanelW = lw - specPanelX - margin;
  const bodyY      = margin + headerH;
  const bodyH      = lh - bodyY - footerH - margin;

  // ── Header (unchanged from v1) ───────────────────────────────────────────
  ctx.fillStyle = "#10211f"; ctx.font = `700 ${sc.fontHeader}px sans-serif`;
  ctx.fillText(result.device.name, margin, margin + (sc.v_22_14));
  ctx.fillStyle = "#45605b"; ctx.font = `400 ${sc.fontSub}px sans-serif`;
  ctx.fillText(
    `${result.size.graftDiameter} mm \u00b7 ${result.nPeaks} peaks \u00b7 ${result.size.sheathFr} Fr \u00b7 ${result.device.fabricMaterial} \u00b7 Foreshortening ${(result.device.foreshortening * 100).toFixed(0)}%`,
    margin, margin + (sc.v_38_24),
  );
  if (caseInput.patientId ?? caseInput.surgeonName) {
    ctx.fillText(
      `Patient: ${caseInput.patientId ?? "\u2014"}   Surgeon: ${caseInput.surgeonName ?? "\u2014"}`,
      margin, margin + (sc.v_52_34),
    );
  }

  // ── 3-D cylinder setup ───────────────────────────────────────────────────
  const { nRings, seamDeg } = result.device;
  const { ringHeight, interRingGap } = getEffectiveRingGeometry(result.device, result.size);

  const circ    = result.circumferenceMm;
  const R       = result.size.graftDiameter / 2;
  const delta   = result.rotation.optimalDeltaMm;
  const proximalRingOffset = result.device.proximalRingOffsetMm ?? 0;

  const maxDepth    = Math.max(
    proximalRingOffset + nRings * ringHeight + (nRings - 1) * interRingGap + 16,
    ...caseInput.fenestrations.map((f) => f.depthMm + 22),
  );
  const annotW      = sc.v_68_34;
  const cylBodyW    = drawPanelW - annotW - (sc.v_14_8);
  const supraClear  = sc.v_40_24;
  const availH      = bodyH - supraClear - (sc.v_30_20);

  const baseScale = Math.min(
    cylBodyW / (2 * R),
    sc.isPrint ? availH / (maxDepth * Math.cos(el)) : Math.min(availH / (maxDepth * Math.cos(el)), 3.0),
  );
  const scale = baseScale * zoom;

  const originX = margin + annotW + cylBodyW / 2 + panX;
  const originY = bodyY + supraClear + panY;
  const cylW    = R * scale;
  const rimRY   = Math.max(cylW * Math.abs(Math.sin(el)), 2.5);
  const rimTopY = originY;
  const rimBotY = originY + maxDepth * Math.cos(el) * scale;

  // ── Cylinder body ────────────────────────────────────────────────────────
  drawCylinderBody(ctx, originX, rimTopY, rimBotY, cylW, rimRY);
  ctx.font = `400 ${sc.fontBack}px sans-serif`;
  drawZoneTints(
    ctx,
    originX,
    rimTopY,
    cylW,
    scale,
    ringHeight,
    interRingGap,
    nRings,
    el, sc,
    proximalRingOffset,
  );

  // Ring labels on right
  {
    let bZ = proximalRingOffset;
    ctx.fillStyle = "rgba(107,114,128,0.65)"; ctx.textAlign = "left";
    for (let r = 0; r < nRings; r++) {
      ctx.fillText(`Ring ${r + 1}`, originX + cylW + (sc.v_4_3), rimTopY + bZ * Math.cos(el) * scale + ringHeight * Math.cos(el) * scale / 2 + 3);
      bZ += ringHeight + interRingGap;
    }
  }

  // Cylinder walls
  ctx.strokeStyle = "#10211f"; ctx.lineWidth = sc.v_2_0_1_5;
  ctx.beginPath();
  ctx.moveTo(originX - cylW, rimTopY); ctx.lineTo(originX - cylW, rimBotY);
  ctx.moveTo(originX + cylW, rimTopY); ctx.lineTo(originX + cylW, rimBotY);
  ctx.stroke();

  // Proximal rim ellipse
  ctx.strokeStyle = "#10211f"; ctx.lineWidth = sc.v_1_8_1_3;
  ctx.beginPath(); ctx.ellipse(originX, rimTopY, cylW, rimRY, 0, 0, 2 * Math.PI); ctx.stroke();
  // Interior gradient fill (3-D depth effect)
  ctx.save();
  ctx.beginPath(); ctx.ellipse(originX, rimTopY, cylW - 1, rimRY - 0.5, 0, 0, 2 * Math.PI);
  const rimGrad = ctx.createRadialGradient(originX, rimTopY - rimRY * 0.4, 0, originX, rimTopY, cylW);
  rimGrad.addColorStop(0, "rgba(185,215,210,0.55)"); rimGrad.addColorStop(1, "rgba(100,140,135,0.18)");
  ctx.fillStyle = rimGrad; ctx.fill(); ctx.restore();

  // Distal rim (lower half solid, upper dashed)
  ctx.strokeStyle = "#333"; ctx.lineWidth = sc.v_1_4_1_1;
  ctx.beginPath(); ctx.ellipse(originX, rimBotY, cylW, rimRY, 0, 0, Math.PI); ctx.stroke();
  ctx.save(); ctx.setLineDash([sc.v_4_3, sc.v_3_2]); ctx.strokeStyle = "rgba(51,51,51,0.28)";
  ctx.beginPath(); ctx.ellipse(originX, rimBotY, cylW, rimRY, 0, Math.PI, 2 * Math.PI); ctx.stroke();
  ctx.restore();

  // ── Stent rings (Z-stent or sinusoidal depending on device) ─────────────
  const strutLW = sc.v_2_0_1_6;
  let ringZ     = proximalRingOffset;
  for (let r = 0; r < nRings; r++) {
    drawRing3D(
      ctx,
      buildRingPtsForDevice(
        result.device.id,
        result.device.stentType,
        R,
        result.nPeaks,
        ringHeight,
        ringZ,
        r,
        delta,
        circ,
      ),
      az,
      el,
      originX,
      originY,
      scale,
      result.device.color,
      strutLW,
    );
    ringZ += ringHeight + interRingGap;
  }

  // ── Suprarenal stent ─────────────────────────────────────────────────────
  const supraH =
    result.device.suprarenalHeightMm ??
    (result.device.hasBareSuprarenal ? 18 : 0);
  const treoLarge = result.device.id === "treo" && result.size.graftDiameter >= 30;

  drawSuprarenal(
    ctx, R, result.nPeaks, delta, circ, az, el, originX, originY, scale,
    result.device.color,
    result.device.id === "treo"
      ? "crown"
      : result.device.hasBareSuprarenal
        ? "zstent"
        : "none",
    treoLarge ? supraH + 2 : supraH,
  );

  // ── Infrarenal barbs (TREO valley barbs) ─────────────────────────────────
  if (result.device.hasInfrarenalBarbs) {
    const dt = (2 * Math.PI) / result.nPeaks;
    const dTheta = (delta / circ) * 2 * Math.PI;
    ctx.save(); ctx.strokeStyle = "#222"; ctx.lineWidth = 0.9;
    const bLen = 3 * scale / 26;
    for (let i = 0; i < result.nPeaks; i++) {
      const theta = dTheta + (i + 0.5) * dt;
      const q = project3D(R * Math.sin(theta), R * Math.cos(theta), ringHeight, az, el, originX, originY, scale);
      if (q.d < 0) continue;
      ctx.beginPath(); ctx.moveTo(q.sx, q.sy); ctx.lineTo(q.sx, q.sy + bLen * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // ── Gold radiopaque markers (Zenith Alpha) ────────────────────────────────
  if (result.device.id === "zenith_alpha") {
    const dTheta = (delta / circ) * 2 * Math.PI;
    ctx.save(); ctx.fillStyle = "#d97706";
    for (const frac of [0, 0.25, 0.5, 0.75]) {
      const theta = dTheta + frac * 2 * Math.PI;
      const q = project3D(R * Math.sin(theta), R * Math.cos(theta), 2, az, el, originX, originY, scale);
      if (q.d < 0) continue;
      ctx.beginPath(); ctx.arc(q.sx, q.sy, Math.max(2.5, scale * 0.12), 0, 2 * Math.PI); ctx.fill();
    }
    ctx.restore();
  }

  // ── Diameter callout ──────────────────────────────────────────────────────
  const diaY = rimTopY - rimRY - (sc.v_18_12);
  ctx.strokeStyle = "#10211f"; ctx.lineWidth = sc.v_1_4_1_0;
  ctx.beginPath();
  ctx.moveTo(originX - cylW, diaY); ctx.lineTo(originX + cylW, diaY);
  ctx.moveTo(originX - cylW, diaY - (sc.isPrint ? 5 : 3)); ctx.lineTo(originX - cylW, diaY + (sc.isPrint ? 5 : 3));
  ctx.moveTo(originX + cylW, diaY - (sc.isPrint ? 5 : 3)); ctx.lineTo(originX + cylW, diaY + (sc.isPrint ? 5 : 3));
  ctx.stroke();
  ctx.fillStyle = "#10211f"; ctx.font = `700 ${sc.v_13_9}px sans-serif`; ctx.textAlign = "center";
  ctx.fillText(`\u00d8 ${result.size.graftDiameter} mm`, originX, diaY - (sc.v_7_4));
  ctx.textAlign = "left";

  // ── Clock guide labels at proximal rim ───────────────────────────────────
  ctx.font = `600 ${sc.v_9_6_5}px sans-serif`; ctx.textAlign = "center";
  for (const [label, deg] of [["12:00 (A)", 0], ["3:00", 90], ["9:00", 270]] as [string, number][]) {
    const theta = ((delta / circ) + deg / 360) * 2 * Math.PI;
    const q = project3D(R * Math.sin(theta), R * Math.cos(theta), 0, az, el, originX, originY, scale);
    if (q.d < 0) continue;
    ctx.fillStyle = "#374151";
    ctx.fillText(label, q.sx, rimTopY - rimRY - (sc.v_8_5));
    ctx.strokeStyle = "rgba(0,0,0,0.08)"; ctx.lineWidth = 0.4; ctx.setLineDash([sc.isPrint ? 4 : 3, sc?3:2]);
    ctx.beginPath(); ctx.moveTo(q.sx, rimTopY); ctx.lineTo(q.sx, rimBotY); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.textAlign = "left";

  // ── Fenestrations ─────────────────────────────────────────────────────────
  const dimLines: { sy: number; label: string; color: string }[] = [];
  caseInput.fenestrations.forEach((fen, idx) => {
    const conflict    = result.optimalConflicts[idx];
    const isConflict  = conflict?.conflict ?? false;
    const adjClock    = conflict?.adjustedClock ?? fen.clock;
    const clockDeg    = (clockToArc(adjClock, circ) / circ) * 360;
    const isStrFree   = !isConflict && fen.ftype !== "SCALLOP"
      && isInInterRingGap(
        fen.depthMm,
        ringHeight,
        interRingGap,
        nRings,
        proximalRingOffset,
      );

    const dl = drawFenestration3D(
      ctx, R, clockDeg, fen.depthMm, fen.widthMm, fen.heightMm,
      fen.vessel, fen.ftype, isConflict, conflict?.minDist ?? 0, isStrFree,
      delta, circ, az, el, originX, originY, scale, sc,
    );
    if (dl) dimLines.push(dl);
  });

  // ── Depth dimension lines (Cook CMD style) ───────────────────────────────
  {
    const colW = sc.fontBadge, arrowSz = sc.v_3_5_2_5;
    dimLines.forEach(({ sy, label, color }, i) => {
      const dimX = originX - cylW - (sc.v_10_7) - i * colW;
      ctx.strokeStyle = color; ctx.lineWidth = sc.v_1_2_0_9;
      ctx.beginPath(); ctx.moveTo(dimX, rimTopY); ctx.lineTo(dimX, sy); ctx.stroke();
      ctx.fillStyle = color;
      drawArrow(ctx, dimX, rimTopY, "up",   arrowSz);
      drawArrow(ctx, dimX, sy,      "down", arrowSz);
      ctx.strokeStyle = `${color}50`; ctx.lineWidth = 0.5; ctx.setLineDash([sc.isPrint ? 3 : 2, sc?2:1.5]);
      ctx.beginPath();
      ctx.moveTo(dimX, rimTopY); ctx.lineTo(originX - cylW, rimTopY);
      ctx.moveTo(dimX, sy);      ctx.lineTo(originX - cylW, sy);
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.font = `700 ${sc.v_11_8}px sans-serif`; ctx.textAlign = "right";
      ctx.fillText(label, dimX - (sc.v_3_2), (rimTopY + sy) / 2 + 4);
      ctx.textAlign = "left";
    });
  }

  // ── Bifurcation hint ─────────────────────────────────────────────────────
  {
    const legLen = Math.min(sc.v_22_14, lh - rimBotY - 12);
    if (legLen > 4) {
      ctx.setLineDash([sc.isPrint ? 4 : 3, sc?3:2]); ctx.strokeStyle = "rgba(16,33,31,0.48)"; ctx.lineWidth = sc.isPrint ? 1.6 : 1.2;
      ctx.beginPath();
      ctx.moveTo(originX - cylW, rimBotY); ctx.lineTo(originX - cylW * 0.30, rimBotY + legLen);
      ctx.moveTo(originX + cylW, rimBotY); ctx.lineTo(originX + cylW * 0.30, rimBotY + legLen);
      ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // ── Depth axis ───────────────────────────────────────────────────────────
  ctx.fillStyle = "#374151"; ctx.font = `400 ${sc.isPrint ? 9 : 7}px sans-serif`;
  ctx.strokeStyle = "rgba(55,65,81,0.40)"; ctx.lineWidth = 0.6; ctx.textAlign = "right";
  for (let d = 0; d <= maxDepth; d += 10) {
    const gy = rimTopY + d * Math.cos(el) * scale;
    if (gy > rimBotY + 6) break;
    ctx.beginPath(); ctx.moveTo(originX - cylW - (sc.isPrint ? 3 : 2), gy); ctx.lineTo(originX - cylW, gy); ctx.stroke();
    ctx.fillText(`${d}`, originX - cylW - (sc.isPrint ? 5 : 4), gy + 3);
  }
  ctx.textAlign = "left";
  ctx.save();
  ctx.translate(originX - cylW - (sc.isPrint ? 22 : 14), rimTopY + (rimBotY - rimTopY) / 2);
  ctx.rotate(-Math.PI / 2); ctx.font = `400 ${sc.isPrint ? 7.5 : 6}px sans-serif`;
  ctx.fillStyle = "#374151"; ctx.textAlign = "center";
  ctx.fillText("Distance from proximal edge (mm)", 0, 0);
  ctx.restore();

  // ══════════════════════════════════════════════════════════════════════════
  // SPEC PANEL — exact copy from v1, no changes
  // ══════════════════════════════════════════════════════════════════════════

  const lineH = sc.v_15_12;
  let sy      = bodyY + (sc.v_6_4);
  const sw    = specPanelW;

  ctx.fillStyle = "#111827"; ctx.font = `700 ${sc.isPrint ? 14 : 10}px sans-serif`;
  ctx.fillText("ROTATION PLAN", specPanelX, sy); sy += lineH * 1.3;
  ctx.fillStyle = "#0f766e"; ctx.font = `600 ${sc.isPrint ? 11 : 9}px sans-serif`;
  sy = wrapText(ctx, getRotationSummary(result), specPanelX, sy, sw, lineH, 4);
  sy += lineH * 0.8;
  ctx.strokeStyle = "rgba(16,33,31,0.15)"; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(specPanelX, sy); ctx.lineTo(specPanelX + sw, sy); ctx.stroke();
  sy += lineH * 0.8;

  const fcnt = { SCALLOP: 0, LARGE_FEN: 0, SMALL_FEN: 0 };
  caseInput.fenestrations.forEach((fen, idx) => {
    const conflict     = result.optimalConflicts[idx];
    const adjClock     = conflict?.adjustedClock ?? fen.clock;
    const isConflicted = conflict?.conflict ?? false;
    const color        = VESSEL_COLORS[fen.vessel] ?? "#334155";
    fcnt[fen.ftype]++;
    const typeLabel = fen.ftype === "SCALLOP"
      ? `REINFORCED SCALLOP #${fcnt.SCALLOP}`
      : fen.ftype === "LARGE_FEN"
        ? `REINFORCED LARGE FENESTRATION #${fcnt.LARGE_FEN}`
        : `REINFORCED SMALL FENESTRATION #${fcnt.SMALL_FEN}`;

    ctx.fillStyle = color; ctx.font = `700 ${sc.isPrint ? 12 : 9}px sans-serif`;
    ctx.fillText(typeLabel, specPanelX, sy); sy += lineH;

    if (fen.ftype !== "SCALLOP") {
      const arcSep   = computeArcSep(adjClock, seamDeg, delta, circ);
      const isStrFree = !isConflicted && isInInterRingGap(fen.depthMm, ringHeight, interRingGap, nRings);
      if (isStrFree) {
        ctx.fillStyle = "#0f766e"; ctx.font = `700 ${sc.isPrint ? 11 : 8}px sans-serif`;
        ctx.fillText("**Strut Free**", specPanelX + (sc.isPrint ? 6 : 4), sy); sy += lineH;
      } else if (isConflicted) {
        ctx.fillStyle = "#dc2626"; ctx.font = `700 ${sc.isPrint ? 11 : 8}px sans-serif`;
        ctx.fillText(`\u26a0 Conflict \u2014 min clearance ${conflict.minDist.toFixed(1)} mm`, specPanelX + (sc.isPrint ? 6 : 4), sy); sy += lineH;
      }
      ctx.fillStyle = "#334155"; ctx.font = `400 ${sc.isPrint ? 11 : 9}px sans-serif`;
      for (const line of [
        `WIDTH: ${fen.widthMm} mm`, `HEIGHT: ${fen.heightMm} mm`,
        `DIST FROM PROX EDGE: ${fen.depthMm} mm`,
        `CLOCK: ${adjClock} (ARCSEP: ${arcSep > 0 ? "+" : ""}${arcSep.toFixed(1)} mm)`,
        `Original clock: ${fen.clock}`,
      ]) { ctx.fillText(line, specPanelX + (sc.isPrint ? 6 : 4), sy); sy += lineH; }
    } else {
      ctx.fillStyle = "#334155"; ctx.font = `400 ${sc.isPrint ? 11 : 9}px sans-serif`;
      for (const line of [
        `WIDTH: ${fen.widthMm} mm`, `HEIGHT: ${fen.heightMm} mm`,
        `CLOCK: ${adjClock}`, `Original clock: ${fen.clock}`,
      ]) { ctx.fillText(line, specPanelX + (sc.isPrint ? 6 : 4), sy); sy += lineH; }
    }
    sy += lineH * 0.5;
  });

  sy += lineH * 0.5;
  ctx.strokeStyle = "rgba(16,33,31,0.15)"; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(specPanelX, sy); ctx.lineTo(specPanelX + sw, sy); ctx.stroke();
  sy += lineH;

  ctx.fillStyle = "#10211f"; ctx.font = `700 ${sc.isPrint ? 12 : 9}px sans-serif`;
  ctx.fillText("DEVICE", specPanelX, sy); sy += lineH;
  ctx.fillStyle = "#334155"; ctx.font = `400 ${sc.isPrint ? 11 : 9}px sans-serif`;
  const deviceLines: string[] = [
    `Sheath: ${result.size.sheathFr} Fr`,
    `Foreshortening: ${(result.device.foreshortening * 100).toFixed(1)}%`,
    `Fabric: ${result.device.fabricMaterial}`,
    `Seam: ${seamDeg === 0 ? "12:00 anterior" : seamDeg === 180 ? "6:00 posterior" : `${seamDeg}\u00b0`}`,
    `Stent type: ${result.device.stentType}`,
    `PMEG suitability: ${result.device.pmegSuitability}/4`,
  ];
  const dev = result.device;
  if (dev.hasBareSuprarenal)          deviceLines.push("Bare suprarenal stent: YES (barbs)");
  if (dev.hasInfrarenalBarbs)         deviceLines.push("Infrarenal barbs: YES (valley barbs)");
  if (dev.minNeckLengthMm      != null) deviceLines.push(`Min neck length (IFU): ${dev.minNeckLengthMm} mm`);
  if (dev.maxInfrarenalAngleDeg != null) deviceLines.push(`Max infrarenal angle (IFU): ${dev.maxInfrarenalAngleDeg}\u00b0`);
  if (dev.maxSuprarenalAngleDeg != null) deviceLines.push(`Max suprarenal angle (IFU): ${dev.maxSuprarenalAngleDeg}\u00b0`);
  for (const line of deviceLines) { ctx.fillText(line, specPanelX + (sc.isPrint ? 6 : 4), sy); sy += lineH; }

  if (caseInput.surgeonNote) {
    sy += lineH * 0.5;
    ctx.fillStyle = "#45605b"; ctx.font = `400 italic ${sc.isPrint ? 10 : 8}px sans-serif`;
    sy = wrapText(ctx, `Note: ${caseInput.surgeonNote}`, specPanelX, sy, sw, lineH, 4);
  }

  // ── Footer (unchanged from v1) ────────────────────────────────────────────
  const footerY = lh - footerH + (sc.v_14_8);
  ctx.strokeStyle = "rgba(16,33,31,0.15)"; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(margin, footerY - (sc.isPrint ? 8 : 6)); ctx.lineTo(lw - margin, footerY - (sc.isPrint ? 8 : 6)); ctx.stroke();
  ctx.fillStyle = "#45605b"; ctx.font = `400 ${sc.isPrint ? 9 : 8}px sans-serif`;
  ctx.fillText("For research and planning use only. All clinical decisions remain the surgeon\u2019s responsibility. Not to scale.", margin, footerY);
  ctx.fillText(`PMEGplan.io  \u2022  ${new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}`, margin, footerY + (sc.isPrint ? 12 : 10));
  if (sc.isPrint) {
    ctx.fillText("Signature: ___________________________   Date: ___________", lw / 2 - 10, footerY);
  }
}
