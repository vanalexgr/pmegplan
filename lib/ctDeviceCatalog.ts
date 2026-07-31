import {
  getBenchCtDeviceDescriptor,
  type BenchCtDeviceDescriptor,
} from "@/lib/geometry/benchCtDeviceLibrary";
import { buildBenchCtRenderModel } from "@/lib/geometry/benchCtRenderModel";
import type { DeviceGeometry, DeviceSize } from "@/lib/types";

export type CtPlatformId = "zenith-alpha-thoracic" | "tx2-pro-form";
export type CtComponentShape = "straight" | "tapered";

export interface CtAorticRange {
  min: number;
  max: number;
}

export interface CtComponentSize {
  code: string;
  shape: CtComponentShape;
  proximalGraftDiameterMm: number;
  distalGraftDiameterMm: number;
  proximalAorticRangeMm: CtAorticRange;
  distalAorticRangeMm: CtAorticRange;
  lengthsMm: number[];
  sheathFr: number;
}

export interface CtPlatform {
  id: CtPlatformId;
  label: string;
  shortLabel: string;
  components: CtComponentSize[];
  sourceLabel: string;
  sourceUrl: string;
}

export interface CtScanReference {
  id: "scan1" | "scan2" | "scan3";
  platformId: CtPlatformId;
  descriptor: BenchCtDeviceDescriptor;
  candidateNominal: {
    proximalDiameterMm: number;
    distalDiameterMm: number;
    lengthMm: number;
  };
  identityNote: string;
}

export type CtScanId = CtScanReference["id"];

/**
 * A rendering and measurement model anchored to one actual bench CT scan.
 * This is deliberately separate from IFU component selection: it is not a
 * recommendation for an unscanned component and it must never be scaled.
 */
export interface MeasuredCtScanModel {
  reference: CtScanReference;
  platform: CtPlatform;
  device: DeviceGeometry;
  /**
   * The catalog component the scan's candidate nominal size corresponds to.
   *
   * Its `code` is the platform's own component code and carries no length —
   * Cook's ordering codes do, but this catalog does not record that suffix and
   * inventing one would put a product identifier in front of a surgeon that
   * nothing here verified. Quote the code and the length separately.
   */
  component: CtComponentSize | null;
}

/** How a scanned device should be named in the interface. */
export interface CtDeviceNaming {
  /** Full platform name, e.g. "Cook Zenith Alpha Thoracic". */
  platformLabel: string;
  /** Component code, e.g. "ZTA-P-42", or null when nothing matched. */
  code: string | null;
  /** Size as ordered, e.g. "42 × 173 mm" or "42 → 32 × 165 mm". */
  size: string;
  /** One line for headers: platform, code and size. */
  full: string;
  /** Whether the nominal size was confirmed rather than inferred from the scan. */
  sizeConfirmed: boolean;
}

export function describeCtDevice(scan: MeasuredCtScanModel): CtDeviceNaming {
  const { proximalDiameterMm, distalDiameterMm, lengthMm } =
    scan.reference.candidateNominal;
  const tapered = proximalDiameterMm !== distalDiameterMm;
  const size = tapered
    ? `${proximalDiameterMm} → ${distalDiameterMm} × ${lengthMm} mm`
    : `${proximalDiameterMm} × ${lengthMm} mm`;
  const code = scan.component?.code ?? null;

  return {
    platformLabel: scan.platform.label,
    code,
    size,
    full: [scan.platform.label, code, size].filter(Boolean).join(" · "),
    // Every scan's size is still derived from measured geometry rather than
    // read off the packaging; the identity note records what was confirmed.
    sizeConfirmed: false,
  };
}

export interface CtSizeSelection {
  platform: CtPlatform;
  component: CtComponentSize;
  proximalAorticDiameterMm: number;
  distalAorticDiameterMm: number;
  selectedLengthMm: number;
  requestedLengthMm: number;
  lengthShortfall: boolean;
  reference: CtScanReference;
  evidence: "measured_scan" | "scaled_proxy";
  descriptor: BenchCtDeviceDescriptor;
  device: DeviceGeometry;
}

export interface CtSizeSelectionFailure {
  platform: CtPlatform;
  proximalAorticDiameterMm: number;
  distalAorticDiameterMm: number;
  reason: string;
}

const range = (min: number, max = min): CtAorticRange => ({ min, max });

