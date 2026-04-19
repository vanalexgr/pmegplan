/**
 * punchCardRenderer.ts  —  PMEGplan.io
 *
 * Renders the PMEG back-table punch card template.
 *
 * Features:
 *   • Full-width chart centred on 12:00 (anterior) — 6:00 at both edges
 *   • Top ruler: nominal perimeter bracket, mm ticks, clock positions, tie markers
 *   • CUT vertical lines + WRAP EDGE vertical lines clearly labelled
 *   • Left + right depth axes with 10 mm / 5 mm ruler marks
 *   • Proximal edge label + distal seal-zone boundary line
 *   • Film boundary reference line + right-edge height bracket
 *   • Color-coded full-width horizontal guide lines per fenestration
 *   • AP markers at 12:00 (centre) and 6:00 (both edges)
 *   • Anti-rotation ✓ mark at 12:00
 *   • Reduction tie position lines
 *   • Device-coloured strut wires (boundary-crossing segments handled)
 *   • Right-side ruler: center-to-center AND bottom-to-bottom distance bars
 *   • 3-column device plan strip below chart (easy to cut apart)
 *   • 10 mm scale bar + calibration note
 */

import { getDeploymentTorqueInfo } from "@/lib/analysis";
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
  leftAxisW:   number;
  rightAnnotW: number;
  rulerH:      number;
  infoH:       number;
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
    rightAnnotW: isPrint ? 108 : 75,
    rulerH:      isPrint ? 54 : 36,
    infoH:       isPrint ? 210 : 140,
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
  return arcMmToClockText(arcMm, circ, { separator: ":", padHour: false });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, radius: number,
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
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number,
  maxWidth: number, lineH: number, maxLines = 5,
): number {
  const words = text.split(" ");
  let line = "";
  let idx  = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) { line = test; continue; }
    ctx.fillText(line, x, y + idx * lineH);
    line = word; idx++;
    if (idx >= maxLines - 1) break;
  }
  if (line) { ctx.fillText(line, x, y + idx * lineH); idx++; }
  return y + idx * lineH;
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, dir: "up" | "down", size: number,
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

// L-shaped registration mark; arms point outward from the chart corner
function drawCutMark(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, dh: number, dv: number,
  len: number, gap: number,
) {
  ctx.beginPath();
  ctx.moveTo(cx + dh * gap, cy);
  ctx.lineTo(cx + dh * (gap + len), cy);
  ctx.moveTo(cx, cy + dv * gap);
  ctx.lineTo(cx, cy + dv * (gap + len));
  ctx.stroke();
}

// ── Height computation ────────────────────────────────────────────────────────

// Estimate the info-strip height based on content (fenestration count etc.)
// Used by both computePunchCardHeight and renderPunchCard so they stay in sync.
function estimateInfoStripH(caseInput: CaseInput, sc: PunchCardScaleContext): number {
  const lineH      = (sc.isPrint ? 14 * 1.45 : 11) * 0.92;
  const titleRows  = 1.15;  // colTitle overhead
  const nFens      = caseInput.fenestrations.filter((f) => f.ftype !== "SCALLOP").length;
  const nScallops  = caseInput.fenestrations.filter((f) => f.ftype === "SCALLOP").length;
  // col1 (DEVICE): title + 9 fixed specs + optional filmHeightMm
  const col1Rows = titleRows + 9 + (caseInput.filmHeightMm != null ? 1 : 0);
  // col2 (ROTATION): title + ~4 text lines + optional SPACING table
  const col2Rows = titleRows + 4 + (nFens >= 2 ? titleRows + nFens : 0);
  // col3 (FENESTRATIONS): title + 5.5 rows per fen + 1.5 per scallop
  const col3Rows = titleRows + nFens * 5.5 + nScallops * 1.5;
  const maxRows  = Math.max(col1Rows, col2Rows, col3Rows);
  // Add footer + scale-bar clearance below content
  const footerClear = sc.isPrint ? 28 : 20;
  return Math.ceil(maxRows * lineH) + footerClear;
}

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
  const xScale  = chartW / result.circumferenceMm;
  const chartH  = maxDepth * xScale;
  const infoH   = estimateInfoStripH(caseInput, sc);
  return Math.ceil(sc.v_80_52 + sc.rulerH + chartH + infoH + margin);
}

