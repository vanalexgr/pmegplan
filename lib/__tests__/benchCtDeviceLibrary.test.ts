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

  it("runs the wire through every measured apex", () => {
    const scan2 = getBenchCtDeviceDescriptor("Endograft_2", "scan2");
    if (!scan2) throw new Error("Expected Endograft_2 scan descriptor");
    const circumferenceMm = Math.PI * 42.5;
    const segments = buildBenchCtStrutSegments(scan2, circumferenceMm);
    const apexCount = scan2.rings.reduce(
      (sum, ring) => sum + ring.proximal_apices.length + ring.distal_apices.length,
      0,
    );

    // The path is interpolated between apices rather than chorded across them,
    // so it carries more vertices than apices while still visiting each one.
    expect(segments.length).toBeGreaterThan(apexCount);

    const model = buildBenchCtRenderModel(scan2);
    const vertices = segments.map((segment) => [segment[0], segment[1]]);
    for (const ring of model.rings) {
      for (const apex of ring.points) {
        const arcMm =
          (apex.thetaRad / (Math.PI * 2)) * circumferenceMm;
        const hit = vertices.some(
          ([vertexArc, vertexZ]) =>
            Math.abs(vertexArc - arcMm) < 0.01 &&
            Math.abs(vertexZ - apex.zMm) < 0.01,
        );
        expect(hit).toBe(true);
      }
    }
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

    expect(Math.min(...segmentZ)).toBeCloseTo(Math.min(...modelZ));
    expect(Math.max(...segmentZ)).toBeCloseTo(Math.max(...modelZ));
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