const alphaStraight = (
  diameter: number,
  vessel: CtAorticRange,
  lengthsMm: number[],
  sheathFr: number,
): CtComponentSize => ({
  code: `ZTA-P-${diameter}`,
  shape: "straight",
  proximalGraftDiameterMm: diameter,
  distalGraftDiameterMm: diameter,
  proximalAorticRangeMm: vessel,
  distalAorticRangeMm: vessel,
  lengthsMm,
  sheathFr,
});

const alphaTapered = (
  proximal: number,
  distal: number,
  proximalVessel: CtAorticRange,
  distalVessel: CtAorticRange,
  lengthsMm: number[],
  sheathFr: number,
): CtComponentSize => ({
  code: `ZTA-PT-${proximal}-${distal}`,
  shape: "tapered",
  proximalGraftDiameterMm: proximal,
  distalGraftDiameterMm: distal,
  proximalAorticRangeMm: proximalVessel,
  distalAorticRangeMm: distalVessel,
  lengthsMm,
  sheathFr,
});

const tx2Straight = (
  diameter: number,
  vessel: CtAorticRange,
  lengthsMm: number[],
  sheathFr: number,
): CtComponentSize => ({
  code: `ZTEG-2P-${diameter}`,
  shape: "straight",
  proximalGraftDiameterMm: diameter,
  distalGraftDiameterMm: diameter,
  proximalAorticRangeMm: vessel,
  distalAorticRangeMm: vessel,
  lengthsMm,
  sheathFr,
});

const tx2Tapered = (
  proximal: number,
  distal: number,
  proximalVessel: CtAorticRange,
  distalVessel: CtAorticRange,
  lengthsMm: number[],
  sheathFr: number,
): CtComponentSize => ({
  code: `ZTEG-2PT-${proximal}-${distal}`,
  shape: "tapered",
  proximalGraftDiameterMm: proximal,
  distalGraftDiameterMm: distal,
  proximalAorticRangeMm: proximalVessel,
  distalAorticRangeMm: distalVessel,
  lengthsMm,
  sheathFr,
});

export const CT_PLATFORMS: readonly CtPlatform[] = [
  {
    id: "zenith-alpha-thoracic",
    label: "Cook Zenith Alpha Thoracic",
    shortLabel: "Zenith Alpha",
    sourceLabel: "Cook Zenith Alpha Thoracic IFU I-ALPHA-TAA-436-04",
    sourceUrl: "https://ifu.cookmedical.com/data/IFU_PDF/I-ALPHA-TAA-436-04.PDF",
    components: [
      alphaStraight(18, range(15, 16), [105, 127], 16),
      alphaStraight(20, range(17), [105, 127], 16),
      alphaStraight(22, range(18, 19), [105, 127], 16),
      alphaStraight(24, range(20, 21), [105, 127], 16),
      alphaStraight(26, range(22, 23), [105, 149], 16),
      alphaStraight(28, range(24, 25), [109, 132, 155, 201], 16),
      alphaStraight(30, range(26, 27), [109, 132, 155, 201], 16),
      alphaStraight(32, range(28, 29), [109, 132, 155, 201], 18),
      alphaStraight(34, range(30), [113, 137, 161, 209], 18),
      alphaStraight(36, range(31, 32), [113, 137, 161, 209], 18),
      alphaStraight(38, range(33, 34), [117, 142, 167, 217], 18),
      alphaStraight(40, range(35, 36), [117, 142, 167, 217], 20),
      alphaStraight(42, range(37, 38), [121, 147, 173, 225], 20),
      alphaStraight(44, range(39), [125, 152, 179, 233], 20),
      alphaStraight(46, range(40, 42), [125, 152, 179, 233], 20),
      alphaTapered(22, 18, range(18, 19), range(15, 16), [105], 16),
      alphaTapered(26, 22, range(22, 23), range(18, 19), [105], 16),
      alphaTapered(30, 26, range(26, 27), range(22, 23), [108], 16),
      alphaTapered(32, 28, range(28, 29), range(24, 25), [178, 201], 18),
      alphaTapered(34, 30, range(30), range(26, 27), [161, 209], 18),
      alphaTapered(36, 32, range(31, 32), range(28, 29), [161, 209], 18),
      alphaTapered(38, 34, range(33, 34), range(30), [167, 217], 18),
      alphaTapered(40, 36, range(35, 36), range(31, 32), [167, 217], 20),
      alphaTapered(42, 38, range(37, 38), range(33, 34), [173, 225], 20),
      alphaTapered(44, 40, range(39), range(35, 36), [179, 233], 20),
      alphaTapered(46, 42, range(40, 42), range(37, 38), [179, 233], 20),
    ],
  },
  {
    id: "tx2-pro-form",
    label: "Cook Zenith TX2 TAA with Pro-Form",
    shortLabel: "TX2",
    sourceLabel: "Cook TX2 Pro-Form IFU I-TX2-PRO-FORM-361-05",
    sourceUrl:
      "https://ifu.cookmedical.com/data/IFU_PDF/I-TX2-PRO-FORM-361-05.PDF",
    components: [
      tx2Straight(22, range(20), [115], 20),
      tx2Straight(24, range(21), [115], 20),
      tx2Straight(26, range(22, 23), [134], 20),
      tx2Straight(28, range(24), [120, 140, 200], 20),
      tx2Straight(30, range(25, 27), [120, 140, 200], 20),
      tx2Straight(32, range(28, 29), [120, 140, 200], 20),
      tx2Straight(34, range(30), [127, 152, 202], 20),
      tx2Straight(36, range(31, 32), [127, 152, 202], 22),
      tx2Straight(38, range(33, 34), [127, 152, 202], 22),
      tx2Straight(40, range(35, 36), [108, 135, 162, 216], 22),
      tx2Straight(42, range(37, 38), [108, 135, 162, 216], 22),
      tx2Tapered(32, 22, range(28, 29), range(20), [162, 202], 20),
      tx2Tapered(34, 24, range(30), range(21), [159, 199], 20),
      tx2Tapered(36, 26, range(31, 32), range(22, 23), [159, 199], 22),
      tx2Tapered(38, 28, range(33, 34), range(24), [159, 199], 22),
      tx2Tapered(40, 30, range(35, 36), range(25, 27), [165, 205], 22),
      tx2Tapered(42, 32, range(37, 38), range(28, 29), [165, 205], 22),
    ],
  },
] as const;

