import { describe, expect, it } from "vitest";

import {
  CT_SCAN_REFERENCES,
  isCtSizeSelection,
  selectCtComponent,
} from "@/lib/ctDeviceCatalog";
import { buildBenchCtRenderModel } from "@/lib/geometry/benchCtRenderModel";

describe("CT-first thoracic device catalog", () => {
  it("locks the confirmed platform identity for all three scans", () => {
    expect(
      CT_SCAN_REFERENCES.filter(
        (reference) => reference.platformId === "zenith-alpha-thoracic",
      ).map((reference) => reference.id),
    ).toEqual(["scan1", "scan3"]);
    expect(
      CT_SCAN_REFERENCES.find((reference) => reference.id === "scan2")
        ?.platformId,
    ).toBe("tx2-pro-form");
  });

  it("selects the Alpha IFU size from rounded aortic OD", () => {
    const selection = selectCtComponent(
      "zenith-alpha-thoracic",
      37.2,
      37.4,
      160,
    );
    expect(isCtSizeSelection(selection)).toBe(true);
    if (!isCtSizeSelection(selection)) return;
    expect(selection.component.code).toBe("ZTA-P-42");
    expect(selection.selectedLengthMm).toBe(173);
    expect(selection.reference.id).toBe("scan1");
    expect(selection.evidence).toBe("measured_scan");
  });

  it("selects the confirmed TX2 tapered scan when the IFU ranges match", () => {
    const selection = selectCtComponent("tx2-pro-form", 38, 29, 160);
    expect(isCtSizeSelection(selection)).toBe(true);
    if (!isCtSizeSelection(selection)) return;
    expect(selection.component.code).toBe("ZTEG-2PT-42-32");
    expect(selection.selectedLengthMm).toBe(165);
    expect(selection.reference.id).toBe("scan2");
    expect(selection.evidence).toBe("measured_scan");
  });

  it("does not bridge an unsupported taper", () => {
    const selection = selectCtComponent("tx2-pro-form", 30, 24, 150);
    expect(isCtSizeSelection(selection)).toBe(false);
  });

  it("marks unscanned sizes as scaled proxies and preserves target taper", () => {
    const selection = selectCtComponent("tx2-pro-form", 35, 26, 160);
    expect(isCtSizeSelection(selection)).toBe(true);
    if (!isCtSizeSelection(selection)) return;
    expect(selection.evidence).toBe("scaled_proxy");
    expect(selection.descriptor.ct_model?.reference_scan).toBe("scan2");
    const model = buildBenchCtRenderModel(selection.descriptor);
    expect(model.diameterAt(0)).toBeCloseTo(40, 0);
    expect(model.diameterAt(model.fabricLengthMm)).toBeCloseTo(30, 0);
  });
});
