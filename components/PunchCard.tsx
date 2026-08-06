"use client";

import { useEffect, useRef } from "react";

import { scallopEdgeDepthMm } from "@/lib/planning/anatomy";
import { arcMmToClockText } from "@/lib/planning/clock";
import { measureHole } from "@/lib/planning/holeMeasurements";
import type { PlanResult } from "@/lib/planning/plan";

/** CSS pixels per millimetre at the 96 dpi the print pipeline assumes. */
const PX_PER_MM = 96 / 25.4;
/** Fabric shown below the deepest opening, in mm. */
const TAIL_MM = 25;
/**
 * Room for the depth scale on the left, the clock row above and below, and the
 * calibration ruler above that.
 */
const MARGIN_MM = { left: 16, top: 20, right: 10, bottom: 16 };

/**
 * Canvas font shorthand. `ctx.font` is parsed by the CSS font shorthand grammar
 * and rejects `var()` outright, leaving the previous value in place — which on
 * this canvas means the 10px default in a coordinate system where one unit is a
 * millimetre, so every label came out 10 mm tall.
 */
const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const font = (weight: number, sizeMm: number) =>
  `${weight} ${sizeMm}px ${MONO}`;

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

    const { graft, openings, solution, scallop } = plan;
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

    /**
     * Confine drawing to the template.
     *
     * A hole near the seam is drawn again one circumference along so both
     * halves are usable, and without this its rim and cross run out into the
     * margin. Scoped tightly, because the clock labels, the depth scale and the
     * ruler all live outside the template on purpose.
     */
    const insideTemplate = (draw: () => void) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x(0), y(0), circumferenceMm, sheetHeightMm);
      ctx.clip();
      draw();
      ctx.restore();
    };

    // Measured wire, so struts can be matched by eye before punching.
    insideTemplate(() => {
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
    });

    // Clock grid every hour, labelled above and below so the sheet can be
    // squared up against the graft's anterior marker from either end.
    for (let hour = 0; hour < 12; hour += 1) {
      const arcMm = (hour / 12) * circumferenceMm;
      const anterior = hour === 0;
      ctx.strokeStyle = anterior ? "#000000" : "rgba(0,0,0,0.20)";
      ctx.lineWidth = anterior ? 0.5 : 0.15;
      ctx.setLineDash(anterior ? [] : [1.5, 1.5]);
      ctx.beginPath();
      ctx.moveTo(x(arcMm), y(0));
      ctx.lineTo(x(arcMm), y(sheetHeightMm));
      ctx.stroke();
      ctx.setLineDash([]);

      const label = `${hour === 0 ? 12 : hour}:00`;
      ctx.fillStyle = "#000000";
      ctx.font = font(anterior ? 700 : 500, 2.4);
      ctx.textAlign = "center";
      ctx.fillText(label, x(arcMm), y(0) - 1.6);
      ctx.fillText(label, x(arcMm), y(sheetHeightMm) + 3.6);
    }

    ctx.font = font(700, 2.4);
    ctx.textAlign = "left";
    ctx.fillText("ANTERIOR", x(0.8), y(0) - 5);

    // Depth scale down the left edge, every 5 mm with labels every 10.
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 0.2;
    ctx.font = font(500, 2.4);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let depthMm = 0; depthMm <= sheetHeightMm; depthMm += 5) {
      const long = depthMm % 10 === 0;
      ctx.beginPath();
      ctx.moveTo(x(0) - (long ? 2.6 : 1.3), y(depthMm));
      ctx.lineTo(x(0), y(depthMm));
      ctx.stroke();
      if (long) {
        ctx.fillStyle = "#000000";
        ctx.fillText(`${depthMm}`, x(0) - 3.4, y(depthMm));
      }
    }
    ctx.textBaseline = "alphabetic";

    // Seal band, drawn over the grid. Its label goes at mid-width, away from
    // 12:00 where the first fenestration and its wrapped copy both sit.
    const sealDepth = solution.pose.proximalDepthMm;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 0.3;
    ctx.setLineDash([2.5, 1.5]);
    ctx.beginPath();
    ctx.moveTo(x(0), y(sealDepth));
    ctx.lineTo(x(circumferenceMm), y(sealDepth));
    ctx.stroke();
    ctx.setLineDash([]);

    const sealLabel = `SEAL ZONE — ${sealDepth.toFixed(1)} mm`;
    ctx.font = font(700, 2.6);
    ctx.textAlign = "center";
    const sealX = x(circumferenceMm / 2);
    const sealWidth = ctx.measureText(sealLabel).width + 3;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(sealX - sealWidth / 2, y(sealDepth) - 4.2, sealWidth, 3.4);
    ctx.fillStyle = "#000000";
    ctx.fillText(sealLabel, sealX, y(sealDepth) - 1.6);

    // Openings: true-size circle and a centre cross, both clipped to the sheet
    // so a hole straddling the seam shows only the part that is on it.
    insideTemplate(() => {
      for (const opening of openings) {
        // Drawn where the strut map puts it, not where a tape at this depth
        // would. The sheet is a development at the proximal circumference, so
        // it is the one frame in which holes and struts line up; the figure to
        // measure by is in the cut list, taken at the hole's own level.
        const drawnArcMm = opening.turnFraction * circumferenceMm;
        for (const shift of [0, -circumferenceMm, circumferenceMm]) {
          const centre = drawnArcMm + shift;
          if (
            centre + opening.radiusMm < 0 ||
            centre - opening.radiusMm > circumferenceMm
          ) {
            continue;
          }

          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 0.4;
          ctx.beginPath();
          ctx.ellipse(
            x(centre),
            y(opening.depthMm),
            opening.semiArcMm,
            opening.semiDepthMm,
            0,
            0,
            Math.PI * 2,
          );
          ctx.stroke();

          // Punch cross, drawn past the rim so it stays visible once cut.
          // Cross arms clear each semi-axis, so they stay visible once cut.
          const armArc = opening.semiArcMm + 2.5;
          const armDepth = opening.semiDepthMm + 2.5;
          ctx.lineWidth = 0.3;
          ctx.beginPath();
          ctx.moveTo(x(centre) - armArc, y(opening.depthMm));
          ctx.lineTo(x(centre) + armArc, y(opening.depthMm));
          ctx.moveTo(x(centre), y(opening.depthMm) - armDepth);
          ctx.lineTo(x(centre), y(opening.depthMm) + armDepth);
          ctx.stroke();
        }
      }
    });

    // The scallop, as the line to cut along rather than a hole to punch. It
    // opens onto the top edge, so the fabric inside it comes away; the hatching
    // says which side of the line that is.
    if (scallop) {
      insideTemplate(() => {
        for (const shift of [0, -circumferenceMm, circumferenceMm]) {
          const centre = scallop.arcMm + shift;
          if (
            centre + scallop.semiArcMm < 0 ||
            centre - scallop.semiArcMm > circumferenceMm
          ) {
            continue;
          }

          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 0.4;
          ctx.beginPath();
          const SAMPLES = 64;
          for (let step = 0; step <= SAMPLES; step += 1) {
            const offset = scallop.semiArcMm * (-1 + (2 * step) / SAMPLES);
            const point = [
              x(centre + offset),
              y(scallopEdgeDepthMm(scallop, offset)),
            ] as const;
            if (step === 0) ctx.moveTo(...point);
            else ctx.lineTo(...point);
          }
          ctx.stroke();

          ctx.strokeStyle = "rgba(0,0,0,0.35)";
          ctx.lineWidth = 0.2;
          ctx.beginPath();
          for (
            let offset = -scallop.semiArcMm;
            offset <= scallop.semiArcMm;
            offset += 1.5
          ) {
            ctx.moveTo(x(centre + offset), y(0));
            ctx.lineTo(x(centre + offset), y(scallopEdgeDepthMm(scallop, offset)));
          }
          ctx.stroke();
        }
      });

      const label = `${scallop.vessel.name} SCALLOP`;
      const size = `${(scallop.semiArcMm * 2).toFixed(1)} w × ${scallop.heightMm.toFixed(1)} h`;
      ctx.font = font(700, 2.9);
      const labelWidth = Math.max(
        ctx.measureText(label).width,
        ctx.measureText(size).width,
      );
      const toRight =
        x(scallop.arcMm) + scallop.semiArcMm + 1.5 + labelWidth <
        x(circumferenceMm);
      const labelX =
        x(scallop.arcMm) +
        (toRight ? scallop.semiArcMm + 1.5 : -scallop.semiArcMm - 1.5);
      ctx.textAlign = toRight ? "left" : "right";
      ctx.fillStyle = "#000000";
      ctx.fillText(label, labelX, y(scallop.heightMm) - 1.4);
      ctx.font = font(500, 2.4);
      ctx.fillText(size, labelX, y(scallop.heightMm) + 1.6);
    }

    // Labels, unclipped and drawn once per hole, beside whichever copy has its
    // centre on the sheet. Naming both copies of a seam-straddling hole would
    // read as two fenestrations.
    for (const opening of openings) {
      const centre = opening.turnFraction * circumferenceMm;
      const clock = arcMmToClockText(opening.arcMm, opening.circumferenceMm);
      const arm = opening.semiArcMm + 2.5;
      const oval = opening.semiArcMm !== opening.semiDepthMm;
      const nameLabel = oval
        ? `${opening.vessel.name} ${(opening.semiArcMm * 2).toFixed(1)}x${(opening.semiDepthMm * 2).toFixed(1)}`
        : `${opening.vessel.name} Ø${(opening.semiArcMm * 2).toFixed(1)}`;
      const detailLabel = `${clock} · ${opening.depthMm.toFixed(1)} mm`;

      ctx.font = font(700, 2.9);
      const labelWidth = Math.max(
        ctx.measureText(nameLabel).width,
        ctx.measureText(detailLabel).width,
      );
      // Flip to the left when the label would run off the sheet.
      const toRight = x(centre) + arm + 1 + labelWidth < x(circumferenceMm);
      const labelX = toRight ? x(centre) + arm + 1 : x(centre) - arm - 1;
      ctx.textAlign = toRight ? "left" : "right";

      // Knock the wire out behind the label so it stays readable.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(
        toRight ? labelX - 0.5 : labelX - labelWidth - 0.5,
        y(opening.depthMm) - 4.4,
        labelWidth + 1,
        6.4,
      );

      ctx.fillStyle = "#000000";
      ctx.fillText(nameLabel, labelX, y(opening.depthMm) - 1.4);
      ctx.font = font(500, 2.4);
      ctx.fillText(detailLabel, labelX, y(opening.depthMm) + 1.6);
    }

    // Calibration ruler: the only way to know the print was not scaled.
    const rulerY = 7;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(x(0), rulerY);
    ctx.lineTo(x(50), rulerY);
    for (let tick = 0; tick <= 50; tick += 10) {
      ctx.moveTo(x(tick), rulerY);
      ctx.lineTo(x(tick), rulerY - 1.8);
    }
    ctx.stroke();
    ctx.fillStyle = "#000000";
    ctx.font = font(600, 2.6);
    ctx.textAlign = "left";
    ctx.fillText("50 mm — verify on paper before use", x(52), rulerY);
  }, [plan]);

  const { graft, openings, solution, oversizeFraction, scallop } = plan;

  // How far the graft has narrowed by the deepest hole. Two millimetres of
  // circumference is under a third of a millimetre of arc anywhere on the
  // sheet, which is inside what a marker pen decides anyway.
  const sheetDepthMm = openings.reduce(
    (deepest, opening) => Math.max(deepest, opening.depthMm),
    solution.pose.proximalDepthMm,
  );
  const tapersMm =
    graft.circumferenceMm - graft.circumferenceAtDepthMm(sheetDepthMm);

  return (
    <div className="punch-card">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-[11px]">
        <div>
          <p className="text-sm font-semibold">
            PMEG cutting template — {graft.naming.full}
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
            <th className="pb-1 pr-3">Arc from 12:00, at depth</th>
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
                  {opening.semiArcMm === opening.semiDepthMm
                    ? `Ø${(opening.semiArcMm * 2).toFixed(1)} mm`
                    : `${(opening.semiArcMm * 2).toFixed(1)} × ${(
                        opening.semiDepthMm * 2
                      ).toFixed(1)} mm`}
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

      {scallop ? (
        <p className="mt-3 text-[11px] leading-4">
          <span className="font-semibold">
            {scallop.vessel.name} scallop — cut, do not punch.
          </span>{" "}
          {(scallop.semiArcMm * 2).toFixed(1)} mm wide by{" "}
          {scallop.heightMm.toFixed(1)} mm deep, centred at{" "}
          {arcMmToClockText(scallop.arcMm, graft.circumferenceMm)}, taken out of
          the proximal fabric edge. The hatched fabric comes away; the struts
          crossing it stay.
          {plan.scallopBridge ? (
            <>
              {" "}
              It leaves {plan.scallopBridge.edgeToEdgeMm.toFixed(1)} mm of fabric
              to the {plan.scallopBridge.vesselName} rim (
              {plan.scallopBridge.toCentreMm.toFixed(1)} mm nadir to centre).
            </>
          ) : null}
        </p>
      ) : null}

      {tapersMm > 2 ? (
        <p className="mt-3 text-[10px] leading-4 text-amber-900">
          This device tapers: {graft.circumferenceMm.toFixed(0)} mm round at the
          fabric edge, {graft.circumferenceAtDepthMm(sheetDepthMm).toFixed(0)} mm
          at the deepest hole. The sheet is drawn at the proximal circumference,
          which is the one frame where the holes and the struts line up, so it
          is a guide to <em>which window</em> a hole falls in and not a wrapper.
          Mark each hole by the arc in the list above, measured round the graft
          at that hole&apos;s own depth.
        </p>
      ) : null}

      <p className="mt-3 text-[10px] leading-4 text-[color:var(--muted-foreground)]">
        Strut positions are the bench-CT segmentation of{" "}
        {graft.scan.reference.id.toUpperCase()}, not a nominal pattern, and apply
        to that scanned device in its free state. Verify against the graft in
        front of you before cutting.
      </p>
    </div>
  );
}