export interface PunchCardRenderOptions {
  ctx:              CanvasRenderingContext2D;
  width:            number;
  height:           number;
  result:           DeviceAnalysisResult;
  caseInput:        CaseInput;
  mode?:            "preview" | "print";
  tieClock?:        number[];
  cutMarginMm?:     number;
  showCalibration?: boolean;
  filmHeightMm?:    number;
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export function renderPunchCard({
  ctx, width, height, result, caseInput,
  mode = "preview", tieClock = [4, 6, 8],
  cutMarginMm = 8, showCalibration = true, filmHeightMm,
}: PunchCardRenderOptions): void {

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f8f4ed";
  ctx.fillRect(0, 0, width, height);

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
  const fs = (base: number) => sc.isPrint ? base * 1.45 : base;

  // ── Layout constants ──────────────────────────────────────────────────────
  const margin    = sc.v_52_20;
  const headerH   = sc.v_80_52;
  const chartX    = margin + sc.leftAxisW;
  const chartY    = headerH + sc.rulerH;
  const chartW    = width - chartX - sc.rightAnnotW - margin;

  const sealZoneH = getSealZoneHeightMm(result.device);
  const maxDepth  = Math.max(
    sealZoneH + 12,
    ...caseInput.fenestrations.map((f) => f.depthMm + 28),
    ...(filmHeightMm != null ? [filmHeightMm + 12] : []),
  );
  const xScale = chartW / result.circumferenceMm;
  const yScale = xScale;
  const chartH = maxDepth * yScale;
  const circ   = result.circumferenceMm;

  const { ringHeight: effectiveRingH, interRingGap: effectiveGap } =
    getEffectiveRingGeometry(result.device, result.size);

  // ── arcToGx: arc → canvas x, centred on 12:00 (anterior) ─────────────────
  // Chart shows arc range [circ/2 … circ/2+circ], i.e. 6:00 at both edges.
  const arcToGx = (arc: number) =>
    chartX + ((arc - circ / 2 + circ * 4) % circ) * xScale;

  // For strut wrap-copy rendering: pixel offsets ±chartW
  function drawStrutPass(lineW: number, strokeCol: string) {
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth   = lineW;
    ctx.setLineDash([]);
    for (const [ax, ay, bx, by] of result.strutSegments as StrutSegment[]) {
      const sx0 = arcToGx(ax);
      const ex0 = arcToGx(bx);
      const sy  = chartY + (ay as number) * yScale;
      const ey  = chartY + (by as number) * yScale;

      // Detect segments that cross the 6:00 boundary (opposite chart edges)
      const isCrossing = Math.abs(sx0 - ex0) > chartW * 0.5;

      const pairs: [number, number, number, number][] = isCrossing
        ? [
            [sx0 - chartW, sy, ex0,         ey],   // left-edge half
            [sx0,          sy, ex0 + chartW, ey],   // right-edge half
          ]
        : [
            [sx0 - chartW, sy, ex0 - chartW, ey],
            [sx0,          sy, ex0,          ey],
            [sx0 + chartW, sy, ex0 + chartW, ey],
          ];

      for (const [sx, syd, ex, eyd] of pairs) {
        if (Math.max(sx, ex) < chartX - 8 || Math.min(sx, ex) > chartX + chartW + 8) continue;
        ctx.beginPath();
        ctx.moveTo(sx, syd);
        ctx.lineTo(ex, eyd);
        ctx.stroke();
      }
    }
  }

  // ── Card background ───────────────────────────────────────────────────────
  drawRoundedRect(ctx, 6, 6, width - 12, height - 12, sc.v_28_18);
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.fill();
  ctx.strokeStyle = "rgba(16,33,31,0.09)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // ── Outer cut-guide dashed border ────────────────────────────────────────
  const cutPx = cutMarginMm * xScale;
  ctx.save();
  ctx.setLineDash([sc.v_10_7, sc.v_6_4]);
  ctx.strokeStyle = "rgba(16,33,31,0.18)";
  ctx.lineWidth = sc.v_1_2_0_8;
  ctx.strokeRect(cutPx, cutPx, width - cutPx * 2, height - cutPx * 2);
  ctx.restore();

  // ── CUT vertical lines (at chart edges, in the axis margin areas) ─────────
  for (const [cx, dir] of [[chartX, -1], [chartX + chartW, 1]] as [number, number][]) {
    // Dotted vertical line
    ctx.save();
    ctx.setLineDash([sc.v_4_3, sc.v_4_3]);
    ctx.strokeStyle = "rgba(16,33,31,0.45)";
    ctx.lineWidth   = sc.v_1_2_0_8;
    ctx.beginPath();
    ctx.moveTo(cx + dir * (sc.isPrint ? 5 : 4), chartY - sc.rulerH / 2);
    ctx.lineTo(cx + dir * (sc.isPrint ? 5 : 4), chartY + chartH);
    ctx.stroke();
    ctx.restore();
    // CUT label rotated
    ctx.save();
    const labelX = cx + dir * (sc.isPrint ? 16 : 11);
    ctx.translate(labelX, chartY + chartH * 0.2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "rgba(16,33,31,0.55)";
    ctx.font      = `700 ${fs(7)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("CUT", 0, 0);
    ctx.restore();
  }

  // ── Header ────────────────────────────────────────────────────────────────
  ctx.fillStyle = "#10211f";
  ctx.font = `700 ${fs(sc.v_18_14)}px sans-serif`;
  ctx.fillText(result.device.name, margin, margin + fs(sc.v_18_14));
  ctx.fillStyle = "#45605b";
  ctx.font = `400 ${fs(sc.v_11_9)}px sans-serif`;
  ctx.fillText(
    `${result.device.manufacturer}  ·  Ø${result.size.graftDiameter} mm  ·  Circ ${circ.toFixed(1)} mm  ·  ${result.nPeaks} peaks  ·  Foreshortening ${(result.device.foreshortening * 100).toFixed(0)}%  ·  ${result.device.fabricMaterial}`,
    margin, margin + fs(sc.v_33_26),
  );
  if (caseInput.patientId ?? caseInput.surgeonName) {
    ctx.fillText(
      `Patient: ${caseInput.patientId ?? "—"}   Surgeon: ${caseInput.surgeonName ?? "—"}`,
      margin, margin + fs(sc.v_48_37),
    );
  }

  // ── Top circumference ruler strip ─────────────────────────────────────────
  //
  // Three vertical zones inside rulerH:
  //   Zone A (top ~40%): circumference bracket + perimeter label
  //   Zone B (mid ~35%): clock-hour labels with colored pills for 3/6/9/12
  //   Zone C (bot ~25%): mm tick marks + distance labels
  //
  const zoneAH  = sc.rulerH * 0.40;   // bracket row height
  const zoneBH  = sc.rulerH * 0.35;   // clock label row height
  const zoneAY  = headerH + zoneAH;   // y of bracket line
  const zoneBY  = headerH + zoneAH + zoneBH * 0.80;  // y of clock label baseline
  const tickBotY = chartY - (sc.isPrint ? 2 : 1);    // bottom of mm ticks
  const tickLblY = chartY - zoneAH * 0.30;            // mm label baseline (above ticks)

  // Ruler background — light slate, distinct from card
  ctx.fillStyle = "rgba(226,232,240,0.75)";
  ctx.fillRect(chartX, headerH, chartW, sc.rulerH);
  // Thin bottom border
  ctx.strokeStyle = "rgba(100,116,139,0.35)";
  ctx.lineWidth = 0.6;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(chartX, chartY);
  ctx.lineTo(chartX + chartW, chartY);
  ctx.stroke();

  // ── Zone A: circumference bracket ────────────────────────────────────────
  ctx.strokeStyle = "#334155";
  ctx.fillStyle   = "#334155";
  ctx.lineWidth   = sc.isPrint ? 1.0 : 0.8;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(chartX + 2, zoneAY);
  ctx.lineTo(chartX + chartW - 2, zoneAY);
  ctx.stroke();
  for (const ex of [chartX + 1, chartX + chartW - 1]) {
    ctx.beginPath();
    ctx.moveTo(ex, zoneAY - (sc.isPrint ? 5 : 4));
    ctx.lineTo(ex, zoneAY + (sc.isPrint ? 5 : 4));
    ctx.stroke();
  }
  ctx.font      = `600 ${fs(7.5)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(
    `Nominal perimeter  ${circ.toFixed(1)} mm  (Ø${result.size.graftDiameter} mm graft)`,
    chartX + chartW / 2, zoneAY - (sc.isPrint ? 7 : 5),
  );
  ctx.textAlign = "left";

  // ── Zone B: clock-hour labels with colored pills ──────────────────────────
  const clockPillColors: Record<number, string> = {
    12: "#0f766e",  // teal — anterior
    6:  "#1d4ed8",  // blue — posterior
    3:  "#7c3aed",  // violet — right
    9:  "#b45309",  // amber — left
  };
  const pillPad = sc.isPrint ? 3.5 : 2.5;
  const pillRad = sc.isPrint ? 3 : 2;
  const clockFontSz = fs(sc.isPrint ? 8 : 7);

  for (let h = 1; h <= 12; h++) {
    const isCard = h % 3 === 0;
    if (!isCard) continue;
    const arc = ((h % 12) / 12) * circ;
    const gx  = arcToGx(arc);
    const lbl = `${h}:00`;
    const col = clockPillColors[h] ?? "#475569";

    ctx.font = `700 ${clockFontSz}px sans-serif`;
    const tw = ctx.measureText(lbl).width;
    const px = gx - tw / 2 - pillPad;
    const py = zoneBY - clockFontSz - pillPad;
    const pw = tw + pillPad * 2;
    const ph = clockFontSz + pillPad * 2;

    // Pill background
    drawRoundedRect(ctx, px, py, pw, ph, pillRad);
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.15;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = sc.isPrint ? 1.0 : 0.7;
    ctx.stroke();

    // Label
    ctx.fillStyle = col;
    ctx.textAlign = "center";
    ctx.fillText(lbl, gx, zoneBY);
    ctx.textAlign = "left";

    // Tick from pill bottom to mm-tick zone
    ctx.strokeStyle = `${col}80`;
    ctx.lineWidth   = sc.isPrint ? 1.2 : 0.9;
    ctx.beginPath();
    ctx.moveTo(gx, py + ph);
    ctx.lineTo(gx, tickBotY);
    ctx.stroke();
  }

  // ── Zone B: tie position markers ──────────────────────────────────────────
  const TIE_COL = "rgba(146,64,14,0.90)";  // warm brown/amber
  for (const clockHour of tieClock) {
    const tieArc = ((clockHour % 12) / 12) * circ;
    const tx     = arcToGx(tieArc);
    if (tx < chartX || tx > chartX + chartW) continue;

    // Diamond marker
    const ds = sc.isPrint ? 4 : 3;
    ctx.save();
    ctx.translate(tx, zoneBY - clockFontSz / 2);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle   = TIE_COL;
    ctx.strokeStyle = TIE_COL;
    ctx.lineWidth   = 0.7;
    ctx.fillRect(-ds / 2, -ds / 2, ds, ds);
    ctx.restore();

    // "T#" label below diamond
    ctx.fillStyle = TIE_COL;
    ctx.font      = `700 ${fs(7.5)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`T${clockHour}`, tx, zoneBY + (sc.isPrint ? 2 : 1));
    ctx.textAlign = "left";

    // Tick to chart
    ctx.strokeStyle = `${TIE_COL}`;
    ctx.lineWidth   = 0.8;
    ctx.setLineDash([sc.v_4_3, sc.v_3_2]);
    ctx.beginPath();
    ctx.moveTo(tx, zoneBY + (sc.isPrint ? 4 : 3));
    ctx.lineTo(tx, tickBotY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Zone C: mm tick marks + distance labels ───────────────────────────────
  for (let mm = 0; mm <= Math.ceil(circ); mm += 5) {
    const tx    = arcToGx(mm + circ / 2);
    const isMaj = mm % 10 === 0;
    const tLen  = isMaj ? (sc.isPrint ? 7 : 5) : (sc.isPrint ? 4 : 3);
    ctx.strokeStyle = isMaj ? "#334155" : "#64748b";
    ctx.lineWidth   = isMaj ? (sc.isPrint ? 1.0 : 0.8) : (sc.isPrint ? 0.6 : 0.5);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(tx, tickBotY - tLen);
    ctx.lineTo(tx, tickBotY);
    ctx.stroke();
    if (isMaj) {
      // Small label background for legibility
      ctx.fillStyle = "rgba(226,232,240,0.85)";
      const lbl = `${mm}`;
      ctx.font = `500 ${fs(7)}px sans-serif`;
      const lw = ctx.measureText(lbl).width;
      ctx.fillRect(tx - lw / 2 - 1, tickLblY - fs(7), lw + 2, fs(7) + 1);
      ctx.fillStyle = "#1e293b";
      ctx.textAlign = "center";
      ctx.fillText(lbl, tx, tickLblY);
      ctx.textAlign = "left";
    }
  }

  // ── Chart background: ring/gap bands ─────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.rect(chartX, chartY, chartW, chartH);
  ctx.clip();

  ctx.fillStyle = "rgba(255,255,255,0.60)";
  ctx.fillRect(chartX, chartY, chartW, chartH);

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

  // Vertical clock guide lines removed — ruler pills already identify positions.

  // ── Seam dashed line ──────────────────────────────────────────────────────
  const seamArc = (result.device.seamDeg / 360) * circ;
  const seamGx  = arcToGx(seamArc);
  ctx.save();
  ctx.setLineDash([sc.v_9_6, sc.v_5_4]);
  ctx.strokeStyle = "rgba(217,119,6,0.90)";
  ctx.lineWidth   = sc.v_1_8_1_2;
  ctx.beginPath();
  ctx.moveTo(seamGx, chartY);
  ctx.lineTo(seamGx, chartY + chartH);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "rgba(217,119,6,0.70)";
  ctx.font      = `600 ${fs(7)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("SEAM", seamGx, chartY + sc.v_11_8);
  ctx.textAlign = "left";

  // ── Z-stent struts ────────────────────────────────────────────────────────
  drawStrutPass(sc.v_2_4_1_8 + sc.v_2_5_2, "rgba(255,255,255,0.85)");  // white halo
  drawStrutPass(sc.v_2_4_1_8,               result.device.color);       // device colour

  // ── Reduction tie position lines ──────────────────────────────────────────
  for (const clockHour of tieClock) {
    const tieArc = ((clockHour % 12) / 12) * circ;
    const tx0    = arcToGx(tieArc);
    for (const poff of [-chartW, 0, chartW]) {
      const tx = tx0 + poff;
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

  // ── Film boundary line ────────────────────────────────────────────────────
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
    const adjArc   = clockTextToArcMm(conflict?.adjustedClock ?? fen.clock, circ);
    const fenY     = chartY + fen.depthMm * yScale;
    const col      = VESSEL_COLORS[fen.vessel] ?? "#475569";
    const rW_px    = Math.max((fen.widthMm / 2) * xScale, sc.v_10_6);
    const rH_px    = Math.max((fen.heightMm / 2) * yScale, sc.v_10_6);

    // Full-width color-coded depth guide line
    if (fen.ftype !== "SCALLOP") {
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = col;
      ctx.lineWidth   = sc.isPrint ? 1.4 : 1.0;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(chartX, fenY);
      ctx.lineTo(chartX + chartW, fenY);
      ctx.stroke();
      ctx.restore();
    }

    const fenX0   = arcToGx(adjArc);
    for (const poff of [-chartW, 0, chartW]) {
      const fenX = fenX0 + poff;
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
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.ellipse(fenX, fenY, rW_px, rH_px, 0, 0, Math.PI * 2);
        ctx.fillStyle   = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth   = sc.v_2_4_2_0;
        ctx.stroke();

        const cs = sc.v_5_3;
        ctx.strokeStyle = col;
        ctx.lineWidth   = sc.v_1_4_1_0;
        ctx.beginPath();
        ctx.moveTo(fenX - cs, fenY); ctx.lineTo(fenX + cs, fenY);
        ctx.moveTo(fenX, fenY - cs); ctx.lineTo(fenX, fenY + cs);
        ctx.stroke();

        ctx.fillStyle = col;
        ctx.font      = `700 ${fs(8)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(`Ø${fen.widthMm}`, fenX, fenY + rH_px * 0.42 + fs(8) * 0.35);
        ctx.textAlign = "left";

        ctx.fillStyle = col;
        ctx.font      = `700 ${fs(9)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(fen.vessel, fenX, fenY + rH_px + sc.v_13_10);
        ctx.fillStyle = isConf ? "#dc2626" : "#334155";
        ctx.font      = `${isConf ? "700" : "400"} ${fs(7.5)}px sans-serif`;
        ctx.fillText(
          isConf ? `⚠ CONFLICT  ${conflict.minDist.toFixed(1)} mm`
                 : `✓ ${conflict.minDist.toFixed(1)} mm clear`,
          fenX, fenY + rH_px + sc.v_24_18,
        );
        ctx.fillStyle = "#374151";
        ctx.font      = `400 ${fs(7)}px sans-serif`;
        ctx.fillText(arcToClockStr(adjArc, circ), fenX, fenY - rH_px - sc.v_5_3);
        ctx.textAlign = "left";

        if (poff === 0) {
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

  // ── Anti-rotation ✓ at 12:00 (centre) ───────────────────────────────────
  const ant12x = arcToGx(0);
  ctx.font      = `700 ${fs(sc.v_24_16)}px sans-serif`;
  ctx.fillStyle = "#0f766e";
  ctx.textAlign = "center";
  ctx.fillText("✓", ant12x, chartY + sc.v_28_20);
  ctx.textAlign = "left";

  // ── WRAP EDGE lines (at chart left and right = 6:00 position) ────────────
  for (const [wx, rot, lbl] of [
    [chartX,          -Math.PI / 2, "6:00  WRAP EDGE  →"],
    [chartX + chartW, +Math.PI / 2, "←  WRAP EDGE  6:00"],
  ] as [number, number, string][]) {
    // Vertical dotted line over full chart height
    ctx.save();
    ctx.setLineDash([sc.v_5_4, sc.v_4_3]);
    ctx.strokeStyle = "rgba(16,33,31,0.50)";
    ctx.lineWidth   = 1.0;
    ctx.beginPath();
    ctx.moveTo(wx, chartY - sc.rulerH / 2);
    ctx.lineTo(wx, chartY + chartH);
    ctx.stroke();
    ctx.restore();
    // Rotated label inside chart
    ctx.save();
    ctx.translate(wx, chartY + chartH * 0.5);
    ctx.rotate(rot);
    ctx.font      = `700 ${fs(7.5)}px sans-serif`;
    ctx.fillStyle = "rgba(16,33,31,0.50)";
    ctx.textAlign = "center";
    ctx.fillText(lbl, 0, 0);
    ctx.restore();
  }

  ctx.restore(); // end chart clip

  // ── Left depth axis ───────────────────────────────────────────────────────
  ctx.fillStyle   = "#374151";
  ctx.strokeStyle = "rgba(55,65,81,0.4)";
  ctx.lineWidth   = 0.6;
  ctx.setLineDash([]);
  for (let d = 0; d <= maxDepth; d += 10) {
    const gy = chartY + d * yScale;
    if (gy > chartY + chartH + 4) break;
    ctx.beginPath();
    ctx.moveTo(chartX - sc.v_4_3, gy);
    ctx.lineTo(chartX + sc.v_3_2, gy);
    ctx.stroke();
    ctx.font      = `400 ${fs(8)}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(`${d}`, chartX - sc.v_6_4, gy + sc.v_4_3);
    ctx.textAlign = "left";
  }
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
  ctx.save();
  ctx.translate(chartX - sc.v_22_14, chartY + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font      = `400 ${fs(7.5)}px sans-serif`;
  ctx.fillStyle = "#374151";
  ctx.textAlign = "center";
  ctx.fillText("Distance from proximal edge (mm)", 0, 0);
  ctx.restore();

  // ── Right depth axis + film height bracket ────────────────────────────────
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

  if (filmHeightMm != null) {
    const filmY = chartY + filmHeightMm * yScale;
    const brkX  = rightAxisX + (sc.isPrint ? 20 : 13);
    const brkW  = sc.isPrint ? 5 : 3;
    if (filmY >= chartY && filmY <= chartY + chartH + 20) {
      ctx.strokeStyle = "rgba(59,130,246,0.80)";
      ctx.fillStyle   = "rgba(59,130,246,0.80)";
      ctx.lineWidth   = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(brkX, chartY);
      ctx.lineTo(brkX, filmY);
      ctx.stroke();
      for (const fy of [chartY, filmY]) {
        ctx.beginPath();
        ctx.moveTo(brkX - brkW, fy);
        ctx.lineTo(brkX + brkW, fy);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(brkX + (sc.isPrint ? 9 : 6), (chartY + filmY) / 2);
      ctx.rotate(Math.PI / 2);
      ctx.font      = `600 ${fs(6.5)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`Film  ${filmHeightMm} mm`, 0, 0);
      ctx.restore();
    }
  }

  // ── Right-side measurement ruler (center-to-center + bottom-to-bottom) ────
  const depthLabelW = sc.isPrint ? 22 : 15;   // space taken by right depth labels
  const filmBrkW    = filmHeightMm != null ? (sc.isPrint ? 22 : 15) : 0;
  const rulerStartX = rightAxisX + depthLabelW + filmBrkW + (sc.isPrint ? 6 : 4);
  const subW        = sc.isPrint ? 24 : 17;    // each sub-column width
  const subGap      = sc.isPrint ? 5 : 3;
  const ccX         = rulerStartX;
  const bbX         = rulerStartX + subW + subGap;

  const sortedFens = caseInput.fenestrations
    .filter((f) => f.ftype !== "SCALLOP")
    .slice()
    .sort((a, b) => a.depthMm - b.depthMm);

  if (sortedFens.length >= 1) {
    // Column headers (rotated)
    for (const [hx, label] of [[ccX + subW / 2, "center-to-center"], [bbX + subW / 2, "bottom-to-bottom"]] as [number, string][]) {
      ctx.save();
      ctx.translate(hx, chartY - (sc.isPrint ? 5 : 3));
      ctx.rotate(-Math.PI / 2);
      ctx.font      = `600 ${fs(6.5)}px sans-serif`;
      ctx.fillStyle = "#374151";
      ctx.textAlign = "left";
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }

    let prevCenterPx = chartY;
    let prevBottomPx = chartY;
    let prevDepthMm  = 0;
    let prevBotMm    = 0;

    sortedFens.forEach((fen, i) => {
      const fenCol      = VESSEL_COLORS[fen.vessel] ?? "#475569";
      const centerPx    = chartY + fen.depthMm * yScale;
      const bottomPx    = chartY + (fen.depthMm + fen.heightMm / 2) * yScale;
      const ccDistMm    = fen.depthMm - prevDepthMm;
      const bbDistMm    = (fen.depthMm - fen.heightMm / 2) - prevBotMm;

      // ── Center-to-center bar ──
      const ccH = centerPx - prevCenterPx;
      if (ccH > 0) {
        ctx.fillStyle   = `${fenCol}25`;
        ctx.strokeStyle = fenCol;
        ctx.lineWidth   = 0.7;
        ctx.setLineDash([]);
        ctx.fillRect(ccX, prevCenterPx, subW, ccH);
        ctx.strokeRect(ccX, prevCenterPx, subW, ccH);
        if (ccH > fs(7) + 2) {
          ctx.fillStyle = "#10211f";
          ctx.font      = `600 ${fs(7)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(`${ccDistMm} mm`, ccX + subW / 2, prevCenterPx + ccH / 2 + fs(7) * 0.35);
          ctx.textAlign = "left";
        }
        // Connector tick to chart
        ctx.strokeStyle = `${fenCol}60`;
        ctx.lineWidth   = 0.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(rightAxisX, centerPx);
        ctx.lineTo(ccX, centerPx);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── Bottom-to-bottom bar ──
      if (i === 0) {
        // First fen: prox edge to bottom of fen
        const topDistMm = fen.depthMm + fen.heightMm / 2;
        const bbH0      = bottomPx - chartY;
        if (bbH0 > 0) {
          ctx.fillStyle   = `${fenCol}18`;
          ctx.strokeStyle = fenCol;
          ctx.lineWidth   = 0.7;
          ctx.setLineDash([]);
          ctx.fillRect(bbX, chartY, subW, bbH0);
          ctx.strokeRect(bbX, chartY, subW, bbH0);
          if (bbH0 > fs(7) + 2) {
            ctx.fillStyle = "#10211f";
            ctx.font      = `600 ${fs(7)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText(`${Math.round(topDistMm)} mm`, bbX + subW / 2, chartY + bbH0 / 2 + fs(7) * 0.35);
            ctx.textAlign = "left";
          }
        }
      } else {
        // Gap between bottom of prev and top of this fen
        const topOfThisMm  = fen.depthMm - fen.heightMm / 2;
        const bbH           = (topOfThisMm - prevBotMm) * yScale;
        const bbTopPx       = prevBottomPx;
        if (bbH > 0) {
          ctx.fillStyle   = `${fenCol}18`;
          ctx.strokeStyle = fenCol;
          ctx.lineWidth   = 0.7;
          ctx.setLineDash([]);
          ctx.fillRect(bbX, bbTopPx, subW, bbH);
          ctx.strokeRect(bbX, bbTopPx, subW, bbH);
          if (bbH > fs(7) + 2) {
            ctx.fillStyle = "#10211f";
            ctx.font      = `600 ${fs(7)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText(
              `${bbDistMm > 0 ? bbDistMm.toFixed(1) : "0"} mm`,
              bbX + subW / 2, bbTopPx + bbH / 2 + fs(7) * 0.35,
            );
            ctx.textAlign = "left";
          }
        }
      }

      prevCenterPx = centerPx;
      prevBottomPx = bottomPx;
      prevDepthMm  = fen.depthMm;
      prevBotMm    = fen.depthMm + fen.heightMm / 2;
    });
  }

  // ── Graft boundary markers (outside clip) ────────────────────────────────
  ctx.fillStyle = "rgba(16,33,31,0.65)";
  ctx.font      = `700 ${fs(7)}px sans-serif`;
  ctx.fillText("▲ PROXIMAL EDGE", chartX + sc.v_3_2, chartY - (sc.isPrint ? 5 : 3));

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

  // ── Clock tick marks at top of chart border (no labels — ruler has pills) ─
  const chartClockColors: Record<number, string> = {
    12: "#0f766e", 6: "#1d4ed8", 3: "#7c3aed", 9: "#b45309",
  };
  for (let h = 1; h <= 12; h++) {
    const isCard = h % 3 === 0;
    const arc    = ((h % 12) / 12) * circ;
    const gx     = arcToGx(arc);
    const col    = isCard ? (chartClockColors[h] ?? "#475569") : "#94a3b8";
    ctx.strokeStyle = col;
    ctx.lineWidth   = isCard ? (sc.isPrint ? 1.2 : 1.0) : (sc.isPrint ? 0.5 : 0.4);
    ctx.setLineDash([]);
    const tickH = isCard ? sc.v_8_5 : sc.v_3_2;
    ctx.beginPath();
    ctx.moveTo(gx, chartY);
    ctx.lineTo(gx, chartY - tickH);
    ctx.stroke();
  }

  // ── Chart border (solid rect — the cut line) ──────────────────────────────
  ctx.strokeStyle = "rgba(16,33,31,0.45)";
  ctx.lineWidth   = 1.0;
  ctx.setLineDash([]);
  ctx.strokeRect(chartX, chartY, chartW, chartH);

  // ── Cut corner registration marks ────────────────────────────────────────
  const cmLen = sc.isPrint ? 10 : 7;
  const cmGap = sc.isPrint ? 3 : 2;
  ctx.strokeStyle = "rgba(16,33,31,0.50)";
  ctx.lineWidth   = 0.8;
  ctx.setLineDash([]);
  drawCutMark(ctx, chartX,          chartY,          -1, -1, cmLen, cmGap);
  drawCutMark(ctx, chartX + chartW, chartY,           +1, -1, cmLen, cmGap);
  drawCutMark(ctx, chartX,          chartY + chartH, -1, +1, cmLen, cmGap);
  drawCutMark(ctx, chartX + chartW, chartY + chartH, +1, +1, cmLen, cmGap);

  // ── 3-column info strip below chart ──────────────────────────────────────
  const infoTop = chartY + chartH + (sc.isPrint ? 18 : 12);
  const infoW   = width - margin * 2;
  const colW    = infoW / 3;
  const col1X   = margin;
  const col2X   = margin + colW;
  const col3X   = margin + colW * 2;

  // Top rule — drawn immediately
  ctx.strokeStyle = "rgba(16,33,31,0.15)";
  ctx.lineWidth   = 0.8;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(margin, infoTop - (sc.isPrint ? 8 : 6));
  ctx.lineTo(width - margin, infoTop - (sc.isPrint ? 8 : 6));
  ctx.stroke();
  // Column dividers drawn after content (see below, uses contentEndY)

  const lineH   = fs(sc.v_14_11) * 0.92;
  const valOffX = colW * 0.48;

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

  const c1 = { v: infoTop };
  colTitle(col1X, c1, "DEVICE");
  colSpec(col1X, c1, "Platform",    result.device.shortName, result.device.color);
  colSpec(col1X, c1, "Diameter",    `${result.size.graftDiameter} mm`);
  colSpec(col1X, c1, "Circ",        `${circ.toFixed(1)} mm`);
  colSpec(col1X, c1, "Sheath",      `${result.size.sheathFr} Fr`);
  colSpec(col1X, c1, "Foreshorten", `${(result.device.foreshortening * 100).toFixed(0)}%`);
  colSpec(col1X, c1, "Ring height", `${effectiveRingH} mm`);
  colSpec(col1X, c1, "Gap",         `${effectiveGap} mm`,
    effectiveGap >= 12 ? "#15803d" : "#c2410c");
  colSpec(col1X, c1, "Peaks / ring", `${result.nPeaks}`);
  colSpec(col1X, c1, "Tie pos",     `${tieClock.join(", ")} o'clock`);
  if (filmHeightMm != null) colSpec(col1X, c1, "Film height", `${filmHeightMm} mm`);

  const c2 = { v: infoTop };
  colTitle(col2X, c2, "ROTATION PLAN");
  if (result.rotation.hasConflictFreeRotation) {
    const rotInfo = getDeploymentTorqueInfo(result.rotation.optimalDeltaDeg);
    const rotDir  = rotInfo.deploymentTorqueDirection !== "none"
      ? ` ${rotInfo.deploymentTorqueDirection === "clockwise" ? "CW" : "CCW"}`
      : "";
    ctx.fillStyle = "#15803d";
    ctx.font      = `700 ${fs(8.5)}px sans-serif`;
    c2.v = wrapText(
      ctx,
      `Rotate ${rotInfo.deploymentTorqueDeg.toFixed(0)}°${rotDir} (${result.rotation.optimalDeltaMm.toFixed(1)} mm). Valid window: ${result.rotation.validWindows.map((w) => `${w.startDeg.toFixed(0)}°–${w.endDeg.toFixed(0)}°`).join(", ")}.`,
      col2X, c2.v, colW - (sc.isPrint ? 12 : 8), lineH, 4,
    );
  } else {
    const compInfo = getDeploymentTorqueInfo(result.rotation.bestCompromiseDeg);
    const compDir  = compInfo.deploymentTorqueDirection !== "none"
      ? ` ${compInfo.deploymentTorqueDirection === "clockwise" ? "CW" : "CCW"}`
      : "";
    ctx.fillStyle = "#b45309";
    ctx.font      = `700 ${fs(8.5)}px sans-serif`;
    c2.v = wrapText(
      ctx,
      `No conflict-free rotation. Best compromise: ${compInfo.deploymentTorqueDeg.toFixed(0)}°${compDir}. Strut bending may be required.`,
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
      const seam      = result.device.seamDeg;
      const adjArcMm  = clockTextToArcMm(adjClock, circ);
      const seamArcMm = (seam / 360) * circ + delta;
      const arcSep    = adjArcMm - seamArcMm;
      for (const row of [
        `Clock: ${fen.clock} → ${adjClock}`,
        `Depth: ${fen.depthMm} mm  ·  Ø${fen.widthMm}×${fen.heightMm} mm`,
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

  // ── Column dividers (drawn after content so height is correct) ───────────
  const contentEndY = Math.max(c1.v, c2.v, c3.v);
  for (const divX of [col2X, col3X]) {
    ctx.strokeStyle = "rgba(16,33,31,0.10)";
    ctx.lineWidth   = 0.6;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(divX - (sc.isPrint ? 6 : 4), infoTop);
    ctx.lineTo(divX - (sc.isPrint ? 6 : 4), contentEndY);
    ctx.stroke();
  }

  // ── Footer + scale bar (placed after actual info content) ─────────────────
  const gap         = sc.isPrint ? 10 : 7;

  // 10 mm scale bar
  const sbY     = contentEndY + gap;
  const sbTickH = sc.v_4_3;
  const sb10Len = 10 * xScale;
  ctx.strokeStyle = "#10211f";
  ctx.fillStyle   = "#10211f";
  ctx.lineWidth   = sc.v_1_8_1_2;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(margin, sbY);                    ctx.lineTo(margin + sb10Len, sbY);
  ctx.moveTo(margin, sbY - sbTickH);          ctx.lineTo(margin, sbY + sbTickH);
  ctx.moveTo(margin + sb10Len, sbY - sbTickH); ctx.lineTo(margin + sb10Len, sbY + sbTickH);
  ctx.stroke();
  ctx.font      = `700 ${fs(8)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("10 mm", margin + sb10Len / 2, sbY - sbTickH - (sc.isPrint ? 2 : 1));
  ctx.textAlign = "left";

  // Footer text
  const footerY = sbY + (sc.isPrint ? 14 : 10);
  ctx.fillStyle = "rgba(69,96,91,0.55)";
  ctx.font      = `400 ${fs(7)}px sans-serif`;
  ctx.fillText(
    `FOR RESEARCH / PLANNING USE ONLY  ·  Print at 100% Actual Size  ·  Width = ${circ.toFixed(1)} mm  ·  PMEGplan.io`,
    margin, footerY,
  );
}