function requireDescriptor(device: string, size: string) {
  const descriptor = getBenchCtDeviceDescriptor(device, size);
  if (!descriptor) {
    throw new Error(`Missing bench CT descriptor ${device}/${size}.`);
  }
  return descriptor;
}

export const CT_SCAN_REFERENCES: readonly CtScanReference[] = [
  {
    id: "scan1",
    platformId: "zenith-alpha-thoracic",
    descriptor: requireDescriptor("Endograft_1", "scan1"),
    candidateNominal: {
      proximalDiameterMm: 42,
      distalDiameterMm: 42,
      lengthMm: 173,
    },
    identityNote:
      "Platform confirmed as Zenith Alpha. Candidate nominal 42 × 173 mm from measured diameter and fabric span; confirm from packaging.",
  },
  {
    id: "scan3",
    platformId: "zenith-alpha-thoracic",
    descriptor: requireDescriptor("Endograft_3", "scan3"),
    candidateNominal: {
      proximalDiameterMm: 32,
      distalDiameterMm: 32,
      lengthMm: 201,
    },
    identityNote:
      "Platform confirmed as Zenith Alpha. Candidate nominal 32 × 201 mm from measured diameter and fabric span; confirm from packaging.",
  },
  {
    id: "scan2",
    platformId: "tx2-pro-form",
    descriptor: requireDescriptor("Endograft_2", "scan2"),
    candidateNominal: {
      proximalDiameterMm: 42,
      distalDiameterMm: 32,
      lengthMm: 165,
    },
    identityNote:
      "Platform confirmed as TX2. Candidate nominal 42 → 32 × 165 mm from measured taper and fabric span; confirm from packaging.",
  },
] as const;

function includes(rangeValue: CtAorticRange, value: number) {
  return value >= rangeValue.min && value <= rangeValue.max;
}

function nearestReference(
  platformId: CtPlatformId,
  component: CtComponentSize,
  lengthMm: number,
) {
  const references = CT_SCAN_REFERENCES.filter(
    (reference) => reference.platformId === platformId,
  );
  return [...references].sort((left, right) => {
    const score = (reference: CtScanReference) =>
      Math.abs(
        reference.candidateNominal.proximalDiameterMm -
          component.proximalGraftDiameterMm,
      ) *
        4 +
      Math.abs(
        reference.candidateNominal.distalDiameterMm -
          component.distalGraftDiameterMm,
      ) *
        4 +
      Math.abs(reference.candidateNominal.lengthMm - lengthMm) / 10;
    return score(left) - score(right);
  })[0];
}

