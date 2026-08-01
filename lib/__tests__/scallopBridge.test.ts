import { describe, expect, it } from "vitest";

import {
  measureScallopBridge,
  type PlacedOpening,
  type PlacedScallop,
} from "@/lib/planning/anatomy";

/**
 * The three scalloped plans in the reference series, as the manufacturer drew
 * them: scallop base and fenestration centres in mm below the proximal fabric
 * edge, at their stated clocks and sizes.
 *
 * They are the only accepted scallop-to-fenestration relationships available to
 * check the measure against. Nothing here is a threshold — see
 * `NARROWEST_SERIES_BRIDGE_MM`; they pin the arithmetic, not a rule.
 */
const SERIES = [
  {
    id: "C001",
    proximalDiameterMm: 30,
    scallop: { clock: "12:15", heightMm: 16 },
    fenestrations: [
      { name: "SMA", clock: "11:45", depthMm: 31, widthMm: 8, heightMm: 8 },
      { name: "RRA", clock: "9:15", depthMm: 39, widthMm: 6, heightMm: 8 },
      { name: "LRA", clock: "2:45", depthMm: 49, widthMm: 6, heightMm: 8 },
    ],
    // Nadir to the nearest fenestration centre, as the plan sheet states it.
    expectToCentreMm: 15,
    // What `centre - depth - radius` gives, ignoring any difference in clock.
    handFormulaMm: 11,
  },
  {
    id: "C002",
    proximalDiameterMm: 30,
    scallop: { clock: "12:15", heightMm: 20 },
    fenestrations: [
      { name: "SMA", clock: "12:00", depthMm: 30, widthMm: 8, heightMm: 8 },
      { name: "LRA", clock: "2:45", depthMm: 49, widthMm: 6, heightMm: 8 },
      { name: "RRA", clock: "9:15", depthMm: 50, widthMm: 6, heightMm: 6 },
    ],
    expectToCentreMm: 10,
    handFormulaMm: 6,
  },
  {
    id: "C003",
    proximalDiameterMm: 26,
    scallop: { clock: "12:45", heightMm: 16 },
    fenestrations: [
      { name: "LRA", clock: "3:45", depthMm: 32, widthMm: 6, heightMm: 6 },
      { name: "RRA", clock: "10:00", depthMm: 36, widthMm: 6, heightMm: 6 },
    ],
    expectToCentreMm: 16,
    handFormulaMm: 13,
  },
] as const;

function arcMm(clock: string, circumferenceMm: number): number {
  const [hour, minute] = clock.split(":").map(Number);
  return (((hour % 12) + minute / 60) / 12) * circumferenceMm;
}

function build(entry: (typeof SERIES)[number]) {
  const circumferenceMm = Math.PI * entry.proximalDiameterMm;
  const scallop = {
    vessel: { name: "SCALLOP" },
    arcMm: arcMm(entry.scallop.clock, circumferenceMm),
    semiArcMm: 10,
    heightMm: entry.scallop.heightMm,
  } as unknown as PlacedScallop;
  const openings = entry.fenestrations.map(
    (fenestration) =>
      ({
        vessel: { name: fenestration.name },
        depthMm: fenestration.depthMm,
        arcMm: arcMm(fenestration.clock, circumferenceMm),
        semiArcMm: fenestration.widthMm / 2,
        semiDepthMm: fenestration.heightMm / 2,
        radiusMm: Math.max(fenestration.widthMm, fenestration.heightMm) / 2,
      }) as unknown as PlacedOpening,
  );
  return { circumferenceMm, scallop, openings };
}

describe("measureScallopBridge against the reference series", () => {
  it("reproduces the nadir-to-centre figure each plan sheet states", () => {
    for (const entry of SERIES) {
      const { circumferenceMm, scallop, openings } = build(entry);
      const bridge = measureScallopBridge(scallop, openings, circumferenceMm);
      expect(bridge, entry.id).not.toBeNull();
      expect(bridge!.toCentreMm, entry.id).toBeCloseTo(entry.expectToCentreMm, 6);
    }
  });

  it("agrees with the hand formula where the clocks nearly align", () => {
    // C001's scallop and SMA are half an hour apart and C002's a quarter, so
    // the shortest run between them is barely diagonal and the two agree.
    for (const entry of [SERIES[0], SERIES[1]]) {
      const { circumferenceMm, scallop, openings } = build(entry);
      const bridge = measureScallopBridge(scallop, openings, circumferenceMm)!;
      expect(bridge.vesselName, entry.id).toBe("SMA");
      expect(bridge.edgeToEdgeMm, entry.id).toBeGreaterThan(entry.handFormulaMm);
      expect(bridge.edgeToEdgeMm, entry.id).toBeLessThan(
        entry.handFormulaMm + 0.5,
      );
    }
  });

  it("finds the fabric the hand formula misses when the clocks do not", () => {
    // C003 scallops the SMA at 12:45 and fenestrates the LRA at 3:45 — three
    // hours round. Subtracting depths pretends they are stacked and reports
    // 13 mm of bridge; the fabric actually between them is half again as much,
    // because most of the run is circumferential.
    const entry = SERIES[2];
    const { circumferenceMm, scallop, openings } = build(entry);
    const bridge = measureScallopBridge(scallop, openings, circumferenceMm)!;

    expect(bridge.vesselName).toBe("LRA");
    expect(bridge.edgeToEdgeMm).toBeGreaterThan(entry.handFormulaMm + 5);
    expect(bridge.edgeToEdgeMm).toBeCloseTo(20.1, 0);
  });

  it("reports what share of the circumference the cut consumes", () => {
    // The same 20 mm cut is a fifth of a 30 mm graft and a quarter of a 26 mm
    // one, which is why it is reported per device rather than as a width.
    const wide = build(SERIES[0]);
    const narrow = build(SERIES[2]);

    expect(
      measureScallopBridge(wide.scallop, wide.openings, wide.circumferenceMm)!
        .circumferenceFraction,
    ).toBeCloseTo(0.21, 2);
    expect(
      measureScallopBridge(
        narrow.scallop,
        narrow.openings,
        narrow.circumferenceMm,
      )!.circumferenceFraction,
    ).toBeCloseTo(0.24, 2);
  });
});
