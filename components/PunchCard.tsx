"use client";

import { useEffect, useRef } from "react";

import { measureHole } from "@/lib/planning/holeMeasurements";
import type { PlanResult } from "@/lib/planning/plan";

/** CSS pixels per millimetre at the 96 dpi the print pipeline assumes. */
const PX_PER_MM = 96 / 25.4;
/** Fabric shown below the deepest opening, in mm. */
const TAIL_MM = 25;
const MARGIN_MM = { left: 14, top: 12, right: 8, bottom: 10 };

export interface PunchCardProps {
  plan: Extract<PlanResult, { ok: true }>;
  caseLabel?: string;
}

/**
 * A 1:1 cutting template for the back table.
 *
 * Printed at 100% it is laid on the graft with 12:00 against the anterior
 * marker and the top edge against the proximal fabric edge, and the crosses
 * punched through. Everything is drawn at true size, so the calibration ruler
 * along the top is the check that matters: if it does not read 50 mm against a
 * real ruler, the print was scaled and nothing else on the sheet can be
 * trusted.
 */
export function PunchCard({ plan, caseLabel }: PunchCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { graft, openings, solution } = plan;
    const { circumferenceMm, segments, wireRadiusMm } = graft;

    const deepestMm = openings.reduce(
      (deepest, opening) => Math.max(deepest, opening.depthMm + opening.radiusMm),
      solution.pose.proximalDepthMm,
    );
    const sheetHeightMm = Math.min(
      graft.fabricLengthMm,
      deepestMm + TAIL_MM,
    );

    const widthMm = circumferenceMm + MARGIN_MM.left + MARGIN_MM.right;
    const heightMm = sheetHeightMm + MARGIN_MM.top + MARGIN_MM.bottom;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(widthMm * PX_PER_MM * ratio);
    canvas.height = Math.round(heightMm * PX_PER_MM * ratio);
    canvas.style.width = `${widthMm}mm`;
    canvas.style.height = `${heightMm}mm`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // One unit is one millimetre from here on.
    ctx.setTransform(PX_PER_MM * ratio, 0, 0, PX_PER_MM * ratio, 0, 0);
    ctx.clearRect(0, 0, widthMm, heightMm);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, widthMm, heightMm);

    const x = (arcMm: number) => MARGIN_MM.left + arcMm;
    const y = (depthMm: number) => MARGIN_MM.top + depthMm;

    // Template outline: the full circumference by the working length.
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 0.3;
    ctx.strokeRect(x(0), y(0), circumferenceMm, sheetHeightMm);

    // Measured wire, so struts can be matched by eye before punching.
    ctx.strokeStyle = "rgba(0,0,0,0.30)";
    ctx.lineWidth = Math.max(0.25, wireRadiusMm * 2);
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const [arcMm, fromZ, , toZ] of segments) {
      if (Math.min(fromZ, toZ) > sheetHeightMm || Math.max(fromZ, toZ) < 0) {
        continue;
      }
      ctx.moveTo(x(arcMm), y(Math.max(0, fromZ)));
      ctx.lineTo(x(arcMm), y(Math.min(sheetHeightMm, toZ)));
    }
    ctx.stroke();

    // Seal band.
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 0.25;
    ctx.setLineDash([2, 1.5]);
    ctx.beginPath();
    ctx.moveTo(x(0), y(solution.pose.proximalDepthMm));
    ctx.lineTo(x(circumferenceMm), y(solution.pose.proximalDepthMm));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#000000";
    ctx.font = "600 3px var(--font-ibm-plex-mono), monospace";
    ctx.textAlign = "left";
    ctx.fillText(
      `seal ${solution.pose.proximalDepthMm.toFixed(1)} mm`,
      x(1),
      y(solution.pose.proximalDepthMm) - 1,
    );

    // Clock grid every hour, full height, so the sheet can be squared up.
    ctx.font = "500 2.6px var(--font-ibm-plex-mono), monospace";
    ctx.textAlign = "center";
    for (let hour = 0; hour < 12; hour += 1) {
      const arcMm = (hour / 12) * circumferenceMm;
      ctx.strokeStyle = hour === 0 ? "#000000" : "rgba(0,0,0,0.22)";
      ctx.lineWidth = hour === 0 ? 0.5 : 0.2;
      ctx.beginPath();
      ctx.moveTo(x(arcMm), y(0));
      ctx.lineTo(x(arcMm), y(sheetHeightMm));
      ctx.stroke();
      ctx.fillStyle = "#000000";
      ctx.fillText(
        `${hour === 0 ? 12 : hour}:00`,
        x(arcMm),
        y(sheetHeightMm) + 4,
      );
    }

    // Depth scale down the left edge, every 5 mm with labels every 10.
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 0.2;
    ctx.textAlign = "right";
    for (let depthMm = 0; depthMm <= sheetHeightMm; depthMm += 5) {
      const long = depthMm % 10 === 0;
      ctx.beginPath();
      ctx.moveTo(x(0) - (long ? 3 : 1.5), y(depthMm));
      ctx.lineTo(x(0), y(depthMm));
      ctx.stroke();
      if (long) {
        ctx.fillStyle = "#000000";
        ctx.fillText(`${depthMm}`, x(0) - 4, y(depthMm) + 1);
      }
    }

    // Openings: true-size circle, centre cross, and the label outside it.
    for (const opening of openings) {
      for (const shift of [0, -circumferenceMm, circumferenceMm]) {
        const centre = opening.arcMm + shift;
        if (
          centre + opening.radiusMm < 0 ||
          centre - opening.radiusMm > circumferenceMm
        ) {
          continue;
        }

        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 0.35;
        ctx.beginPath();
        ctx.arc(x(centre), y(opening.depthMm), opening.radiusMm, 0, Math.PI * 2);
        ctx.stroke();

        // Punch cross, drawn past the rim so it stays visible once cut.
        const arm = opening.radiusMm + 2;
        ctx.lineWidth = 0.3;
        ctx.beginPath();
        ctx.moveTo(x(centre) - arm, y(opening.depthMm));
        ctx.lineTo(x(centre) + arm, y(opening.depthMm));
        ctx.moveTo(x(centre), y(opening.depthMm) - arm);
        ctx.lineTo(x(centre), y(opening.depthMm) + arm);
        ctx.stroke();

        ctx.fillStyle = "#000000";
        ctx.font = "700 3.2px var(--font-ibm-plex-mono), monospace";
        ctx.textAlign = "left";
        ctx.fillText(
          `${opening.vessel.name} Ø${(opening.radiusMm * 2).toFixed(1)}`,
          x(centre) + arm + 1,
          y(opening.depthMm) - 1,
        );
      }
    }

    // Calibration ruler: the only way to know the print was not scaled.
    const rulerY = MARGIN_MM.top - 6;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(x(0), rulerY);
    ctx.lineTo(x(50), rulerY);
    ctx.stroke();
    for (let tick = 0; tick <= 50; tick += 10) {
      ctx.beginPath();
      ctx.moveTo(x(tick), rulerY);
      ctx.lineTo(x(tick), rulerY - 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#000000";
    ctx.font = "600 3px var(--font-ibm-plex-mono), monospace";
    ctx.textAlign = "left";
    ctx.fillText("50 mm — check against a ruler before use", x(52), rulerY);
  }, [plan]);

  const { graft, openings, solution, oversizeFraction } = plan;

  return (
    <div className="punch-card">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-[11px]">
        <div>
          <p className="text-sm font-semibold">
            PMEG cutting template — {graft.scan.platform.shortLabel}{" "}
            {graft.proximalDiameterMm.toFixed(1)} mm
          </p>
          <p className="text-[color:var(--muted-foreground)]">
            {caseLabel ? `${caseLabel} · ` : ""}
            {graft.scan.reference.id.toUpperCase()} bench CT ·{" "}
            {(oversizeFraction * 100).toFixed(0)}% oversize · push in{" "}
            {solution.pose.proximalDepthMm.toFixed(1)} mm · rotate{" "}
            {Math.abs(solution.pose.rotationDeg).toFixed(1)}°{" "}
            {solution.pose.rotationDeg >= 0 ? "CW" : "CCW"}
          </p>
        </div>
        <p className="text-[color:var(--muted-foreground)]">
          Print at 100%. Align 12:00 with the anterior marker and the top edge
          with the proximal fabric edge.
        </p>
      </header>

      <canvas ref={canvasRef} className="block" />

      <table className="mt-4 w-full text-left text-[11px]">
        <thead className="uppercase tracking-[0.1em] text-[color:var(--muted-foreground)]">
          <tr>
            <th className="pb-1 pr-3">Vessel</th>
            <th className="pb-1 pr-3">Depth</th>
            <th className="pb-1 pr-3">Clock</th>
            <th className="pb-1 pr-3">Arc from 12:00</th>
            <th className="pb-1 pr-3">Ø</th>
            <th className="pb-1 pr-3">Clearance</th>
            <th className="pb-1">Nearest apex / valley</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {openings.map((opening, index) => {
            const clearance = solution.clearances[index]?.clearanceMm ?? 0;
            const measurement = measureHole(graft, opening, clearance);
            return (
              <tr key={opening.vessel.name} className="border-t border-black/15">
                <td className="py-1 pr-3 font-sans font-medium">
                  {opening.vessel.name}
                </td>
                <td className="py-1 pr-3">{opening.depthMm.toFixed(1)} mm</td>
                <td className="py-1 pr-3">{measurement.clock}</td>
                <td className="py-1 pr-3">{opening.arcMm.toFixed(1)} mm</td>
                <td className="py-1 pr-3">
                  {(opening.radiusMm * 2).toFixed(1)} mm
                </td>
                <td className="py-1 pr-3">{clearance.toFixed(2)} mm</td>
                <td className="py-1">
                  {measurement.apexAbove
                    ? `${measurement.apexAbove.distanceMm.toFixed(1)} above`
                    : "—"}
                  {" / "}
                  {measurement.valleyBelow
                    ? `${measurement.valleyBelow.distanceMm.toFixed(1)} below`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="mt-3 text-[10px] leading-4 text-[color:var(--muted-foreground)]">
        Strut positions are the bench-CT segmentation of{" "}
        {graft.scan.reference.id.toUpperCase()}, not a nominal pattern, and apply
        to that scanned device in its free state. Verify against the graft in
        front of you before cutting.
      </p>
    </div>
  );
}
