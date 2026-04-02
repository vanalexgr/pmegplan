/**
 * PMEGplan.io — Cook CMD-style Graft Sketch Renderer
 *
 * Renders a vertical front-elevation drawing of the proximal graft body,
 * modelled on Cook Medical Custom-Made Device planning sheets.
 *
 * Coordinate convention (matches Cook CMD, caudal-to-cranial view):
 *   12:00 = anterior = centre of drawing
 *   3:00  = patient LEFT  = right quarter
 *   9:00  = patient RIGHT = left quarter
 *   6:00  = posterior     = left/right edges (seam for Zenith Alpha)
 */

import { clockToArc, wrapMm } from "@/lib/conflictDetection";
import { getRotationSummary } from "@/lib/analysis";
import type { CaseInput, DeviceAnalysisResult, StrutSegment } from "@/lib/types";

// ── Colour map ────────────────────────────────────────────────────────────────

const VESSEL_COLORS: Record<string, string> = {
  SMA: "#b45309",
  LRA: "#1d4ed8",
  RRA: "#6d28d9",
  CELIAC: "#b91c1c",
  LMA: "#0f766e",
  CUSTOM: "#334155",
};

// ── Coordinate helpers ────────────────────────────────────────────────────────

/**
 * Convert arc position (0 = 12:00, clockwise) to signed arc from noon.
 * Returns value in [-circ/2, +circ/2]: positive = clockwise (right side of sketch).
 */
function arcFromNoon(arcPos: number, circ: number): number {
  const w = wrapMm(arcPos, circ);
  return w > circ / 2 ? w - circ : w;
}

/** Clock string → signed arc-from-noon (mm). */
function clockToDrawArc(clock: string, circ: number): number {
  return arcFromNoon(clockToArc(clock, circ), circ);
}

/** Arc-from-noon → pixel X in sketch drawing area. */
function toDrawX(
  arcPos: number,
  delta: number,
  circ: number,
  centerX: number,
  xScale: number,
): number {
  return centerX + arcFromNoon(wrapMm(arcPos + delta, circ), circ) * xScale;
}

// ── ARCSEP helper ─────────────────────────────────────────────────────────────

/**
 * Arc separation from seam to fenestration, in mm.
 * Positive = counterclockwise from seam, negative = clockwise.
 * (Cook CMD convention.)
 */
function computeArcSep(
  adjustedClock: string,
  seamDeg: number,
  optimalDeltaMm: number,
  circ: number,
): number {
  const fenArc = wrapMm(clockToArc(adjustedClock, circ), circ);
  const seamArc = wrapMm((seamDeg / 360) * circ + optimalDeltaMm, circ);
  let sep = fenArc - seamArc;
  if (sep > circ / 2) sep -= circ;
  if (sep < -circ / 2) sep += circ;
  return sep;
}

// ── Strut-zone helpers ────────────────────────────────────────────────────────

function isInInterRingGap(
  depthMm: number,
  ringHeight: number,
  interRingGap: number,
  nRings: number,
): boolean {
  let y = 0;
  for (let i = 0; i < nRings - 1; i++) {
    y += ringHeight;
    if (depthMm >= y && depthMm <= y + interRingGap) return true;
    y += interRingGap;
  }
  return false;
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: "up" | "down",
  size: number,
) {
  ctx.beginPath();
  if (direction === "up") {
    ctx.moveTo(x, y);
    ctx.lineTo(x - size / 2, y + size);
    ctx.lineTo(x + size / 2, y + size);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x - size / 2, y - size);
    ctx.lineTo(x + size / 2, y - size);
  }
  ctx.closePath();
  ctx.fill();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 6,
): number {
  const words = text.split(" ");
  let line = "";
  let y = startY;
  let lineCount = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      lineCount++;
      line = word;
      if (lineCount >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line) { ctx.fillText(line, x, y); y += lineHeight; }
  return y;
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export interface GraftSketchOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  result: DeviceAnalysisResult;
  caseInput: CaseInput;
  mode?: "preview" | "print";
}

