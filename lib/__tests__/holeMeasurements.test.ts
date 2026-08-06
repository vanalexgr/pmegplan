import { describe, expect, it } from "vitest";

import type { AnatomyCase } from "@/lib/planning/anatomy";
import { measureHole } from "@/lib/planning/holeMeasurements";
import { planGraft } from "@/lib/planning/plan";

function taaaCase(sealZoneDiameterMm: number): AnatomyCase {
  return {
    clockConvention: "axial_ct",
    vessels: [
      { name: "CELIAC", gapFromPreviousMm: 0, clock: "12:00", ostiumDiameterMm: 8 },
      { name: "SMA", gapFromPreviousMm: 18, clock: "12:30", ostiumDiameterMm: 9 },
      { name: "RRA", gapFromPreviousMm: 24, clock: "9:00", ostiumDiameterMm: 6 },
      { name: "LRA", gapFromPreviousMm: 5, clock: "3:30", ostiumDiameterMm: 6 },
    ],
    fenestrate: ["CELIAC", "SMA", "RRA", "LRA"],
    aorta: { sealZoneDiameterMm, proximalLandingLengthMm: 25 },
  };
}

/**
 * A round opening on an untapered graft, for the exact-geometry cases below.
 * `turnFraction` is where the hole really is; `arcMm` is that angle read off at
 * the opening's own circumference, which on a cylinder is the same ruler the
 * struts are laid out on.
 */
function cylindricalOpening(spec: {
  arcMm: number;
  depthMm: number;
  radiusMm: number;
  circumferenceMm: number;
}): Parameters<typeof measureHole>[1] {
  return {
    vessel: { name: "TEST" },
    turnFraction: spec.arcMm / spec.circumferenceMm,
    circumferenceMm: spec.circumferenceMm,
    arcMm: spec.arcMm,
    depthMm: spec.depthMm,
    radiusMm: spec.radiusMm,
    semiArcMm: spec.radiusMm,
    semiDepthMm: spec.radiusMm,
  } as unknown as Parameters<typeof measureHole>[1];
}

function measuredPlan() {
  const plan = planGraft(taaaCase(36));
  if (!plan.ok) throw new Error("Expected a plan");
  return plan;
}

