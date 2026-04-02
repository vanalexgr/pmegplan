import { clockToArc, wrapMm } from "@/lib/conflictDetection";
import { getRotationSummary } from "@/lib/analysis";
import { getSealZoneHeightMm } from "@/lib/stentGeometry";
import type { CaseInput, DeviceAnalysisResult } from "@/lib/types";

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

const vesselColors: Record<string, string> = {
  SMA: "#f59e0b",
  LRA: "#2563eb",
  RRA: "#7c3aed",
  CELIAC: "#dc2626",
  LMA: "#0f766e",
  CUSTOM: "#334155",
};

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.closePath();
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 5,
) {
  const words = text.split(" ");
  let line = "";
  let lineIndex = 0;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      line = testLine;
      continue;
    }

    ctx.fillText(line, x, y + lineIndex * lineHeight);
    line = word;
    lineIndex += 1;

    if (lineIndex >= maxLines - 1) {
      break;
    }
  }

  if (line) {
    ctx.fillText(line, x, y + lineIndex * lineHeight);
  }
}

function drawFenestration(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  conflicted: boolean,
  isScallop: boolean,
) {
  ctx.save();

  if (isScallop) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(width / 2, 12), Math.PI, 0);
    ctx.lineTo(x + width / 2, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = `${color}33`;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  if (conflicted) {
    ctx.beginPath();
    ctx.setLineDash([7, 5]);
    ctx.arc(x, y, Math.max(width, height) / 2 + 10, 0, Math.PI * 2);
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.restore();
}

function drawStruts(
  ctx: CanvasRenderingContext2D,
  result: DeviceAnalysisResult,
  chartX: number,
  chartY: number,
  chartWidth: number,
  yScale: number,
  xScale: number,
) {
  const offsets = [-result.circumferenceMm, 0, result.circumferenceMm];
  ctx.save();
  ctx.strokeStyle = "rgba(15, 23, 42, 0.8)";
  ctx.lineWidth = 1.4;

  for (const [ax, ay, bx, by] of result.strutSegments) {
    for (const offset of offsets) {
      const startX = chartX + (ax + offset) * xScale;
      const endX = chartX + (bx + offset) * xScale;

      if (
        (startX < chartX - 20 && endX < chartX - 20) ||
        (startX > chartX + chartWidth + 20 && endX > chartX + chartWidth + 20)
      ) {
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(startX, chartY + ay * yScale);
      ctx.lineTo(endX, chartY + by * yScale);
      ctx.stroke();
    }
  }

  ctx.restore();
}

export interface PunchCardRenderOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  result: DeviceAnalysisResult;
  caseInput: CaseInput;
  mode?: "preview" | "print";
}

export function renderPunchCard({
  ctx,
  width,
  height,
  result,
  caseInput,
  mode = "preview",
}: PunchCardRenderOptions) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f8f4ed";
  ctx.fillRect(0, 0, width, height);

  if (!result.size) {
    ctx.fillStyle = "#10211f";
    ctx.font = "700 26px sans-serif";
    ctx.fillText(result.device.shortName, 24, 42);
    ctx.font = "400 16px sans-serif";
    drawWrappedText(
      ctx,
      result.unsupportedReason ?? "No compatible graft size available.",
      24,
      82,
      width - 48,
      24,
      6,
    );
    return;
  }

  const margin = mode === "print" ? 48 : 20;
  const sidePanelWidth =
    mode === "print" ? Math.min(360, width * 0.28) : Math.min(280, width * 0.34);
  const chartX = margin;
  const chartY = mode === "print" ? 88 : 56;
  const chartWidth = width - margin * 2 - sidePanelWidth - 24;
  const chartHeight = height - chartY - margin;
  const sidePanelX = chartX + chartWidth + 24;
  const sidePanelY = chartY;
  const sealZoneHeight = getSealZoneHeightMm(result.device);
  const maximumFenDepth = Math.max(
    sealZoneHeight + 10,
    ...caseInput.fenestrations.map((fenestration) => fenestration.depthMm + 24),
  );
  const xScale = chartWidth / result.circumferenceMm;
  const yScale = chartHeight / maximumFenDepth;

  drawRoundedRect(ctx, 8, 8, width - 16, height - 16, 26);
  ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
  ctx.fill();
  ctx.strokeStyle = "rgba(16, 33, 31, 0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#10211f";
  ctx.font = mode === "print" ? "700 30px sans-serif" : "700 20px sans-serif";
  ctx.fillText(result.device.name, chartX, 34);
  ctx.font = mode === "print" ? "400 16px sans-serif" : "400 12px sans-serif";
  ctx.fillStyle = "#45605b";
  ctx.fillText(
    `${result.device.manufacturer} • ${result.size.graftDiameter} mm • ${result.nPeaks} peaks • ${result.device.stentType}`,
    chartX,
    mode === "print" ? 58 : 54,
  );

  ctx.save();
  ctx.beginPath();
  ctx.rect(chartX, chartY, chartWidth, chartHeight);
  ctx.clip();

  let currentY = 0;
  for (let ringIndex = 0; ringIndex < result.device.nRings; ringIndex += 1) {
    const ringTop = chartY + currentY * yScale;
    const ringHeightPx = result.device.ringHeight * yScale;
    ctx.fillStyle = "rgba(220, 38, 38, 0.12)";
    ctx.fillRect(chartX, ringTop, chartWidth, ringHeightPx);

    // Ring label
    if (ringHeightPx > (mode === "print" ? 18 : 12)) {
      ctx.fillStyle = "rgba(185, 28, 28, 0.55)";
      ctx.font = mode === "print" ? "400 11px sans-serif" : "400 9px sans-serif";
      ctx.fillText(`Ring ${ringIndex + 1}`, chartX + 4, ringTop + (mode === "print" ? 14 : 10));
    }

    currentY += result.device.ringHeight;

    if (ringIndex < result.device.nRings - 1) {
      const gapTop = chartY + currentY * yScale;
      const gapHeightPx = result.device.interRingGap * yScale;
      ctx.fillStyle = "rgba(15, 118, 110, 0.12)";
      ctx.fillRect(chartX, gapTop, chartWidth, gapHeightPx);

      // "Safe zone" label in inter-ring gap
      if (gapHeightPx > (mode === "print" ? 18 : 12)) {
        ctx.fillStyle = "rgba(15, 118, 110, 0.65)";
        ctx.font = mode === "print" ? "600 11px sans-serif" : "600 9px sans-serif";
        ctx.fillText("safe zone", chartX + 4, gapTop + gapHeightPx / 2 + 4);
      }

      currentY += result.device.interRingGap;
    }
  }

  ctx.strokeStyle = "rgba(16, 33, 31, 0.12)";
  ctx.lineWidth = 1;
  for (let axisY = 0; axisY <= maximumFenDepth; axisY += 10) {
    const y = chartY + axisY * yScale;
    ctx.beginPath();
    ctx.moveTo(chartX, y);
    ctx.lineTo(chartX + chartWidth, y);
    ctx.stroke();
  }

  const clockLabels = [
    { label: "12:00", arc: 0 },
    { label: "3:00", arc: result.circumferenceMm / 4 },
    { label: "6:00", arc: result.circumferenceMm / 2 },
    { label: "9:00", arc: (result.circumferenceMm * 3) / 4 },
  ];
  for (const tick of clockLabels) {
    const x = chartX + tick.arc * xScale;
    ctx.beginPath();
    ctx.moveTo(x, chartY);
    ctx.lineTo(x, chartY + chartHeight);
    ctx.stroke();
  }

  const seamArc = (result.device.seamDeg / 360) * result.circumferenceMm;
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = "rgba(217, 119, 6, 0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(chartX + seamArc * xScale, chartY);
  ctx.lineTo(chartX + seamArc * xScale, chartY + chartHeight);
  ctx.stroke();
  ctx.restore();

  drawStruts(ctx, result, chartX, chartY, chartWidth, yScale, xScale);

  caseInput.fenestrations.forEach((fenestration, index) => {
    const conflict = result.optimalConflicts[index];
    const x =
      chartX +
      wrapMm(
        clockToArc(fenestration.clock, result.circumferenceMm) +
          result.rotation.optimalDeltaMm,
        result.circumferenceMm,
      ) *
        xScale;
    const y =
      fenestration.ftype === "SCALLOP"
        ? chartY + 3
        : chartY + fenestration.depthMm * yScale;
    const widthPx = Math.max(12, fenestration.widthMm * xScale);
    const heightPx = Math.max(12, fenestration.heightMm * yScale);
    const color = vesselColors[fenestration.vessel] ?? "#334155";

    drawFenestration(
      ctx,
      x,
      y,
      widthPx,
      heightPx,
      color,
      conflict?.conflict ?? false,
      fenestration.ftype === "SCALLOP",
    );

    const inGap =
      fenestration.ftype !== "SCALLOP" &&
      isInInterRingGap(
        fenestration.depthMm,
        result.device.ringHeight,
        result.device.interRingGap,
        result.device.nRings,
      );
    if (inGap) {
      ctx.fillStyle = "#10211f";
      ctx.font =
        mode === "print" ? "700 13px sans-serif" : "700 10px sans-serif";
      ctx.fillText("A", x, y + heightPx / 2 + (mode === "print" ? 18 : 13));
    }

    ctx.fillStyle = color;
    ctx.font = mode === "print" ? "600 13px sans-serif" : "600 11px sans-serif";
    ctx.fillText(
      `${fenestration.vessel} ${conflict?.adjustedClock ?? fenestration.clock}`,
      x + 10,
      Math.min(chartY + chartHeight - 8, y + 14),
    );
  });

  ctx.restore();

  ctx.fillStyle = "#45605b";
  ctx.font = mode === "print" ? "500 12px sans-serif" : "500 10px sans-serif";
  for (let axisY = 0; axisY <= maximumFenDepth; axisY += 10) {
    const y = chartY + axisY * yScale;
    ctx.fillText(`${axisY}`, chartX - 30, y + 4);
  }

  for (const tick of clockLabels) {
    const x = chartX + tick.arc * xScale;
    ctx.fillText(tick.label, x - 18, chartY - 10);
  }

  const scaleBarWidth = 10 * xScale;
  const scaleBarY = chartY + chartHeight + (mode === "print" ? 18 : 14);
  ctx.strokeStyle = "#10211f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(chartX, scaleBarY);
  ctx.lineTo(chartX + scaleBarWidth, scaleBarY);
  ctx.moveTo(chartX, scaleBarY - 5);
  ctx.lineTo(chartX, scaleBarY + 5);
  ctx.moveTo(chartX + scaleBarWidth, scaleBarY - 5);
  ctx.lineTo(chartX + scaleBarWidth, scaleBarY + 5);
  ctx.stroke();
  ctx.fillStyle = "#45605b";
  ctx.fillText("10 mm scale", chartX + scaleBarWidth + 10, scaleBarY + 4);
  ctx.fillText("Depth (mm)", chartX - 58, chartY - 10);

  drawRoundedRect(ctx, sidePanelX, sidePanelY, sidePanelWidth, chartHeight, 22);
  ctx.fillStyle = "rgba(245, 240, 230, 0.88)";
  ctx.fill();

  ctx.fillStyle = "#10211f";
  ctx.font = mode === "print" ? "700 16px sans-serif" : "700 13px sans-serif";
  ctx.fillText("Rotation Plan", sidePanelX + 18, sidePanelY + 28);
  ctx.font = mode === "print" ? "400 13px sans-serif" : "400 11px sans-serif";
  ctx.fillStyle = "#45605b";
  drawWrappedText(
    ctx,
    getRotationSummary(result),
    sidePanelX + 18,
    sidePanelY + 50,
    sidePanelWidth - 36,
    mode === "print" ? 18 : 15,
    6,
  );

  const blockStart = sidePanelY + (mode === "print" ? 148 : 136);
  ctx.fillStyle = "#10211f";
  ctx.font = mode === "print" ? "700 15px sans-serif" : "700 12px sans-serif";
  ctx.fillText("Device", sidePanelX + 18, blockStart);
  ctx.font = mode === "print" ? "400 13px sans-serif" : "400 11px sans-serif";
  ctx.fillStyle = "#45605b";
  const deviceLines = [
    `Sheath: ${result.size.sheathFr} Fr`,
    `Foreshortening: ${(result.device.foreshortening * 100).toFixed(1)}%`,
    `Material: ${result.device.fabricMaterial}`,
    `Suitability: ${result.device.pmegSuitability}/4`,
  ];
  deviceLines.forEach((line, index) => {
    ctx.fillText(line, sidePanelX + 18, blockStart + 24 + index * 18);
  });

  const fenestrationStart = blockStart + 112;
  ctx.fillStyle = "#10211f";
  ctx.font = mode === "print" ? "700 15px sans-serif" : "700 12px sans-serif";
  ctx.fillText("Fenestrations", sidePanelX + 18, fenestrationStart);
  ctx.font = mode === "print" ? "400 12px sans-serif" : "400 10px sans-serif";
  caseInput.fenestrations.forEach((fenestration, index) => {
    const resultRow = result.optimalConflicts[index];
    const y = fenestrationStart + 22 + index * 42;
    ctx.fillStyle = vesselColors[fenestration.vessel] ?? "#334155";
    ctx.fillText(fenestration.vessel, sidePanelX + 18, y);
    ctx.fillStyle = "#45605b";
    ctx.fillText(
      `${fenestration.clock} -> ${resultRow.adjustedClock}`,
      sidePanelX + 90,
      y,
    );
    ctx.fillText(
      resultRow.conflict
        ? `Conflict • ${resultRow.minDist.toFixed(1)} mm`
        : `Clear • ${resultRow.minDist.toFixed(1)} mm`,
      sidePanelX + 18,
      y + 16,
    );
  });

  const footerY = sidePanelY + chartHeight - 56;
  ctx.fillStyle = "#10211f";
  ctx.font = mode === "print" ? "700 14px sans-serif" : "700 12px sans-serif";
  ctx.fillText("Research / planning use only", sidePanelX + 18, footerY);
  ctx.font = mode === "print" ? "400 11px sans-serif" : "400 10px sans-serif";
  ctx.fillStyle = "#45605b";
  drawWrappedText(
    ctx,
    result.device.pmegNotes,
    sidePanelX + 18,
    footerY + 18,
    sidePanelWidth - 36,
    mode === "print" ? 15 : 13,
    6,
  );
}

