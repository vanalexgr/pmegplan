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
import { getEffectiveRingGeometry } from "@/lib/devices";
import type { CaseInput, DeviceAnalysisResult, StrutSegment } from "@/lib/types";



export interface PunchCardScaleContext {
  isPrint: boolean;
  v_52_20: number;
  v_80_52: number;
  v_28_20: number;
  v_56_36: number;
  v_28_18: number;
  v_10_7: number;
  v_6_4: number;
  v_1_2_0_8: number;
  v_18_14: number;
  v_11_9: number;
  v_33_26: number;
  v_48_37: number;
  v_18_11: number;
  v_13_10: number;
  v_16_10: number;
  v_8_5: number;
  v_9_6: number;
  v_1_8_1_2: number;
  v_3_2: number;
  v_4_3: number;
  v_5_4: number;
  v_11_8: number;
  v_2_4_1_8: number;
  v_2_5_2: number;
  v_1_4_1_0: number;
  fontSub: number;
  v_10_6: number;
  v_12_8: number;
  strokeCore: number;
  v_14_11: number;
  v_2_0_1_4: number;
  v_2_4_2_0: number;
  v_5_3: number;
  v_24_18: number;
  v_2_1_5: number;
  v_22_14: number;
  v_24_16: number;
  v_40_29: number;
  v_8_4: number;
  v_m14_m10: number;
  v_1_5_1_0: number;
  v_8_6: number;
  v_22_16: number;
}

export function buildPunchCardScaleContext(mode: "preview" | "print"): PunchCardScaleContext {
  const isPrint = mode === "print";
  return {
    isPrint,
    v_52_20: isPrint ? 52 : 20,
    v_80_52: isPrint ? 80 : 52,
    v_28_20: isPrint ? 28 : 20,
    v_56_36: isPrint ? 56 : 36,
    v_28_18: isPrint ? 28 : 18,
    v_10_7: isPrint ? 10 : 7,
    v_6_4: isPrint ? 6 : 4,
    v_1_2_0_8: isPrint ? 1.2 : 0.8,
    v_18_14: isPrint ? 18 : 14,
    v_11_9: isPrint ? 11 : 9,
    v_33_26: isPrint ? 33 : 26,
    v_48_37: isPrint ? 48 : 37,
    v_18_11: isPrint ? 18 : 11,
    v_13_10: isPrint ? 13 : 10,
    v_16_10: isPrint ? 16 : 10,
    v_8_5: isPrint ? 8 : 5,
    v_9_6: isPrint ? 9 : 6,
    v_1_8_1_2: isPrint ? 1.8 : 1.2,
    v_3_2: isPrint ? 3 : 2,
    v_4_3: isPrint ? 4 : 3,
    v_5_4: isPrint ? 5 : 4,
    v_11_8: isPrint ? 11 : 8,
    v_2_4_1_8: isPrint ? 2.4 : 1.8,
    v_2_5_2: isPrint ? 2.5 : 2,
    v_1_4_1_0: isPrint ? 1.4 : 1.0,
    fontSub: isPrint ? 12 : 9,
    v_10_6: isPrint ? 10 : 6,
    v_12_8: isPrint ? 12 : 8,
    strokeCore: isPrint ? 2.2 : 1.8,
    v_14_11: isPrint ? 14 : 11,
    v_2_0_1_4: isPrint ? 2.0 : 1.4,
    v_2_4_2_0: isPrint ? 2.4 : 2.0,
    v_5_3: isPrint ? 5 : 3,
    v_24_18: isPrint ? 24 : 18,
    v_2_1_5: isPrint ? 2 : 1.5,
    v_22_14: isPrint ? 22 : 14,
    v_24_16: isPrint ? 24 : 16,
    v_40_29: isPrint ? 40 : 29,
    v_8_4: isPrint ? 8 : 4,
    v_m14_m10: isPrint ? -14 : -10,
    v_1_5_1_0: isPrint ? 1.5 : 1.0,
    v_8_6: isPrint ? 8 : 6,
    v_22_16: isPrint ? 22 : 16,
  };
}
import {
  arcMmToClockText,
  clockTextToArcMm,
} from "@/lib/planning/clock";

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