describe("measureHole", () => {
  it("reports the hole where the cut list says it is", () => {
    const plan = measuredPlan();
    const opening = plan.openings[0];
    const measurement = measureHole(plan.graft, opening, 1);

    expect(measurement.vesselName).toBe(opening.vessel.name);
    expect(measurement.diameterMm).toBeCloseTo(opening.radiusMm * 2, 10);
    expect(measurement.depthMm).toBeCloseTo(opening.depthMm, 10);
    expect(measurement.clock).toMatch(/^\d{1,2}:\d{2}$/);
  });

  it("finds free fabric on every side of a conflict-free hole", () => {
    const plan = measuredPlan();

    for (const [index, opening] of plan.openings.entries()) {
      const clearance = plan.solution.clearances[index].clearanceMm;
      const measurement = measureHole(plan.graft, opening, clearance);

      // A hole the solver cleared cannot be sitting on wire.
      expect(measurement.insideRingBand).toBe(false);
      const sides = [
        measurement.gaps.above?.distanceMm ?? null,
        measurement.gaps.below?.distanceMm ?? null,
        measurement.gaps.left?.distanceMm ?? null,
        measurement.gaps.right?.distanceMm ?? null,
      ].filter((gap): gap is number => gap !== null);
      expect(sides.length).toBeGreaterThan(0);
      for (const gap of sides) expect(gap).toBeGreaterThan(0);
    }
  });

  it("reports each gap as the distance the hole could move that way", () => {
    // Exact geometry, so the expected answers are arithmetic rather than
    // whatever the scan happens to contain. A 6 mm hole at arc 50, depth 40,
    // boxed in by four vertical strokes.
    const circumferenceMm = 120;
    const graft = {
      circumferenceMm,
      wireRadiusMm: 0,
      segments: [
        [50, 30, 50, 32], // directly above: gap 40-3-32 = 5
        [50, 51, 50, 53], // directly below: gap 51-(40+3)  = 8
        [42, 36, 42, 44], // to the left, spanning the hole: gap 8-3 = 5
        [61, 36, 61, 44], // to the right, spanning the hole: gap 11-3 = 8
      ],
    } as unknown as Parameters<typeof measureHole>[0];

    const opening = cylindricalOpening({
      arcMm: 50,
      depthMm: 40,
      radiusMm: 3,
      circumferenceMm,
    });

    const measurement = measureHole(graft, opening, 5);

    expect(measurement.gaps.above?.distanceMm ?? null).toBeCloseTo(5, 10);
    expect(measurement.gaps.below?.distanceMm ?? null).toBeCloseTo(8, 10);
    expect(measurement.gaps.left?.distanceMm ?? null).toBeCloseTo(5, 10);
    expect(measurement.gaps.right?.distanceMm ?? null).toBeCloseTo(8, 10);
    expect(measurement.insideRingBand).toBe(false);
  });

  it("does not treat a strut clipping the hole's edge as blocking it", () => {
    // A stroke offset sideways by 8 and sitting 4 above the centre of a radius
    // 5 hole. Measuring to the flat of the hole would say it is 3 mm away; the
    // rim there is only sqrt(25-16) = 3 across, so the true slide is 8 - 3 = 5.
    const graft = {
      circumferenceMm: 120,
      wireRadiusMm: 0,
      segments: [[58, 34, 58, 36]],
    } as unknown as Parameters<typeof measureHole>[0];
    const opening = cylindricalOpening({
      arcMm: 50,
      depthMm: 40,
      radiusMm: 5,
      circumferenceMm: 120,
    });

    const measurement = measureHole(graft, opening, 1);

    expect(measurement.gaps.right?.distanceMm ?? null).toBeCloseTo(5, 10);
    // Sliding up, the same stroke is 4 above centre but offset 8 sideways —
    // further than the radius, so it can never be reached that way.
    expect(measurement.gaps.above?.distanceMm ?? null).toBeNull();
  });

  it("knows when the hole is sitting on the ring rather than in a window", () => {
    const graft = {
      circumferenceMm: 120,
      wireRadiusMm: 0,
      segments: [[50, 38, 50, 42]], // a stroke straight through the hole
    } as unknown as Parameters<typeof measureHole>[0];
    const opening = cylindricalOpening({
      arcMm: 50,
      depthMm: 40,
      radiusMm: 3,
      circumferenceMm: 120,
    });

    expect(measureHole(graft, opening, -1).insideRingBand).toBe(true);
  });

  it("gives a landmark above and below to measure from", () => {
    const plan = measuredPlan();
    const measurement = measureHole(
      plan.graft,
      plan.openings[1],
      plan.solution.clearances[1].clearanceMm,
    );

    expect(measurement.apexAbove).not.toBeNull();
    expect(measurement.valleyBelow).not.toBeNull();
    if (!measurement.apexAbove || !measurement.valleyBelow) return;

    // An apex is proximal to the hole, a valley distal to it.
    expect(measurement.apexAbove.depthMm).toBeLessThan(measurement.depthMm);
    expect(measurement.valleyBelow.depthMm).toBeGreaterThan(measurement.depthMm);
    expect(measurement.apexAbove.distanceMm).toBeGreaterThan(0);
    expect(measurement.valleyBelow.distanceMm).toBeGreaterThan(0);
    expect(measurement.apexAbove.clock).toMatch(/^\d{1,2}:\d{2}$/);
  });

  it("measures across the seam rather than around the long way", () => {
    const plan = measuredPlan();
    const graft = plan.graft;
    // A hole just clockwise of 12:00 must see wire just anticlockwise of it as
    // a neighbour a millimetre away, not a circumference away.
    const nearSeam = {
      ...plan.openings[0],
      turnFraction: 0.5 / plan.openings[0].circumferenceMm,
      arcMm: 0.5,
    };

    const measurement = measureHole(graft, nearSeam, 1);
    const offsets = [measurement.apexAbove, measurement.valleyBelow]
      .filter((landmark) => landmark !== null)
      .map((landmark) => landmark!.arcOffsetMm);

    for (const offset of offsets) {
      expect(Math.abs(offset)).toBeLessThanOrEqual(graft.circumferenceMm / 2);
    }
  });
});
