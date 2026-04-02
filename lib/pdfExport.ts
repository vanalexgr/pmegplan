import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { saveAs } from "file-saver";

import { getConflictCount } from "@/lib/analysis";
import { renderGraftSketch } from "@/lib/graftSketchRenderer";
import { renderPunchCard } from "@/lib/punchCardRenderer";
import type { CaseInput, DeviceAnalysisResult } from "@/lib/types";

const A4_LANDSCAPE_MM = { width: 297, height: 210 };

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function renderOffscreenCanvas(
  result: DeviceAnalysisResult,
  caseInput: CaseInput,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 3508;
  canvas.height = 2480;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to create export canvas.");
  }

  renderPunchCard({
    ctx: context,
    width: canvas.width,
    height: canvas.height,
    result,
    caseInput,
    mode: "print",
  });

  return canvas;
}

function makeFileName(result: DeviceAnalysisResult, caseInput: CaseInput) {
  const patient = caseInput.patientId ? `-${slugify(caseInput.patientId)}` : "";
  return `${slugify(result.device.shortName)}${patient}.pdf`;
}

function renderSketchOffscreenCanvas(
  result: DeviceAnalysisResult,
  caseInput: CaseInput,
) {
  // Portrait A4 at 300 DPI: 2480 × 3508
  const canvas = document.createElement("canvas");
  canvas.width = 2480;
  canvas.height = 3508;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create sketch canvas.");
  renderGraftSketch({
    ctx: context,
    width: canvas.width,
    height: canvas.height,
    result,
    caseInput,
    mode: "print",
  });
  return canvas;
}

async function buildDevicePdfBlob(
  result: DeviceAnalysisResult,
  caseInput: CaseInput,
) {
  // Page 1: landscape punch card
  const punchCanvas = renderOffscreenCanvas(result, caseInput);
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  pdf.addImage(
    punchCanvas.toDataURL("image/png"),
    "PNG",
    0,
    0,
    A4_LANDSCAPE_MM.width,
    A4_LANDSCAPE_MM.height,
    undefined,
    "FAST",
  );

  // Page 2: portrait graft sketch (Cook CMD-style)
  const sketchCanvas = renderSketchOffscreenCanvas(result, caseInput);
  pdf.addPage("a4", "portrait");
  pdf.addImage(
    sketchCanvas.toDataURL("image/png"),
    "PNG",
    0,
    0,
    210,   // A4 portrait width (mm)
    297,   // A4 portrait height (mm)
    undefined,
    "FAST",
  );

  return pdf.output("blob");
}

async function buildSummaryPdfBlob(
  results: DeviceAnalysisResult[],
  caseInput: CaseInput,
) {
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const exportDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  pdf.setFillColor(248, 244, 237);
  pdf.rect(0, 0, 297, 210, "F");
  pdf.setTextColor(16, 33, 31);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text("PMEGplan.io ranking summary", 16, 20);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(
    `Patient: ${caseInput.patientId || "N/A"}    Neck: ${caseInput.neckDiameterMm} mm    Surgeon: ${caseInput.surgeonName || "N/A"}    Date: ${exportDate}`,
    16,
    28,
  );

  const headers = [
    "Rank",
    "Device",
    "Size",
    "Status",
    "Conflicts @0",
    "Conflicts @opt",
    "Optimal rotation",
  ];
  const columnX = [16, 32, 104, 128, 170, 205, 242];
  const top = 42;

  pdf.setFont("helvetica", "bold");
  headers.forEach((header, index) => {
    pdf.text(header, columnX[index], top);
  });

  pdf.setFont("helvetica", "normal");
  results.forEach((result, index) => {
    const y = top + 12 + index * 12;
    const baselineCount = getConflictCount(result.baselineConflicts);
    const optimalCount = getConflictCount(result.optimalConflicts);
    const status = result.rotation.hasConflictFreeRotation ? "Window" : "Compromise";

    pdf.text(String(index + 1), columnX[0], y);
    pdf.text(result.device.shortName, columnX[1], y);
    pdf.text(result.size ? `${result.size.graftDiameter} mm` : "Unavailable", columnX[2], y);
    pdf.text(status, columnX[3], y);
    pdf.text(String(baselineCount), columnX[4], y);
    pdf.text(String(optimalCount), columnX[5], y);
    pdf.text(`${result.rotation.optimalDeltaDeg.toFixed(1)}°`, columnX[6], y);
  });

  pdf.setFontSize(9);
  pdf.text(
    "For research and planning use only. All clinical decisions remain the surgeon's responsibility.",
    16,
    198,
  );

  return pdf.output("blob");
}

export async function downloadDevicePdf(
  result: DeviceAnalysisResult,
  caseInput: CaseInput,
) {
  const blob = await buildDevicePdfBlob(result, caseInput);
  saveAs(blob, makeFileName(result, caseInput));
}

export async function downloadAllPdfs(
  results: DeviceAnalysisResult[],
  caseInput: CaseInput,
) {
  const zip = new JSZip();
  const available = results.filter((result) => result.size);

  for (const result of available) {
    const blob = await buildDevicePdfBlob(result, caseInput);
    zip.file(makeFileName(result, caseInput), blob);
  }

  const summary = await buildSummaryPdfBlob(available, caseInput);
  zip.file("index.pdf", summary);

  const archive = await zip.generateAsync({ type: "blob" });
  saveAs(
    archive,
    `${caseInput.patientId ? `${slugify(caseInput.patientId)}-` : ""}pmegplan-export.zip`,
  );
}

export function buildPrintUrl(caseInput: CaseInput, deviceId: string) {
  const params = new URLSearchParams({
    deviceId,
    case: JSON.stringify(caseInput),
  });
  return `/punch-card-print?${params.toString()}`;
}

