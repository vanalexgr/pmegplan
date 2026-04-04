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
 *   - segments facing viewer  -> solid, device colour
 *   - segments facing away    -> dashed, faded
 *
 * Everything else (spec panel, ARCSEP, footer, imports) is unchanged from v1.
 */

import { clockToArc, wrapMm } from "@/lib/conflictDetection";
import { getRotationSummary } from "@/lib/analysis";
import type { CaseInput, DeviceAnalysisResult } from "@/lib/types";

// -- Vessel colour map (unchanged) --------------------------------------------
const VESSEL_COLORS: Record<string, string> = {
  SMA: "#b45309", LRA: "#1d4ed8", RRA: "#6d28d9",
  CELIAC: "#b91c1c", LMA: "#0f766e", CUSTOM: "#334155",
};

// -- Helpers preserved from v1 (used by spec panel) ---------------------------

function arcFromNoon(arcPos: number, circ: number): number {
  const w = wrapMm(arcPos, circ);
  return w > circ / 2 ? w - circ : w;
}

function computeArcSep(
  adjustedClock: string, seamDeg: number, optimalDeltaMm: number, circ: number,
): number {
  const fenArc  = wrapMm(clockToArc(adjustedClock, circ), circ);
  const seamArc = wrapMm((seamDeg / 360) * circ + optimalDeltaMm, circ);
  let sep = fenArc - seamArc;
  if (sep >  circ / 2) sep -= circ;
  if (sep < -circ / 2) sep += circ;
  return sep;
}

function isInInterRingGap(
  depthMm: number, ringHeight: number, interRingGap: number, nRings: number,
): boolean {
  let y = 0;
  for (let i = 0; i < nRings - 1; i++) {
    y += ringHeight;
    if (depthMm >= y && depthMm <= y + interRingGap) return true;
    y += interRingGap;
  }
  return false;
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

// ===========================================================================
// 3-D PROJECTION ENGINE
// ===========================================================================
//
// Coordinate system:
//   The graft long axis is Z (0 = proximal, positive = distal).
//   The cross-section lies in XY:  X = sin(theta), Y = cos(theta)
//     so theta = 0 -> 12:00 (anterior), theta = pi/2 -> 3:00 (patient left).
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

// -- Build Z-stent ring as 3-D surface points --------------------------------
// Zigzag wave: nPeaks peaks, each consisting of an ascending limb (z0 -> z0+ringH)
// and a descending limb (z0+ringH -> z0). Alternate rings are phase-shifted by half
// a wave width to produce the interlocking Z-stent pattern.
function buildRingPts(
  R: number, nPeaks: number, ringH: number, z0: number,
  ringIdx: number, delta: number, circ: number, N = 10,
): Pt3D[] {
  const dt     = (2 * Math.PI) / nPeaks;
  const phase  = ((ringIdx % 2) * dt) / 2;
  const dTheta = (delta / circ) * 2 * Math.PI;
  const pts: Pt3D[] = [];

  for (let i = 0; i < nPeaks; i++) {
    const t0 = dTheta + phase + i * dt;
    const tm = dTheta + phase + (i + 0.5) * dt;
    const t1 = dTheta + phase + (i + 1) * dt;

    // Ascending limb: peak -> trough
    for (let s = 0; s <= N; s++) {
      const f = s / N;
      pts.push({ x: R * Math.sin(t0 + f * (tm - t0)), y: R * Math.cos(t0 + f * (tm - t0)), z: z0 + f * ringH });
    }
    // Descending limb: trough -> next peak
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
): Pt3D[] {
  const total = nPeaks * N;
  const dTheta = (2 * Math.PI) / total;
  const phaseOffset = (ringIdx % 2) * (Math.PI / nPeaks);
  const deltaTheta = (delta / circ) * 2 * Math.PI;
  const pts: Pt3D[] = [];

  for (let i = 0; i <= total; i += 1) {
    const theta = deltaTheta + phaseOffset + i * dTheta;
    const zz =
      z0 +
      (ringH / 2) *
        (1 - Math.cos(nPeaks * (i / total) * 2 * Math.PI + phaseOffset));
    pts.push({ x: R * Math.sin(theta), y: R * Math.cos(theta), z: zz });
  }

  return pts;
}

function buildRingPtsForDevice(
  stentType: string,
  R: number,
  nPeaks: number,
  ringH: number,
  z0: number,
  ringIdx: number,
  delta: number,
  circ: number,
): Pt3D[] {
  if (
    stentType === "sinusoidal" ||
    stentType === "helical" ||
    stentType === "M-stent"
  ) {
    return buildSinusoidalRingPts3D(
      R,
      nPeaks,
      ringH,
      z0,
      ringIdx,
      delta,
      circ,
    );
  }

  return buildRingPts(R, nPeaks, ringH, z0, ringIdx, delta, circ);
}

// -- Draw ring with front/back hidden-line removal ----------------------------
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
  const projected = project3D(
    px,
    py,
    depthMm,
    az,
    el,
    ox,
    oy,
    scale,
  );

  return {
    ...projected,
    face,
    front: face >= 0,
  };
}

function drawSurfaceSegments3D(
  ctx: CanvasRenderingContext2D,
  segments: DeviceAnalysisResult["strutSegments"],
  circ: number,
  R: number,
  az: number,
  el: number,
  ox: number,
  oy: number,
  scale: number,
  color: string,
  lw: number,
): void {
  const front = new Path2D();
  const back = new Path2D();

  for (const [ax, ay, bx, by] of segments) {
    const a = projectSurfacePoint(ax, ay, circ, R, az, el, ox, oy, scale);
    const b = projectSurfacePoint(bx, by, circ, R, az, el, ox, oy, scale);

    if ((a.face + b.face) / 2 >= 0) {
      front.moveTo(a.sx, a.sy);
      front.lineTo(b.sx, b.sy);
    } else {
      back.moveTo(a.sx, a.sy);
      back.lineTo(b.sx, b.sy);
    }
  }

  ctx.save();
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = color + "30";
  ctx.lineWidth = lw * 0.55;
  ctx.stroke(back);
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = lw + 1.9;
  ctx.stroke(front);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke(front);
  ctx.restore();
}

// -- Cylinder body shading (subtle 3-D depth) --------------------------------
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

// -- Ring zone tints clipped to cylinder width -------------------------------
function drawZoneTints(
  ctx: CanvasRenderingContext2D,
  ox: number, topY: number, cylW: number, scale: number,
  ringH: number, gapH: number, nRings: number, el: number, p: boolean,
): void {
  const cosEl = Math.cos(el);
  ctx.save();
  ctx.beginPath(); ctx.rect(ox - cylW, topY, cylW * 2, 9999); ctx.clip();

  let bZ = 0;
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
      if (gH > (p ? 10 : 7)) {
        ctx.fillStyle = "rgba(15,118,110,0.60)";
        ctx.font      = `400 ${p ? 8.5 : 6.5}px sans-serif`;
        ctx.textAlign = "left";
        ctx.fillText(`gap ${gapH} mm`, ox + cylW + (p ? 4 : 3), gTop + gH / 2 + 3);
      }
      bZ += gapH;
    }
  }
  ctx.restore();
}