export function renderGraftSketch({
  ctx,
  width,
  height,
  result,
  caseInput,
  mode = "preview",
}: GraftSketchOptions): void {
  ctx.clearRect(0, 0, width, height);

  if (!result.size) {
    const s = mode === "print" ? width / 600 : 1;
    ctx.fillStyle = "#f8f4ed";
    ctx.fillRect(0, 0, width, height);
    if (s !== 1) ctx.scale(s, s);
    ctx.fillStyle = "#45605b";
    ctx.font = "400 14px sans-serif";
    ctx.fillText("No compatible graft size for this anatomy.", 24, 40);
    return;
  }

  const p = mode === "print";

  // ── Scale setup ─────────────────────────────────────────────────────────────
  // For print mode the canvas is 2480×3508 (300 DPI A4 portrait).
  // All layout constants and font sizes are written for a ~600px logical width.
  // We apply ctx.scale so the renderer works in logical coordinates and the
  // high-res canvas is filled correctly.
  const printScale = p ? width / 600 : 1;
  const lw = Math.round(width / printScale);   // logical width  (≈600 for print)
  const lh = Math.round(height / printScale);  // logical height (≈850 for print)

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);           // fill at native resolution
  if (p) ctx.scale(printScale, printScale);    // scale AFTER background fill

  const margin = p ? 24 : 20;
  const headerH = p ? 54 : 44;
  const footerH = p ? 42 : 36;

  // Layout: ~52% drawing | ~48% specs
  const totalBodyW = lw - margin * 2;
  const drawPanelW = Math.round(totalBodyW * 0.52);
  const specPanelX = margin + drawPanelW + (p ? 16 : 14);
  const specPanelW = lw - specPanelX - margin;
  const bodyY = margin + headerH;
  const bodyH = lh - bodyY - footerH - margin;

  // ── Header ──────────────────────────────────────────────────────────────────
  ctx.fillStyle = "#10211f";
  ctx.font = `700 ${p ? 20 : 13}px sans-serif`;
  ctx.fillText(result.device.name, margin, margin + (p ? 22 : 14));
  ctx.fillStyle = "#45605b";
  ctx.font = `400 ${p ? 12 : 9}px sans-serif`;
  ctx.fillText(
    `${result.size.graftDiameter} mm • ${result.nPeaks} peaks • ${result.size.sheathFr} Fr sheath • ${result.device.fabricMaterial} • Foreshortening ${(result.device.foreshortening * 100).toFixed(0)}%`,
    margin,
    margin + (p ? 38 : 24),
  );
  if (caseInput.patientId || caseInput.surgeonName) {
    ctx.fillText(
      `Patient: ${caseInput.patientId || "—"}   Surgeon: ${caseInput.surgeonName || "—"}`,
      margin,
      margin + (p ? 52 : 34),
    );
  }

  // ── Graft body geometry setup ────────────────────────────────────────────────
  const circ = result.circumferenceMm;
  const delta = result.rotation.optimalDeltaMm;
  const { ringHeight, interRingGap, nRings, seamDeg } = result.device;

  // Horizontal: graft body spans full circumference centred at 12:00
  const annotationLW = p ? 72 : 36; // space left of graft body for depth annotations
  const graftBodyW = drawPanelW - annotationLW - (p ? 16 : 8);
  const xScale = graftBodyW / circ;
  const graftBodyX = margin + annotationLW;       // left edge of graft body = 6:00
  const graftBodyCX = graftBodyX + graftBodyW / 2; // centre = 12:00

  // Vertical: show all rings + fenestrations
  const sealZoneH = nRings * ringHeight + (nRings - 1) * interRingGap;
  const maxDepth = Math.max(
    sealZoneH + 15,
    ...caseInput.fenestrations.map((f) => f.depthMm + 20),
  );
  const graftBodyY = bodyY + (p ? 36 : 28); // proximal edge y (space for Ø callout + bare stent)
  const availH = bodyH - (p ? 38 : 30);    // available height for graft body
  // Fill available height in print; cap at 3.0 px/mm on screen to avoid overflow
  const yScale = p ? availH / maxDepth : Math.min(availH / maxDepth, 3.0);
  const graftBodyH = maxDepth * yScale;

  // ── Diameter callout ─────────────────────────────────────────────────────────
  const diaY = graftBodyY - (p ? 24 : 14);
  ctx.strokeStyle = "#10211f";
  ctx.lineWidth = p ? 1.5 : 1;
  ctx.beginPath();
  ctx.moveTo(graftBodyX, diaY);
  ctx.lineTo(graftBodyX + graftBodyW, diaY);
  ctx.moveTo(graftBodyX, diaY - 5);
  ctx.lineTo(graftBodyX, diaY + 5);
  ctx.moveTo(graftBodyX + graftBodyW, diaY - 5);
  ctx.lineTo(graftBodyX + graftBodyW, diaY + 5);
  ctx.stroke();
  ctx.fillStyle = "#10211f";
  ctx.font = `600 ${p ? 13 : 9}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(`Ø${result.size.graftDiameter}`, graftBodyCX, diaY - (p ? 8 : 5));
  ctx.textAlign = "left";

  // ── Graft side walls ─────────────────────────────────────────────────────────
  ctx.strokeStyle = "#10211f";
  ctx.lineWidth = p ? 2.2 : 1.5;
  ctx.beginPath();
  ctx.moveTo(graftBodyX, graftBodyY);
  ctx.lineTo(graftBodyX, graftBodyY + graftBodyH);
  ctx.moveTo(graftBodyX + graftBodyW, graftBodyY);
  ctx.lineTo(graftBodyX + graftBodyW, graftBodyY + graftBodyH);
  ctx.stroke();

  // Opening at bottom (bifurcation hint: slight inward taper)
  ctx.strokeStyle = "rgba(16,33,31,0.25)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(graftBodyX, graftBodyY + graftBodyH);
  ctx.lineTo(graftBodyX + graftBodyW * 0.35, graftBodyY + graftBodyH + (p ? 14 : 8));
  ctx.moveTo(graftBodyX + graftBodyW, graftBodyY + graftBodyH);
  ctx.lineTo(graftBodyX + graftBodyW * 0.65, graftBodyY + graftBodyH + (p ? 14 : 8));
  ctx.stroke();
  ctx.setLineDash([]);

  // ── Ring zones: fabric hatching + gap labels (Cook CMD / publication style) ──
  // Ring zones: diagonal crosshatch = woven polyester fabric
  // Inter-ring gaps: white (strut-free, no hatching)
  {
    const hatchSpacing = p ? 5 : 4;  // pixels between hatch lines
    const hatchColor = "rgba(0,0,0,0.18)";

    let y = 0;
    for (let ri = 0; ri < nRings; ri++) {
      const rTop = graftBodyY + y * yScale;
      const rH = ringHeight * yScale;

      // Clip to this ring band and draw diagonal hatch
      ctx.save();
      ctx.beginPath();
      ctx.rect(graftBodyX + 1, rTop, graftBodyW - 2, rH);
      ctx.clip();
      ctx.strokeStyle = hatchColor;
      ctx.lineWidth = p ? 0.7 : 0.6;
      // Diagonal lines at 45° across band
      const diagRange = graftBodyW + rH;
      for (let d = -rH; d < graftBodyW + rH; d += hatchSpacing) {
        ctx.beginPath();
        ctx.moveTo(graftBodyX + d, rTop);
        ctx.lineTo(graftBodyX + d + rH, rTop + rH);
        ctx.stroke();
      }
      // Cross-hatch (other direction) for polyester fabric texture
      for (let d = -rH; d < graftBodyW + rH; d += hatchSpacing) {
        ctx.beginPath();
        ctx.moveTo(graftBodyX + d + rH, rTop);
        ctx.lineTo(graftBodyX + d, rTop + rH);
        ctx.stroke();
      }
      ctx.restore();

      // Ring label on RIGHT side
      ctx.fillStyle = "#6b7280";
      ctx.font = `400 ${p ? 9 : 7}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(`Ring ${ri + 1}`, graftBodyX + graftBodyW + (p ? 5 : 3), rTop + rH / 2 + 3);

      y += ringHeight;
      if (ri < nRings - 1) {
        const gTop = graftBodyY + y * yScale;
        const gH = interRingGap * yScale;
        if (gH > (p ? 10 : 7)) {
          ctx.fillStyle = "#374151";
          ctx.font = `400 italic ${p ? 9 : 7}px sans-serif`;
          ctx.textAlign = "left";
          ctx.fillText(`gap ${interRingGap}mm`, graftBodyX + graftBodyW + (p ? 5 : 3), gTop + gH / 2 + 3);
        }
        y += interRingGap;
      }
    }
    ctx.textAlign = "left";
  }

  // ── Depth tick marks on left axis (no grid, just ticks + numbers) ────────────
  ctx.fillStyle = "#374151";
  ctx.font = `400 ${p ? 9 : 7}px sans-serif`;
  ctx.textAlign = "right";
  for (let d = 0; d <= maxDepth; d += 10) {
    const gy = graftBodyY + d * yScale;
    if (gy > graftBodyY + graftBodyH + 5) break;
    // Short tick at graft edge
    ctx.strokeStyle = "#374151";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(graftBodyX - (p ? 3 : 2), gy);
    ctx.lineTo(graftBodyX, gy);
    ctx.stroke();
    ctx.fillText(`${d}`, graftBodyX - (p ? 6 : 4), gy + 3);
  }
  ctx.textAlign = "left";

  // ── Clock position labels & thin guide lines at top ──────────────────────────
  const clockGuides = [
    { label: "9:00", arcD: -circ / 4 },
    { label: "12:00", arcD: 0 },
    { label: "3:00", arcD: circ / 4 },
  ];
  ctx.font = `600 ${p ? 10 : 7}px sans-serif`;
  ctx.textAlign = "center";
  for (const { label, arcD } of clockGuides) {
    const gx = graftBodyCX + arcD * xScale;
    if (gx < graftBodyX || gx > graftBodyX + graftBodyW) continue;
    ctx.fillStyle = "#374151";
    ctx.fillText(label, gx, graftBodyY - (p ? 9 : 6));
    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.lineWidth = 0.4;
    ctx.setLineDash([p ? 4 : 3, p ? 3 : 2]);
    ctx.beginPath();
    ctx.moveTo(gx, graftBodyY);
    ctx.lineTo(gx, graftBodyY + graftBodyH);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.textAlign = "left";

  // ── Z-stent struts (reuse precomputed segments, apply rotation & centering) ──
  const waveWidth = circ / result.nPeaks;
  const supraH = p ? 26 : 16; // pixel height of suprarenal bare stent zone above fabric

  ctx.save();
  // Clip region: include suprarenal zone above graft body
  ctx.beginPath();
  ctx.rect(graftBodyX, graftBodyY - supraH - 2, graftBodyW + 2, graftBodyH + supraH + 6);
  ctx.clip();

  // Draw strut wires on top of hatching — white outline first for contrast
  const strutLW = p ? 2.0 : 1.5;
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? "#ffffff" : "rgba(15,23,42,0.88)";
    ctx.lineWidth = pass === 0 ? strutLW + (p ? 2 : 1.5) : strutLW;
    for (const [ax, ay, bx, by] of result.strutSegments as StrutSegment[]) {
      for (const copy of [-1, 0, 1]) {
        const dax = graftBodyCX + arcFromNoon(wrapMm(ax + delta, circ), circ) * xScale + copy * graftBodyW;
        const dbx = graftBodyCX + arcFromNoon(wrapMm(bx + delta, circ), circ) * xScale + copy * graftBodyW;
        const day = graftBodyY + ay * yScale;
        const dby = graftBodyY + by * yScale;
        if (Math.max(dax, dbx) < graftBodyX - 4 || Math.min(dax, dbx) > graftBodyX + graftBodyW + 4) continue;
        ctx.beginPath();
        ctx.moveTo(dax, day);
        ctx.lineTo(dbx, dby);
        ctx.stroke();
      }
    }
  }

  // ── Suprarenal bare stent ─────────────────────────────────────────────────────
  // Drawn above the fabric proximal edge — bare = no hatching, dashed outline
  if (result.device.hasBareSuprarenal) {
    const isTREO = result.device.id === "treo";

    if (isTREO) {
      // TREO suprarenal: open crown stent (rounded arches, like IFU diagram)
      // Drawn as scalloped arcs across the top
      ctx.strokeStyle = "rgba(15,23,42,0.78)";
      ctx.lineWidth = p ? 1.5 : 1.1;
      for (let pk = 0; pk < result.nPeaks; pk++) {
        const arcA = wrapMm(pk * waveWidth + delta, circ);
        const arcB = wrapMm((pk + 0.5) * waveWidth + delta, circ);
        const arcC = wrapMm((pk + 1) * waveWidth + delta, circ);
        for (const copy of [-1, 0, 1]) {
          const xa = graftBodyCX + arcFromNoon(arcA, circ) * xScale + copy * graftBodyW;
          const xb = graftBodyCX + arcFromNoon(arcB, circ) * xScale + copy * graftBodyW;
          const xc = graftBodyCX + arcFromNoon(arcC, circ) * xScale + copy * graftBodyW;
          if (Math.max(xa, xc) < graftBodyX || Math.min(xa, xc) > graftBodyX + graftBodyW) continue;
          // Arch: two lines meeting at the peak, slightly curved
          const archH = supraH * 0.85;
          ctx.beginPath();
          ctx.moveTo(xa, graftBodyY);
          ctx.quadraticCurveTo(xb, graftBodyY - archH, xc, graftBodyY);
          ctx.stroke();
        }
      }
      // Small dots at arch bases (TREO crown stent foot points)
      ctx.fillStyle = "rgba(15,23,42,0.70)";
      for (let pk = 0; pk < result.nPeaks; pk++) {
        const footArc = wrapMm(pk * waveWidth + delta, circ);
        const fx = graftBodyCX + arcFromNoon(footArc, circ) * xScale;
        if (fx < graftBodyX + 1 || fx > graftBodyX + graftBodyW - 1) continue;
        ctx.beginPath();
        ctx.arc(fx, graftBodyY, p ? 2.5 : 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Zenith Alpha / Endurant II: Z-stent bare suprarenal, dashed (no fabric)
      ctx.strokeStyle = "rgba(15,23,42,0.75)";
      ctx.lineWidth = p ? 1.5 : 1.1;
      ctx.setLineDash([p ? 4 : 3, p ? 2.5 : 2]);
      for (let pk = 0; pk < result.nPeaks * 2; pk++) {
        const arcA = (pk * waveWidth) / 2 + delta;
        const arcB = ((pk + 1) * waveWidth) / 2 + delta;
        for (const copy of [-1, 0, 1]) {
          const xa = graftBodyCX + arcFromNoon(wrapMm(arcA, circ), circ) * xScale + copy * graftBodyW;
          const xb = graftBodyCX + arcFromNoon(wrapMm(arcB, circ), circ) * xScale + copy * graftBodyW;
          if (Math.max(xa, xb) < graftBodyX || Math.min(xa, xb) > graftBodyX + graftBodyW) continue;
          const yA = pk % 2 === 0 ? graftBodyY : graftBodyY - supraH;
          const yB = pk % 2 === 0 ? graftBodyY - supraH : graftBodyY;
          ctx.beginPath();
          ctx.moveTo(xa, yA);
          ctx.lineTo(xb, yB);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }

    // Fixation barbs at cranial peaks
    ctx.strokeStyle = "rgba(15,23,42,0.85)";
    ctx.lineWidth = p ? 1.4 : 1.0;
    const barbLen = p ? 10 : 6;
    for (let pk = 0; pk < result.nPeaks; pk++) {
      const peakArc = pk * waveWidth + delta;
      for (const copy of [-1, 0, 1]) {
        const px = graftBodyCX + arcFromNoon(wrapMm(peakArc, circ), circ) * xScale + copy * graftBodyW;
        if (px < graftBodyX + 1 || px > graftBodyX + graftBodyW - 1) continue;
        const topY = result.device.id === "treo" ? graftBodyY - supraH * 0.85 : graftBodyY - supraH;
        ctx.beginPath();
        ctx.moveTo(px, topY);
        ctx.lineTo(px - barbLen * 0.5, topY - barbLen);
        ctx.stroke();
      }
    }
  } else {
    // No bare stent: simple anchor ticks at proximal fabric edge
    ctx.strokeStyle = "rgba(15,23,42,0.65)";
    ctx.lineWidth = p ? 1.2 : 0.9;
    const barbLen = p ? 8 : 5;
    for (let pk = 0; pk < result.nPeaks; pk++) {
      const peakArc = pk * waveWidth + delta;
      const px = graftBodyCX + arcFromNoon(wrapMm(peakArc, circ), circ) * xScale;
      if (px < graftBodyX + 2 || px > graftBodyX + graftBodyW - 2) continue;
      ctx.beginPath();
      ctx.moveTo(px, graftBodyY);
      ctx.lineTo(px - barbLen * 0.45, graftBodyY - barbLen);
      ctx.stroke();
    }
  }

  // ── Infrarenal barbs (TREO valley barbs, black ticks) ────────────────────────
  if (result.device.hasInfrarenalBarbs) {
    ctx.strokeStyle = "rgba(15,23,42,0.85)";
    ctx.lineWidth = p ? 1.3 : 0.9;
    const irbLen = p ? 7 : 5;
    const valleyY = graftBodyY + ringHeight * yScale;
    for (let v = 0; v < result.nPeaks; v++) {
      const valleyArc = (v + 0.5) * waveWidth + delta;
      const vx = graftBodyCX + arcFromNoon(wrapMm(valleyArc, circ), circ) * xScale;
      if (vx < graftBodyX + 2 || vx > graftBodyX + graftBodyW - 2) continue;
      ctx.beginPath();
      ctx.moveTo(vx, valleyY);
      ctx.lineTo(vx, valleyY + irbLen);
      ctx.stroke();
    }
  }

  ctx.restore();

  // ── Gold markers (Zenith Alpha: 4 markers circumferentially at proximal fabric edge) ──
  if (result.device.id === "zenith_alpha") {
    ctx.fillStyle = "#d97706"; // gold
    const markerR = p ? 3.5 : 2.5;
    const markerY = graftBodyY + (p ? 4 : 3); // within 2 mm of proximal fabric edge
    const markerPositions = [0, circ / 4, circ / 2, (3 * circ) / 4];
    for (const arc of markerPositions) {
      const mx = graftBodyCX + arcFromNoon(wrapMm(arc + delta, circ), circ) * xScale;
      if (mx < graftBodyX + markerR || mx > graftBodyX + graftBodyW - markerR) continue;
      ctx.beginPath();
      ctx.arc(mx, markerY, markerR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Callout labels (left of graft body, Cook CMD style) ─────────────────────
  const calloutX = graftBodyX - (p ? 5 : 3);
  ctx.font = `400 ${p ? 10 : 7}px sans-serif`;
  ctx.textAlign = "right";

  if (result.device.hasBareSuprarenal) {
    ctx.fillStyle = "#374151";
    ctx.fillText("Barbs", calloutX, graftBodyY - supraH - (p ? 2 : 1));
    ctx.fillText("Bare stent", calloutX, graftBodyY - supraH / 2 + 3);
  } else {
    ctx.fillStyle = "#374151";
    ctx.fillText("Anchors", calloutX, graftBodyY - (p ? 8 : 5));
  }

  if (result.device.id === "zenith_alpha") {
    // "LONG GOLD MARKERS" label at the marker level (within 2mm of fabric edge)
    ctx.fillStyle = "#d97706";
    ctx.font = `600 ${p ? 10 : 7}px sans-serif`;
    ctx.fillText("Long Gold", calloutX, graftBodyY + (p ? 5 : 3));
    ctx.fillText("Markers", calloutX, graftBodyY + (p ? 15 : 10));
    ctx.font = `400 ${p ? 10 : 7}px sans-serif`;
  }

  if (result.device.hasInfrarenalBarbs) {
    ctx.fillStyle = "#0f766e";
    ctx.fillText("Infrarenal", calloutX, graftBodyY + ringHeight * yScale - (p ? 3 : 2));
    ctx.fillText("barbs", calloutX, graftBodyY + ringHeight * yScale + (p ? 8 : 5));
  }

  ctx.fillStyle = "#374151";
  ctx.textAlign = "left";

  // ── Seam lines (Cook CMD: thick red dashed, full height) ────────────────────
  // Draw seam BEFORE struts so it sits behind the wire drawing
  const seamArcRaw = (seamDeg / 360) * circ;
  const seamArcRotated = wrapMm(seamArcRaw + delta, circ);
  const seamDrawX = graftBodyCX + arcFromNoon(seamArcRotated, circ) * xScale;
  const seamTopY = graftBodyY - supraH - (p ? 4 : 2);

  const drawSeamLine = (sx: number, alpha: number) => {
    if (sx < graftBodyX - 2 || sx > graftBodyX + graftBodyW + 2) return;
    ctx.save();
    ctx.setLineDash([p ? 8 : 5, p ? 5 : 3]);
    ctx.strokeStyle = `rgba(220,38,38,${alpha})`;
    ctx.lineWidth = p ? 2.5 : 1.8;
    ctx.beginPath();
    ctx.moveTo(sx, seamTopY);
    ctx.lineTo(sx, graftBodyY + graftBodyH + (p ? 10 : 6));
    ctx.stroke();
    ctx.restore();
  };

  drawSeamLine(seamDrawX, 0.92);
  // Seam at opposite side of cylinder
  const seamOppositeX = seamDrawX < graftBodyCX
    ? graftBodyCX + (graftBodyCX - seamDrawX)
    : graftBodyCX - (seamDrawX - graftBodyCX);
  if (Math.abs(seamOppositeX - seamDrawX) > 4) drawSeamLine(seamOppositeX, 0.55);

  // Seam label (above graft)
  ctx.fillStyle = "rgba(220,38,38,0.90)";
  ctx.font = `600 ${p ? 9 : 7}px sans-serif`;
  ctx.textAlign = "center";
  const seamLabel = seamDeg === 0 ? "Seam\n12:00" : seamDeg === 180 ? "Seam\n6:00" : `Seam\n${seamDeg}°`;
  ctx.fillText(seamLabel.replace("\n", " "), seamDrawX, seamTopY - (p ? 3 : 2));
  ctx.textAlign = "left";

  // ── Fenestrations ────────────────────────────────────────────────────────────
  const fenCountByType: Record<string, number> = {};
  const dimLines: Array<{ y: number; label: string; color: string }> = [];

  caseInput.fenestrations.forEach((fen, idx) => {
    const conflict = result.optimalConflicts[idx];
    const adjClock = conflict?.adjustedClock ?? fen.clock;
    const isConflicted = conflict?.conflict ?? false;
    const color = VESSEL_COLORS[fen.vessel] ?? "#334155";

    const fenDrawX = graftBodyCX + clockToDrawArc(adjClock, circ) * xScale;
    const fenDrawY = fen.ftype === "SCALLOP"
      ? graftBodyY
      : graftBodyY + fen.depthMm * yScale;

    const isStrFree = !isConflicted && fen.ftype !== "SCALLOP"
      && isInInterRingGap(fen.depthMm, ringHeight, interRingGap, nRings);

    ctx.save();
    ctx.beginPath();
    ctx.rect(graftBodyX, graftBodyY - (p ? 25 : 15), graftBodyW, graftBodyH + (p ? 30 : 18));
    ctx.clip();

    if (fen.ftype === "SCALLOP") {
      // Scallop: semicircle notch cut into proximal edge
      const sW = Math.max(fen.widthMm * xScale, p ? 20 : 13);
      const sH = Math.max(fen.heightMm * yScale, p ? 16 : 10);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = color;
      ctx.lineWidth = p ? 2.2 : 1.8;
      ctx.beginPath();
      ctx.arc(fenDrawX, graftBodyY, sW / 2, Math.PI, 0, false);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Height dimension line inside scallop
      if (sH > (p ? 8 : 5)) {
        ctx.strokeStyle = `${color}70`;
        ctx.lineWidth = 0.7;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(fenDrawX, graftBodyY);
        ctx.lineTo(fenDrawX, graftBodyY - sH);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Vessel label above graft edge
      ctx.fillStyle = color;
      ctx.font = `700 ${p ? 11 : 8}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(fen.vessel, fenDrawX, graftBodyY - sH - (p ? 4 : 3));
      ctx.textAlign = "left";
    } else {
      // Round/large fenestration: circle with center crosshair (Cook CMD style)
      const rW = Math.max((fen.widthMm / 2) * xScale, p ? 10 : 7);
      const rH = Math.max((fen.heightMm / 2) * yScale, p ? 10 : 7);
      // Use circle (not ellipse) — Cook CMD shows round holes as circles
      const r = Math.max(rW, rH);

      // Conflict: dashed red outer ring
      if (isConflicted) {
        ctx.strokeStyle = "#dc2626";
        ctx.lineWidth = p ? 1.5 : 1;
        ctx.setLineDash([p ? 4 : 3, p ? 3 : 2]);
        ctx.beginPath();
        ctx.arc(fenDrawX, fenDrawY, r + (p ? 7 : 5), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // White fill (punch-out appearance)
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(fenDrawX, fenDrawY, r, 0, Math.PI * 2);
      ctx.fill();

      // Circle border (thick, device color)
      ctx.strokeStyle = color;
      ctx.lineWidth = p ? 2.2 : 1.8;
      ctx.beginPath();
      ctx.arc(fenDrawX, fenDrawY, r, 0, Math.PI * 2);
      ctx.stroke();

      // Center crosshair (Cook CMD convention)
      const cSize = p ? 5 : 3;
      ctx.strokeStyle = color;
      ctx.lineWidth = p ? 1.2 : 0.9;
      ctx.beginPath();
      ctx.moveTo(fenDrawX - cSize, fenDrawY);
      ctx.lineTo(fenDrawX + cSize, fenDrawY);
      ctx.moveTo(fenDrawX, fenDrawY - cSize);
      ctx.lineTo(fenDrawX, fenDrawY + cSize);
      ctx.stroke();

      // "A" = strut-free (Cook CMD: prominent letter beside hole)
      if (isStrFree) {
        ctx.fillStyle = "#111827";
        ctx.font = `900 ${p ? 16 : 11}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("A", fenDrawX, fenDrawY + r + (p ? 14 : 10));
        ctx.textAlign = "left";
      }

      // Vessel label to the right of hole
      ctx.fillStyle = color;
      ctx.font = `700 ${p ? 11 : 8}px sans-serif`;
      ctx.fillText(fen.vessel, fenDrawX + r + (p ? 4 : 3), fenDrawY + 3);

      // Horizontal leader tick to left graft wall
      ctx.strokeStyle = `${color}60`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(graftBodyX, fenDrawY);
      ctx.lineTo(graftBodyX - (p ? 4 : 3), fenDrawY);
      ctx.stroke();

      dimLines.push({ y: fenDrawY, label: `${fen.depthMm}`, color });
    }

    ctx.restore();
  });

  // ── Depth dimension lines (Cook CMD style: staggered vertical arrows) ────────
  // Each fenestration gets its own offset column so labels don't collide
  {
    const colW = p ? 14 : 10;
    const arrowSz = p ? 3.5 : 2.5;

    dimLines.forEach(({ y, label, color }, i) => {
      const dimX = graftBodyX - (p ? 10 : 7) - i * colW;

      // Vertical arrow line: proximal edge → fenestration
      ctx.strokeStyle = color;
      ctx.lineWidth = p ? 1.2 : 0.9;
      ctx.beginPath();
      ctx.moveTo(dimX, graftBodyY);
      ctx.lineTo(dimX, y);
      ctx.stroke();

      // Arrowheads
      ctx.fillStyle = color;
      drawArrow(ctx, dimX, graftBodyY, "up", arrowSz);
      drawArrow(ctx, dimX, y, "down", arrowSz);

      // Short horizontal leaders to graft wall
      ctx.strokeStyle = `${color}55`;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([p ? 3 : 2, p ? 2 : 1.5]);
      ctx.beginPath();
      ctx.moveTo(dimX, graftBodyY);
      ctx.lineTo(graftBodyX, graftBodyY);
      ctx.moveTo(dimX, y);
      ctx.lineTo(graftBodyX, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dimension label (bold, Cook CMD style)
      ctx.fillStyle = color;
      ctx.font = `700 ${p ? 11 : 8}px sans-serif`;
      ctx.textAlign = "right";
      ctx.fillText(label, dimX - (p ? 3 : 2), (graftBodyY + y) / 2 + 4);
      ctx.textAlign = "left";
    });
  }

  // ── Spec panel ───────────────────────────────────────────────────────────────
  const lineH = p ? 15 : 12;
  let sy = bodyY + (p ? 6 : 4);
  const sw = specPanelW;

  // Rotation plan
  ctx.fillStyle = "#111827";
  ctx.font = `700 ${p ? 14 : 10}px sans-serif`;
  ctx.fillText("ROTATION PLAN", specPanelX, sy);
  sy += lineH * 1.3;
  ctx.fillStyle = "#0f766e";
  ctx.font = `600 ${p ? 11 : 9}px sans-serif`;
  sy = wrapText(ctx, getRotationSummary(result), specPanelX, sy, sw, lineH, 4);

  sy += lineH * 0.8;
  ctx.strokeStyle = "rgba(16,33,31,0.15)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(specPanelX, sy);
  ctx.lineTo(specPanelX + sw, sy);
  ctx.stroke();
  sy += lineH * 0.8;

  // Fenestration specs
  const fcnt = { SCALLOP: 0, LARGE_FEN: 0, SMALL_FEN: 0 };
  caseInput.fenestrations.forEach((fen, idx) => {
    const conflict = result.optimalConflicts[idx];
    const adjClock = conflict?.adjustedClock ?? fen.clock;
    const isConflicted = conflict?.conflict ?? false;
    const color = VESSEL_COLORS[fen.vessel] ?? "#334155";
    fcnt[fen.ftype]++;
    const typeLabel =
      fen.ftype === "SCALLOP"
        ? `REINFORCED SCALLOP #${fcnt.SCALLOP}`
        : fen.ftype === "LARGE_FEN"
        ? `REINFORCED LARGE FENESTRATION #${fcnt.LARGE_FEN}`
        : `REINFORCED SMALL FENESTRATION #${fcnt.SMALL_FEN}`;

    ctx.fillStyle = color;
    ctx.font = `700 ${p ? 12 : 9}px sans-serif`;
    ctx.fillText(typeLabel, specPanelX, sy);
    sy += lineH;

    if (fen.ftype !== "SCALLOP") {
      const arcSep = computeArcSep(adjClock, seamDeg, delta, circ);
      const isStrFree = !isConflicted
        && isInInterRingGap(fen.depthMm, ringHeight, interRingGap, nRings);
      if (isStrFree) {
        ctx.fillStyle = "#0f766e";
        ctx.font = `700 ${p ? 11 : 8}px sans-serif`;
        ctx.fillText("**Strut Free**", specPanelX + (p ? 6 : 4), sy);
        sy += lineH;
      } else if (isConflicted) {
        ctx.fillStyle = "#dc2626";
        ctx.font = `700 ${p ? 11 : 8}px sans-serif`;
        ctx.fillText(`⚠ Conflict — min clearance ${conflict.minDist.toFixed(1)} mm`, specPanelX + (p ? 6 : 4), sy);
        sy += lineH;
      }
      ctx.fillStyle = "#334155";
      ctx.font = `400 ${p ? 11 : 9}px sans-serif`;
      const specLines = [
        `WIDTH: ${fen.widthMm} mm`,
        `HEIGHT: ${fen.heightMm} mm`,
        `DIST FROM PROX EDGE: ${fen.depthMm} mm`,
        `CLOCK: ${adjClock} (ARCSEP: ${arcSep > 0 ? "+" : ""}${arcSep.toFixed(1)} mm)`,
        `Original clock: ${fen.clock}`,
      ];
      for (const line of specLines) {
        ctx.fillText(line, specPanelX + (p ? 6 : 4), sy);
        sy += lineH;
      }
    } else {
      ctx.fillStyle = "#334155";
      ctx.font = `400 ${p ? 11 : 9}px sans-serif`;
      const specLines = [
        `WIDTH: ${fen.widthMm} mm`,
        `HEIGHT: ${fen.heightMm} mm`,
        `CLOCK: ${adjClock}`,
        `Original clock: ${fen.clock}`,
      ];
      for (const line of specLines) {
        ctx.fillText(line, specPanelX + (p ? 6 : 4), sy);
        sy += lineH;
      }
    }
    sy += lineH * 0.5;
  });

  sy += lineH * 0.5;
  ctx.strokeStyle = "rgba(16,33,31,0.15)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(specPanelX, sy);
  ctx.lineTo(specPanelX + sw, sy);
  ctx.stroke();
  sy += lineH;

  // Device data block
  ctx.fillStyle = "#10211f";
  ctx.font = `700 ${p ? 12 : 9}px sans-serif`;
  ctx.fillText("DEVICE", specPanelX, sy);
  sy += lineH;
  ctx.fillStyle = "#334155";
  ctx.font = `400 ${p ? 11 : 9}px sans-serif`;
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
  if (dev.minNeckLengthMm != null) deviceLines.push(`Min neck length (IFU): ${dev.minNeckLengthMm} mm`);
  if (dev.maxInfrarenalAngleDeg != null) deviceLines.push(`Max infrarenal angle (IFU): ${dev.maxInfrarenalAngleDeg}°`);
  if (dev.maxSuprarenalAngleDeg != null) deviceLines.push(`Max suprarenal angle (IFU): ${dev.maxSuprarenalAngleDeg}°`);
  deviceLines.forEach((line) => {
    ctx.fillText(line, specPanelX + (p ? 6 : 4), sy);
    sy += lineH;
  });

  if (caseInput.surgeonNote) {
    sy += lineH * 0.5;
    ctx.fillStyle = "#45605b";
    ctx.font = `400 italic ${p ? 10 : 8}px sans-serif`;
    sy = wrapText(ctx, `Note: ${caseInput.surgeonNote}`, specPanelX, sy, sw, lineH, 4);
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  const footerY = lh - footerH + (p ? 14 : 8);
  ctx.strokeStyle = "rgba(16,33,31,0.15)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(margin, footerY - (p ? 8 : 6));
  ctx.lineTo(lw - margin, footerY - (p ? 8 : 6));
  ctx.stroke();
  ctx.fillStyle = "#45605b";
  ctx.font = `400 ${p ? 9 : 8}px sans-serif`;
  ctx.fillText(
    "For research and planning use only. All clinical decisions remain the surgeon's responsibility. Not to scale.",
    margin,
    footerY,
  );
  ctx.fillText(
    `PMEGplan.io  •  ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`,
    margin,
    footerY + (p ? 12 : 10),
  );
  if (p) {
    ctx.fillText(
      "Signature: ___________________________   Date: ___________",
      lw / 2 - 10,
      footerY,
    );
  }
}
