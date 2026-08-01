import { describe, expect, it } from "vitest";

import { buildClearanceField } from "@/lib/planning/clearanceField";
import {
  ellipseClearanceMm,
  ellipseReachMm,
} from "@/lib/planning/openingClearance";
import { measureHole } from "@/lib/planning/holeMeasurements";
import type { StrutSegment } from "@/lib/types";

const CIRCUMFERENCE_MM = 120;

describe("ellipseReachMm", () => {
  it("is the radius on a circle and the semi-axes on an ellipse", () => {
    const circle = { semiArcMm: 4, semiDepthMm: 4 };
    expect(ellipseReachMm(circle, 0)).toBeCloseTo(4, 10);
    expect(ellipseReachMm(circle, Math.PI / 3)).toBeCloseTo(4, 10);

    // 6 x 8 mm: 3 mm circumferentially, 4 mm axially.
    const oval = { semiArcMm: 3, semiDepthMm: 4 };
    expect(ellipseReachMm(oval, 0)).toBeCloseTo(3, 10);
    expect(ellipseReachMm(oval, Math.PI / 2)).toBeCloseTo(4, 10);
    expect(ellipseReachMm(oval, Math.PI / 4)).toBeGreaterThan(3);
    expect(ellipseReachMm(oval, Math.PI / 4)).toBeLessThan(4);
  });
});

describe("ellipseClearanceMm", () => {
  it("matches the plain radius test on a circular opening", () => {
    // A single vertical stroke, so the nearest wire is squarely to one side.
    const segments: StrutSegment[] = [[70, 20, 70, 60]];
    const field = buildClearanceField(segments, CIRCUMFERENCE_MM);

    const circle = { semiArcMm: 4, semiDepthMm: 4 };
    const wireRadiusMm = 0.5;
    const direct = field.distanceAt(50, 40) - 4 - wireRadiusMm;

    expect(ellipseClearanceMm(field, 50, 40, circle, wireRadiusMm)).toBeCloseTo(
      direct,
      6,
    );
  });

  it("gives an egg-shaped opening the room its narrow axis leaves", () => {
    // Wire to the side, so what matters is the opening's circumferential
    // half-width — 3 mm — not the 4 mm it reaches axially.
    const segments: StrutSegment[] = [[70, 10, 70, 70]];
    const field = buildClearanceField(segments, CIRCUMFERENCE_MM);
    const wireRadiusMm = 0.5;

    const oval = { semiArcMm: 3, semiDepthMm: 4 };
    const circumscribed = { semiArcMm: 4, semiDepthMm: 4 };

    const ovalClearance = ellipseClearanceMm(field, 50, 40, oval, wireRadiusMm);
    const circleClearance = ellipseClearanceMm(
      field,
      50,
      40,
      circumscribed,
      wireRadiusMm,
    );

    // Treating the oval as its circumscribed circle would throw away the whole
    // millimetre its narrow axis buys in the direction the wire actually lies.
    expect(ovalClearance).toBeGreaterThan(circleClearance + 0.9);
    expect(ovalClearance).toBeCloseTo(circleClearance + 1, 1);
  });

  it("never claims more room than the inscribed circle would allow", () => {
    // Whatever the gradient says, the answer stays inside the bounds that hold
    // in every direction — so a noisy estimate degrades rather than misleads.
    const segments: StrutSegment[] = [
      [70, 10, 70, 70],
      [50, 20, 62, 34],
      [30, 44, 44, 58],
    ];
    const field = buildClearanceField(segments, CIRCUMFERENCE_MM);
    const oval = { semiArcMm: 3, semiDepthMm: 4 };
    const wireRadiusMm = 0.5;

    for (let arcMm = 0; arcMm < CIRCUMFERENCE_MM; arcMm += 1.5) {
      for (let depthMm = 15; depthMm < 65; depthMm += 1.5) {
        const distance = field.distanceAt(arcMm, depthMm);
        const clearance = ellipseClearanceMm(
          field,
          arcMm,
          depthMm,
          oval,
          wireRadiusMm,
        );
        expect(clearance).toBeLessThanOrEqual(
          distance - (3 + wireRadiusMm) + 1e-9,
        );
        expect(clearance).toBeGreaterThanOrEqual(
          distance - (4 + wireRadiusMm) - 1e-9,
        );
      }
    }
  });
});

describe("measureHole on an egg-shaped opening", () => {
  const graft = {
    circumferenceMm: CIRCUMFERENCE_MM,
    wireRadiusMm: 0,
    segments: [
      [50, 30, 50, 32], // above
      [50, 51, 50, 53], // below
      [42, 36, 42, 44], // left, spanning the hole
    ] as StrutSegment[],
  } as unknown as Parameters<typeof measureHole>[0];

  const oval = {
    vessel: { name: "TEST" },
    arcMm: 50,
    depthMm: 40,
    semiArcMm: 3,
    semiDepthMm: 4,
    radiusMm: 4,
  } as unknown as Parameters<typeof measureHole>[1];

  it("slides axially by its height and sideways by its width", () => {
    const measurement = measureHole(graft, oval, 1);

    // Straight up, the rim is 4 mm away: 40 - 4 - 32 = 4.
    expect(measurement.gaps.above?.distanceMm ?? null).toBeCloseTo(4, 10);
    // Straight down: 51 - (40 + 4) = 7.
    expect(measurement.gaps.below?.distanceMm ?? null).toBeCloseTo(7, 10);
    // Sideways the rim is only 3 mm across: 8 - 3 = 5.
    expect(measurement.gaps.left?.distanceMm ?? null).toBeCloseTo(5, 10);
  });

  it("reports both dimensions rather than one diameter", () => {
    const measurement = measureHole(graft, oval, 1);

    expect(measurement.widthMm).toBeCloseTo(6, 10);
    expect(measurement.heightMm).toBeCloseTo(8, 10);
  });
});
