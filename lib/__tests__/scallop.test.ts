import { describe, expect, it } from "vitest";

import {
  minProximalDepthMm,
  normalizeAnatomy,
  scallopHeightMm,
  scallopSeparationMm,
  type AnatomyCase,
} from "@/lib/planning/anatomy";
import { planGraft } from "@/lib/planning/plan";

/**
 * The reference case: coeliac 10 mm above the SMA. A closed coeliac
 * fenestration cannot seal here, and preserving it caps push-in at 6 mm —
 * below the seal minimum. The custom device for this anatomy used a scallop.
 */
function coeliacTooClose(treatment: "preserve" | "scallop"): AnatomyCase {
  return {
    clockConvention: "axial_ct",
    vessels: [
      { name: "CELIAC", gapFromPreviousMm: 0, clock: "12:15", ostiumDiameterMm: 8 },
      { name: "SMA", gapFromPreviousMm: 10, clock: "12:00", ostiumDiameterMm: 9 },
      { name: "LRA", gapFromPreviousMm: 19, clock: "2:45", ostiumDiameterMm: 6 },
      { name: "RRA", gapFromPreviousMm: 1, clock: "9:15", ostiumDiameterMm: 6 },
    ],
    fenestrate: ["SMA", "LRA", "RRA"],
    ...(treatment === "scallop" ? { scallop: ["CELIAC"] } : {}),
    aorta: { sealZoneDiameterMm: 26.1, proximalLandingLengthMm: 20 },
  };
}

describe("scallop", () => {
  it("classifies the scalloped vessel apart from preserved ones", () => {
    const anatomy = normalizeAnatomy(coeliacTooClose("scallop"));

    expect(anatomy.scalloped?.name).toBe("CELIAC");
    expect(anatomy.preserved).toHaveLength(0);
    expect(anatomy.fenestrations.map((vessel) => vessel.name)).toEqual([
      "SMA",
      "LRA",
      "RRA",
    ]);
  });

  it("seals on the fabric below it rather than above the first hole", () => {
    const anatomy = normalizeAnatomy(coeliacTooClose("scallop"));

    // The coeliac-to-SMA gap is what seals, not the depth of the SMA hole.
    expect(scallopSeparationMm(anatomy)).toBe(10);
    expect(minProximalDepthMm(anatomy)).toBe(10);

    const plain = normalizeAnatomy(coeliacTooClose("preserve"));
    expect(scallopSeparationMm(plain)).toBeNull();
    expect(minProximalDepthMm(plain)).toBe(10);
  });

  it("derives the scallop height from the pose", () => {
    // Reproduces all three scalloped plans in the reference series: height is
    // the depth of the first fenestration less the scallop separation.
    const anatomy = normalizeAnatomy(coeliacTooClose("scallop"));

    expect(scallopHeightMm(anatomy, { proximalDepthMm: 30, rotationDeg: 0 })).toBe(20);
    expect(scallopHeightMm(anatomy, { proximalDepthMm: 10, rotationDeg: 0 })).toBe(0);
    expect(
      scallopHeightMm(normalizeAnatomy(coeliacTooClose("preserve")), {
        proximalDepthMm: 30,
        rotationDeg: 0,
      }),
    ).toBeNull();
  });

  it("rescues anatomy that cannot be sealed any other way", () => {
    // Preserved, the coeliac caps push-in at 10 - 8/2 = 6 mm, under the 10 mm
    // seal minimum, and there is no plan at all.
    const preserved = planGraft(coeliacTooClose("preserve"));
    expect(preserved.ok).toBe(true);
    if (!preserved.ok) return;
    expect(preserved.solution.status).toBe("seal_zone_too_short");
    expect(preserved.depthLimit.maxDepthMm).toBeCloseTo(6, 10);

    // Scalloped, the coeliac is cut rather than kept clear, so it no longer
    // caps the push-in and the case becomes plannable.
    const scalloped = planGraft(coeliacTooClose("scallop"));
    expect(scalloped.ok).toBe(true);
    if (!scalloped.ok) return;
    expect(scalloped.solution.status).not.toBe("seal_zone_too_short");
    expect(scalloped.solution.pose.proximalDepthMm).toBeGreaterThanOrEqual(10);
  });

  it("refuses a scallop with too little fabric under it", () => {
    const tight = coeliacTooClose("scallop");
    // 6 mm between the coeliac and the SMA leaves nothing to seal against.
    tight.vessels[1].gapFromPreviousMm = 6;

    const plan = planGraft(tight);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.solution.status).toBe("scallop_seal_too_short");
  });

  it("rejects a scallop with anything treated above it", () => {
    const broken = coeliacTooClose("scallop");
    broken.scallop = ["SMA"];
    broken.fenestrate = ["CELIAC", "LRA", "RRA"];

    expect(() => normalizeAnatomy(broken)).toThrow(/cannot be treated above it/);
  });

  it("rejects more than one scallop", () => {
    const broken = coeliacTooClose("scallop");
    broken.scallop = ["CELIAC", "SMA"];
    broken.fenestrate = ["LRA", "RRA"];

    expect(() => normalizeAnatomy(broken)).toThrow(/Only one vessel can be scalloped/);
  });

  it("rejects a vessel that is both scalloped and fenestrated", () => {
    const broken = coeliacTooClose("scallop");
    broken.fenestrate = ["CELIAC", "SMA", "LRA", "RRA"];

    expect(() => normalizeAnatomy(broken)).toThrow(/both fenestrated and scalloped/);
  });
});
