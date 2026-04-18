/**
 * punchCardRenderer.ts  —  PMEGplan.io
 *
 * Renders the PMEG back-table punch card template.
 *
 * Features:
 *   • Full-width chart (graft footprint) — the cuttable punch card section
 *   • Top ruler showing nominal perimeter with mm ticks, clock marks, tie markers
 *   • Left + right depth axes with 10 mm ruler marks
 *   • Cut corner registration marks at chart corners
 *   • Proximal edge label + distal seal-zone boundary line
 *   • Film boundary reference line + right-edge height bracket
 *   • AP markers: arrows at 12:00 (anterior) and 6:00 (posterior)
 *   • Anti-rotation ✓ mark at 12:00 / proximal corner
 *   • Reduction tie position lines (configurable clock positions)
 *   • Device-coloured strut wires
 *   • Per-fenestration horizontal depth guide lines + depth labels
 *   • Diameter labels inside fenestration ellipses
 *   • Wrap edge labels ("LEFT WRAP EDGE" / "RIGHT WRAP EDGE")
 *   • 3-column device plan strip below the chart (easy to cut apart)
 *   • 10 mm scale bar + calibration note
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
  // New layout values
  leftAxisW:  number;   // px reserved left of chart for depth labels
  rightAnnotW: number;  // px reserved right of chart for ticks + film bracket
  rulerH:     number;   // px height of top circumference ruler strip
  infoH:      number;   // px height of info strip below chart
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
    leftAxisW:   isPrint ? 40 : 28,
    rightAnnotW: isPrint ? 32 : 22,
    rulerH:      isPrint ? 38 : 26,
    infoH:       isPrint ? 230 : 155,
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

// Registration cross-hair for cut corners (arms point AWAY from chart)
function drawCutMark(
  ctx:  CanvasRenderingContext2D,
  cx:   number,
  cy:   number,
  dh:   number,   // horizontal direction: -1 = left, +1 = right
  dv:   number,   // vertical direction:   -1 = up,   +1 = down
  len:  number,
  gap:  number,
) {
  ctx.beginPath();
  ctx.moveTo(cx + dh * gap, cy);
  ctx.lineTo(cx + dh * (gap + len), cy);
  ctx.moveTo(cx, cy + dv * gap);
  ctx.lineTo(cx, cy + dv * (gap + len));
  ctx.stroke();
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
  const sc        = buildPunchCardScaleContext(mode);
  const margin    = sc.v_52_20;
  const chartW    = width - margin - sc.leftAxisW - sc.rightAnnotW - margin;
  const sealZoneH = getSealZoneHeightMm(result.device);
  const maxDepth  = Math.max(
    sealZoneH + 12,
    ...caseInput.fenestrations.map((f) => f.depthMm + 28),
    ...(caseInput.filmHeightMm != null ? [caseInput.filmHeightMm + 12] : []),
  );
  const xScale = chartW / result.circumferenceMm;
  const chartH = maxDepth * xScale;
  return Math.ceil(sc.v_80_52 + sc.rulerH + chartH + sc.infoH + margin);
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
  /** Show calibration note. Default true. */
  showCalibration?:    boolean;
  /** Height of transparent film in mm. When set, draws a horizontal reference line. */
  filmHeightMm?:       number;
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
  filmHeightMm,
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
  const fs = (base: number) => (sc.isPrint ? base * 1.45 : base);

  // ── Layout constants ──────────────────────────────────────────────────────
  const margin      = sc.v_52_20;
  const headerH     = sc.v_80_52;
  const chartX      = margin + sc.leftAxisW;
  const chartY      = headerH + sc.rulerH;
  const chartW      = width - chartX - sc.rightAnnotW - margin;

  const sealZoneH   = getSealZoneHeightMm(result.device);
  const maxDepth    = Math.max(
    sealZoneH + 12,
    ...caseInput.fenestrations.map((f) => f.depthMm + 28),
    ...(filmHeightMm != null ? [filmHeightMm + 12] : []),
  );
  const xScale = chartW / result.circumferenceMm;
  const yScale = xScale;
  const chartH = maxDepth * yScale;

  const { ringHeight: effectiveRingH, interRingGap: effectiveGap } = getEffectiveRingGeometry(result.device, result.size);

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
  ctx.strokeStyle = "rgba(16,33,31,0.22)";
  ctx.lineWidth = sc.v_1_2_0_8;
  ctx.strokeRect(cutPx, cutPx, width - cutPx * 2, height - cutPx * 2);
  ctx.restore();
  ctx.fillStyle = "rgba(16,33,31,0.28)";
  ctx.font = `400 ${fs(6.5)}px sans-serif`;
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

  // ── Top circumference ruler strip ─────────────────────────────────────────
  // Zone: from y=headerH to y=chartY (height = sc.rulerH)
  const rulerBandY  = headerH;
  const rulerBandH  = sc.rulerH;
  const rulerTickY  = chartY - (sc.isPrint ? 4 : 3);   // bottom of tick marks
  const rulerLabelY = chartY - (sc.isPrint ? 14 : 9);  // mm labels above ticks
  const rulerArrY   = headerH + (sc.isPrint ? 10 : 7); // circumference bracket line

  // Ruler background
  ctx.fillStyle = "rgba(248,244,237,0.7)";
  ctx.fillRect(chartX, rulerBandY, chartW, rulerBandH);

  // Double-headed bracket showing total circumference
  ctx.strokeStyle = "#334155";
  ctx.fillStyle   = "#334155";
  ctx.lineWidth   = 0.8;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(chartX + 3, rulerArrY);
  ctx.lineTo(chartX + chartW - 3, rulerArrY);
  ctx.stroke();
  // End ticks
  for (const ex of [chartX + 1, chartX + chartW - 1]) {
    ctx.beginPath();
    ctx.moveTo(ex, rulerArrY - (sc.isPrint ? 4 : 3));
    ctx.lineTo(ex, rulerArrY + (sc.isPrint ? 4 : 3));
    ctx.stroke();
  }
  // Circumference label
  ctx.font      = `600 ${fs(7)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(
    `Nominal perimeter  ${result.circumferenceMm.toFixed(1)} mm  (Ø${result.size.graftDiameter} mm graft)`,
    chartX + chartW / 2,
    rulerArrY - (sc.isPrint ? 6 : 4),
  );
  ctx.textAlign = "left";

  // Tick marks every 5 mm, labels every 10 mm
  for (let mm = 0; mm <= Math.ceil(result.circumferenceMm); mm += 5) {
    const tx      = chartX + mm * xScale;
    const isMaj   = mm % 10 === 0;
    const tickLen = isMaj ? (sc.isPrint ? 6 : 5) : (sc.isPrint ? 3 : 2);
    ctx.strokeStyle = isMaj ? "#475569" : "#94a3b8";
    ctx.lineWidth   = isMaj ? 0.8 : 0.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(tx, rulerTickY - tickLen);
    ctx.lineTo(tx, rulerTickY);
    ctx.stroke();
    if (isMaj) {
      ctx.fillStyle = "#475569";
      ctx.font      = `400 ${fs(6.5)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`${mm}`, tx, rulerLabelY);
      ctx.textAlign = "left";
    }
  }

  // Clock-hour positions on ruler
  for (let h = 3; h <= 9; h += 3) {
    const arc = (h / 12) * result.circumferenceMm;
    const cx  = chartX + arc * xScale;
    ctx.fillStyle = "rgba(29,78,216,0.65)";
    ctx.font      = `400 ${fs(6)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`${h}:00`, cx, rulerArrY + (sc.isPrint ? 11 : 8));
    ctx.textAlign = "left";
  }

  // Tie position markers in ruler
  for (const clockHour of tieClock) {
    const tieArc = ((clockHour % 12) * 60 / 720) * result.circumferenceMm;
    const tx     = chartX + tieArc * xScale;
    if (tx < chartX || tx > chartX + chartW) continue;
    ctx.fillStyle   = "rgba(107,114,128,0.90)";
    ctx.strokeStyle = "rgba(107,114,128,0.90)";
    ctx.lineWidth   = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(tx, rulerTickY - (sc.isPrint ? 8 : 6));
    ctx.lineTo(tx, rulerTickY);
    ctx.stroke();
    ctx.font      = `700 ${fs(6.5)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`T${clockHour}`, tx, rulerArrY + (sc.isPrint ? 11 : 8));
    ctx.textAlign = "left";
  }

  // ── Chart background with ring/gap tint bands ─────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.rect(chartX, chartY, chartW, chartH);
  ctx.clip();

  ctx.fillStyle = "rgba(255,255,255,0.60)";
  ctx.fillRect(chartX, chartY, chartW, chartH);

  // Ring danger zones (light red) and safe inter-ring zones (light green)
  const proximalRingOffset = result.device.proximalRingOffsetMm ?? 0;
  let bandY = proximalRingOffset;
  for (let ri = 0; ri < result.device.nRings; ri++) {
    const ringTop  = chartY + bandY * yScale;
    const ringH_px = effectiveRingH * yScale;
    ctx.fillStyle = "rgba(220,38,38,0.10)";
    ctx.fillRect(chartX, ringTop, chartW, ringH_px);
    if (ringH_px > sc.v_18_11) {
      ctx.fillStyle = "rgba(185,28,28,0.50)";
      ctx.font      = `400 ${fs(8)}px sans-serif`;
      ctx.fillText(`Ring ${ri + 1}`, chartX + 4, ringTop + sc.v_13_10);
    }
    bandY += effectiveRingH;
    if (ri < result.device.nRings - 1) {
      const gapTop  = chartY + bandY * yScale;
      const gapH_px = effectiveGap * yScale;
      ctx.fillStyle = "rgba(15,118,110,0.11)";
      ctx.fillRect(chartX, gapTop, chartW, gapH_px);
      if (gapH_px > sc.v_16_10) {
        ctx.fillStyle = "rgba(15,118,110,0.60)";
        ctx.font      = `600 ${fs(7.5)}px sans-serif`;
        ctx.fillText(`safe  ${effectiveGap} mm`, chartX + 4, gapTop + gapH_px / 2 + 3);
      }
      bandY += effectiveGap;
    }
  }

  // ── Horizontal depth grid (every 10 mm) ──────────────────────────────────
  ctx.strokeStyle = "rgba(16,33,31,0.08)";
  ctx.lineWidth   = 0.6;
  ctx.setLineDash([]);
  for (let d = 0; d <= maxDepth; d += 10) {
    const gy = chartY + d * yScale;
    ctx.beginPath();
    ctx.moveTo(chartX, gy);
    ctx.lineTo(chartX + chartW, gy);
    ctx.stroke();
  }

  // ── Vertical clock guide lines — all 12 hours ────────────────────────────
  for (let h = 1; h <= 12; h++) {
    const isCard = h % 3 === 0;
    const arc    = ((h % 12) / 12) * result.circumferenceMm;
    const gx     = chartX + arc * xScale;
    ctx.strokeStyle = isCard ? "rgba(16,33,31,0.12)" : "rgba(16,33,31,0.06)";
    ctx.lineWidth   = isCard ? 0.8 : 0.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(gx, chartY);
    ctx.lineTo(gx, chartY + chartH);
    ctx.stroke();
  }

  // ── AP markers ────────────────────────────────────────────────────────────
  const ap12x   = chartX;
  const ap6x    = chartX + (result.circumferenceMm / 2) * xScale;
  const apArrow = sc.v_9_6;
  ctx.fillStyle   = "#1d4ed8";
  ctx.strokeStyle = "#1d4ed8";
  ctx.lineWidth   = sc.v_1_8_1_2;
  ctx.setLineDash([]);
  drawArrowHead(ctx, ap12x, chartY - sc.v_3_2, "down", apArrow);
  ctx.font = `700 ${fs(8)}px sans-serif`;
  ctx.fillText("A", ap12x + apArrow + 2, chartY - sc.v_4_3);
  drawArrowHead(ctx, ap6x, chartY - sc.v_3_2, "down", apArrow);
  ctx.fillText("P", ap6x + apArrow + 2, chartY - sc.v_4_3);

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
  ctx.fillText("SEAM", chartX + seamArc * xScale, chartY + sc.v_11_8);
  ctx.textAlign = "left";

  // ── Z-stent struts ────────────────────────────────────────────────────────
  const strutColor   = result.device.color;
  const strutWeight  = sc.v_2_4_1_8;
  const strutOffsets = [-result.circumferenceMm, 0, result.circumferenceMm];

  // Pass 1: white outline for contrast
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth   = strutWeight + sc.v_2_5_2;
  ctx.setLineDash([]);
  for (const [ax, ay, bx, by] of result.strutSegments as StrutSegment[]) {
    for (const off of strutOffsets) {
      const sx = chartX + (ax + off) * xScale;
      const ex = chartX + (bx + off) * xScale;
      if (Math.max(sx, ex) < chartX - 8 || Math.min(sx, ex) > chartX + chartW + 8) continue;
      ctx.beginPath();
      ctx.moveTo(sx, chartY + ay * yScale);
      ctx.lineTo(ex, chartY + by * yScale);
      ctx.stroke();
    }
  }
  // Pass 2: device-colour wire
  ctx.strokeStyle = strutColor;
  ctx.lineWidth   = strutWeight;
  for (const [ax, ay, bx, by] of result.strutSegments as StrutSegment[]) {
    for (const off of strutOffsets) {
      const sx = chartX + (ax + off) * xScale;
      const ex = chartX + (bx + off) * xScale;
      if (Math.max(sx, ex) < chartX - 8 || Math.min(sx, ex) > chartX + chartW + 8) continue;
      ctx.beginPath();
      ctx.moveTo(sx, chartY + ay * yScale);
      ctx.lineTo(ex, chartY + by * yScale);
      ctx.stroke();
    }
  }

  // ── Reduction tie position lines ──────────────────────────────────────────
  for (const clockHour of tieClock) {
    const tieArc = ((clockHour % 12) * 60 / 720) * result.circumferenceMm;
    for (const off of strutOffsets) {
      const tx = chartX + (tieArc + off) * xScale;
      if (tx < chartX - 2 || tx > chartX + chartW + 2) continue;
      ctx.save();
      ctx.setLineDash([sc.v_6_4, sc.v_4_3]);
      ctx.strokeStyle = "rgba(107,114,128,0.75)";
      ctx.lineWidth   = sc.v_1_4_1_0;
      ctx.beginPath();
      ctx.moveTo(tx, chartY);
      ctx.lineTo(tx, chartY + chartH);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Film boundary line (inside chart) ────────────────────────────────────
  if (filmHeightMm != null) {
    const filmY = chartY + filmHeightMm * yScale;
    if (filmY >= chartY - 2 && filmY <= chartY + chartH + 40) {
      ctx.save();
      ctx.setLineDash([sc.v_6_4, sc.v_4_3]);
      ctx.strokeStyle = "rgba(59,130,246,0.85)";
      ctx.lineWidth   = sc.v_1_4_1_0;
      ctx.beginPath();
      ctx.moveTo(chartX, filmY);
      ctx.lineTo(chartX + chartW, filmY);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "rgba(59,130,246,0.85)";
      ctx.font      = `600 ${fs(7)}px sans-serif`;
      ctx.fillText(`Film  ${filmHeightMm} mm`, chartX + 4, filmY - 3);
    }
  }

  // ── Fenestrations ─────────────────────────────────────────────────────────
  const delta = result.rotation.optimalDeltaMm;

  caseInput.fenestrations.forEach((fen, idx) => {
    const conflict = result.optimalConflicts[idx];
    const isConf   = conflict?.conflict ?? false;
    const adjArc   = clockTextToArcMm(conflict?.adjustedClock ?? fen.clock, result.circumferenceMm);
    const fenY     = chartY + fen.depthMm * yScale;
    const col      = VESSEL_COLORS[fen.vessel] ?? "#475569";
    const rW_px    = Math.max((fen.widthMm / 2) * xScale, sc.v_10_6);
    const rH_px    = Math.max((fen.heightMm / 2) * yScale, sc.v_10_6);

    // Full-width depth guide line
    if (fen.ftype !== "SCALLOP") {
      ctx.save();
      ctx.setLineDash([sc.v_3_2, sc.v_2_1_5]);
      ctx.strokeStyle = `${col}55`;
      ctx.lineWidth   = sc.v_1_2_0_8;
      ctx.beginPath();
      ctx.moveTo(chartX, fenY);
      ctx.lineTo(chartX + chartW, fenY);
      ctx.stroke();
      ctx.restore();
    }

    for (const off of strutOffsets) {
      const fenX = chartX + (adjArc + off) * xScale;
      if (fenX < chartX - rW_px * 2 || fenX > chartX + chartW + rW_px * 2) continue;

      ctx.save();

      if (fen.ftype === "SCALLOP") {
        const nW = Math.max(fen.widthMm * xScale, sc.v_16_10);
        const nH = Math.max(fen.heightMm * yScale, sc.v_12_8);
        ctx.fillStyle   = `${col}28`;
        ctx.strokeStyle = col;
        ctx.lineWidth   = sc.strokeCore;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(fenX - nW / 2, chartY);
        ctx.lineTo(fenX - nW / 2, chartY + nH);
        ctx.quadraticCurveTo(fenX, chartY + nH * 1.4, fenX + nW / 2, chartY + nH);
        ctx.lineTo(fenX + nW / 2, chartY);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.font      = `700 ${fs(8)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("SCALLOP", fenX, chartY - sc.v_4_3);
        ctx.fillText(fen.vessel,  fenX, chartY - sc.v_14_11);
        ctx.textAlign = "left";
      } else {
        // Conflict halo
        if (isConf) {
          ctx.save();
          ctx.setLineDash([sc.v_5_4, sc.v_4_3]);
          ctx.strokeStyle = "#dc2626";
          ctx.lineWidth   = sc.v_2_0_1_4;
          const hr = Math.max(rW_px, rH_px) + sc.v_9_6;
          ctx.beginPath();
          ctx.arc(fenX, fenY, hr, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Fenestration ellipse
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.ellipse(fenX, fenY, rW_px, rH_px, 0, 0, Math.PI * 2);
        ctx.fillStyle   = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth   = sc.v_2_4_2_0;
        ctx.stroke();

        // Center crosshair
        const cs = sc.v_5_3;
        ctx.strokeStyle = col;
        ctx.lineWidth   = sc.v_1_4_1_0;
        ctx.beginPath();
        ctx.moveTo(fenX - cs, fenY);
        ctx.lineTo(fenX + cs, fenY);
        ctx.moveTo(fenX, fenY - cs);
        ctx.lineTo(fenX, fenY + cs);
        ctx.stroke();

        // Diameter label inside ellipse
        ctx.fillStyle = col;
        ctx.font      = `700 ${fs(8)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(`Ø${fen.widthMm}`, fenX, fenY + rH_px * 0.42 + fs(8) * 0.35);
        ctx.textAlign = "left";

        // Vessel label below ellipse
        ctx.fillStyle = col;
        ctx.font      = `700 ${fs(9)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(fen.vessel, fenX, fenY + rH_px + sc.v_13_10);
        ctx.fillStyle = isConf ? "#dc2626" : "#334155";
        ctx.font      = `${isConf ? "700" : "400"} ${fs(7.5)}px sans-serif`;
        ctx.fillText(
          isConf
            ? `⚠ CONFLICT  ${conflict.minDist.toFixed(1)} mm`
            : `✓ ${conflict.minDist.toFixed(1)} mm clear`,
          fenX,
          fenY + rH_px + sc.v_24_18,
        );
        // Clock label above ellipse
        ctx.fillStyle = "#374151";
        ctx.font      = `400 ${fs(7)}px sans-serif`;
        ctx.fillText(arcToClockStr(adjArc, result.circumferenceMm), fenX, fenY - rH_px - sc.v_5_3);
        ctx.textAlign = "left";

        // Depth label on right side of chart (main copy only)
        if (off === 0) {
          ctx.fillStyle = col;
          ctx.font      = `400 ${fs(7)}px sans-serif`;
          ctx.textAlign = "right";
          ctx.fillText(`${fen.depthMm} mm`, chartX + chartW - sc.v_3_2, fenY - 3);
          ctx.textAlign = "left";
        }
      }

      ctx.restore();
    }
  });

  // ── Anti-rotation ✓ mark ─────────────────────────────────────────────────
  ctx.font      = `700 ${fs(sc.v_24_16)}px sans-serif`;
  ctx.fillStyle = "#0f766e";
  ctx.textAlign = "center";
  ctx.fillText("✓", chartX, chartY + sc.v_28_20);
  ctx.font      = `400 ${fs(7)}px sans-serif`;
  ctx.fillStyle = "rgba(15,118,110,0.55)";
  ctx.fillText("12:00 / A", chartX, chartY + sc.v_40_29);
  ctx.textAlign = "left";

  // ── Wrap edge labels ──────────────────────────────────────────────────────
  ctx.save();
  ctx.translate(chartX + sc.v_4_3, chartY + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font      = `600 ${fs(7)}px sans-serif`;
  ctx.fillStyle = "rgba(16,33,31,0.35)";
  ctx.textAlign = "center";
  ctx.fillText("← LEFT WRAP EDGE", 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(chartX + chartW - sc.v_4_3, chartY + chartH / 2);
  ctx.rotate(Math.PI / 2);
  ctx.font      = `600 ${fs(7)}px sans-serif`;
  ctx.fillStyle = "rgba(16,33,31,0.35)";
  ctx.textAlign = "center";
  ctx.fillText("RIGHT WRAP EDGE →", 0, 0);
  ctx.restore();

  ctx.restore(); // end chart clip

  // ── Left depth axis ───────────────────────────────────────────────────────
  ctx.fillStyle   = "#374151";
  ctx.strokeStyle = "rgba(55,65,81,0.4)";
  ctx.lineWidth   = 0.6;
  ctx.setLineDash([]);
  for (let d = 0; d <= maxDepth; d += 10) {
    const gy = chartY + d * yScale;
    if (gy > chartY + chartH + 4) break;
    // Tick into chart
    ctx.beginPath();
    ctx.moveTo(chartX - sc.v_4_3, gy);
    ctx.lineTo(chartX + sc.v_3_2, gy);
    ctx.stroke();
    // Label
    ctx.font      = `400 ${fs(8)}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(`${d}`, chartX - sc.v_6_4, gy + sc.v_4_3);
    ctx.textAlign = "left";
  }
  // Minor ticks every 5 mm
  ctx.strokeStyle = "rgba(55,65,81,0.2)";
  ctx.lineWidth   = 0.4;
  for (let d = 5; d <= maxDepth; d += 10) {
    const gy = chartY + d * yScale;
    if (gy > chartY + chartH + 4) break;
    ctx.beginPath();
    ctx.moveTo(chartX - sc.v_3_2, gy);
    ctx.lineTo(chartX + 1, gy);
    ctx.stroke();
  }
  // Y-axis label
  ctx.save();
  ctx.translate(chartX - sc.v_22_14, chartY + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font      = `400 ${fs(7.5)}px sans-serif`;
  ctx.fillStyle = "#374151";
  ctx.textAlign = "center";
  ctx.fillText("Distance from proximal edge (mm)", 0, 0);
  ctx.restore();

  // ── Right depth axis (tick marks + depth labels) ──────────────────────────
  const rightAxisX = chartX + chartW;
  ctx.strokeStyle = "rgba(55,65,81,0.4)";
  ctx.lineWidth   = 0.6;
  ctx.setLineDash([]);
  for (let d = 0; d <= maxDepth; d += 10) {
    const gy = chartY + d * yScale;
    if (gy > chartY + chartH + 4) break;
    ctx.beginPath();
    ctx.moveTo(rightAxisX - sc.v_3_2, gy);
    ctx.lineTo(rightAxisX + sc.v_4_3, gy);
    ctx.stroke();
    ctx.fillStyle = "#374151";
    ctx.font      = `400 ${fs(7.5)}px sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(`${d}`, rightAxisX + sc.v_6_4, gy + sc.v_4_3);
  }
  // Minor ticks right
  ctx.strokeStyle = "rgba(55,65,81,0.2)";
  ctx.lineWidth   = 0.4;
  for (let d = 5; d <= maxDepth; d += 10) {
    const gy = chartY + d * yScale;
    if (gy > chartY + chartH + 4) break;
    ctx.beginPath();
    ctx.moveTo(rightAxisX - 1, gy);
    ctx.lineTo(rightAxisX + sc.v_3_2, gy);
    ctx.stroke();
  }

  // ── Film height bracket on right edge ─────────────────────────────────────
  if (filmHeightMm != null) {
    const filmY    = chartY + filmHeightMm * yScale;
    const brkX     = rightAxisX + (sc.isPrint ? 18 : 12);
    const brkW     = sc.isPrint ? 5 : 3;
    if (filmY >= chartY && filmY <= chartY + chartH + 20) {
      ctx.strokeStyle = "rgba(59,130,246,0.80)";
      ctx.fillStyle   = "rgba(59,130,246,0.80)";
      ctx.lineWidth   = 1;
      ctx.setLineDash([]);
      // Vertical bracket
      ctx.beginPath();
      ctx.moveTo(brkX, chartY);
      ctx.lineTo(brkX, filmY);
      ctx.stroke();
      // Top cap
      ctx.beginPath();
      ctx.moveTo(brkX - brkW, chartY);
      ctx.lineTo(brkX + brkW, chartY);
      ctx.stroke();
      // Bottom cap
      ctx.beginPath();
      ctx.moveTo(brkX - brkW, filmY);
      ctx.lineTo(brkX + brkW, filmY);
      ctx.stroke();
      // Label (rotated)
      ctx.save();
      ctx.translate(brkX + (sc.isPrint ? 8 : 5), (chartY + filmY) / 2);
      ctx.rotate(Math.PI / 2);
      ctx.font      = `600 ${fs(6.5)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`Film  ${filmHeightMm} mm`, 0, 0);
      ctx.restore();
    }
  }

  // ── Graft boundary markers ────────────────────────────────────────────────
  // Proximal edge label (above chart, left side)
  ctx.fillStyle = "rgba(16,33,31,0.65)";
  ctx.font      = `700 ${fs(7)}px sans-serif`;
  ctx.fillText("▲ PROXIMAL EDGE", chartX + sc.v_3_2, chartY - (sc.isPrint ? 5 : 3));

  // Distal seal zone boundary line + label
  const sealY = chartY + sealZoneH * yScale;
  if (sealY < chartY + chartH) {
    ctx.save();
    ctx.setLineDash([sc.v_10_7, sc.v_6_4]);
    ctx.strokeStyle = "rgba(180,83,9,0.55)";
    ctx.lineWidth   = sc.v_1_2_0_8;
    ctx.beginPath();
    ctx.moveTo(chartX, sealY);
    ctx.lineTo(chartX + chartW, sealY);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "rgba(180,83,9,0.65)";
    ctx.font      = `600 ${fs(6.5)}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(`▼ Seal zone  ${sealZoneH} mm`, chartX + chartW - sc.v_3_2, sealY - 2);
    ctx.textAlign = "left";
  }

  // ── Clock tick marks and labels above chart (outside clip) ────────────────
  for (let h = 1; h <= 12; h++) {
    const isCard = h % 3 === 0;
    const arc    = ((h % 12) / 12) * result.circumferenceMm;
    const gx     = chartX + arc * xScale;
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth   = isCard ? 1.0 : 0.7;
    ctx.setLineDash([]);
    const tickH = isCard ? sc.v_8_5 : sc.v_5_3;
    ctx.beginPath();
    ctx.moveTo(gx, chartY);
    ctx.lineTo(gx, chartY - tickH);
    ctx.stroke();
    ctx.fillStyle = isCard ? "#334155" : "#64748b";
    ctx.font      = `${isCard ? "600" : "400"} ${fs(isCard ? 8 : 7)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(String(h), gx, chartY - tickH - sc.v_3_2);
    ctx.textAlign = "left";
  }

  // ── Chart border (solid rect — the cut line) ──────────────────────────────
  ctx.strokeStyle = "rgba(16,33,31,0.50)";
  ctx.lineWidth   = 1.0;
  ctx.setLineDash([]);
  ctx.strokeRect(chartX, chartY, chartW, chartH);

  // ── Cut corner registration marks ────────────────────────────────────────
  const cmLen = sc.isPrint ? 10 : 7;
  const cmGap = sc.isPrint ? 3 : 2;
  ctx.strokeStyle = "rgba(16,33,31,0.55)";
  ctx.lineWidth   = 0.8;
  ctx.setLineDash([]);
  // Top-left
  drawCutMark(ctx, chartX, chartY,       -1, -1, cmLen, cmGap);
  // Top-right
  drawCutMark(ctx, chartX + chartW, chartY,       +1, -1, cmLen, cmGap);
  // Bottom-left
  drawCutMark(ctx, chartX, chartY + chartH,       -1, +1, cmLen, cmGap);
  // Bottom-right
  drawCutMark(ctx, chartX + chartW, chartY + chartH, +1, +1, cmLen, cmGap);

  // ── 3-column info strip below chart ──────────────────────────────────────
  const infoTop  = chartY + chartH + (sc.isPrint ? 18 : 12);
  const infoW    = width - margin * 2;
  const colW     = infoW / 3;
  const col1X    = margin;
  const col2X    = margin + colW;
  const col3X    = margin + colW * 2;

  // Separator line
  ctx.strokeStyle = "rgba(16,33,31,0.15)";
  ctx.lineWidth   = 0.8;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(margin, infoTop - (sc.isPrint ? 8 : 6));
  ctx.lineTo(width - margin, infoTop - (sc.isPrint ? 8 : 6));
  ctx.stroke();

  // Vertical column dividers
  for (const divX of [col2X, col3X]) {
    ctx.strokeStyle = "rgba(16,33,31,0.10)";
    ctx.lineWidth   = 0.6;
    ctx.beginPath();
    ctx.moveTo(divX - (sc.isPrint ? 6 : 4), infoTop);
    ctx.lineTo(divX - (sc.isPrint ? 6 : 4), infoTop + sc.infoH - (sc.isPrint ? 20 : 14));
    ctx.stroke();
  }

  const lineH    = fs(sc.v_14_11) * 0.92;
  const valOffX  = colW * 0.48;

  function colTitle(x: number, y: { v: number }, t: string) {
    ctx.fillStyle = "#10211f";
    ctx.font      = `700 ${fs(9.5)}px sans-serif`;
    ctx.fillText(t, x, y.v);
    y.v += lineH * 0.3;
    ctx.strokeStyle = "rgba(16,33,31,0.15)";
    ctx.lineWidth   = 0.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x, y.v);
    ctx.lineTo(x + colW - (sc.isPrint ? 12 : 8), y.v);
    ctx.stroke();
    y.v += lineH * 0.85;
  }

  function colSpec(x: number, y: { v: number }, key: string, val: string, valColor?: string) {
    ctx.fillStyle = "rgba(69,96,91,0.75)";
    ctx.font      = `400 ${fs(8)}px sans-serif`;
    ctx.fillText(key, x, y.v);
    ctx.fillStyle = valColor ?? "#10211f";
    ctx.font      = `600 ${fs(8)}px sans-serif`;
    ctx.fillText(val, x + valOffX, y.v);
    y.v += lineH;
  }

  // ─ Column 1: DEVICE ───────────────────────────────────────────────────────
  const c1 = { v: infoTop };
  colTitle(col1X, c1, "DEVICE");
  colSpec(col1X, c1, "Platform",    result.device.shortName, result.device.color);
  colSpec(col1X, c1, "Diameter",    `${result.size.graftDiameter} mm`);
  colSpec(col1X, c1, "Circ",        `${result.circumferenceMm.toFixed(1)} mm`);
  colSpec(col1X, c1, "Sheath",      `${result.size.sheathFr} Fr`);
  colSpec(col1X, c1, "Foreshorten", `${(result.device.foreshortening * 100).toFixed(0)}%`);
  colSpec(col1X, c1, "Ring height", `${effectiveRingH} mm`);
  colSpec(col1X, c1, "Gap",         `${effectiveGap} mm`,
    effectiveGap >= 12 ? "#15803d" : "#c2410c");
  colSpec(col1X, c1, "Peaks / ring", `${result.nPeaks}`);
  // Tie positions
  colSpec(col1X, c1, "Tie pos",     `${tieClock.join(", ")} o'clock`);
  if (filmHeightMm != null) {
    colSpec(col1X, c1, "Film height", `${filmHeightMm} mm`);
  }

  // ─ Column 2: ROTATION PLAN + SPACING ──────────────────────────────────────
  const c2 = { v: infoTop };
  colTitle(col2X, c2, "ROTATION PLAN");
  if (result.rotation.hasConflictFreeRotation) {
    ctx.fillStyle = "#15803d";
    ctx.font      = `700 ${fs(8.5)}px sans-serif`;
    c2.v = wrapText(
      ctx,
      `Rotate ${result.rotation.optimalDeltaDeg.toFixed(0)}° CW (${result.rotation.optimalDeltaMm.toFixed(1)} mm). Valid window: ${result.rotation.validWindows.map((w) => `${w.startDeg.toFixed(0)}°–${w.endDeg.toFixed(0)}°`).join(", ")}.`,
      col2X, c2.v, colW - (sc.isPrint ? 12 : 8), lineH, 4,
    );
  } else {
    ctx.fillStyle = "#b45309";
    ctx.font      = `700 ${fs(8.5)}px sans-serif`;
    c2.v = wrapText(
      ctx,
      `No conflict-free rotation. Best compromise: ${result.rotation.bestCompromiseDeg.toFixed(0)}° CW. Strut bending may be required.`,
      col2X, c2.v, colW - (sc.isPrint ? 12 : 8), lineH, 4,
    );
  }
  c2.v += lineH * 0.6;

  const spacingFens = caseInput.fenestrations
    .filter((f) => f.ftype !== "SCALLOP")
    .slice()
    .sort((a, b) => a.depthMm - b.depthMm);
  if (spacingFens.length >= 2) {
    colTitle(col2X, c2, "SPACING  (center-to-center)");
    colSpec(col2X, c2, `Prox → ${spacingFens[0].vessel}`, `${spacingFens[0].depthMm} mm`);
    for (let i = 1; i < spacingFens.length; i++) {
      const dist = spacingFens[i].depthMm - spacingFens[i - 1].depthMm;
      colSpec(col2X, c2, `${spacingFens[i - 1].vessel} → ${spacingFens[i].vessel}`, `${dist} mm`);
    }
  }

  // ─ Column 3: FENESTRATIONS ─────────────────────────────────────────────────
  const c3 = { v: infoTop };
  colTitle(col3X, c3, "FENESTRATIONS");
  const fcnt: Record<string, number> = { SCALLOP: 0, LARGE_FEN: 0, SMALL_FEN: 0 };

  caseInput.fenestrations.forEach((fen, idx) => {
    const conflict  = result.optimalConflicts[idx];
    const adjClock  = conflict?.adjustedClock ?? fen.clock;
    const isConf    = conflict?.conflict ?? false;
    const fenCol    = VESSEL_COLORS[fen.vessel] ?? "#334155";
    fcnt[fen.ftype] = (fcnt[fen.ftype] ?? 0) + 1;
    const typeLabel =
      fen.ftype === "SCALLOP"   ? `SCALLOP #${fcnt.SCALLOP}`     :
      fen.ftype === "LARGE_FEN" ? `LARGE FEN #${fcnt.LARGE_FEN}` :
                                  `SMALL FEN #${fcnt.SMALL_FEN}`;

    ctx.fillStyle = fenCol;
    ctx.font      = `700 ${fs(8.5)}px sans-serif`;
    ctx.fillText(`${fen.vessel}  ${typeLabel}`, col3X, c3.v);
    c3.v += lineH;

    ctx.fillStyle = "#334155";
    ctx.font      = `400 ${fs(7.5)}px sans-serif`;
    if (fen.ftype !== "SCALLOP") {
      const seam     = result.device.seamDeg;
      const adjArcMm  = clockTextToArcMm(adjClock, result.circumferenceMm);
      const seamArcMm = (seam / 360) * result.circumferenceMm + delta;
      const arcSep    = adjArcMm - seamArcMm;
      for (const row of [
        `Clock: ${fen.clock} → ${adjClock}`,
        `Depth: ${fen.depthMm} mm  ·  ${fen.widthMm}×${fen.heightMm} mm`,
        `ARCSEP: ${arcSep > 0 ? "+" : ""}${arcSep.toFixed(1)} mm from seam`,
      ]) {
        ctx.fillText(row, col3X + sc.v_6_4, c3.v);
        c3.v += lineH;
      }
      ctx.fillStyle = isConf ? "#dc2626" : "#15803d";
      ctx.font      = `700 ${fs(7.5)}px sans-serif`;
      ctx.fillText(
        isConf ? `⚠ Conflict  (${conflict.minDist.toFixed(1)} mm)` : `✓ Clear  (${conflict.minDist.toFixed(1)} mm)`,
        col3X + sc.v_6_4, c3.v,
      );
      c3.v += lineH;
    } else {
      ctx.fillText(`Clock: ${adjClock}  ·  ${fen.widthMm}×${fen.heightMm} mm`, col3X + sc.v_6_4, c3.v);
      c3.v += lineH;
    }
    c3.v += lineH * 0.5;
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = height - margin + sc.v_8_4;
  ctx.fillStyle = "rgba(69,96,91,0.55)";
  ctx.font      = `400 ${fs(7)}px sans-serif`;
  ctx.fillText(
    `FOR RESEARCH / PLANNING USE ONLY  ·  Print at 100% Actual Size  ·  Width = ${result.circumferenceMm.toFixed(1)} mm  ·  PMEGplan.io`,
    margin,
    footerY,
  );

  // ── Scale bar ─────────────────────────────────────────────────────────────
  const sbX   = margin;
  const sbY   = height - margin + sc.v_m14_m10;
  const sbLen = 10 * xScale;
  ctx.strokeStyle = "#10211f";
  ctx.fillStyle   = "#10211f";
  ctx.lineWidth   = sc.v_1_8_1_2;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(sbX, sbY);
  ctx.lineTo(sbX + sbLen, sbY);
  ctx.moveTo(sbX, sbY - sc.v_4_3);
  ctx.lineTo(sbX, sbY + sc.v_4_3);
  ctx.moveTo(sbX + sbLen, sbY - sc.v_4_3);
  ctx.lineTo(sbX + sbLen, sbY + sc.v_4_3);
  ctx.stroke();
  ctx.font      = `700 ${fs(8)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("10 mm", sbX + sbLen / 2, sbY - sc.v_6_4);
  ctx.textAlign = "left";

  // ── Calibration note ──────────────────────────────────────────────────────
  if (showCalibration) {
    ctx.fillStyle = "rgba(16,33,31,0.40)";
    ctx.font      = `400 italic ${fs(7)}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(
      `Verify: chart width = ${result.circumferenceMm.toFixed(1)} mm`,
      width - margin,
      height - margin + sc.v_8_4,
    );
    ctx.textAlign = "left";
  }
}
