/**
 * punchCardRenderer.ts  —  PMEGplan.io
 *
 * Renders the PMEG back-table punch card template.
 *
 * Additions vs v1 (matching Lazaris PMEG Layout Tool feature parity):
 *   • Calibration square (100 × 100 mm corner box) — critical for print verification
 *   • AP markers: arrows at 12:00 (anterior) and 6:00 (posterior) at proximal edge
 *   • Anti-rotation ✓ mark at 12:00 / proximal corner
 *   • Cut guides (dashed border with configurable margin)
 *   • Reduction tie position lines (3 clock positions, configurable)
 *   • Bolder device-coloured strut wires (2× Lazaris weight)
 *   • Dual scale bar — mm ruler + "10 mm" callout
 *   • True-scale print note ("Print at 100% — Actual Size")
 *   • Per-fenestration ARCSEP from seam
 *   • Wrap edge labels ("LEFT WRAP EDGE ↺" / "RIGHT WRAP EDGE")
 */

import { getSealZoneHeightMm } from "@/lib/stentGeometry";
import type { CaseInput, DeviceAnalysisResult, StrutSegment } from "@/lib/types";

// ── Colours ───────────────────────────────────────────────────────────────────

const VESSEL_COLORS: Record<string, string> = {
  SMA:    "#15803d",
  LRA:    "#c2410c",
  RRA:    "#b91c1c",
  LMA:    "#0369a1",
  CELIAC: "#7c3aed",
  CUSTOM: "#475569",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function clockToArc(clock: string, circ: number): number {
  const [h, m] = clock.split(":").map(Number);
  return (((h % 12) * 60 + m) / 720) * circ;
}

function arcToClockStr(arcMm: number, circ: number): string {
  const deg    = (arcMm / circ) * 360;
  const total  = Math.round((deg / 360) * 720);
  const h      = Math.floor(total / 60) % 12;
  const m      = total % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

function drawRoundedRect(
  ctx:    CanvasRenderingContext2D,
  x:      number,
  y:      number,
  w:      number,
  h:      number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapText(
  ctx:       CanvasRenderingContext2D,
  text:      string,
  x:         number,
  y:         number,
  maxWidth:  number,
  lineH:     number,
  maxLines = 5,
): number {
  const words = text.split(" ");
  let line = "";
  let idx  = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) { line = test; continue; }
    ctx.fillText(line, x, y + idx * lineH);
    line = word;
    idx++;
    if (idx >= maxLines - 1) break;
  }
  if (line) { ctx.fillText(line, x, y + idx * lineH); idx++; }
  return y + idx * lineH;
}

// Draw a small arrow pointing up or down
function drawArrowHead(
  ctx:  CanvasRenderingContext2D,
  x:    number,
  y:    number,
  dir:  "up" | "down",
  size: number,
) {
  ctx.beginPath();
  if (dir === "up") {
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

// ── Main export ────────────────────────────────────────────────────────────────

export interface PunchCardRenderOptions {
  ctx:                 CanvasRenderingContext2D;
  width:               number;
  height:              number;
  result:              DeviceAnalysisResult;
  caseInput:           CaseInput;
  mode?:               "preview" | "print";
  /** Three clock positions for reduction tie guides, e.g. [4, 6, 8]. Default [4, 6, 8]. */
  tieClock?:           number[];
  /** Cut margin in mm (printed dashed border). Default 8 mm. */
  cutMarginMm?:        number;
  /** Show calibration square in bottom-left corner. Default true. */
  showCalibration?:    boolean;
}

export function renderPunchCard({
  ctx,
  width,
  height,
  result,
  caseInput,
  mode            = "preview",
  tieClock        = [4, 6, 8],
  cutMarginMm     = 8,
  showCalibration = true,
}: PunchCardRenderOptions): void {

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f8f4ed";
  ctx.fillRect(0, 0, width, height);

  // ── Unsupported fallback ──────────────────────────────────────────────────
  if (!result.size) {
    ctx.fillStyle = "#10211f";
    ctx.font = `700 ${mode === "print" ? 28 : 18}px sans-serif`;
    ctx.fillText(result.device.shortName, 24, 44);
    ctx.font = `400 ${mode === "print" ? 16 : 12}px sans-serif`;
    ctx.fillStyle = "#dc2626";
    wrapText(ctx, result.unsupportedReason ?? "No compatible graft size.", 24, 80, width - 48, 22, 6);
    return;
  }

  const p  = mode === "print";
  const fs = (base: number) => (p ? base * 1.45 : base); // font scale helper

  // ── Layout constants ──────────────────────────────────────────────────────
  const margin       = p ?  52 :  20;
  const headerH      = p ?  80 :  52;
  const sidePanelW   = p ? Math.min(380, width * 0.27) : Math.min(295, width * 0.34);
  const chartX       = margin;
  const chartY       = headerH;
  const chartW       = width - margin * 2 - sidePanelW - (p ? 28 : 20);
  const chartH       = height - chartY - margin - (p ? 56 : 36); // leave room for footer
  const sidePanelX   = chartX + chartW + (p ? 28 : 20);

  const sealZoneH    = getSealZoneHeightMm(result.device);
  const maxDepth     = Math.max(
    sealZoneH + 12,
    ...caseInput.fenestrations.map((f) => f.depthMm + 28),
  );
  const xScale = chartW / result.circumferenceMm;
  const yScale = chartH / maxDepth;

  // Physical mm per pixel (for calibration square and true-scale items)
  // In print mode the canvas is sized so 1px ≈ 1mm * xScale.
  const mmPerPx = 1 / xScale;  // how many mm does one pixel represent?

  // ── Card background ───────────────────────────────────────────────────────
  drawRoundedRect(ctx, 6, 6, width - 12, height - 12, p ? 28 : 18);
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.fill();
  ctx.strokeStyle = "rgba(16,33,31,0.09)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // ── Cut guide border (dashed outer) ──────────────────────────────────────
  const cutPx = cutMarginMm * xScale;
  ctx.save();
  ctx.setLineDash([p ? 10 : 7, p ? 6 : 4]);
  ctx.strokeStyle = "rgba(16,33,31,0.28)";
  ctx.lineWidth = p ? 1.2 : 0.8;
  ctx.strokeRect(cutPx, cutPx, width - cutPx * 2, height - cutPx * 2);
  ctx.restore();
  // CUT GUIDE label
  ctx.fillStyle = "rgba(16,33,31,0.30)";
  ctx.font = `400 ${fs(7)}px sans-serif`;
  ctx.fillText("CUT GUIDE", cutPx + 4, cutPx - 3);

  // ── Header ────────────────────────────────────────────────────────────────
  ctx.fillStyle = "#10211f";
  ctx.font = `700 ${fs(p ? 18 : 14)}px sans-serif`;
  ctx.fillText(result.device.name, margin, margin + fs(p ? 18 : 14));

  ctx.fillStyle = "#45605b";
  ctx.font = `400 ${fs(p ? 11 : 9)}px sans-serif`;
  ctx.fillText(
    `${result.device.manufacturer}  ·  Ø${result.size.graftDiameter} mm  ·  Circ ${result.circumferenceMm.toFixed(1)} mm  ·  ${result.nPeaks} peaks  ·  Foreshortening ${(result.device.foreshortening * 100).toFixed(0)}%  ·  ${result.device.fabricMaterial}`,
    margin,
    margin + fs(p ? 33 : 26),
  );
  if (caseInput.patientId ?? caseInput.surgeonName) {
    ctx.fillText(
      `Patient: ${caseInput.patientId ?? "—"}   Surgeon: ${caseInput.surgeonName ?? "—"}`,
      margin,
      margin + fs(p ? 48 : 37),
    );
  }

  // ── Chart background with ring/gap tint bands ─────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.rect(chartX, chartY, chartW, chartH);
  ctx.clip();

  // Slight off-white background for chart area
  ctx.fillStyle = "rgba(255,255,255,0.60)";
  ctx.fillRect(chartX, chartY, chartW, chartH);

  // Ring danger zones (light red)  and safe inter-ring zones (light green)
  let bandY = 0;
  for (let ri = 0; ri < result.device.nRings; ri++) {
    // Ring band
    const ringTop  = chartY + bandY * yScale;
    const ringH_px = result.device.ringHeight * yScale;
    ctx.fillStyle = "rgba(220,38,38,0.10)";
    ctx.fillRect(chartX, ringTop, chartW, ringH_px);

    if (ringH_px > (p ? 18 : 11)) {
      ctx.fillStyle = "rgba(185,28,28,0.50)";
      ctx.font = `400 ${fs(8)}px sans-serif`;
      ctx.fillText(`Ring ${ri + 1}`, chartX + 4, ringTop + (p ? 13 : 10));
    }
    bandY += result.device.ringHeight;

    if (ri < result.device.nRings - 1) {
      const gapTop  = chartY + bandY * yScale;
      const gapH_px = result.device.interRingGap * yScale;
      ctx.fillStyle = "rgba(15,118,110,0.11)";
      ctx.fillRect(chartX, gapTop, chartW, gapH_px);

      if (gapH_px > (p ? 16 : 10)) {
        ctx.fillStyle = "rgba(15,118,110,0.60)";
        ctx.font = `600 ${fs(7.5)}px sans-serif`;
        ctx.fillText(
          `safe  ${result.device.interRingGap} mm`,
          chartX + 4,
          gapTop + gapH_px / 2 + 3,
        );
      }
      bandY += result.device.interRingGap;
    }
  }

  // ── Horizontal depth grid lines (every 10 mm) ─────────────────────────────
  ctx.strokeStyle = "rgba(16,33,31,0.08)";
  ctx.lineWidth = 0.7;
  for (let d = 0; d <= maxDepth; d += 10) {
    const gy = chartY + d * yScale;
    ctx.beginPath();
    ctx.moveTo(chartX, gy);
    ctx.lineTo(chartX + chartW, gy);
    ctx.stroke();
  }

  // ── Vertical clock guide lines (12:00, 3:00, 6:00, 9:00) ─────────────────
  const clockMarks = [
    { label: "12:00 (A)", arc: 0 },
    { label: "3:00",      arc: result.circumferenceMm / 4 },
    { label: "6:00 (P)",  arc: result.circumferenceMm / 2 },
    { label: "9:00",      arc: (result.circumferenceMm * 3) / 4 },
  ];
  ctx.strokeStyle = "rgba(16,33,31,0.12)";
  ctx.lineWidth = 0.8;
  ctx.font = `600 ${fs(8)}px sans-serif`;
  for (const { label, arc } of clockMarks) {
    const gx = chartX + arc * xScale;
    ctx.beginPath();
    ctx.moveTo(gx, chartY);
    ctx.lineTo(gx, chartY + chartH);
    ctx.stroke();
    // Label above chart
    ctx.fillStyle = "#334155";
    ctx.textAlign = "center";
    ctx.fillText(label, gx, chartY - (p ? 8 : 5));
    ctx.textAlign = "left";
  }

  // ── AP markers: prominent arrows at 12:00 and 6:00 ────────────────────────
  // Anterior (12:00) — filled triangle + "A"
  const ap12x   = chartX + 0 * xScale;  // 12:00 arc = 0
  const ap6x    = chartX + (result.circumferenceMm / 2) * xScale;
  const apArrow = p ? 9 : 6;
  ctx.fillStyle  = "#1d4ed8";
  ctx.strokeStyle = "#1d4ed8";
  ctx.lineWidth  = p ? 1.8 : 1.2;
  // 12:00 arrow pointing DOWN (proximal = top = anterior)
  drawArrowHead(ctx, ap12x, chartY - (p ? 3 : 2), "down", apArrow);
  ctx.font = `700 ${fs(8)}px sans-serif`;
  ctx.fillText("A", ap12x + apArrow + 2, chartY - (p ? 4 : 3));
  // 6:00 arrow
  drawArrowHead(ctx, ap6x, chartY - (p ? 3 : 2), "down", apArrow);
  ctx.fillText("P", ap6x + apArrow + 2, chartY - (p ? 4 : 3));

  // ── Seam dashed line ──────────────────────────────────────────────────────
  const seamArc = (result.device.seamDeg / 360) * result.circumferenceMm;
  ctx.save();
  ctx.setLineDash([p ? 9 : 6, p ? 5 : 4]);
  ctx.strokeStyle = "rgba(217,119,6,0.90)";
  ctx.lineWidth   = p ? 1.8 : 1.2;
  ctx.beginPath();
  ctx.moveTo(chartX + seamArc * xScale, chartY);
  ctx.lineTo(chartX + seamArc * xScale, chartY + chartH);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "rgba(217,119,6,0.70)";
  ctx.font      = `600 ${fs(7)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("SEAM", chartX + seamArc * xScale, chartY + (p ? 11 : 8));
  ctx.textAlign = "left";

  // ── Z-stent struts (DEVICE COLOURED, bold) ────────────────────────────────
  const strutColor    = result.device.color;
  const strutWeight   = p ? 2.4 : 1.8;
  const strutOffsets  = [-result.circumferenceMm, 0, result.circumferenceMm];

  // Pass 1: white outline for contrast against hatching
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth   = strutWeight + (p ? 2.5 : 2);
  for (const [ax, ay, bx, by] of result.strutSegments as StrutSegment[]) {
    for (const off of strutOffsets) {
      const sx = chartX + (ax + off) * xScale;
      const ex = chartX + (bx + off) * xScale;
      if (Math.max(sx,ex) < chartX - 8 || Math.min(sx,ex) > chartX + chartW + 8) continue;
      ctx.beginPath();
      ctx.moveTo(sx, chartY + ay * yScale);
      ctx.lineTo(ex, chartY + by * yScale);
      ctx.stroke();
    }
  }
  // Pass 2: device-coloured wire
  ctx.strokeStyle = strutColor;
  ctx.lineWidth   = strutWeight;
  for (const [ax, ay, bx, by] of result.strutSegments as StrutSegment[]) {
    for (const off of strutOffsets) {
      const sx = chartX + (ax + off) * xScale;
      const ex = chartX + (bx + off) * xScale;
      if (Math.max(sx,ex) < chartX - 8 || Math.min(sx,ex) > chartX + chartW + 8) continue;
      ctx.beginPath();
      ctx.moveTo(sx, chartY + ay * yScale);
      ctx.lineTo(ex, chartY + by * yScale);
      ctx.stroke();
    }
  }

  // ── Reduction tie position lines ──────────────────────────────────────────
  // Three vertical dashed lines at configurable clock positions
  for (const clockHour of tieClock) {
    const tieArc = ((clockHour % 12) * 60 / 720) * result.circumferenceMm;
    for (const off of strutOffsets) {
      const tx = chartX + (tieArc + off) * xScale;
      if (tx < chartX - 2 || tx > chartX + chartW + 2) continue;
      ctx.save();
      ctx.setLineDash([p ? 6 : 4, p ? 4 : 3]);
      ctx.strokeStyle = "rgba(107,114,128,0.70)";
      ctx.lineWidth   = p ? 1.4 : 1.0;
      ctx.beginPath();
      ctx.moveTo(tx, chartY);
      ctx.lineTo(tx, chartY + chartH);
      ctx.stroke();
      ctx.restore();
    }
  }
  // Tie guide legend (top-right of chart)
  ctx.fillStyle = "rgba(107,114,128,0.80)";
  ctx.font      = `400 ${fs(7)}px sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText(`Tie pos: ${tieClock.join(", ")} o'clock`, chartX + chartW - 4, chartY + (p ? 12 : 9));
  ctx.textAlign = "left";

  // ── Fenestrations ─────────────────────────────────────────────────────────
  const delta = result.rotation.optimalDeltaMm;

  caseInput.fenestrations.forEach((fen, idx) => {
    const conflict   = result.optimalConflicts[idx];
    const isConf     = conflict?.conflict ?? false;
    const adjArc     = clockToArc(conflict?.adjustedClock ?? fen.clock, result.circumferenceMm);
    const fenY       = chartY + fen.depthMm * yScale;
    const col        = VESSEL_COLORS[fen.vessel] ?? "#475569";
    const rW_px      = Math.max((fen.widthMm / 2) * xScale, p ? 10 : 6);
    const rH_px      = Math.max((fen.heightMm / 2) * yScale, p ? 10 : 6);

    // Render at arc + optional wrap copies
    for (const off of strutOffsets) {
      const fenX = chartX + (adjArc + off) * xScale;
      if (fenX < chartX - rW_px * 2 || fenX > chartX + chartW + rW_px * 2) continue;

      ctx.save();

      if (fen.ftype === "SCALLOP") {
        // U-shaped notch at proximal edge
        const nW = Math.max(fen.widthMm * xScale, p ? 16 : 10);
        const nH = Math.max(fen.heightMm * yScale, p ? 12 : 8);
        ctx.fillStyle  = `${col}28`;
        ctx.strokeStyle = col;
        ctx.lineWidth  = p ? 2.2 : 1.8;
        ctx.beginPath();
        ctx.moveTo(fenX - nW / 2, chartY);
        ctx.lineTo(fenX - nW / 2, chartY + nH);
        ctx.quadraticCurveTo(fenX, chartY + nH * 1.4, fenX + nW / 2, chartY + nH);
        ctx.lineTo(fenX + nW / 2, chartY);
        ctx.fill();
        ctx.stroke();
        // Notch label
        ctx.fillStyle   = col;
        ctx.font        = `700 ${fs(8)}px sans-serif`;
        ctx.textAlign   = "center";
        ctx.fillText("SCALLOP", fenX, chartY - (p ? 4 : 3));
        ctx.fillText(fen.vessel,  fenX, chartY - (p ? 14 : 11));
        ctx.textAlign = "left";

      } else {
        // Conflict halo
        if (isConf) {
          ctx.save();
          ctx.setLineDash([p ? 5 : 4, p ? 4 : 3]);
          ctx.strokeStyle = "#dc2626";
          ctx.lineWidth   = p ? 2.0 : 1.4;
          const hr = Math.max(rW_px, rH_px) + (p ? 9 : 6);
          ctx.beginPath();
          ctx.arc(fenX, fenY, hr, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Filled fenestration (white punch-out style with device-colour border)
        ctx.beginPath();
        ctx.ellipse(fenX, fenY, rW_px, rH_px, 0, 0, Math.PI * 2);
        ctx.fillStyle   = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth   = p ? 2.4 : 2.0;
        ctx.stroke();

        // Center crosshair (Cook CMD convention)
        const cs = p ? 5 : 3;
        ctx.strokeStyle = col;
        ctx.lineWidth   = p ? 1.4 : 1.0;
        ctx.beginPath();
        ctx.moveTo(fenX - cs, fenY);
        ctx.lineTo(fenX + cs, fenY);
        ctx.moveTo(fenX, fenY - cs);
        ctx.lineTo(fenX, fenY + cs);
        ctx.stroke();

        // Vessel label
        ctx.fillStyle  = col;
        ctx.font       = `700 ${fs(9)}px sans-serif`;
        ctx.textAlign  = "center";
        ctx.fillText(fen.vessel, fenX, fenY + rH_px + (p ? 13 : 10));
        ctx.fillStyle  = isConf ? "#dc2626" : "#334155";
        ctx.font       = `${isConf ? "700" : "400"} ${fs(7.5)}px sans-serif`;
        ctx.fillText(
          isConf
            ? `⚠ CONFLICT  ${conflict.minDist.toFixed(1)} mm`
            : `✓ ${conflict.minDist.toFixed(1)} mm clear`,
          fenX,
          fenY + rH_px + (p ? 24 : 18),
        );
        // Adjusted clock
        ctx.fillStyle = "#374151";
        ctx.font      = `400 ${fs(7)}px sans-serif`;
        ctx.fillText(arcToClockStr(adjArc, result.circumferenceMm), fenX, fenY - rH_px - (p ? 5 : 3));
        ctx.textAlign = "left";

        // Horizontal leader to depth axis
        ctx.strokeStyle = `${col}50`;
        ctx.lineWidth   = 0.6;
        ctx.setLineDash([p ? 3 : 2, p ? 2 : 1.5]);
        ctx.beginPath();
        ctx.moveTo(chartX, fenY);
        ctx.lineTo(fenX - rW_px - (p ? 3 : 2), fenY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();
    }
  });

  // ── Depth axis labels (left of chart) ─────────────────────────────────────
  ctx.fillStyle   = "#374151";
  ctx.font        = `400 ${fs(8)}px sans-serif`;
  ctx.textAlign   = "right";
  ctx.strokeStyle = "rgba(55,65,81,0.4)";
  ctx.lineWidth   = 0.5;
  for (let d = 0; d <= maxDepth; d += 10) {
    const gy = chartY + d * yScale;
    if (gy > chartY + chartH + 4) break;
    ctx.beginPath();
    ctx.moveTo(chartX - (p ? 4 : 3), gy);
    ctx.lineTo(chartX, gy);
    ctx.stroke();
    ctx.fillText(`${d}`, chartX - (p ? 6 : 4), gy + (p ? 4 : 3));
  }
  ctx.textAlign = "left";
  // Y-axis label
  ctx.save();
  ctx.translate(chartX - (p ? 22 : 14), chartY + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font      = `400 ${fs(7.5)}px sans-serif`;
  ctx.fillStyle = "#374151";
  ctx.textAlign = "center";
  ctx.fillText("Distance from proximal edge (mm)", 0, 0);
  ctx.restore();

  // ── Anti-rotation ✓ mark at 12:00 / proximal corner ─────────────────────
  // A large ✓ check visible from the operating field to confirm orientation
  ctx.font = `700 ${fs(p ? 24 : 16)}px sans-serif`;
  ctx.fillStyle  = "#0f766e";
  ctx.textAlign  = "center";
  ctx.fillText("✓", chartX + 0 * xScale, chartY + (p ? 28 : 20));
  ctx.font       = `400 ${fs(7)}px sans-serif`;
  ctx.fillStyle  = "rgba(15,118,110,0.55)";
  ctx.fillText("12:00 / A", chartX + 0 * xScale, chartY + (p ? 40 : 29));
  ctx.textAlign  = "left";

  // ── Wrap edge labels ──────────────────────────────────────────────────────
  ctx.save();
  ctx.translate(chartX + (p ? 4 : 3), chartY + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font      = `600 ${fs(7)}px sans-serif`;
  ctx.fillStyle = "rgba(16,33,31,0.35)";
  ctx.textAlign = "center";
  ctx.fillText("← LEFT WRAP EDGE", 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(chartX + chartW - (p ? 4 : 3), chartY + chartH / 2);
  ctx.rotate(Math.PI / 2);
  ctx.font      = `600 ${fs(7)}px sans-serif`;
  ctx.fillStyle = "rgba(16,33,31,0.35)";
  ctx.textAlign = "center";
  ctx.fillText("RIGHT WRAP EDGE →", 0, 0);
  ctx.restore();

  ctx.restore(); // end clip

  // ── Side panel ────────────────────────────────────────────────────────────
  let sy        = chartY;
  const lineH   = fs(p ? 14 : 11);
  const sw      = sidePanelW - (p ? 8 : 4);

  function sectionTitle(t: string) {
    ctx.fillStyle = "#10211f";
    ctx.font      = `700 ${fs(10)}px sans-serif`;
    ctx.fillText(t, sidePanelX, sy);
    sy += lineH * 0.35;
    ctx.strokeStyle = "rgba(16,33,31,0.15)";
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    ctx.moveTo(sidePanelX, sy);
    ctx.lineTo(sidePanelX + sw, sy);
    ctx.stroke();
    sy += lineH * 0.85;
  }

  function spec(key: string, val: string, valColor?: string) {
    ctx.fillStyle = "rgba(69,96,91,0.75)";
    ctx.font      = `400 ${fs(8.5)}px sans-serif`;
    ctx.fillText(key, sidePanelX, sy);
    ctx.fillStyle = valColor ?? "#10211f";
    ctx.font      = `600 ${fs(8.5)}px sans-serif`;
    ctx.fillText(val, sidePanelX + sw * 0.52, sy);
    sy += lineH;
  }

  sectionTitle("DEVICE");
  spec("Platform",    result.device.shortName,                              result.device.color);
  spec("Diameter",    `${result.size.graftDiameter} mm`);
  spec("Circ",        `${result.circumferenceMm.toFixed(1)} mm`);
  spec("Sheath",      `${result.size.sheathFr} Fr`);
  spec("Foreshorten", `${(result.device.foreshortening * 100).toFixed(0)}%`);
  spec("Ring height", `${result.device.ringHeight} mm`);
  spec("Gap",         `${result.device.interRingGap} mm`,
    result.device.interRingGap >= 12 ? "#15803d" : "#c2410c");
  spec("Peaks / ring", `${result.nPeaks}`);
  sy += lineH * 0.4;

  sectionTitle("ROTATION PLAN");
  if (result.rotation.hasConflictFreeRotation) {
    ctx.fillStyle = "#15803d";
    ctx.font      = `700 ${fs(9)}px sans-serif`;
    sy = wrapText(
      ctx,
      `Rotate ${result.rotation.optimalDeltaDeg.toFixed(0)}° CW (${result.rotation.optimalDeltaMm.toFixed(1)} mm). Valid window: ${result.rotation.validWindows.map((w) => `${w.startDeg.toFixed(0)}°–${w.endDeg.toFixed(0)}°`).join(", ")}.`,
      sidePanelX, sy, sw, lineH, 5,
    );
  } else {
    ctx.fillStyle = "#b45309";
    ctx.font      = `700 ${fs(9)}px sans-serif`;
    sy = wrapText(
      ctx,
      `No conflict-free rotation. Best compromise: ${result.rotation.bestCompromiseDeg.toFixed(0)}° CW. Strut bending technique may be required.`,
      sidePanelX, sy, sw, lineH, 5,
    );
  }
  sy += lineH * 0.5;

  sectionTitle("FENESTRATIONS");
  const fcnt: Record<string, number> = { SCALLOP: 0, LARGE_FEN: 0, SMALL_FEN: 0 };
  caseInput.fenestrations.forEach((fen, idx) => {
    const conflict   = result.optimalConflicts[idx];
    const adjClock   = conflict?.adjustedClock ?? fen.clock;
    const isConf     = conflict?.conflict ?? false;
    const col        = VESSEL_COLORS[fen.vessel] ?? "#334155";
    fcnt[fen.ftype]  = (fcnt[fen.ftype] ?? 0) + 1;
    const typeLabel  =
      fen.ftype === "SCALLOP"   ? `SCALLOP #${fcnt.SCALLOP}`    :
      fen.ftype === "LARGE_FEN" ? `LARGE FEN #${fcnt.LARGE_FEN}` :
                                  `SMALL FEN #${fcnt.SMALL_FEN}`;

    ctx.fillStyle = col;
    ctx.font      = `700 ${fs(9)}px sans-serif`;
    ctx.fillText(`${fen.vessel}  ${typeLabel}`, sidePanelX, sy);
    sy += lineH;

    ctx.fillStyle = "#334155";
    ctx.font      = `400 ${fs(8)}px sans-serif`;
    if (fen.ftype !== "SCALLOP") {
      const seam    = result.device.seamDeg;
      const adjArcMm = clockToArc(adjClock, result.circumferenceMm);
      const seamArcMm = (seam / 360) * result.circumferenceMm + delta;
      const arcSep  = adjArcMm - seamArcMm;
      const specRows = [
        `Clock: ${fen.clock} → ${adjClock}`,
        `Depth: ${fen.depthMm} mm  ·  ${fen.widthMm}×${fen.heightMm} mm`,
        `ARCSEP: ${arcSep > 0 ? "+" : ""}${arcSep.toFixed(1)} mm from seam`,
      ];
      for (const row of specRows) { ctx.fillText(row, sidePanelX + (p ? 6 : 4), sy); sy += lineH; }
      ctx.fillStyle = isConf ? "#dc2626" : "#15803d";
      ctx.font      = `700 ${fs(8)}px sans-serif`;
      ctx.fillText(
        isConf ? `⚠ Conflict  (${conflict.minDist.toFixed(1)} mm)` : `✓ Clear  (${conflict.minDist.toFixed(1)} mm)`,
        sidePanelX + (p ? 6 : 4), sy,
      );
      sy += lineH;
    } else {
      ctx.fillText(`Clock: ${adjClock}  ·  ${fen.widthMm}×${fen.heightMm} mm`, sidePanelX + (p ? 6 : 4), sy);
      sy += lineH;
      ctx.fillStyle = "rgba(107,114,128,0.75)";
      ctx.font      = `400 italic ${fs(7.5)}px sans-serif`;
      ctx.fillText("Scallop — strut conflict irrelevant", sidePanelX + (p ? 6 : 4), sy);
      sy += lineH;
    }
    sy += lineH * 0.4;
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = height - margin + (p ? 8 : 4);
  ctx.fillStyle = "rgba(69,96,91,0.55)";
  ctx.font      = `400 ${fs(7)}px sans-serif`;
  ctx.fillText(
    `FOR RESEARCH / PLANNING USE ONLY  ·  Print at 100% Actual Size — verify calibration square  ·  PMEGplan.io`,
    margin,
    footerY,
  );

  // ── Scale bar (bottom-left of chart area) ─────────────────────────────────
  const sbX    = margin;
  const sbY    = height - margin + (p ? -14 : -10);
  // 10 mm physical = 10 * xScale pixels
  const sbLen  = 10 * xScale;
  ctx.strokeStyle = "#10211f";
  ctx.fillStyle   = "#10211f";
  ctx.lineWidth   = p ? 1.8 : 1.2;
  ctx.beginPath();
  ctx.moveTo(sbX, sbY);
  ctx.lineTo(sbX + sbLen, sbY);
  ctx.moveTo(sbX, sbY - (p ? 4 : 3));
  ctx.lineTo(sbX, sbY + (p ? 4 : 3));
  ctx.moveTo(sbX + sbLen, sbY - (p ? 4 : 3));
  ctx.lineTo(sbX + sbLen, sbY + (p ? 4 : 3));
  ctx.stroke();
  ctx.font      = `700 ${fs(8)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("10 mm", sbX + sbLen / 2, sbY - (p ? 6 : 4));
  ctx.textAlign = "left";

  // ── Calibration square (100 × 100 mm in bottom-right corner) ─────────────
  // Drawn ONLY in print mode or when showCalibration = true and wide enough
  if (showCalibration && (p || width > 400)) {
    const calSide  = 100 * xScale;          // 100 mm → pixels
    const calX     = width - margin - calSide;
    const calY     = height - margin - calSide;

    if (calX > sidePanelX + sidePanelW + 10 || p) {
      ctx.fillStyle   = "rgba(16,33,31,0.04)";
      ctx.strokeStyle = "#10211f";
      ctx.lineWidth   = p ? 1.5 : 1.0;
      ctx.fillRect(calX, calY, calSide, calSide);
      ctx.strokeRect(calX, calY, calSide, calSide);

      // Corner ticks every 10 mm
      ctx.lineWidth = 0.6;
      for (let t = 10; t < 100; t += 10) {
        const tp = t * xScale;
        ctx.beginPath();
        // top tick
        ctx.moveTo(calX + tp, calY);
        ctx.lineTo(calX + tp, calY + (p ? 4 : 3));
        // bottom tick
        ctx.moveTo(calX + tp, calY + calSide);
        ctx.lineTo(calX + tp, calY + calSide - (p ? 4 : 3));
        // left tick
        ctx.moveTo(calX, calY + tp);
        ctx.lineTo(calX + (p ? 4 : 3), calY + tp);
        // right tick
        ctx.moveTo(calX + calSide, calY + tp);
        ctx.lineTo(calX + calSide - (p ? 4 : 3), calY + tp);
        ctx.stroke();
      }

      ctx.fillStyle = "#10211f";
      ctx.font      = `700 ${fs(8)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("100 mm", calX + calSide / 2, calY - (p ? 5 : 4));
      ctx.textAlign = "left";

      ctx.save();
      ctx.translate(calX - (p ? 5 : 4), calY + calSide / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText("100 mm", 0, 0);
      ctx.restore();

      ctx.fillStyle = "rgba(16,33,31,0.38)";
      ctx.font      = `400 italic ${fs(7)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("CALIBRATION", calX + calSide / 2, calY + calSide / 2 - (p ? 6 : 4));
      ctx.fillText("SQUARE",      calX + calSide / 2, calY + calSide / 2 + (p ? 8 : 6));
      ctx.fillText("Verify = 100 mm", calX + calSide / 2, calY + calSide / 2 + (p ? 22 : 16));
      ctx.textAlign = "left";
    }
  }
}
