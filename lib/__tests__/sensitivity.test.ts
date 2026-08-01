import { describe, expect, it } from "vitest";

import { normalizeAnatomy, type AnatomyCase } from "@/lib/planning/anatomy";
import { planGraft } from "@/lib/planning/plan";
import { analyseSensitivity, isKnifeEdge } from "@/lib/planning/sensitivity";

function juxtarenal(coeliacToSmaMm: number, coeliacOstiumMm = 8): AnatomyCase {
  return {
    clockConvention: "axial_ct",
    vessels: [
      {
        name: "CELIAC",
        gapFromPreviousMm: 0,
        ostiumDiameterMm: coeliacOstiumMm,
      },
      { name: "SMA", gapFromPreviousMm: coeliacToSmaMm, clock: "12:00", ostiumDiameterMm: 9 },
      { name: "LRA", gapFromPreviousMm: 19, clock: "2:45", ostiumDiameterMm: 6 },
      { name: "RRA", gapFromPreviousMm: 1, clock: "9:15", ostiumDiameterMm: 6 },
    ],
    fenestrate: ["SMA", "LRA", "RRA"],
    aorta: { sealZoneDiameterMm: 26, proximalLandingLengthMm: 20 },
  };
}

function analyse(anatomyCase: AnatomyCase) {
  const plan = planGraft(anatomyCase);
  if (!plan.ok) throw new Error(`Expected a plan: ${plan.reason}`);
  return {
    plan,
    sensitivity: analyseSensitivity(
      normalizeAnatomy(anatomyCase),
      plan.solution,
      plan.depthLimit,
    ),
  };
}

describe("analyseSensitivity", () => {
  it("names the vessel a failed seal hinges on, and what would change it", () => {
    // Coeliac 10 mm above the SMA with an 8 mm ostium caps push-in at 6 mm,
    // against a 10 mm minimum.
    const { sensitivity } = analyse(juxtarenal(10));

    expect(sensitivity.binding).toBe("push_in_ceiling");
    expect(sensitivity.vesselName).toBe("CELIAC");
    expect(sensitivity.slackMm).toBeCloseTo(-4, 10);
    // Either 4 mm more room above the SMA...
    expect(sensitivity.gapChangeMm).toBeCloseTo(4, 10);
    // ...or an ostium of 2 x (10 - 10) = 0 mm, which is to say: no ostium
    // measurement rescues this. The verdict is not a measurement artefact.
    expect(sensitivity.ostiumWouldNeedMm).toBeCloseTo(0, 10);
  });

  it("distinguishes a verdict that a remeasurement could flip", () => {
    // 13.8 mm and an 8 mm ostium leaves the limit at 9.8 — failing by 0.2 mm.
    const marginal = analyse(juxtarenal(13.8)).sensitivity;
    expect(marginal.slackMm).toBeCloseTo(-0.2, 6);
    expect(isKnifeEdge(marginal)).toBe(true);
    // A 0.4 mm larger gap, or a 0.4 mm smaller ostium, would flip it.
    expect(marginal.gapChangeMm).toBeCloseTo(0.2, 6);
    expect(marginal.ostiumWouldNeedMm).toBeCloseTo(7.6, 6);

    // Whereas 10 mm fails by 4 mm and no plausible remeasurement helps.
    expect(isKnifeEdge(analyse(juxtarenal(10)).sensitivity)).toBe(false);
  });

  it("reports the tightest hole and the tolerance when the plan stands", () => {
    const { plan, sensitivity } = analyse(juxtarenal(22));

    expect(sensitivity.binding).toBe("clearance");
    expect(sensitivity.slackMm).toBeCloseTo(plan.solution.marginMm, 10);
    // Because the pattern is rigid, the margin is the room every opening has.
    expect(sensitivity.positionToleranceMm).toBeCloseTo(
      plan.solution.marginMm,
      10,
    );

    const tightest = plan.solution.clearances.reduce((worst, candidate) =>
      candidate.clearanceMm < worst.clearanceMm ? candidate : worst,
    );
    expect(sensitivity.vesselName).toBe(tightest.vesselName);
  });

  it("points at the vessel gap when a scallop has too little fabric under it", () => {
    const scalloped = juxtarenal(6);
    scalloped.scallop = ["CELIAC"];

    const { sensitivity } = analyse(scalloped);

    expect(sensitivity.binding).toBe("scallop_seal");
    expect(sensitivity.vesselName).toBe("CELIAC");
    expect(sensitivity.slackMm).toBeCloseTo(-4, 10);
    expect(sensitivity.gapChangeMm).toBeCloseTo(4, 10);
    // A scallop seals on fabric between the vessels; the ostium is not in it.
    expect(sensitivity.ostiumWouldNeedMm).toBeNull();
  });
});
