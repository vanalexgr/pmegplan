import { describe, expect, it } from "vitest";

import {
  MIN_PROXIMAL_FENESTRATION_DEPTH_MM,
  fabricEdgeZMm,
  normalizeAnatomy,
  placeOpenings,
  type AnatomyCase,
} from "@/lib/planning/anatomy";

function buildCase(): AnatomyCase {
  return {
    clockConvention: "axial_ct",
    vessels: [
      {
        name: "CELIAC",
        gapFromPreviousMm: 0,
        clock: "12:00",
        ostiumDiameterMm: 8,
      },
      {
        name: "SMA",
        gapFromPreviousMm: 20,
        clock: "12:00",
        ostiumDiameterMm: 9,
      },
      {
        name: "LRA",
        gapFromPreviousMm: 25,
        clock: "2:30",
        ostiumDiameterMm: 6,
      },
      {
        name: "RRA",
        gapFromPreviousMm: 4,
        clock: "9:30",
        ostiumDiameterMm: 6,
      },
      {
        name: "IMA",
        gapFromPreviousMm: 10,
        clock: "1:00",
        ostiumDiameterMm: 4,
      },
    ],
    fenestrate: ["CELIAC", "SMA", "LRA", "RRA"],
    cover: ["IMA"],
    aorta: { sealZoneDiameterMm: 30, proximalLandingLengthMm: 25 },
  };
}

describe("normalizeAnatomy", () => {
  it("places the datum at the lowest renal ostium", () => {
    const anatomy = normalizeAnatomy(buildCase());

    expect(anatomy.datumVesselName).toBe("RRA");
    expect(anatomy.vessels.map((vessel) => [vessel.name, vessel.zMm])).toEqual([
      ["CELIAC", 49],
      ["SMA", 29],
      ["LRA", 4],
      ["RRA", 0],
      ["IMA", -10],
    ]);
  });

  it("leaves covered vessels out of the rigid pattern", () => {
    const anatomy = normalizeAnatomy(buildCase());

    expect(anatomy.fenestrations.map((vessel) => vessel.name)).toEqual([
      "CELIAC",
      "SMA",
      "LRA",
      "RRA",
    ]);
    expect(anatomy.proximalFenestrationZMm).toBe(49);
    expect(anatomy.fenestrationSpanMm).toBe(49);
  });

  it("falls back to the most distal vessel when no renal is present", () => {
    const withoutRenals = buildCase();
    withoutRenals.vessels = withoutRenals.vessels.slice(0, 2);
    withoutRenals.fenestrate = ["CELIAC", "SMA"];
    withoutRenals.cover = [];

    expect(normalizeAnatomy(withoutRenals).datumVesselName).toBe("SMA");
  });

  it("marks anything neither fenestrated nor covered as preserved", () => {
    const juxtarenal = buildCase();
    juxtarenal.fenestrate = ["LRA", "RRA"];

    const anatomy = normalizeAnatomy(juxtarenal);

    expect(anatomy.preserved.map((vessel) => vessel.name)).toEqual([
      "CELIAC",
      "SMA",
    ]);
  });

  it("rejects a fenestration selection that is not in the chain", () => {
    const broken = buildCase();
    broken.fenestrate = ["CELIAC", "LMA"];

    expect(() => normalizeAnatomy(broken)).toThrow(/LMA is selected/);
  });

  it("does not need a clock for a vessel that is not cut", () => {
    const juxtarenal = buildCase();
    juxtarenal.fenestrate = ["LRA", "RRA"];
    delete juxtarenal.vessels[1].clock;

    expect(() => normalizeAnatomy(juxtarenal)).not.toThrow();
  });

  it("requires a clock for every vessel that is fenestrated", () => {
    const broken = buildCase();
    delete broken.vessels[1].clock;

    expect(() => normalizeAnatomy(broken)).toThrow(/SMA is fenestrated/);
  });

  it("rejects a case with no fenestrations", () => {
    const broken = buildCase();
    broken.fenestrate = [];

    expect(() => normalizeAnatomy(broken)).toThrow(/at least one fenestration/);
  });

  it("rejects a non-positive gap inside the chain", () => {
    const broken = buildCase();
    broken.vessels[1].gapFromPreviousMm = 0;

    expect(() => normalizeAnatomy(broken)).toThrow(/Gap above SMA/);
  });
});

describe("placeOpenings", () => {
  it("puts the most proximal fenestration at exactly the pose depth", () => {
    const anatomy = normalizeAnatomy(buildCase());
    const pose = {
      proximalDepthMm: MIN_PROXIMAL_FENESTRATION_DEPTH_MM,
      rotationDeg: 0,
    };

    const placed = placeOpenings(anatomy, pose, 100);

    expect(placed.map((opening) => [opening.vessel.name, opening.depthMm])).toEqual([
      ["CELIAC", 10],
      ["SMA", 30],
      ["LRA", 55],
      ["RRA", 59],
    ]);
  });

  it("preserves relative spacing when the pattern is pushed in", () => {
    const anatomy = normalizeAnatomy(buildCase());
    const shallow = placeOpenings(anatomy, { proximalDepthMm: 10, rotationDeg: 0 }, 100);
    const deep = placeOpenings(anatomy, { proximalDepthMm: 22, rotationDeg: 0 }, 100);

    for (const [index, opening] of deep.entries()) {
      expect(opening.depthMm - shallow[index].depthMm).toBeCloseTo(12, 10);
    }
  });

  it("rotates the whole pattern together and wraps the circumference", () => {
    const anatomy = normalizeAnatomy(buildCase());
    const unrotated = placeOpenings(anatomy, { proximalDepthMm: 10, rotationDeg: 0 }, 100);
    const rotated = placeOpenings(anatomy, { proximalDepthMm: 10, rotationDeg: 90 }, 100);

    expect(unrotated[0].arcMm).toBeCloseTo(0, 10);
    expect(rotated[0].arcMm).toBeCloseTo(75, 10);

    for (const [index, opening] of rotated.entries()) {
      const shifted = (unrotated[index].arcMm - 25 + 100) % 100;
      expect(opening.arcMm).toBeCloseTo(shifted, 10);
    }
  });

  it("sizes the clear radius from the opening diameter when given", () => {
    const withAllowance = buildCase();
    withAllowance.vessels[1].openingDiameterMm = 12;
    const anatomy = normalizeAnatomy(withAllowance);

    const placed = placeOpenings(anatomy, { proximalDepthMm: 10, rotationDeg: 0 }, 100);

    expect(placed[0].radiusMm).toBe(4);
    expect(placed[1].radiusMm).toBe(6);
  });
});

describe("fabricEdgeZMm", () => {
  it("sits the seal rule above the most proximal fenestration", () => {
    const anatomy = normalizeAnatomy(buildCase());

    expect(
      fabricEdgeZMm(anatomy, {
        proximalDepthMm: MIN_PROXIMAL_FENESTRATION_DEPTH_MM,
        rotationDeg: 0,
      }),
    ).toBe(59);
  });
});
