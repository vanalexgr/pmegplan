import { describe, expect, it } from "vitest";

import { bestFacingAngle } from "@/lib/geometry/coordinates";

/** Turn fraction from a clock position, 12:00 = 0, increasing clockwise. */
const atClock = (hours: number, minutes = 0) =>
  (((hours % 12) + minutes / 60) / 12) % 1;

const degrees = (radians: number) => (radians * 180) / Math.PI;

/** How far an opening sits from the facing direction, in degrees, 0-180. */
const offsetDeg = (turnFraction: number, facingRad: number) =>
  Math.abs(((turnFraction * 360 - degrees(facingRad) + 540) % 360) - 180);

describe("bestFacingAngle", () => {
  it("faces 12:00 when there is nothing on the graft", () => {
    expect(bestFacingAngle([])).toBe(0);
  });

  it("faces a single opening head on", () => {
    const facing = bestFacingAngle([atClock(4, 30)]);
    expect(degrees(facing)).toBeCloseTo(135, 0);
  });

  it("shows three of four openings on the case that motivated it", () => {
    // Coeliac 11:35, SMA 12:05, left renal 3:05, right renal 8:35 — the
    // example case. Facing 12:00 leaves both renals off the near surface.
    const openings = [
      atClock(11, 35),
      atClock(12, 5),
      atClock(3, 5),
      atClock(8, 35),
    ];
    const facing = bestFacingAngle(openings);
    const visible = openings.filter(
      (opening) => offsetDeg(opening, facing) <= 75,
    );
    expect(visible).toHaveLength(3);

    const facingNoon = openings.filter(
      (opening) => offsetDeg(opening, 0) <= 75,
    );
    expect(facingNoon.length).toBeLessThan(visible.length);

    // And none of the three is left on the silhouette, where it renders as a
    // sliver against the graft edge rather than as a hole.
    for (const opening of visible) {
      expect(offsetDeg(opening, facing)).toBeLessThan(65);
    }
  });

  it("cannot be beaten by any other angle, and centres what it shows", () => {
    const openings = [atClock(11), atClock(1), atClock(5), atClock(7)];
    const facing = bestFacingAngle(openings);
    const score = (facingRad: number) =>
      openings.filter((opening) => offsetDeg(opening, facingRad) <= 75).length;

    for (let deg = 0; deg < 360; deg += 1) {
      expect(score((deg * Math.PI) / 180)).toBeLessThanOrEqual(score(facing));
    }
  });

  it("is indifferent to how a turn fraction is wound", () => {
    const wound = bestFacingAngle([atClock(3) + 2, atClock(9) - 1]);
    const plain = bestFacingAngle([atClock(3), atClock(9)]);
    expect(wound).toBeCloseTo(plain, 6);
  });
});
