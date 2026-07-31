import { describe, expect, it } from "vitest";

import { minDistToStruts } from "@/lib/conflictDetection";
import { buildClearanceField } from "@/lib/planning/clearanceField";
import type { StrutSegment } from "@/lib/types";

const CIRCUMFERENCE_MM = 100;

function zigzagRings(): StrutSegment[] {
  const segments: StrutSegment[] = [];
  const peaks = 6;
  const waveMm = CIRCUMFERENCE_MM / peaks;

  for (const top of [0, 30, 60]) {
    for (let peak = 0; peak < peaks; peak += 1) {
      const left = peak * waveMm;
      const middle = left + waveMm / 2;
      const right = left + waveMm;
      segments.push([left, top, middle, top + 20]);
      segments.push([middle, top + 20, right, top]);
    }
  }

  return segments;
}

describe("buildClearanceField", () => {
  it("agrees with the brute-force segment distance", () => {
    const segments = zigzagRings();
    const field = buildClearanceField(segments, CIRCUMFERENCE_MM, { cellMm: 0.25 });

    let worstOver = 0;
    let worstUnder = 0;

    for (let sample = 0; sample < 3000; sample += 1) {
      const arcMm = (sample * 37.13) % CIRCUMFERENCE_MM;
      const depthMm = 2 + ((sample * 13.7) % 76);
      const exact = minDistToStruts(arcMm, depthMm, segments, CIRCUMFERENCE_MM);
      const approximate = field.distanceAt(arcMm, depthMm);

      worstOver = Math.max(worstOver, approximate - exact);
      worstUnder = Math.max(worstUnder, exact - approximate);
    }

    expect(worstOver).toBeLessThan(0.05);
    expect(worstUnder).toBeLessThan(0.5);
  });

  it("wraps across the circumferential seam", () => {
    const segments: StrutSegment[] = [[1, 40, 1, 42]];
    const field = buildClearanceField(segments, CIRCUMFERENCE_MM, { cellMm: 0.25 });

    const arcMm = CIRCUMFERENCE_MM - 2;
    const exact = minDistToStruts(arcMm, 41, segments, CIRCUMFERENCE_MM);

    expect(exact).toBeCloseTo(3, 10);
    expect(field.distanceAt(arcMm, 41)).toBeCloseTo(exact, 0);
  });

  it("never reports more clearance than the true distance", () => {
    const segments: StrutSegment[] = [[20, 10, 80, 10]];
    const field = buildClearanceField(segments, CIRCUMFERENCE_MM, { cellMm: 0.25 });

    for (const depthMm of [11, 13, 16, 20, 25]) {
      expect(field.distanceAt(50, depthMm)).toBeLessThanOrEqual(depthMm - 10);
    }
  });

  it("rejects an empty segment list", () => {
    expect(() => buildClearanceField([], CIRCUMFERENCE_MM)).toThrow(
      /at least one strut segment/,
    );
  });
});