function descriptorRawRange(descriptor: BenchCtDeviceDescriptor) {
  const apexZ = descriptor.rings.flatMap((ring) => [
    ...ring.proximal_apices.map((apex) => apex.z_mm),
    ...ring.distal_apices.map((apex) => apex.z_mm),
  ]);
  return {
    min: Math.min(...apexZ),
    max: Math.max(...apexZ),
  };
}

function measuredMeanDiameter(descriptor: BenchCtDeviceDescriptor) {
  return (
    descriptor.rings.reduce((sum, ring) => sum + ring.diameter_mm, 0) /
    Math.max(descriptor.rings.length, 1)
  );
}

function scaleDescriptor(
  reference: CtScanReference,
  component: CtComponentSize,
  lengthMm: number,
  evidence: CtSizeSelection["evidence"],
): BenchCtDeviceDescriptor {
  const descriptor = reference.descriptor;
  if (evidence === "measured_scan") {
    return {
      ...descriptor,
      ct_model: {
        evidence,
        identity_status: "candidate_nominal_size",
        reference_scan: reference.id,
        target_component: `${component.code}-${lengthMm}`,
        radial_scale: 1,
        axial_scale: 1,
      },
    };
  }

  const rawRange = descriptorRawRange(descriptor);
  const fabricStart =
    descriptor.rendering?.fabric_proximal_edge_z_mm ?? rawRange.min;
  const fabricEnd =
    descriptor.rendering?.fabric_distal_edge_z_mm ?? rawRange.max;
  const referenceLength = reference.candidateNominal.lengthMm;
  const axialScale = lengthMm / Math.max(referenceLength, 1);
  const referenceMeanDiameter = measuredMeanDiameter(descriptor);
  const targetMeanDiameter =
    (component.proximalGraftDiameterMm + component.distalGraftDiameterMm) / 2;
  const radialScale = targetMeanDiameter / Math.max(referenceMeanDiameter, 1);
  const scaleZ = (zMm: number) =>
    fabricStart + (zMm - fabricStart) * axialScale;
  const targetDiameterAt = (zMm: number) => {
    const rawFraction = Math.min(
      1,
      Math.max(0, (zMm - fabricStart) / Math.max(fabricEnd - fabricStart, 1)),
    );
    const fraction =
      descriptor.rendering?.anatomical_proximal_z === "high"
        ? 1 - rawFraction
        : rawFraction;
    return (
      component.proximalGraftDiameterMm +
      (component.distalGraftDiameterMm -
        component.proximalGraftDiameterMm) *
        fraction
    );
  };

  return {
    ...descriptor,
    device: `${descriptor.device} CT-derived proxy`,
    size: `${component.proximalGraftDiameterMm}-${component.distalGraftDiameterMm}-${lengthMm}`,
    geometry: {
      shape:
        component.proximalGraftDiameterMm === component.distalGraftDiameterMm
          ? "cylindrical"
          : "conical",
      scan_orientation:
        descriptor.geometry?.scan_orientation ?? "inverted_corrected",
      proximal_fixation: descriptor.geometry?.proximal_fixation ?? {
        ring_count: 0,
        position: "none",
      },
    },
    diameter_profile: descriptor.diameter_profile?.map((point) => ({
      z: scaleZ(point.z),
      d: targetDiameterAt(point.z),
    })),
    rendering: descriptor.rendering
      ? {
          ...descriptor.rendering,
          fabric_proximal_edge_z_mm: scaleZ(
            descriptor.rendering.fabric_proximal_edge_z_mm,
          ),
          fabric_distal_edge_z_mm:
            descriptor.rendering.fabric_distal_edge_z_mm == null
              ? undefined
              : scaleZ(descriptor.rendering.fabric_distal_edge_z_mm),
          barb_length_mm:
            descriptor.rendering.barb_length_mm == null
              ? undefined
              : descriptor.rendering.barb_length_mm * radialScale,
        }
      : undefined,
    rings: descriptor.rings.map((ring) => {
      const ringZ =
        [...ring.proximal_apices, ...ring.distal_apices].reduce(
          (sum, apex) => sum + apex.z_mm,
          0,
        ) /
        Math.max(ring.proximal_apices.length + ring.distal_apices.length, 1);
      return {
        ...ring,
        diameter_mm: targetDiameterAt(ringZ),
        ring_height_mm: ring.ring_height_mm * axialScale,
        z_proximal_apices_mm:
          ring.z_proximal_apices_mm == null
            ? null
            : scaleZ(ring.z_proximal_apices_mm),
        z_distal_apices_mm:
          ring.z_distal_apices_mm == null
            ? null
            : scaleZ(ring.z_distal_apices_mm),
        proximal_apices: ring.proximal_apices.map((apex) => ({
          ...apex,
          z_mm: scaleZ(apex.z_mm),
        })),
        distal_apices: ring.distal_apices.map((apex) => ({
          ...apex,
          z_mm: scaleZ(apex.z_mm),
        })),
      };
    }),
    ct_model: {
      evidence,
      identity_status: "candidate_nominal_size",
      reference_scan: reference.id,
      target_component: `${component.code}-${lengthMm}`,
      radial_scale: Number(radialScale.toFixed(4)),
      axial_scale: Number(axialScale.toFixed(4)),
    },
  };
}