function arcToClockStr(arcMm: number, circ: number): string {
  return arcMmToClockText(arcMm, circ, {
    separator: ":",
    padHour: false,
  });
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

/**
 * Computes the canvas height required for a punch card rendered at the given
 * width with uniform (undistorted) x/y scaling. Call this before creating the
 * canvas so that height = computePunchCardHeight(...); then pass the same
 * height into renderPunchCard.
 */
export function computePunchCardHeight(
  width:     number,
  result:    DeviceAnalysisResult,
  caseInput: CaseInput,
  mode:      "preview" | "print",
): number {
  if (!result.size) return mode === "print" ? 400 : 300;
  const sc = buildPunchCardScaleContext(mode);
  const sidePanelW = sc.isPrint ? Math.min(380, width * 0.27) : Math.min(295, width * 0.34);
  const chartW  = width - sc.v_52_20 * 2 - sidePanelW - sc.v_28_20;
  const sealZoneH = getSealZoneHeightMm(result.device);
  const maxDepth  = Math.max(
    sealZoneH + 12,
    ...caseInput.fenestrations.map((f) => f.depthMm + 28),
  );
  const chartH = (chartW / result.circumferenceMm) * maxDepth;
  return Math.ceil(sc.v_80_52 + chartH + sc.v_52_20 + sc.v_56_36);
}

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

  const sc = buildPunchCardScaleContext(mode);
  const fs = (base: number) => (sc.isPrint ? base * 1.45 : base); // font scale helper

  // ── Layout constants ──────────────────────────────────────────────────────
  const margin       = sc.v_52_20;
  const headerH      = sc.v_80_52;
  const sidePanelW   = sc.isPrint ? Math.min(380, width * 0.27) : Math.min(295, width * 0.34);
  const chartX       = margin;
  const chartY       = headerH;
  const chartW       = width - margin * 2 - sidePanelW - (sc.v_28_20);
  const sidePanelX   = chartX + chartW + (sc.v_28_20);

  const sealZoneH    = getSealZoneHeightMm(result.device);
  const maxDepth     = Math.max(
    sealZoneH + 12,
    ...caseInput.fenestrations.map((f) => f.depthMm + 28),
  );
  // Uniform scale: both axes use the same px/mm so ring geometry is not distorted.
  // chartH is derived from content depth, not from the canvas height.
  const xScale = chartW / result.circumferenceMm;
  const yScale = xScale;
  const chartH = maxDepth * yScale;

  // ── Card background ───────────────────────────────────────────────────────
  drawRoundedRect(ctx, 6, 6, width - 12, height - 12, sc.v_28_18);
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.fill();
  ctx.strokeStyle = "rgba(16,33,31,0.09)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // ── Cut guide border (dashed outer) ──────────────────────────────────────
  const cutPx = cutMarginMm * xScale;
  ctx.save();
  ctx.setLineDash([sc.v_10_7, sc.v_6_4]);
  ctx.strokeStyle = "rgba(16,33,31,0.28)";
  ctx.lineWidth = sc.v_1_2_0_8;
  ctx.strokeRect(cutPx, cutPx, width - cutPx * 2, height - cutPx * 2);
  ctx.restore();
  // CUT GUIDE label
  ctx.fillStyle = "rgba(16,33,31,0.30)";
  ctx.font = `400 ${fs(7)}px sans-serif`;
  ctx.fillText("CUT GUIDE", cutPx + 4, cutPx - 3);

  // ── Header ────────────────────────────────────────────────────────────────
  ctx.fillStyle = "#10211f";
  ctx.font = `700 ${fs(sc.v_18_14)}px sans-serif`;
  ctx.fillText(result.device.name, margin, margin + fs(sc.v_18_14));

  ctx.fillStyle = "#45605b";
  ctx.font = `400 ${fs(sc.v_11_9)}px sans-serif`;
  ctx.fillText(
    `${result.device.manufacturer}  ·  Ø${result.size.graftDiameter} mm  ·  Circ ${result.circumferenceMm.toFixed(1)} mm  ·  ${result.nPeaks} peaks  ·  Foreshortening ${(result.device.foreshortening * 100).toFixed(0)}%  ·  ${result.device.fabricMaterial}`,
    margin,
    margin + fs(sc.v_33_26),
  );
  if (caseInput.patientId ?? caseInput.surgeonName) {
    ctx.fillText(
      `Patient: ${caseInput.patientId ?? "—"}   Surgeon: ${caseInput.surgeonName ?? "—"}`,
      margin,
      margin + fs(sc.v_48_37),
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
  const proximalRingOffset = result.device.proximalRingOffsetMm ?? 0;
  const { ringHeight: effectiveRingH, interRingGap: effectiveGap } = getEffectiveRingGeometry(result.device, result.size);
  bandY = proximalRingOffset;
  for (let ri = 0; ri < result.device.nRings; ri++) {
    // Ring band
    const ringTop  = chartY + bandY * yScale;
    const ringH_px = effectiveRingH * yScale;
    ctx.fillStyle = "rgba(220,38,38,0.10)";
    ctx.fillRect(chartX, ringTop, chartW, ringH_px);

    if (ringH_px > (sc.v_18_11)) {
      ctx.fillStyle = "rgba(185,28,28,0.50)";
      ctx.font = `400 ${fs(8)}px sans-serif`;
      ctx.fillText(`Ring ${ri + 1}`, chartX + 4, ringTop + (sc.v_13_10));
    }
    bandY += effectiveRingH;

    if (ri < result.device.nRings - 1) {
      const gapTop  = chartY + bandY * yScale;
      const gapH_px = effectiveGap * yScale;
      ctx.fillStyle = "rgba(15,118,110,0.11)";
      ctx.fillRect(chartX, gapTop, chartW, gapH_px);

      if (gapH_px > (sc.v_16_10)) {
        ctx.fillStyle = "rgba(15,118,110,0.60)";
        ctx.font = `600 ${fs(7.5)}px sans-serif`;
        ctx.fillText(
          `safe  ${effectiveGap} mm`,
          chartX + 4,
          gapTop + gapH_px / 2 + 3,
        );
      }
      bandY += effectiveGap;
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
    ctx.fillText(label, gx, chartY - (sc.v_8_5));
    ctx.textAlign = "left";
  }

  // ── AP markers: prominent arrows at 12:00 and 6:00 ────────────────────────
  // Anterior (12:00) — filled triangle + "A"
  const ap12x   = chartX + 0 * xScale;  // 12:00 arc = 0
  const ap6x    = chartX + (result.circumferenceMm / 2) * xScale;
  const apArrow = sc.v_9_6;
  ctx.fillStyle  = "#1d4ed8";
  ctx.strokeStyle = "#1d4ed8";
  ctx.lineWidth  = sc.v_1_8_1_2;
  // 12:00 arrow pointing DOWN (proximal = top = anterior)
  drawArrowHead(ctx, ap12x, chartY - (sc.v_3_2), "down", apArrow);
  ctx.font = `700 ${fs(8)}px sans-serif`;
  ctx.fillText("A", ap12x + apArrow + 2, chartY - (sc.v_4_3));
  // 6:00 arrow
  drawArrowHead(ctx, ap6x, chartY - (sc.v_3_2), "down", apArrow);
  ctx.fillText("P", ap6x + apArrow + 2, chartY - (sc.v_4_3));

  // ── Seam dashed line ──────────────────────────────────────────────────────
  const seamArc = (result.device.seamDeg / 360) * result.circumferenceMm;
  ctx.save();
  ctx.setLineDash([sc.v_9_6, sc.v_5_4]);
  ctx.strokeStyle = "rgba(217,119,6,0.90)";
  ctx.lineWidth   = sc.v_1_8_1_2;
  ctx.beginPath();
  ctx.moveTo(chartX + seamArc * xScale, chartY);
  ctx.lineTo(chartX + seamArc * xScale, chartY + chartH);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "rgba(217,119,6,0.70)";
  ctx.font      = `600 ${fs(7)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("SEAM", chartX + seamArc * xScale, chartY + (sc.v_11_8));
  ctx.textAlign = "left";

  // ── Z-stent struts (DEVICE COLOURED, bold) ────────────────────────────────
  const strutColor    = result.device.color;
  const strutWeight   = sc.v_2_4_1_8;
  const strutOffsets  = [-result.circumferenceMm, 0, result.circumferenceMm];

  // Pass 1: white outline for contrast against hatching
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth   = strutWeight + (sc.v_2_5_2);
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
      ctx.setLineDash([sc.v_6_4, sc.v_4_3]);
      ctx.strokeStyle = "rgba(107,114,128,0.70)";
      ctx.lineWidth   = sc.v_1_4_1_0;
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
  ctx.fillText(`Tie pos: ${tieClock.join(", ")} o'clock`, chartX + chartW - 4, chartY + (sc.fontSub));
  ctx.textAlign = "left";

  // ── Fenestrations ─────────────────────────────────────────────────────────
  const delta = result.rotation.optimalDeltaMm;

  caseInput.fenestrations.forEach((fen, idx) => {
    const conflict   = result.optimalConflicts[idx];
    const isConf     = conflict?.conflict ?? false;
    const adjArc     = clockTextToArcMm(conflict?.adjustedClock ?? fen.clock, result.circumferenceMm);
    const fenY       = chartY + fen.depthMm * yScale;
    const col        = VESSEL_COLORS[fen.vessel] ?? "#475569";
    const rW_px      = Math.max((fen.widthMm / 2) * xScale, sc.v_10_6);
    const rH_px      = Math.max((fen.heightMm / 2) * yScale, sc.v_10_6);

    // Render at arc + optional wrap copies
    for (const off of strutOffsets) {
      const fenX = chartX + (adjArc + off) * xScale;
      if (fenX < chartX - rW_px * 2 || fenX > chartX + chartW + rW_px * 2) continue;

      ctx.save();

      if (fen.ftype === "SCALLOP") {
        // U-shaped notch at proximal edge
        const nW = Math.max(fen.widthMm * xScale, sc.v_16_10);
        const nH = Math.max(fen.heightMm * yScale, sc.v_12_8);
        ctx.fillStyle  = `${col}28`;
        ctx.strokeStyle = col;
        ctx.lineWidth  = sc.strokeCore;
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
        ctx.fillText("SCALLOP", fenX, chartY - (sc.v_4_3));
        ctx.fillText(fen.vessel,  fenX, chartY - (sc.v_14_11));
        ctx.textAlign = "left";

      } else {
        // Conflict halo
        if (isConf) {
          ctx.save();
          ctx.setLineDash([sc.v_5_4, sc.v_4_3]);
          ctx.strokeStyle = "#dc2626";
          ctx.lineWidth   = sc.v_2_0_1_4;
          const hr = Math.max(rW_px, rH_px) + (sc.v_9_6);
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
        ctx.lineWidth   = sc.v_2_4_2_0;
        ctx.stroke();

        // Center crosshair (Cook CMD convention)
        const cs = sc.v_5_3;
        ctx.strokeStyle = col;
        ctx.lineWidth   = sc.v_1_4_1_0;
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
        ctx.fillText(fen.vessel, fenX, fenY + rH_px + (sc.v_13_10));
        ctx.fillStyle  = isConf ? "#dc2626" : "#334155";
        ctx.font       = `${isConf ? "700" : "400"} ${fs(7.5)}px sans-serif`;
        ctx.fillText(
          isConf
            ? `⚠ CONFLICT  ${conflict.minDist.toFixed(1)} mm`
            : `✓ ${conflict.minDist.toFixed(1)} mm clear`,
          fenX,
          fenY + rH_px + (sc.v_24_18),
        );
        // Adjusted clock
        ctx.fillStyle = "#374151";
        ctx.font      = `400 ${fs(7)}px sans-serif`;
        ctx.fillText(arcToClockStr(adjArc, result.circumferenceMm), fenX, fenY - rH_px - (sc.v_5_3));
        ctx.textAlign = "left";

        // Horizontal leader to depth axis
        ctx.strokeStyle = `${col}50`;
        ctx.lineWidth   = 0.6;
        ctx.setLineDash([sc.v_3_2, sc.v_2_1_5]);
        ctx.beginPath();
        ctx.moveTo(chartX, fenY);
        ctx.lineTo(fenX - rW_px - (sc.v_3_2), fenY);
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
    ctx.moveTo(chartX - (sc.v_4_3), gy);
    ctx.lineTo(chartX, gy);
    ctx.stroke();
    ctx.fillText(`${d}`, chartX - (sc.v_6_4), gy + (sc.v_4_3));
  }
  ctx.textAlign = "left";
  // Y-axis label
  ctx.save();
  ctx.translate(chartX - (sc.v_22_14), chartY + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font      = `400 ${fs(7.5)}px sans-serif`;
  ctx.fillStyle = "#374151";
  ctx.textAlign = "center";
  ctx.fillText("Distance from proximal edge (mm)", 0, 0);
  ctx.restore();

  // ── Anti-rotation ✓ mark at 12:00 / proximal corner ─────────────────────
  // A large ✓ check visible from the operating field to confirm orientation
  ctx.font = `700 ${fs(sc.v_24_16)}px sans-serif`;
  ctx.fillStyle  = "#0f766e";
  ctx.textAlign  = "center";
  ctx.fillText("✓", chartX + 0 * xScale, chartY + (sc.v_28_20));
  ctx.font       = `400 ${fs(7)}px sans-serif`;
  ctx.fillStyle  = "rgba(15,118,110,0.55)";
  ctx.fillText("12:00 / A", chartX + 0 * xScale, chartY + (sc.v_40_29));
  ctx.textAlign  = "left";

  // ── Wrap edge labels ──────────────────────────────────────────────────────
  ctx.save();
  ctx.translate(chartX + (sc.v_4_3), chartY + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font      = `600 ${fs(7)}px sans-serif`;
  ctx.fillStyle = "rgba(16,33,31,0.35)";
  ctx.textAlign = "center";
  ctx.fillText("← LEFT WRAP EDGE", 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(chartX + chartW - (sc.v_4_3), chartY + chartH / 2);
  ctx.rotate(Math.PI / 2);
  ctx.font      = `600 ${fs(7)}px sans-serif`;
  ctx.fillStyle = "rgba(16,33,31,0.35)";
  ctx.textAlign = "center";
  ctx.fillText("RIGHT WRAP EDGE →", 0, 0);
  ctx.restore();

  ctx.restore(); // end clip

  // ── Side panel ────────────────────────────────────────────────────────────
  let sy        = chartY;
  const lineH   = fs(sc.v_14_11);
  const sw      = sidePanelW - (sc.v_8_4);

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
  spec("Ring height", `${effectiveRingH} mm`);
  spec("Gap",         `${effectiveGap} mm`,
    effectiveGap >= 12 ? "#15803d" : "#c2410c");

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
      const adjArcMm = clockTextToArcMm(adjClock, result.circumferenceMm);
      const seamArcMm = (seam / 360) * result.circumferenceMm + delta;
      const arcSep  = adjArcMm - seamArcMm;
      const specRows = [
        `Clock: ${fen.clock} → ${adjClock}`,
        `Depth: ${fen.depthMm} mm  ·  ${fen.widthMm}×${fen.heightMm} mm`,
        `ARCSEP: ${arcSep > 0 ? "+" : ""}${arcSep.toFixed(1)} mm from seam`,
      ];
      for (const row of specRows) { ctx.fillText(row, sidePanelX + (sc.v_6_4), sy); sy += lineH; }
      ctx.fillStyle = isConf ? "#dc2626" : "#15803d";
      ctx.font      = `700 ${fs(8)}px sans-serif`;
      ctx.fillText(
        isConf ? `⚠ Conflict  (${conflict.minDist.toFixed(1)} mm)` : `✓ Clear  (${conflict.minDist.toFixed(1)} mm)`,
        sidePanelX + (sc.v_6_4), sy,
      );
      sy += lineH;
    } else {
      ctx.fillText(`Clock: ${adjClock}  ·  ${fen.widthMm}×${fen.heightMm} mm`, sidePanelX + (sc.v_6_4), sy);
      sy += lineH;
      ctx.fillStyle = "rgba(107,114,128,0.75)";
      ctx.font      = `400 italic ${fs(7.5)}px sans-serif`;
      ctx.fillText("Scallop — strut conflict irrelevant", sidePanelX + (sc.v_6_4), sy);
      sy += lineH;
    }
    sy += lineH * 0.4;
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = height - margin + (sc.v_8_4);
  ctx.fillStyle = "rgba(69,96,91,0.55)";
  ctx.font      = `400 ${fs(7)}px sans-serif`;
  ctx.fillText(
    `FOR RESEARCH / PLANNING USE ONLY  ·  Print at 100% Actual Size — verify calibration square  ·  PMEGplan.io`,
    margin,
    footerY,
  );

  // ── Scale bar (bottom-left of chart area) ─────────────────────────────────
  const sbX    = margin;
  const sbY    = height - margin + (sc.v_m14_m10);
  // 10 mm physical = 10 * xScale pixels
  const sbLen  = 10 * xScale;
  ctx.strokeStyle = "#10211f";
  ctx.fillStyle   = "#10211f";
  ctx.lineWidth   = sc.v_1_8_1_2;
  ctx.beginPath();
  ctx.moveTo(sbX, sbY);
  ctx.lineTo(sbX + sbLen, sbY);
  ctx.moveTo(sbX, sbY - (sc.v_4_3));
  ctx.lineTo(sbX, sbY + (sc.v_4_3));
  ctx.moveTo(sbX + sbLen, sbY - (sc.v_4_3));
  ctx.lineTo(sbX + sbLen, sbY + (sc.v_4_3));
  ctx.stroke();
  ctx.font      = `700 ${fs(8)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("10 mm", sbX + sbLen / 2, sbY - (sc.v_6_4));
  ctx.textAlign = "left";

  // ── Calibration square (100 × 100 mm in bottom-right corner) ─────────────
  // Drawn ONLY in print mode or when showCalibration = true and wide enough
  if (showCalibration && (sc.isPrint || width > 400)) {
    const calSide  = 100 * xScale;          // 100 mm → pixels
    const calX     = width - margin - calSide;
    const calY     = height - margin - calSide;

    if (calX > sidePanelX + sidePanelW + 10 || sc.isPrint) {
      ctx.fillStyle   = "rgba(16,33,31,0.04)";
      ctx.strokeStyle = "#10211f";
      ctx.lineWidth   = sc.v_1_5_1_0;
      ctx.fillRect(calX, calY, calSide, calSide);
      ctx.strokeRect(calX, calY, calSide, calSide);

      // Corner ticks every 10 mm
      ctx.lineWidth = 0.6;
      for (let t = 10; t < 100; t += 10) {
        const tp = t * xScale;
        ctx.beginPath();
        // top tick
        ctx.moveTo(calX + tp, calY);
        ctx.lineTo(calX + tp, calY + (sc.v_4_3));
        // bottom tick
        ctx.moveTo(calX + tp, calY + calSide);
        ctx.lineTo(calX + tp, calY + calSide - (sc.v_4_3));
        // left tick
        ctx.moveTo(calX, calY + tp);
        ctx.lineTo(calX + (sc.v_4_3), calY + tp);
        // right tick
        ctx.moveTo(calX + calSide, calY + tp);
        ctx.lineTo(calX + calSide - (sc.v_4_3), calY + tp);
        ctx.stroke();
      }

      ctx.fillStyle = "#10211f";
      ctx.font      = `700 ${fs(8)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("100 mm", calX + calSide / 2, calY - (sc.v_5_4));
      ctx.textAlign = "left";

      ctx.save();
      ctx.translate(calX - (sc.v_5_4), calY + calSide / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText("100 mm", 0, 0);
      ctx.restore();

      ctx.fillStyle = "rgba(16,33,31,0.38)";
      ctx.font      = `400 italic ${fs(7)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("CALIBRATION", calX + calSide / 2, calY + calSide / 2 - (sc.v_6_4));
      ctx.fillText("SQUARE",      calX + calSide / 2, calY + calSide / 2 + (sc.v_8_6));
      ctx.fillText("Verify = 100 mm", calX + calSide / 2, calY + calSide / 2 + (sc.v_22_16));
      ctx.textAlign = "left";
    }
  }
}
