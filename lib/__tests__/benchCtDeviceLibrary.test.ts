import { describe, expect, it } from "vitest";
import {
  ALL_DEVICES,
  BENCH_CT_DEVICE_LIBRARY,
  getBenchCtDeviceDescriptor,
} from "@/lib/devices";
import {
  buildBenchCtStrutSegments,
  buildStrutSegmentsForDevice,
} from "@/lib/stentGeometry";
import {
  buildBenchCtRenderModel,
  sampleBenchCtRing,
} from "@/lib/geometry/benchCtRenderModel";

describe("bench CT device library", () => {
  it("registers each scanned descriptor with its measured apex geometry", () => {
    expect(BENCH_CT_DEVICE_LIBRARY).toHaveLength(3);
    const scan1 = getBenchCtDeviceDescriptor("Endograft_1", "scan1");
    expect(scan1?.rings).toHaveLength(8);
    expect(scan1?.rings.every((ring) => ring.n_apices === 7)).toBe(true);
    expect(getBenchCtDeviceDescriptor("Endograft_3", "scan3")?.rings).toHaveLength(10);
  });

  it("carries a validated wire map on every scanned device", () => {
    for (const name of ["Endograft_1", "Endograft_2", "Endograft_3"]) {
      const scan = name.replace("Endograft_", "scan");
      const descriptor = getBenchCtDeviceDescriptor(name, scan);
      if (!descriptor) throw new Error(`Expected ${name} ${scan}`);
      const map = descriptor.wire_map;
      if (!map) throw new Error(`${name} has no wire map`);

      expect(map.theta_bins).toBe(map.runs.length);
      // The fit that put the map in the descriptor's frame has to be tight, or
      // the measured wire is not where the plan thinks it is.
      expect(map.datum_fit.apex_residual_p50_mm).toBeLessThan(1);

      const runs = map.runs.flat();
      // Every interval is ordered and about a wire thick, not a whole ring.
      for (const [start, end] of runs) expect(end).toBeGreaterThanOrEqual(start);
      const lengths = runs.map(([start, end]) => end - start).sort((a, b) => a - b);
      expect(lengths[Math.floor(lengths.length / 2)]).toBeLessThan(4);
    }
  });

  it("takes strut segments from the scan rather than interpolating apices", () => {
    const scan1 = getBenchCtDeviceDescriptor("Endograft_1", "scan1");
    if (!scan1) throw new Error("Expected Endograft_1 scan descriptor");

    const segments = buildBenchCtStrutSegments(scan1, Math.PI * 42.5);
    const apexCount = scan1.rings.reduce(
      (sum, ring) => sum + ring.proximal_apices.length + ring.distal_apices.length,
      0,
    );

    // Two orders of magnitude more wire than the apex rows carry.
    expect(segments.length).toBeGreaterThan(apexCount * 20);
    expect(segments.length).toBe(scan1.wire_map!.runs.flat().length);
  });

  it("covers the whole circumference, not half of it", () => {
    // The extractor bins theta over [-180, 180), so unwrapped arcs run from
    // minus half a circumference. A consumer drawing [0, circumference) then
    // shows only the near half of the device.
    for (const [name, scan] of [
      ["Endograft_1", "scan1"],
      ["Endograft_2", "scan2"],
      ["Endograft_3", "scan3"],
    ] as const) {
      const descriptor = getBenchCtDeviceDescriptor(name, scan);
      if (!descriptor) throw new Error(`Expected ${name}`);
      const circumferenceMm = Math.PI * 42.5;
      const arcs = buildBenchCtStrutSegments(descriptor, circumferenceMm).map(
        (segment) => segment[0],
      );

      expect(Math.min(...arcs)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...arcs)).toBeLessThan(circumferenceMm);

      // Every twelfth of the circumference carries wire.
      for (let hour = 0; hour < 12; hour += 1) {
        const from = (hour / 12) * circumferenceMm;
        const to = ((hour + 1) / 12) * circumferenceMm;
        const inSector = arcs.filter((arc) => arc >= from && arc < to).length;
        expect(inSector).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the bare fixation ring above the fabric in the segments", () => {
    for (const [name, scan] of [
      ["Endograft_1", "scan1"],
      ["Endograft_3", "scan3"],
    ] as const) {
      const descriptor = getBenchCtDeviceDescriptor(name, scan);
      if (!descriptor) throw new Error(`Expected ${name}`);
      const model = buildBenchCtRenderModel(descriptor);
      const segments = buildBenchCtStrutSegments(descriptor, Math.PI * 42.5);
      const depths = segments.flatMap((segment) => [segment[1], segment[3]]);

      // Both Alphas carry a fixation ring roughly 12 mm proximal to the fabric.
      expect(Math.min(...depths)).toBeLessThan(-10);
      expect(Math.max(...depths)).toBeGreaterThan(model.fabricLengthMm - 5);
    }

    // The TX2 is covered end to end, so nothing sits far above the fabric.
    const tx2 = getBenchCtDeviceDescriptor("Endograft_2", "scan2");
    if (!tx2) throw new Error("Expected Endograft_2");
    const tx2Depths = buildBenchCtStrutSegments(tx2, Math.PI * 42.5).flatMap(
      (segment) => [segment[1], segment[3]],
    );
    expect(Math.min(...tx2Depths)).toBeGreaterThan(-3);
  });

  it("puts measured metal at the apices the ring rows claim", () => {
    // The apex rows and the wire map are independent descriptions of the same
    // wire: one a fourteen-point idealisation, the other the segmentation. Most
    // apices must land on measured metal, or the two disagree about where the
    // struts are and the plan is built on the wrong one.
    const scan1 = getBenchCtDeviceDescriptor("Endograft_1", "scan1");
    if (!scan1) throw new Error("Expected Endograft_1 scan descriptor");
    const map = scan1.wire_map!;
    const step = map.theta_step_deg;

    const misses: number[] = [];
    for (const ring of scan1.rings) {
      for (const apex of [...ring.proximal_apices, ...ring.distal_apices]) {
        const theta = apex.theta_deg > 180 ? apex.theta_deg - 360 : apex.theta_deg;
        const bin = Math.min(
          map.theta_bins - 1,
          Math.max(0, Math.floor((theta + 180) / step)),
        );
        const nearest = map.runs[bin].reduce((best, [start, end]) => {
          const distance = Math.min(
            Math.abs(apex.z_mm - start),
            Math.abs(apex.z_mm - end),
          );
          return Math.min(best, distance);
        }, Number.POSITIVE_INFINITY);
        misses.push(nearest);
      }
    }

    misses.sort((a, b) => a - b);
    const median = misses[Math.floor(misses.length / 2)];
    expect(median).toBeCloseTo(map.datum_fit.apex_residual_p50_mm, 1);
    expect(median).toBeLessThan(0.5);
  });

  it("uses the same proximal-fabric datum as the measured 3-D renderer", () => {
    const scan2 = getBenchCtDeviceDescriptor("Endograft_2", "scan2");
    if (!scan2) throw new Error("Expected Endograft_2 scan descriptor");
    const model = buildBenchCtRenderModel(scan2);
    const segments = buildBenchCtStrutSegments(scan2, Math.PI * 42.5);
    const segmentZ = segments.flatMap((segment) => [segment[1], segment[3]]);
    const modelZ = model.rings.flatMap((ring) =>
      ring.points.map((point) => point.zMm),
    );

    // The segments now come from the segmentation, which reaches slightly past
    // the apex rows because it catches metal the apex detector rounded off.
    // Agreement to within a voxel is what shows they share a datum.
    const voxelMm = scan2.wire_map!.isotropic_spacing_mm;
    expect(Math.min(...segmentZ) - Math.min(...modelZ)).toBeLessThan(voxelMm);
    expect(Math.min(...segmentZ) - Math.min(...modelZ)).toBeGreaterThan(-2);
    expect(Math.abs(Math.max(...segmentZ) - Math.max(...modelZ))).toBeLessThan(2);
  });

  it("routes an explicit bench preview through measured rather than parametric struts", () => {
    const preview = ALL_DEVICES.find((device) => device.id === "bench-ct-endograft-1-scan1");
    if (!preview?.benchCtDescriptor) throw new Error("Expected Endograft_1 preview device");
    const size = preview.sizes[0];
    const circumference = Math.PI * size.graftDiameter;
    expect(preview.isBenchCtOnly).toBe(true);
    expect(
      buildStrutSegmentsForDevice(
        preview,
        circumference,
        preview.ringHeight,
        preview.interRingGap,
        preview.nRings,
        size.nPeaks,
      ),
    ).toEqual(buildBenchCtStrutSegments(preview.benchCtDescriptor, circumference));
  });

  it("keeps bare fixation separate from the fabric and exposes its barb topology", () => {
    const alpha = getBenchCtDeviceDescriptor("Endograft_1", "scan1");
    if (!alpha) throw new Error("Expected Zenith Alpha scan descriptor");
    const model = buildBenchCtRenderModel(alpha);

    expect(model.rings[0].kind).toBe("bare_fixation");
    expect(model.rings[0].points.some((point) => point.zMm < 0)).toBe(true);
    expect(model.barbs).toHaveLength(alpha.rings[0].proximal_apices.length);
    expect(model.minimumZMm).toBeLessThan(0);
  });

  it("corrects the inverted TX2 scan to its anatomical taper", () => {
    const tx2 = getBenchCtDeviceDescriptor("Endograft_2", "scan2");
    if (!tx2) throw new Error("Expected TX2 scan descriptor");
    const model = buildBenchCtRenderModel(tx2);

    expect(model.shape).toBe("conical");
    expect(model.diameterAt(0)).toBeGreaterThan(model.diameterAt(model.fabricLengthMm) + 7);
    expect(model.rings[0].points[0].zMm).toBeLessThan(model.rings.at(-1)?.points[0].zMm ?? 0);
  });

  it("smooths visual ring paths without changing the measured apex source data", () => {
    const tx2 = getBenchCtDeviceDescriptor("Endograft_2", "scan2");
    if (!tx2) throw new Error("Expected TX2 scan descriptor");
    const model = buildBenchCtRenderModel(tx2);
    const sampled = sampleBenchCtRing(model.rings[0].points);

    expect(sampled).toHaveLength(model.rings[0].points.length * 7);
    expect(tx2.rings[0].proximal_apices).toHaveLength(12);
  });
});