function mostCommon(values: number[]) {
  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 0;
}

function median(values: number[]) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)] ?? 0;
}

function buildRuntimeDevice(
  platform: CtPlatform,
  component: CtComponentSize,
  selectedLengthMm: number,
  descriptor: BenchCtDeviceDescriptor,
): DeviceGeometry {
  const nPeaks = mostCommon(descriptor.rings.map((ring) => ring.n_apices));
  const ringHeight = median(
    descriptor.rings.map((ring) => ring.ring_height_mm),
  );
  const gaps = descriptor.rings.slice(0, -1).flatMap((ring, index) => {
    const next = descriptor.rings[index + 1];
    if (
      ring.z_distal_apices_mm == null ||
      next.z_proximal_apices_mm == null
    ) {
      return [];
    }
    return [Math.max(0, next.z_proximal_apices_mm - ring.z_distal_apices_mm)];
  });
  const size: DeviceSize = {
    graftDiameter: component.proximalGraftDiameterMm,
    neckDiameterMin: component.proximalAorticRangeMm.min,
    neckDiameterMax: component.proximalAorticRangeMm.max,
    sheathFr: component.sheathFr,
    nPeaks,
    mainBodyLengths: [selectedLengthMm],
  };

  return {
    id: `ct-${platform.id}-${component.code}-${selectedLengthMm}`,
    name: `${platform.label} ${component.code}`,
    shortName: `${platform.shortLabel} ${component.proximalGraftDiameterMm}${
      component.shape === "tapered"
        ? `→${component.distalGraftDiameterMm}`
        : ""
    } × ${selectedLengthMm}`,
    manufacturer: "Cook Medical",
    ringHeight,
    interRingGap: median(gaps),
    nRings: descriptor.rings.length,
    foreshortening: 0,
    seamDeg: 0,
    wireRadius: 0.5,
    stentType: "Z-stent",
    fabricMaterial: "polyester",
    pmegSuitability: 1,
    pmegNotes:
      descriptor.ct_model?.evidence === "measured_scan"
        ? "Bench-CT measured geometry. Candidate nominal size remains pending packaging confirmation."
        : "CT-scaled research proxy. Topology must be verified for this exact catalog size before fabrication use.",
    clinicalRank: 1,
    color: "#ff8a72",
    waveWidthMm:
      nPeaks > 0
        ? (Math.PI * component.proximalGraftDiameterMm) / nPeaks
        : 0,
    sizes: [size],
    sources: [platform.sourceLabel, `Bench CT ${descriptor.ct_model?.reference_scan}`],
    benchCtDescriptor: descriptor,
  };
}

function componentForReference(
  platform: CtPlatform,
  reference: CtScanReference,
) {
  return platform.components.find(
    (component) =>
      component.proximalGraftDiameterMm ===
        reference.candidateNominal.proximalDiameterMm &&
      component.distalGraftDiameterMm ===
        reference.candidateNominal.distalDiameterMm &&
      component.lengthsMm.includes(reference.candidateNominal.lengthMm),
  );
}

/**
 * Returns one of the three actual CT models. No geometry is interpolated,
 * stretched, or borrowed from another scan in this path.
 */