// -- Suprarenal stent (device-specific) --------------------------------------
function drawSuprarenal(
  ctx: CanvasRenderingContext2D,
  R: number, nPeaks: number, delta: number, circ: number,
  az: number, el: number, ox: number, oy: number, scale: number,
  color: string, suprType: "crown" | "zstent" | "none",
): void {
  if (suprType === "none") return;
  const SUPRA_Z = -18;
  const dt      = (2 * Math.PI) / nPeaks;
  const dTheta  = (delta / circ) * 2 * Math.PI;

  if (suprType === "crown") {
    // TREO: parabolic arches above fabric
    ctx.save(); ctx.strokeStyle = color + "cc"; ctx.lineWidth = 1.3;
    for (let i = 0; i < nPeaks; i++) {
      const t0 = dTheta + i * dt, t1 = dTheta + (i + 1) * dt;
      const archPts: Pt3D[] = [];
      for (let s = 0; s <= 14; s++) {
        const f = s / 14, theta = t0 + f * (t1 - t0);
        archPts.push({ x: R * Math.sin(theta), y: R * Math.cos(theta), z: SUPRA_Z * (1 - 4 * f * (1 - f)) });
      }
      const prj = archPts.map((p) => project3D(p.x, p.y, p.z, az, el, ox, oy, scale));
      ctx.beginPath(); ctx.moveTo(prj[0].sx, prj[0].sy);
      for (let s = 1; s < prj.length; s++) ctx.lineTo(prj[s].sx, prj[s].sy);
      ctx.stroke();
    }
    // Crown foot dots
    ctx.fillStyle = color;
    for (let i = 0; i < nPeaks; i++) {
      const theta = dTheta + i * dt;
      const q = project3D(R * Math.sin(theta), R * Math.cos(theta), 0, az, el, ox, oy, scale);
      if (q.d < 0) continue;
      ctx.beginPath(); ctx.arc(q.sx, q.sy, 2.2, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.restore();
  } else {
    // Zenith Alpha / Endurant: dashed Z-stent ring above fabric
    ctx.save(); ctx.setLineDash([3.5, 2.5]);
    drawRing3D(
      ctx,
      buildRingPtsForDevice("Z-stent", R, nPeaks, Math.abs(SUPRA_Z), SUPRA_Z, 0, delta, circ),
      az,
      el,
      ox,
      oy,
      scale,
      color + "80",
      1.1,
    );
    ctx.setLineDash([]); ctx.restore();
  }

  // Fixation barbs at peaks
  ctx.save(); ctx.strokeStyle = "#222"; ctx.lineWidth = 0.9;
  const bLen = 4 * scale / 26;
  for (let i = 0; i < nPeaks; i++) {
    const theta = dTheta + i * dt;
    const barbZ = suprType === "crown" ? 0 : SUPRA_Z;
    const q     = project3D(R * Math.sin(theta), R * Math.cos(theta), barbZ, az, el, ox, oy, scale);
    if (q.d < 0) continue;
    ctx.beginPath(); ctx.moveTo(q.sx, q.sy); ctx.lineTo(q.sx - bLen * 1.2, q.sy - bLen * 2.2); ctx.stroke();
  }
  ctx.restore();
}

// -- Fenestration on cylinder surface ----------------------------------------
function drawFenestration3D(
  ctx: CanvasRenderingContext2D,
  R: number, clockDeg: number, depthMm: number, widthMm: number, heightMm: number,
  vessel: string, ftype: string, isConflicted: boolean, minDist: number, isStrFree: boolean,
  circ: number, az: number, el: number, ox: number, oy: number, scale: number, p: boolean,
): { sy: number; label: string; color: string } | null {
  const color  = VESSEL_COLORS[vessel] ?? "#334155";
  const arcMm = (clockDeg / 360) * circ;
  const q = projectSurfacePoint(arcMm, depthMm, circ, R, az, el, ox, oy, scale);
  const fore = Math.max(0.25, Math.abs(q.face) / R);
  const backLabelY = q.sy - (p ? 14 : 10);
  const backMetaY = q.sy + (p ? 14 : 10);
  const backTagX = q.sx + (p ? 12 : 9);
  const backTagY = q.sy - (p ? 1 : 0);

  if (ftype === "SCALLOP") {
    const qRim = projectSurfacePoint(arcMm, 0, circ, R, az, el, ox, oy, scale);
    const nW   = Math.max(widthMm * scale * 0.30 * fore, p ? 14 : 9);
    const nH   = Math.max(heightMm * scale * 0.32, p ? 11 : 7);
    ctx.save();
    ctx.fillStyle = qRim.front ? color + "28" : color + "12";
    ctx.strokeStyle = qRim.front ? color : color + "80";
    ctx.lineWidth = p ? 2.2 : 1.8;
    if (!qRim.front) {
      ctx.setLineDash([p ? 4 : 3, p ? 3 : 2]);
    }
    ctx.beginPath();
    ctx.moveTo(qRim.sx - nW, qRim.sy); ctx.lineTo(qRim.sx - nW, qRim.sy + nH);
    ctx.quadraticCurveTo(qRim.sx, qRim.sy + nH * 1.6, qRim.sx + nW, qRim.sy + nH);
    ctx.lineTo(qRim.sx + nW, qRim.sy); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    if (qRim.front) {
      ctx.fillStyle = color; ctx.font = `700 ${p ? 10 : 7.5}px sans-serif`; ctx.textAlign = "center";
      ctx.fillText(vessel, qRim.sx, qRim.sy - (p ? 14 : 10));
    } else {
      ctx.fillStyle = color + "c0";
      ctx.font = `700 ${p ? 8.5 : 6.5}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`${vessel} back`, qRim.sx, qRim.sy - (p ? 11 : 8));
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
    p ? 7 : 4,
  );
  const ry = Math.max(
    Math.hypot(bottom.sx - top.sx, bottom.sy - top.sy) / 2,
    p ? 7 : 4,
  );
  const rotation = Math.atan2(right.sy - left.sy, right.sx - left.sx);
  const guideRx = rx;
  const guideRy = ry;
  const coreRx = Math.max(p ? 5 : 3.8, Math.min(rx * 0.54, p ? 10 : 6.8));
  const coreRy = Math.max(p ? 5 : 3.8, Math.min(ry * 0.54, p ? 10 : 6.8));
  const haloRx = guideRx + (p ? 4.5 : 3.6);
  const haloRy = guideRy + (p ? 4.5 : 3.6);

  ctx.save();
  if (isConflicted) {
    ctx.beginPath(); ctx.ellipse(q.sx, q.sy, haloRx, haloRy, rotation, 0, 2 * Math.PI);
    ctx.strokeStyle = "#dc262672"; ctx.lineWidth = p ? 1.6 : 1.1;
    ctx.setLineDash([p ? 4 : 3, p ? 3 : 2]); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.beginPath(); ctx.ellipse(q.sx, q.sy, guideRx, guideRy, rotation, 0, 2 * Math.PI);
  ctx.strokeStyle = q.front ? color + "8c" : color + "5c";
  ctx.lineWidth = p ? 1.4 : 1.05;
  ctx.setLineDash([p ? 4 : 3, p ? 3 : 2]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath(); ctx.ellipse(q.sx, q.sy, coreRx, coreRy, rotation, 0, 2 * Math.PI);
  if (q.front) {
    ctx.fillStyle = "#ffffff"; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = p ? 2.2 : 1.8; ctx.stroke();

    const csx = Math.max(p ? 5 : 3, coreRx * 0.72);
    const csy = Math.max(p ? 5 : 3, coreRy * 0.72);
    ctx.strokeStyle = color; ctx.lineWidth = p ? 1.2 : 0.9;
    ctx.beginPath();
    ctx.moveTo(q.sx - csx, q.sy); ctx.lineTo(q.sx + csx, q.sy);
    ctx.moveTo(q.sx, q.sy - csy); ctx.lineTo(q.sx, q.sy + csy);
    ctx.stroke();

    if (isStrFree) {
      ctx.fillStyle = "#111827"; ctx.font = `900 ${p ? 14 : 10}px sans-serif`; ctx.textAlign = "center";
      ctx.fillText("A", q.sx, q.sy + ry + (p ? 13 : 9));
    }
    ctx.fillStyle = color; ctx.font = `700 ${p ? 10 : 7.5}px sans-serif`;
    ctx.fillText(vessel, q.sx + rx + (p ? 3 : 2), q.sy + 3);
  } else {
    ctx.fillStyle = color + "14";
    ctx.fill();
    ctx.strokeStyle = color + "c0";
    ctx.lineWidth = p ? 1.8 : 1.4;
    ctx.setLineDash([p ? 4 : 3, p ? 3 : 2]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(q.sx, q.sy, Math.max(p ? 2.6 : 2, Math.min(rx, ry) * 0.32), 0, 2 * Math.PI);
    ctx.fillStyle = color + "d0";
    ctx.fill();

    ctx.fillStyle = color + "d0";
    ctx.font = `700 ${p ? 8.5 : 6.5}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(vessel, q.sx, backLabelY);

    ctx.fillStyle = "rgba(17,24,39,0.62)";
    ctx.font = `600 ${p ? 7.5 : 6}px sans-serif`;
    ctx.fillText("BACK", backTagX, backTagY);

    if (isConflicted) {
      ctx.fillStyle = "#dc2626c8";
      ctx.font = `600 ${p ? 7.5 : 6}px sans-serif`;
      ctx.fillText("conflict", q.sx, backMetaY);
    }
  }

  ctx.textAlign = "left";
  ctx.restore();
  return { sy: q.sy, label: `${depthMm}`, color };
}

function drawFenestrationGhost3D(
  ctx: CanvasRenderingContext2D,
  R: number,
  clockDeg: number,
  depthMm: number,
  _widthMm: number,
  _heightMm: number,
  vessel: string,
  circ: number,
  az: number,
  el: number,
  ox: number,
  oy: number,
  scale: number,
  p: boolean,
): void {
  const color = VESSEL_COLORS[vessel] ?? "#334155";
  const arcMm = (clockDeg / 360) * circ;
  const q = projectSurfacePoint(arcMm, depthMm, circ, R, az, el, ox, oy, scale);
  const markerR = p ? 4.2 : 2.8;
  const guideLen = p ? 10 : 7;

  ctx.save();
  ctx.beginPath();
  ctx.arc(q.sx, q.sy, markerR, 0, 2 * Math.PI);
  ctx.setLineDash([p ? 5 : 4, p ? 4 : 3]);
  ctx.strokeStyle = q.front ? color + "55" : color + "35";
  ctx.lineWidth = p ? 1.5 : 1.1;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(q.sx, q.sy, Math.max(p ? 1.7 : 1.2, markerR * 0.42), 0, 2 * Math.PI);
  ctx.fillStyle = q.front ? color + "65" : color + "40";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(q.sx, q.sy - markerR - 1);
  ctx.lineTo(q.sx, q.sy - markerR - guideLen);
  ctx.strokeStyle = q.front ? color + "45" : color + "30";
  ctx.setLineDash([p ? 3 : 2, p ? 3 : 2]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawScallopGhost3D(
  ctx: CanvasRenderingContext2D,
  R: number,
  clockDeg: number,
  widthMm: number,
  heightMm: number,
  vessel: string,
  circ: number,
  az: number,
  el: number,
  ox: number,
  oy: number,
  scale: number,
  p: boolean,
): void {
  const color = VESSEL_COLORS[vessel] ?? "#334155";
  const arcMm = (clockDeg / 360) * circ;
  const qRim = projectSurfacePoint(arcMm, 0, circ, R, az, el, ox, oy, scale);
  const guideTopY = qRim.sy - (p ? 16 : 11);
  const guideBottomY = qRim.sy + (p ? 3 : 2);
  const guideDotR = p ? 2.6 : 1.9;

  ctx.save();
  ctx.setLineDash([p ? 5 : 4, p ? 4 : 3]);
  ctx.strokeStyle = qRim.front ? color + "55" : color + "35";
  ctx.lineWidth = p ? 1.6 : 1.1;
  ctx.beginPath();
  ctx.moveTo(qRim.sx, guideTopY);
  ctx.lineTo(qRim.sx, guideBottomY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(qRim.sx, guideTopY, guideDotR, 0, 2 * Math.PI);
  ctx.fillStyle = qRim.front ? color + "70" : color + "40";
  ctx.fill();
  ctx.restore();
}

// ===========================================================================
// PUBLIC INTERFACE  —  SAME SIGNATURE AS v1, NO CHANGES IN COMPONENTS
// ===========================================================================

export interface GraftSketchOptions {
  ctx:       CanvasRenderingContext2D;
  width:     number;
  height:    number;
  result:    DeviceAnalysisResult;
  caseInput: CaseInput;
  mode?:     "preview" | "print";
  az?:       number;
  el?:       number;
  viewScale?: number;
  viewOffsetX?: number;
  viewOffsetY?: number;
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
  viewScale = 1,
  viewOffsetX = 0,
  viewOffsetY = 0,
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

  const p          = mode === "print";
  const printScale = p ? width / 600 : 1;
  const lw         = Math.round(width  / printScale);
  const lh         = Math.round(height / printScale);

  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
  if (p) ctx.scale(printScale, printScale);

  const margin  = p ? 24 : 20;
  const headerH = p ? 54 : 44;
  const footerH = p ? 42 : 36;

  // Same 52/48 layout split as v1
  const totalBodyW = lw - margin * 2;
  const drawPanelW = Math.round(totalBodyW * 0.52);
  const specPanelX = margin + drawPanelW + (p ? 16 : 14);
  const specPanelW = lw - specPanelX - margin;
  const bodyY      = margin + headerH;
  const bodyH      = lh - bodyY - footerH - margin;

  // -- Header (unchanged from v1) ------------------------------------------
  ctx.fillStyle = "#10211f"; ctx.font = `700 ${p ? 20 : 13}px sans-serif`;
  ctx.fillText(result.device.name, margin, margin + (p ? 22 : 14));
  ctx.fillStyle = "#45605b"; ctx.font = `400 ${p ? 12 : 9}px sans-serif`;
  ctx.fillText(
    `${result.size.graftDiameter} mm · ${result.nPeaks} peaks · ${result.size.sheathFr} Fr · ${result.device.fabricMaterial} · Foreshortening ${(result.device.foreshortening * 100).toFixed(0)}%`,
    margin, margin + (p ? 38 : 24),
  );
  if (caseInput.patientId ?? caseInput.surgeonName) {
    ctx.fillText(
      `Patient: ${caseInput.patientId ?? "—"}   Surgeon: ${caseInput.surgeonName ?? "—"}`,
      margin, margin + (p ? 52 : 34),
    );
  }

  // -- 3-D cylinder setup --------------------------------------------------
  const { ringHeight, interRingGap, nRings, seamDeg } = result.device;
  const circ    = result.circumferenceMm;
  const R       = result.size.graftDiameter / 2;
  const delta   = result.rotation.optimalDeltaMm;

  const maxDepth    = Math.max(
    nRings * ringHeight + (nRings - 1) * interRingGap + 16,
    ...caseInput.fenestrations.map((f) => f.depthMm + 22),
  );
  const annotW      = p ? 68 : 34;
  const cylBodyW    = drawPanelW - annotW - (p ? 14 : 8);
  const supraClear  = p ? 40 : 24;
  const availH      = bodyH - supraClear - (p ? 30 : 20);

  const scale = Math.min(
    cylBodyW / (2 * R),
    p ? availH / (maxDepth * Math.cos(el)) : Math.min(availH / (maxDepth * Math.cos(el)), 3.0),
  );

  const originX = margin + annotW + cylBodyW / 2;
  const originY = bodyY + supraClear;
  const cylW    = R * scale;
  const rimRY   = Math.max(cylW * Math.abs(Math.sin(el)), 2.5);
  const rimTopY = originY;
  const rimBotY = originY + maxDepth * Math.cos(el) * scale;
  const viewBoxX = margin;
  const viewBoxY = bodyY;
  const viewBoxW = drawPanelW;
  const viewBoxH = bodyH;
  const viewCenterX = viewBoxX + viewBoxW / 2;
  const viewCenterY = viewBoxY + viewBoxH / 2;

  // -- Cylinder body -------------------------------------------------------
  ctx.save();
  ctx.beginPath();
  ctx.rect(viewBoxX, viewBoxY, viewBoxW, viewBoxH);
  ctx.clip();
  ctx.translate(viewCenterX + viewOffsetX, viewCenterY + viewOffsetY);
  ctx.scale(viewScale, viewScale);
  ctx.translate(-viewCenterX, -viewCenterY);

  drawCylinderBody(ctx, originX, rimTopY, rimBotY, cylW, rimRY);
  ctx.font = `400 ${p ? 8.5 : 6.5}px sans-serif`;
  drawZoneTints(ctx, originX, rimTopY, cylW, scale, ringHeight, interRingGap, nRings, el, p);

  // Ring labels on right
  {
    let bZ = 0;
    ctx.fillStyle = "rgba(107,114,128,0.65)"; ctx.textAlign = "left";
    for (let r = 0; r < nRings; r++) {
      ctx.fillText(`Ring ${r + 1}`, originX + cylW + (p ? 4 : 3), rimTopY + bZ * Math.cos(el) * scale + ringHeight * Math.cos(el) * scale / 2 + 3);
      bZ += ringHeight + interRingGap;
    }
  }

  // Cylinder walls
  ctx.strokeStyle = "#10211f"; ctx.lineWidth = p ? 2.0 : 1.5;
  ctx.beginPath();
  ctx.moveTo(originX - cylW, rimTopY); ctx.lineTo(originX - cylW, rimBotY);
  ctx.moveTo(originX + cylW, rimTopY); ctx.lineTo(originX + cylW, rimBotY);
  ctx.stroke();

  // Proximal rim ellipse
  ctx.strokeStyle = "#10211f"; ctx.lineWidth = p ? 1.8 : 1.3;
  ctx.beginPath(); ctx.ellipse(originX, rimTopY, cylW, rimRY, 0, 0, 2 * Math.PI); ctx.stroke();
  // Interior gradient fill (3-D depth effect)
  ctx.save();
  ctx.beginPath(); ctx.ellipse(originX, rimTopY, cylW - 1, rimRY - 0.5, 0, 0, 2 * Math.PI);
  const rimGrad = ctx.createRadialGradient(originX, rimTopY - rimRY * 0.4, 0, originX, rimTopY, cylW);
  rimGrad.addColorStop(0, "rgba(185,215,210,0.55)"); rimGrad.addColorStop(1, "rgba(100,140,135,0.18)");
  ctx.fillStyle = rimGrad; ctx.fill(); ctx.restore();

  // Distal rim (lower half solid, upper dashed)
  ctx.strokeStyle = "#333"; ctx.lineWidth = p ? 1.4 : 1.1;
  ctx.beginPath(); ctx.ellipse(originX, rimBotY, cylW, rimRY, 0, 0, Math.PI); ctx.stroke();
  ctx.save(); ctx.setLineDash([p ? 4 : 3, p ? 3 : 2]); ctx.strokeStyle = "rgba(51,51,51,0.28)";
  ctx.beginPath(); ctx.ellipse(originX, rimBotY, cylW, rimRY, 0, Math.PI, 2 * Math.PI); ctx.stroke();
  ctx.restore();

  // -- Covered stent rings -------------------------------------------------
  const strutLW = p ? 2.0 : 1.6;
  drawSurfaceSegments3D(
    ctx,
    result.strutSegments,
    circ,
    R,
    az,
    el,
    originX,
    originY,
    scale,
    result.device.color,
    strutLW,
  );

  // -- Suprarenal stent ----------------------------------------------------
  drawSuprarenal(
    ctx, R, result.nPeaks, 0, circ, az, el, originX, originY, scale,
    result.device.color,
    result.device.id === "treo" ? "crown" : result.device.hasBareSuprarenal ? "zstent" : "none",
  );

  // -- Infrarenal barbs (TREO valley barbs) --------------------------------
  if (result.device.hasInfrarenalBarbs) {
    const dt = (2 * Math.PI) / result.nPeaks;
    const dTheta = 0;
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

  // -- Gold radiopaque markers (Zenith Alpha) -------------------------------
  if (result.device.id === "zenith_alpha") {
    const dTheta = 0;
    ctx.save(); ctx.fillStyle = "#d97706";
    for (const frac of [0, 0.25, 0.5, 0.75]) {
      const theta = dTheta + frac * 2 * Math.PI;
      const q = project3D(R * Math.sin(theta), R * Math.cos(theta), 2, az, el, originX, originY, scale);
      if (q.d < 0) continue;
      ctx.beginPath(); ctx.arc(q.sx, q.sy, Math.max(2.5, scale * 0.12), 0, 2 * Math.PI); ctx.fill();
    }
    ctx.restore();
  }

  // -- Diameter callout ----------------------------------------------------
  const diaY = rimTopY - rimRY - (p ? 18 : 12);
  ctx.strokeStyle = "#10211f"; ctx.lineWidth = p ? 1.4 : 1.0;
  ctx.beginPath();
  ctx.moveTo(originX - cylW, diaY); ctx.lineTo(originX + cylW, diaY);
  ctx.moveTo(originX - cylW, diaY - (p?5:3)); ctx.lineTo(originX - cylW, diaY + (p?5:3));
  ctx.moveTo(originX + cylW, diaY - (p?5:3)); ctx.lineTo(originX + cylW, diaY + (p?5:3));
  ctx.stroke();
  ctx.fillStyle = "#10211f"; ctx.font = `700 ${p ? 13 : 9}px sans-serif`; ctx.textAlign = "center";
  ctx.fillText(`Ø ${result.size.graftDiameter} mm`, originX, diaY - (p ? 7 : 4));
  ctx.textAlign = "left";

  // -- Clock guide labels at proximal rim ----------------------------------
  ctx.font = `600 ${p ? 9 : 6.5}px sans-serif`; ctx.textAlign = "center";
  for (const [label, deg] of [["12:00 (A)", 0], ["3:00", 90], ["9:00", 270]] as [string, number][]) {
    const theta = (deg / 360) * 2 * Math.PI;
    const q = project3D(R * Math.sin(theta), R * Math.cos(theta), 0, az, el, originX, originY, scale);
    if (q.d < 0) continue;
    ctx.fillStyle = "#374151";
    ctx.fillText(label, q.sx, rimTopY - rimRY - (p ? 8 : 5));
    ctx.strokeStyle = "rgba(0,0,0,0.08)"; ctx.lineWidth = 0.4; ctx.setLineDash([p?4:3, p?3:2]);
    ctx.beginPath(); ctx.moveTo(q.sx, rimTopY); ctx.lineTo(q.sx, rimBotY); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.textAlign = "left";

  // -- Fenestrations --------------------------------------------------------
  const dimLines: { sy: number; label: string; color: string }[] = [];
  caseInput.fenestrations.forEach((fen, idx) => {
    const conflict    = result.optimalConflicts[idx];
    const isConflict  = conflict?.conflict ?? false;
    const adjClock    = conflict?.adjustedClock ?? fen.clock;
    const originalClockDeg = (clockToArc(fen.clock, circ) / circ) * 360;
    const clockDeg    = (clockToArc(adjClock, circ) / circ) * 360;
    const isStrFree   = !isConflict && fen.ftype !== "SCALLOP"
      && isInInterRingGap(fen.depthMm, ringHeight, interRingGap, nRings);

    if (adjClock !== fen.clock) {
      if (fen.ftype === "SCALLOP") {
        drawScallopGhost3D(
          ctx,
          R,
          originalClockDeg,
          fen.widthMm,
          fen.heightMm,
          fen.vessel,
          circ,
          az,
          el,
          originX,
          originY,
          scale,
          p,
        );
      } else {
        drawFenestrationGhost3D(
          ctx,
          R,
          originalClockDeg,
          fen.depthMm,
          fen.widthMm,
          fen.heightMm,
          fen.vessel,
          circ,
          az,
          el,
          originX,
          originY,
          scale,
          p,
        );
      }
    }

    const dl = drawFenestration3D(
      ctx, R, clockDeg, fen.depthMm, fen.widthMm, fen.heightMm,
      fen.vessel, fen.ftype, isConflict, conflict?.minDist ?? 0, isStrFree,
      circ, az, el, originX, originY, scale, p,
    );
    if (dl) dimLines.push(dl);
  });

  // -- Depth dimension lines (Cook CMD style) -------------------------------
  {
    const colW = p ? 14 : 10, arrowSz = p ? 3.5 : 2.5;
    dimLines.forEach(({ sy, label, color }, i) => {
      const dimX = originX - cylW - (p ? 10 : 7) - i * colW;
      ctx.strokeStyle = color; ctx.lineWidth = p ? 1.2 : 0.9;
      ctx.beginPath(); ctx.moveTo(dimX, rimTopY); ctx.lineTo(dimX, sy); ctx.stroke();
      ctx.fillStyle = color;
      drawArrow(ctx, dimX, rimTopY, "up",   arrowSz);
      drawArrow(ctx, dimX, sy,      "down", arrowSz);
      ctx.strokeStyle = `${color}50`; ctx.lineWidth = 0.5; ctx.setLineDash([p?3:2, p?2:1.5]);
      ctx.beginPath();
      ctx.moveTo(dimX, rimTopY); ctx.lineTo(originX - cylW, rimTopY);
      ctx.moveTo(dimX, sy);      ctx.lineTo(originX - cylW, sy);
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.font = `700 ${p ? 11 : 8}px sans-serif`; ctx.textAlign = "right";
      ctx.fillText(label, dimX - (p ? 3 : 2), (rimTopY + sy) / 2 + 4);
      ctx.textAlign = "left";
    });
  }

  // -- Bifurcation hint ----------------------------------------------------
  {
    const legLen = Math.min(p ? 22 : 14, lh - rimBotY - 12);
    if (legLen > 4) {
      ctx.setLineDash([p?4:3, p?3:2]); ctx.strokeStyle = "rgba(16,33,31,0.48)"; ctx.lineWidth = p?1.6:1.2;
      ctx.beginPath();
      ctx.moveTo(originX - cylW, rimBotY); ctx.lineTo(originX - cylW * 0.30, rimBotY + legLen);
      ctx.moveTo(originX + cylW, rimBotY); ctx.lineTo(originX + cylW * 0.30, rimBotY + legLen);
      ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // -- Depth axis ----------------------------------------------------------
  ctx.fillStyle = "#374151"; ctx.font = `400 ${p?9:7}px sans-serif`;
  ctx.strokeStyle = "rgba(55,65,81,0.40)"; ctx.lineWidth = 0.6; ctx.textAlign = "right";
  for (let d = 0; d <= maxDepth; d += 10) {
    const gy = rimTopY + d * Math.cos(el) * scale;
    if (gy > rimBotY + 6) break;
    ctx.beginPath(); ctx.moveTo(originX - cylW - (p?3:2), gy); ctx.lineTo(originX - cylW, gy); ctx.stroke();
    ctx.fillText(`${d}`, originX - cylW - (p?5:4), gy + 3);
  }
  ctx.textAlign = "left";
  ctx.save();
  ctx.translate(originX - cylW - (p?22:14), rimTopY + (rimBotY - rimTopY) / 2);
  ctx.rotate(-Math.PI / 2); ctx.font = `400 ${p?7.5:6}px sans-serif`;
  ctx.fillStyle = "#374151"; ctx.textAlign = "center";
  ctx.fillText("Distance from proximal edge (mm)", 0, 0);
  ctx.restore();
  ctx.restore();

  // ==========================================================================
  // SPEC PANEL — exact copy from v1, no changes
  // ==========================================================================

  const lineH = p ? 15 : 12;
  let sy      = bodyY + (p ? 6 : 4);
  const sw    = specPanelW;

  ctx.fillStyle = "#111827"; ctx.font = `700 ${p?14:10}px sans-serif`;
  ctx.fillText("ROTATION PLAN", specPanelX, sy); sy += lineH * 1.3;
  ctx.fillStyle = "#0f766e"; ctx.font = `600 ${p?11:9}px sans-serif`;
  sy = wrapText(ctx, getRotationSummary(result), specPanelX, sy, sw, lineH, 4);
  sy += lineH * 0.8;
  ctx.fillStyle = "#45605b"; ctx.font = `400 ${p?10:8}px sans-serif`;
  sy = wrapText(
    ctx,
    "Colored footprint outlines show the current punch size. Small dashed targets mark the original anatomy positions when rotation shifts a fenestration.",
    specPanelX,
    sy,
    sw,
    lineH,
    4,
  );
  sy += lineH * 0.5;
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

    ctx.fillStyle = color; ctx.font = `700 ${p?12:9}px sans-serif`;
    ctx.fillText(typeLabel, specPanelX, sy); sy += lineH;

    if (fen.ftype !== "SCALLOP") {
      const arcSep   = computeArcSep(adjClock, seamDeg, delta, circ);
      const isStrFree = !isConflicted && isInInterRingGap(fen.depthMm, ringHeight, interRingGap, nRings);
      if (isStrFree) {
        ctx.fillStyle = "#0f766e"; ctx.font = `700 ${p?11:8}px sans-serif`;
        ctx.fillText("**Strut Free**", specPanelX + (p?6:4), sy); sy += lineH;
      } else if (isConflicted) {
        ctx.fillStyle = "#dc2626"; ctx.font = `700 ${p?11:8}px sans-serif`;
        ctx.fillText(`⚠ Conflict — min clearance ${conflict.minDist.toFixed(1)} mm`, specPanelX + (p?6:4), sy); sy += lineH;
      }
      ctx.fillStyle = "#334155"; ctx.font = `400 ${p?11:9}px sans-serif`;
      for (const line of [
        `WIDTH: ${fen.widthMm} mm`, `HEIGHT: ${fen.heightMm} mm`,
        `DIST FROM PROX EDGE: ${fen.depthMm} mm`,
        `CLOCK: ${adjClock} (ARCSEP: ${arcSep > 0 ? "+" : ""}${arcSep.toFixed(1)} mm)`,
        `Original clock: ${fen.clock}`,
      ]) { ctx.fillText(line, specPanelX + (p?6:4), sy); sy += lineH; }
    } else {
      ctx.fillStyle = "#334155"; ctx.font = `400 ${p?11:9}px sans-serif`;
      for (const line of [
        `WIDTH: ${fen.widthMm} mm`, `HEIGHT: ${fen.heightMm} mm`,
        `CLOCK: ${adjClock}`, `Original clock: ${fen.clock}`,
      ]) { ctx.fillText(line, specPanelX + (p?6:4), sy); sy += lineH; }
    }
    sy += lineH * 0.5;
  });

  sy += lineH * 0.5;
  ctx.strokeStyle = "rgba(16,33,31,0.15)"; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(specPanelX, sy); ctx.lineTo(specPanelX + sw, sy); ctx.stroke();
  sy += lineH;

  ctx.fillStyle = "#10211f"; ctx.font = `700 ${p?12:9}px sans-serif`;
  ctx.fillText("DEVICE", specPanelX, sy); sy += lineH;
  ctx.fillStyle = "#334155"; ctx.font = `400 ${p?11:9}px sans-serif`;
  const deviceLines: string[] = [
    `Sheath: ${result.size.sheathFr} Fr`,
    `Foreshortening: ${(result.device.foreshortening * 100).toFixed(1)}%`,
    `Fabric: ${result.device.fabricMaterial}`,
    `Seam: ${seamDeg === 0 ? "12:00 anterior" : seamDeg === 180 ? "6:00 posterior" : `${seamDeg}°`}`,
    `Stent type: ${result.device.stentType}`,
    `PMEG suitability: ${result.device.pmegSuitability}/4`,
  ];
  const dev = result.device;
  if (dev.hasBareSuprarenal) deviceLines.push("Bare suprarenal stent: YES (barbs)");
  if (dev.hasInfrarenalBarbs) deviceLines.push("Infrarenal barbs: YES (valley barbs)");
  if (dev.minNeckLengthMm      != null) deviceLines.push(`Min neck length (IFU): ${dev.minNeckLengthMm} mm`);
  if (dev.maxInfrarenalAngleDeg != null) deviceLines.push(`Max infrarenal angle (IFU): ${dev.maxInfrarenalAngleDeg}°`);
  if (dev.maxSuprarenalAngleDeg != null) deviceLines.push(`Max suprarenal angle (IFU): ${dev.maxSuprarenalAngleDeg}°`);
  for (const line of deviceLines) { ctx.fillText(line, specPanelX + (p?6:4), sy); sy += lineH; }

  if (caseInput.surgeonNote) {
    sy += lineH * 0.5;
    ctx.fillStyle = "#45605b"; ctx.font = `400 italic ${p?10:8}px sans-serif`;
    sy = wrapText(ctx, `Note: ${caseInput.surgeonNote}`, specPanelX, sy, sw, lineH, 4);
  }

  // -- Footer (unchanged from v1) -------------------------------------------
  const footerY = lh - footerH + (p ? 14 : 8);
  ctx.strokeStyle = "rgba(16,33,31,0.15)"; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(margin, footerY - (p?8:6)); ctx.lineTo(lw - margin, footerY - (p?8:6)); ctx.stroke();
  ctx.fillStyle = "#45605b"; ctx.font = `400 ${p?9:8}px sans-serif`;
  ctx.fillText("For research and planning use only. All clinical decisions remain the surgeon’s responsibility. Not to scale.", margin, footerY);
  ctx.fillText(`PMEGplan.io  •  ${new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}`, margin, footerY + (p?12:10));
  if (p) {
    ctx.fillText("Signature: ___________________________   Date: ___________", lw / 2 - 10, footerY);
  }
}
