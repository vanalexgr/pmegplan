import { describe, expect, it } from "vitest";

import {
  SCALLOP_WIDTH_MM,
  minProximalDepthMm,
  normalizeAnatomy,
  placeScallop,
  scallopCentreDepthMm,
  scallopEdgeDepthMm,
  scallopHeightMm,
  scallopSeparationMm,
  uniformCircumference,
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
    // The floor sits a coeliac radius deeper than the separation. At the
    // separation exactly the cut has no height and the fabric edge crosses the
    // coeliac; a radius more puts the edge level with its cranial rim, which is
    // the shallowest pose that actually relieves the vessel.
    expect(minProximalDepthMm(anatomy)).toBe(14);

    const plain = normalizeAnatomy(coeliacTooClose("preserve"));
    expect(scallopSeparationMm(plain)).toBeNull();
    expect(minProximalDepthMm(plain)).toBe(10);
  });

  it("derives the scallop height from the pose, carried past the vessel", () => {
    const anatomy = normalizeAnatomy(coeliacTooClose("scallop"));

    // The plan-sheet run — fabric edge to the coeliac's centre — is the push-in
    // less the 10 mm separation, which is what all three plans in the reference
    // series state. The cut goes a coeliac radius further, to the caudal rim,
    // so that no fabric crosses the vessel.
    const pose = { proximalDepthMm: 30, rotationDeg: 0 };
    expect(scallopCentreDepthMm(anatomy, pose)).toBe(20);
    expect(scallopHeightMm(anatomy, pose)).toBe(24);

    // At the separation exactly the edge lands on the ostium's centre: nothing
    // of the vessel is relieved, and the cut is only its own lower half.
    const flush = { proximalDepthMm: 10, rotationDeg: 0 };
    expect(scallopCentreDepthMm(anatomy, flush)).toBe(0);
    expect(scallopHeightMm(anatomy, flush)).toBe(4);

    expect(
      scallopHeightMm(normalizeAnatomy(coeliacTooClose("preserve")), pose),
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

  it("refuses only when the cut would run into the opening below it", () => {
    // Where the two just touch is arithmetic, and the pose cannot change it:
    // the cut ends at the coeliac's caudal rim, 4 mm below its centre, and the
    // SMA's hole starts 4.5 mm above its own. So 8.5 mm of separation is the
    // floor for this pair, whatever the graft or the push-in.
    //
    // 8 mm is under it, and the two are one aperture rather than a scallop with
    // fabric beneath it.
    const merged = coeliacTooClose("scallop");
    merged.vessels[1].gapFromPreviousMm = 8;
    const mergedPlan = planGraft(merged);
    expect(mergedPlan.ok).toBe(true);
    if (!mergedPlan.ok) return;
    expect(mergedPlan.solution.status).toBe("scallop_meets_opening");

    // 12 mm leaves a bridge of about 3.5 mm — under the narrowest in the
    // reference series, but buildable, so it is planned and reported rather
    // than refused. There is no universal minimum bridge to refuse it by.
    const tight = coeliacTooClose("scallop");
    tight.vessels[1].gapFromPreviousMm = 12;
    const tightPlan = planGraft(tight);
    expect(tightPlan.ok).toBe(true);
    if (!tightPlan.ok) return;
    expect(tightPlan.solution.status).not.toBe("scallop_meets_opening");
    expect(tightPlan.scallopBridge?.edgeToEdgeMm).toBeGreaterThan(0);
  });

  it("reports both the quoted separation and the real fabric bridge", () => {
    const plan = planGraft(coeliacTooClose("scallop"));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const bridge = plan.scallopBridge;
    if (!bridge) throw new Error("Expected a bridge.");

    // Nadir to centre is the separation: 10 mm, as a plan sheet would quote.
    expect(bridge.vesselName).toBe("SMA");
    expect(bridge.toCentreMm).toBeCloseTo(10, 6);
    // Edge to edge is far less, and this is the gap between the two figures the
    // readout exists to show. Both ends eat into the 10 mm: the cut runs 4 mm
    // past the coeliac's centre to clear it, and the SMA's own 9 mm hole starts
    // 4.5 mm above its centre. That leaves 1.5 mm, and a little more than that
    // because the two are 15 minutes apart on the clock, so the shortest run
    // between them is diagonal rather than straight down.
    expect(bridge.edgeToEdgeMm).toBeGreaterThan(1.5);
    expect(bridge.edgeToEdgeMm).toBeLessThan(2.5);
    // A 20 mm cut consumes a fifth of this 32 mm device's circumference, and
    // would consume less of a wider one — which is why it is reported.
    expect(bridge.circumferenceFraction).toBeCloseTo(0.2, 1);
  });

  it("rejects a scallop with a fenestration above it", () => {
    const broken = coeliacTooClose("scallop");
    broken.scallop = ["SMA"];
    broken.fenestrate = ["CELIAC", "LRA", "RRA"];

    expect(() => normalizeAnatomy(broken)).toThrow(
      /cannot be fenestrated above it/,
    );
  });

  it("allows a scallop below a vessel that is only preserved", () => {
    // Keeping the coeliac clear of the fabric altogether does not stop the edge
    // being scalloped for the SMA: all a preserved vessel does is cap push-in.
    const smaScallop = coeliacTooClose("preserve");
    smaScallop.vessels[1].gapFromPreviousMm = 20;
    smaScallop.scallop = ["SMA"];
    smaScallop.fenestrate = ["LRA", "RRA"];
    smaScallop.aorta.proximalLandingLengthMm = 25;

    const anatomy = normalizeAnatomy(smaScallop);
    expect(anatomy.scalloped?.name).toBe("SMA");
    expect(anatomy.preserved.map((vessel) => vessel.name)).toEqual(["CELIAC"]);

    const plan = planGraft(smaScallop);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    // The coeliac still caps the push-in, 4 mm clear of its own ostium.
    expect(plan.depthLimit.limitingVesselName).toBe("CELIAC");
  });

  it("refuses to scallop a renal", () => {
    const broken = coeliacTooClose("scallop");
    broken.scallop = ["LRA"];
    broken.fenestrate = ["CELIAC", "SMA", "RRA"];

    expect(() => normalizeAnatomy(broken)).toThrow(
      /renal artery and takes a fenestration/,
    );
  });

  it("narrows a shallow cut rather than flattening it into a saucer", () => {
    // A scallop is a U everywhere it is manufactured — 10 mm wide by 6 to 12 on
    // the off-the-shelf fenestrated device, 30 by 20 on a custom arch one — so
    // the height is never less than half the width. A pose that cannot give the
    // full 20 mm that depth gets the widest semicircle that fits instead.
    // 14 mm in is the shallowest this anatomy allows: the edge lands on the
    // coeliac's cranial rim, and the cut runs the ostium's full 8 mm.
    const shallow = placeScallop(
      normalizeAnatomy(coeliacTooClose("scallop")),
      { proximalDepthMm: 14, rotationDeg: 0 },
      uniformCircumference(120),
    );
    if (!shallow) throw new Error("Expected a scallop.");
    expect(shallow.heightMm).toBe(8);
    expect(shallow.semiArcMm).toBe(8);

    // A bare semicircle: deepest in the middle, closed at its own half-width.
    expect(scallopEdgeDepthMm(shallow, 0)).toBeCloseTo(8, 10);
    expect(scallopEdgeDepthMm(shallow, 8)).toBe(0);
    // On the circle the whole way, rather than bulging out to 10 mm.
    expect(Math.hypot(6, scallopEdgeDepthMm(shallow, 6))).toBeCloseTo(8, 10);
  });

  it("keeps the full width once the cut is deep enough to carry it", () => {
    const deep = placeScallop(
      normalizeAnatomy(coeliacTooClose("scallop")),
      { proximalDepthMm: 35, rotationDeg: 0 },
      uniformCircumference(120),
    );
    if (!deep) throw new Error("Expected a scallop.");
    // 35 in, less the 10 mm separation, plus the coeliac's own 4 mm radius.
    expect(deep.centreDepthMm).toBe(25);
    expect(deep.heightMm).toBe(29);
    expect(deep.semiArcMm).toBe(SCALLOP_WIDTH_MM / 2);
    // Straight sides down to a shoulder at 29 − 10, then a semicircular base of
    // the half-width centred there: every point of it is 10 mm from that centre.
    expect(scallopEdgeDepthMm(deep, 0)).toBeCloseTo(29, 10);
    expect(scallopEdgeDepthMm(deep, 6)).toBeCloseTo(27, 10);
    expect(Math.hypot(6, scallopEdgeDepthMm(deep, 6) - 19)).toBeCloseTo(10, 10);
  });

  it("places no cut at all when the pose leaves none to make", () => {
    // The fabric edge below the coeliac's caudal rim covers the vessel outright.
    // That is not a scallop of no height, it is a device that cannot carry the
    // plan, so nothing is placed. Six millimetres in puts the edge 4 mm past the
    // rim, which is well below any pose the solver would reach for.
    expect(
      placeScallop(
        normalizeAnatomy(coeliacTooClose("scallop")),
        { proximalDepthMm: 6, rotationDeg: 0 },
        uniformCircumference(120),
      ),
    ).toBeNull();
  });

  it("rejects more than one scallop", () => {
    const broken = coeliacTooClose("scallop");
    broken.scallop = ["CELIAC", "SMA"];
    broken.fenestrate = ["LRA", "RRA"];

    expect(() => normalizeAnatomy(broken)).toThrow(/Only one vessel can be scalloped/);
  });

  it("places the cut at the vessel's clock, turned with the graft", () => {
    const anatomy = normalizeAnatomy(coeliacTooClose("scallop"));
    const circumferenceMm = 120;

    // 12:15 is an eighth of an hour past the top: 1/48 of the way round.
    const straight = placeScallop(
      anatomy,
      { proximalDepthMm: 22, rotationDeg: 0 },
      uniformCircumference(circumferenceMm),
    );
    expect(straight?.arcMm).toBeCloseTo(circumferenceMm / 48, 10);
    expect(straight?.semiArcMm).toBe(10);
    // 22 in, less the 10 mm separation, plus the coeliac's own 4 mm radius.
    expect(straight?.heightMm).toBe(16);

    // Turning the graft moves the cut with every other opening, since the
    // whole pattern is rigid.
    const turned = placeScallop(
      anatomy,
      { proximalDepthMm: 22, rotationDeg: 30 },
      uniformCircumference(circumferenceMm),
    );
    // 30° back from 12:15 lands at 11:15, an eighth of the way round from 12.
    expect(turned?.arcMm).toBeCloseTo((circumferenceMm * 45) / 48, 10);

    expect(
      placeScallop(
        normalizeAnatomy(coeliacTooClose("preserve")),
        { proximalDepthMm: 22, rotationDeg: 0 },
        uniformCircumference(circumferenceMm),
      ),
    ).toBeNull();
  });

  it("cuts a round-bottomed notch that closes back onto the fabric edge", () => {
    const scallop = placeScallop(
      normalizeAnatomy(coeliacTooClose("scallop")),
      { proximalDepthMm: 22, rotationDeg: 0 },
      uniformCircumference(120),
    );
    if (!scallop) throw new Error("Expected a scallop.");

    // Deepest at the centre, and the bottom is a semicircle of the cut's own
    // half-width — 10 mm here — centred that far up from the deepest point.
    expect(scallopEdgeDepthMm(scallop, 0)).toBeCloseTo(16, 10);
    for (const offsetMm of [0, 3, 6, 9.9]) {
      const depthMm = scallopEdgeDepthMm(scallop, offsetMm);
      expect(Math.hypot(offsetMm, depthMm - 6)).toBeCloseTo(10, 10);
    }
    // Outside the cut the fabric edge is untouched.
    expect(scallopEdgeDepthMm(scallop, 10)).toBe(0);
    expect(scallopEdgeDepthMm(scallop, -20)).toBe(0);
  });

  it("takes the fabric edge up the neck rather than stopping at the vessel", () => {
    // The seal rule alone would allow the edge to sit level with the coeliac,
    // at 10 mm, which cuts no scallop at all. What the cut is for is the aorta
    // above the vessel, so the cut takes the whole 20 mm of neck declared —
    // and it does so on every device, because the neck is a property of the
    // patient rather than of the graft chosen.
    const plan = planGraft(coeliacTooClose("scallop"));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    // 30 mm in: the 20 mm of neck above the coeliac plus its 10 mm above the
    // SMA. Which is the order of the reference series — C002 has the same 10 mm
    // coeliac-to-SMA gap and a 20 mm scallop quoted to the vessel centre.
    expect(plan.solution.pose.proximalDepthMm).toBeCloseTo(30, 10);
    expect(plan.scallop?.centreDepthMm).toBeCloseTo(20, 10);
    expect(plan.scallop?.heightMm).toBeCloseTo(24, 10);

    for (const fit of plan.considered) {
      if (!fit.scallop) continue;
      expect(fit.scallop.heightMm, fit.model.scan.reference.id).toBeCloseTo(
        24,
        10,
      );
    }
  });

  it("carries the placed cut on the plan", () => {
    const plan = planGraft(coeliacTooClose("scallop"));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.scallop?.vessel.name).toBe("CELIAC");
    // The height is what the solved pose implies, not a separate choice: the
    // push-in less the 10 mm separation, carried a coeliac radius past the
    // vessel so the cut clears it.
    expect(plan.scallop?.heightMm).toBeCloseTo(
      plan.solution.pose.proximalDepthMm - 10 + 4,
      10,
    );

    expect(planGraft(coeliacTooClose("preserve")).ok).toBe(true);
    const preserved = planGraft(coeliacTooClose("preserve"));
    expect(preserved.ok && preserved.scallop).toBeNull();
  });

  it("needs a clock for the vessel it cuts", () => {
    const unplaced = coeliacTooClose("scallop");
    delete unplaced.vessels[0].clock;

    expect(() => normalizeAnatomy(unplaced)).toThrow(
      /scalloped and needs a clock position/,
    );
  });

  it("rejects a vessel that is both scalloped and fenestrated", () => {
    const broken = coeliacTooClose("scallop");
    broken.fenestrate = ["CELIAC", "SMA", "LRA", "RRA"];

    expect(() => normalizeAnatomy(broken)).toThrow(/both fenestrated and scalloped/);
  });
});