export function getMeasuredCtScanModel(
  scanId: CtScanId,
): MeasuredCtScanModel {
  const reference = CT_SCAN_REFERENCES.find((item) => item.id === scanId);
  if (!reference) {
    throw new Error(`Unknown measured CT scan ${scanId}.`);
  }
  const platform = getCtPlatform(reference.platformId);
  if (!platform) {
    throw new Error(`Missing platform for measured CT scan ${scanId}.`);
  }
  const component = componentForReference(platform, reference);
  if (!component) {
    throw new Error(`No catalog record matches measured CT scan ${scanId}.`);
  }

  const descriptor = scaleDescriptor(
    reference,
    component,
    reference.candidateNominal.lengthMm,
    "measured_scan",
  );
  const referenceDevice = buildRuntimeDevice(
    platform,
    component,
    reference.candidateNominal.lengthMm,
    descriptor,
  );
  const measuredModel = buildBenchCtRenderModel(descriptor);
  const measuredDiameterMm = measuredModel.diameterAt(0);
  const nPeaks = mostCommon(descriptor.rings.map((ring) => ring.n_apices));

  return {
    reference,
    platform,
    component,
    device: {
      ...referenceDevice,
      id: `ct-measured-${reference.id}`,
      name: `${platform.label} · ${reference.id.toUpperCase()}`,
      shortName: `${reference.id.toUpperCase()} · measured CT`,
      pmegNotes:
        "Measured free-state CT geometry only. It is not an IFU size recommendation; candidate nominal identity requires packaging confirmation.",
      waveWidthMm:
        nPeaks > 0 ? (Math.PI * measuredDiameterMm) / nPeaks : 0,
      sizes: [
        {
          ...referenceDevice.sizes[0],
          // This synthetic range is used only to let the legacy analysis
          // engine operate on the selected physical scan. It is never exposed
          // as sizing guidance in the CT-only workspace.
          graftDiameter: measuredDiameterMm,
          neckDiameterMin: 0,
          neckDiameterMax: Number.POSITIVE_INFINITY,
          nPeaks,
          mainBodyLengths: [measuredModel.fabricLengthMm],
        },
      ],
    },
  };
}

export function getCtPlatform(platformId: CtPlatformId) {
  return CT_PLATFORMS.find((platform) => platform.id === platformId) ?? null;
}

export function selectCtComponent(
  platformId: CtPlatformId,
  proximalAorticDiameterMm: number,
  distalAorticDiameterMm: number,
  requestedLengthMm: number,
): CtSizeSelection | CtSizeSelectionFailure {
  const platform = getCtPlatform(platformId);
  if (!platform) {
    throw new Error(`Unknown CT platform ${platformId}.`);
  }

  const proximal = Math.round(proximalAorticDiameterMm);
  const distal = Math.round(distalAorticDiameterMm);
  const matching = platform.components.filter(
    (component) =>
      includes(component.proximalAorticRangeMm, proximal) &&
      includes(component.distalAorticRangeMm, distal),
  );
  const component = [...matching].sort((left, right) => {
    if (left.shape !== right.shape) {
      const taperNeeded = proximal - distal >= 4;
      if (taperNeeded) return left.shape === "tapered" ? -1 : 1;
      return left.shape === "straight" ? -1 : 1;
    }
    return (
      left.proximalGraftDiameterMm - right.proximalGraftDiameterMm
    );
  })[0];

  if (!component) {
    return {
      platform,
      proximalAorticDiameterMm: proximal,
      distalAorticDiameterMm: distal,
      reason:
        "No exact IFU component matches both rounded proximal and distal outer-wall diameters. The model is intentionally not extrapolated across an unsupported taper.",
    };
  }

  const orderedLengths = [...component.lengthsMm].sort(
    (left, right) => left - right,
  );
  const selectedLengthMm =
    orderedLengths.find((length) => length >= requestedLengthMm) ??
    orderedLengths[orderedLengths.length - 1];
  const reference = nearestReference(platformId, component, selectedLengthMm);
  if (!reference) {
    return {
      platform,
      proximalAorticDiameterMm: proximal,
      distalAorticDiameterMm: distal,
      reason: "No confirmed CT scan is available for this platform.",
    };
  }
  const evidence =
    reference.candidateNominal.proximalDiameterMm ===
      component.proximalGraftDiameterMm &&
    reference.candidateNominal.distalDiameterMm ===
      component.distalGraftDiameterMm &&
    reference.candidateNominal.lengthMm === selectedLengthMm
      ? "measured_scan"
      : "scaled_proxy";
  const descriptor = scaleDescriptor(
    reference,
    component,
    selectedLengthMm,
    evidence,
  );

  return {
    platform,
    component,
    proximalAorticDiameterMm: proximal,
    distalAorticDiameterMm: distal,
    selectedLengthMm,
    requestedLengthMm,
    lengthShortfall: selectedLengthMm < requestedLengthMm,
    reference,
    evidence,
    descriptor,
    device: buildRuntimeDevice(
      platform,
      component,
      selectedLengthMm,
      descriptor,
    ),
  };
}

export function isCtSizeSelection(
  value: CtSizeSelection | CtSizeSelectionFailure,
): value is CtSizeSelection {
  return "component" in value;
}
