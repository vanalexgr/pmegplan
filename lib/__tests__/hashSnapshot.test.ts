import { describe, it, expect } from "vitest";
import { hashSnapshot } from "@/lib/planning/hash";
import type { CaseInput } from "@/lib/types";

describe("hashSnapshot", () => {
  const baseCase: CaseInput = {
    patientId: "patient_1",
    surgeonName: "Surgeon X",
    surgeonNote: "Note",
    neckDiameterMm: 24,
    fenestrations: [
      { vessel: "LRA", ftype: "SMALL_FEN", clock: "9:00", depthMm: 10, widthMm: 6, heightMm: 6 },
      { vessel: "RRA", ftype: "SMALL_FEN", clock: "3:00", depthMm: 10, widthMm: 6, heightMm: 6 },
    ],
  };
  const baseDevices = ["device_a", "device_b"];
  const baseId = "proj_123";

  it("Same inputs -> same hash", () => {
    const h1 = hashSnapshot(baseCase, baseDevices, baseId);
    const h2 = hashSnapshot(baseCase, baseDevices, baseId);
    expect(h1).toBe(h2);
  });

  it("Different neckDiameterMm -> different hash", () => {
    const h1 = hashSnapshot(baseCase, baseDevices, baseId);
    const modified = { ...baseCase, neckDiameterMm: 25 };
    const h2 = hashSnapshot(modified, baseDevices, baseId);
    expect(h1).not.toBe(h2);
  });

  it("Different fenestration clock -> different hash", () => {
    const h1 = hashSnapshot(baseCase, baseDevices, baseId);
    const modified = { 
      ...baseCase, 
      fenestrations: [
        { ...baseCase.fenestrations[0], clock: "10:00" },
        baseCase.fenestrations[1]
      ] 
    };
    const h2 = hashSnapshot(modified, baseDevices, baseId);
    expect(h1).not.toBe(h2);
  });

  it("selectedDeviceIds order-independence", () => {
    const h1 = hashSnapshot(baseCase, ["a", "b"], baseId);
    const h2 = hashSnapshot(baseCase, ["b", "a"], baseId);
    expect(h1).toBe(h2);
  });

  it("projectId change -> different hash", () => {
    const h1 = hashSnapshot(baseCase, baseDevices, "id_1");
    const h2 = hashSnapshot(baseCase, baseDevices, "id_2");
    expect(h1).not.toBe(h2);
  });

  it("anatomical landmarks participate in the hash", () => {
    const h1 = hashSnapshot(baseCase, baseDevices, baseId);
    const modified = {
      ...baseCase,
      anatomicalVessels: [{ name: "SMA", mmAboveProximalFen: 15 }],
    };
    const h2 = hashSnapshot(modified, baseDevices, baseId);
    expect(h1).not.toBe(h2);
  });
});
