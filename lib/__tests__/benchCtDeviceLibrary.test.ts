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

describe("bench CT device library", () => {
  it("registers each scanned descriptor with its measured apex geometry", () => {
    expect(BENCH_CT_DEVICE_LIBRARY).toHaveLength(3);
    const scan1 = getBenchCtDeviceDescriptor("Endograft_1", "scan1");
    expect(scan1?.rings).toHaveLength(8);
    expect(scan1?.rings.every((ring) => ring.n_apices === 7)).toBe(true);
    expect(getBenchCtDeviceDescriptor("Endograft_3", "scan3")?.rings).toHaveLength(10);
  });

  it("converts measured apex rows into closed punch-card strut paths", () => {
    const scan2 = getBenchCtDeviceDescriptor("Endograft_2", "scan2");
    if (!scan2) throw new Error("Expected Endograft_2 scan descriptor");
    const segments = buildBenchCtStrutSegments(scan2, Math.PI * 42.5);
    const apexCount = scan2.rings.reduce(
      (sum, ring) => sum + ring.proximal_apices.length + ring.distal_apices.length,
      0,
    );
    expect(segments).toHaveLength(apexCount);
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
});
