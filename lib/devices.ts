import type { DeviceGeometry, DeviceSize } from "@/lib/types";
import { resolveRingGeometry } from "@/lib/geometry/ringGeometry";
import {
  BENCH_CT_DEVICE_LIBRARY,
  getBenchCtDeviceDescriptor,
  type BenchCtDeviceDescriptor,
} from "@/lib/geometry/benchCtDeviceLibrary";

export {
  BENCH_CT_DEVICE_LIBRARY,
  getBenchCtDeviceDescriptor,
};

function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)] ?? 0;
}

function mostCommon(values: number[]): number {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

function benchCtPreviewDevice(
  descriptor: BenchCtDeviceDescriptor,
  index: number,
): DeviceGeometry {
  const diameter = median(descriptor.rings.map((ring) => ring.diameter_mm));
  const ringHeight = median(descriptor.rings.map((ring) => ring.ring_height_mm));
  const gap = median(
    descriptor.rings
      .slice(0, -1)
      .flatMap((ring, ringIndex) => {
        const next = descriptor.rings[ringIndex + 1];
        return ring.z_distal_apices_mm != null && next.z_proximal_apices_mm != null
          ? [next.z_proximal_apices_mm - ring.z_distal_apices_mm]
          : [];
      })
      .filter((value) => value >= 0),
  );
  const nPeaks = mostCommon(descriptor.rings.map((ring) => ring.n_apices));

  return {
    id: `bench-ct-${descriptor.device.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${descriptor.size}`,
    name: `${descriptor.device} — ${descriptor.size} (bench CT preview)`,
    shortName: `${descriptor.device} ${descriptor.size}`,
    manufacturer: "Bench CT geometry",
    ringHeight,
    interRingGap: gap,
    nRings: descriptor.rings.length,
    foreshortening: 0,
    seamDeg: 0,
    wireRadius: 0.5,
    stentType: "Z-stent",
    fabricMaterial: "polyester",
    pmegSuitability: 4,
    pmegNotes: "Research preview: measured free-state apex geometry from bench CT. Not an IFU-sized or clinically recommended device entry.",
    clinicalRank: 100 + index,
    color: ["#b45309", "#be123c", "#0369a1"][index] ?? "#475569",
    waveWidthMm: nPeaks > 0 ? (Math.PI * diameter) / nPeaks : 0,
    sizes: [{
      graftDiameter: diameter,
      neckDiameterMin: 0,
      neckDiameterMax: 100,
      sheathFr: 0,
      nPeaks,
      mainBodyLengths: [Math.max(...descriptor.rings.flatMap((ring) => [
        ring.z_proximal_apices_mm ?? 0,
        ring.z_distal_apices_mm ?? 0,
      ]))],
    }],
    sources: [`Bench CT descriptor ${descriptor.device}/${descriptor.size}`],
    benchCtDescriptor: descriptor,
    isBenchCtOnly: true,
  };
}

/** Measured-geometry entries intended only for explicit punch-card preview. */
export const BENCH_CT_PREVIEW_DEVICES = BENCH_CT_DEVICE_LIBRARY.map(benchCtPreviewDevice);

/**
 * PMEGplan.io — Device Geometry Database
 *
 * CLINICAL USE WARNING: This file is for research/planning only.
 * Always verify against current IFU before clinical use.
 */

export function computePeaks(
  graftDiameterMm: number,
  waveWidthMm: number,
): number {
  return Math.round((Math.PI * graftDiameterMm) / waveWidthMm);
}

export const ZENITH_ALPHA: DeviceGeometry = {
  id: "zenith_alpha",
  name: "Cook Zenith Alpha Abdominal",
  shortName: "Zenith Alpha",
  manufacturer: "Cook Medical",
  // ringHeight = projected vertical height of each Z-stent ring (~8–10 mm clinically).
  // NOTE: the strut wire length is ~18 mm; projected height ≈ 9 mm after angular deployment.
  ringHeight: 9,
  interRingGap: 6,
  nRings: 5,
  foreshortening: 0.06,
  seamDeg: 180,
  wireRadius: 2,
  stentType: "Z-stent",
  fabricMaterial: "polyester",
  pmegSuitability: 1,
  pmegNotes:
    "Gold standard PMEG platform. Zenith Alpha keeps the familiar Cook zig-zag row architecture, with relatively narrow row stacking: practical working windows can be long circumferentially but the rows themselves sit only about 6 mm apart, so renal fenestrations often still crowd a stent row and need careful rotational planning.",
  clinicalRank: 1,
  color: "#2563eb",
  waveWidthMm: 13.6,
  // IFU: first Z-stent ring starts very close to the proximal fabric edge
  proximalRingOffsetMm: 2,
  // IFU T_ZALPHA_REV5: bare suprarenal nitinol stent with fixation barbs
  hasBareSuprarenal: true,
  suprarenalHeightMm: 6, // IFU: suprarenal crown height ~6 mm
  hasInfrarenalBarbs: false,
  // IFU §2: ≥15 mm non-aneurysmal neck, <60° infrarenal, <45° suprarenal
  minNeckLengthMm: 15,
  maxInfrarenalAngleDeg: 60,
  maxSuprarenalAngleDeg: 45,
  sizes: [
    {
      graftDiameter: 22,
      neckDiameterMin: 18,
      neckDiameterMax: 19,
      sheathFr: 16,
      nPeaks: 5,
      mainBodyLengths: [70, 84, 98, 108, 118, 128],
    },
    {
      graftDiameter: 24,
      neckDiameterMin: 20,
      neckDiameterMax: 21,
      sheathFr: 16,
      nPeaks: 5,
      mainBodyLengths: [70, 84, 98, 108, 118, 128],
    },
    {
      // IFU: intended vessel 22 mm (exactly) → 26 mm graft
      graftDiameter: 26,
      neckDiameterMin: 22,
      neckDiameterMax: 22,
      sheathFr: 16,
      nPeaks: 6,
      mainBodyLengths: [70, 84, 98, 108, 118, 128],
    },
    {
      graftDiameter: 28,
      neckDiameterMin: 23,
      neckDiameterMax: 24,
      sheathFr: 16,
      nPeaks: 6,
      mainBodyLengths: [70, 84, 98, 108, 118, 128],
    },
    {
      graftDiameter: 30,
      neckDiameterMin: 25,
      neckDiameterMax: 26,
      sheathFr: 16,
      nPeaks: 7,
      mainBodyLengths: [70, 84, 98, 108, 118, 128],
    },
    {
      graftDiameter: 32,
      neckDiameterMin: 27,
      neckDiameterMax: 28,
      sheathFr: 16,
      nPeaks: 7,
      mainBodyLengths: [70, 84, 98, 108, 118, 128],
    },
    {
      graftDiameter: 36,
      neckDiameterMin: 29,
      neckDiameterMax: 32,
      sheathFr: 17,
      nPeaks: 8,
      mainBodyLengths: [70, 84, 98, 108, 118, 128],
    },
  ],
  sources: [
    "Cook Medical IFU T_ZALPHA_REV5",
    "PMC10958111",
    "Starnes BW J Vasc Surg 2012",
    "Oderich GS Ann Vasc Surg",
    "IFU T_ZALPHA_REV5: bare suprarenal zone about 18 mm confirmed",
  ],
};

export const ENDURANT_II: DeviceGeometry = {
  id: "endurant_ii",
  name: "Medtronic Endurant II",
  shortName: "Endurant II",
  manufacturer: "Medtronic",
  // Short proximal covered rows packed into roughly the first 55 mm, rather
  // than tall 20 mm oscillations, better match the published platform profile.
  // Device-level defaults (used when a size does not carry its own overrides).
  // Binary extraction (endurant_23_28_data): ring heights 8.8–9.1 mm, gaps 1.0–1.3 mm.
  // 5 rings packed tightly: total span ~50 mm (5×9 + 4×1.1 = 49.4 mm).
  ringHeight: 9.0,
  interRingGap: 1.1,
  nRings: 5,
  foreshortening: 0.07,
  seamDeg: 180,
  wireRadius: 1.8,
  stentType: "M-stent",
  fabricMaterial: "polyester",
  pmegSuitability: 2,
  pmegNotes:
    "Common European PMEG alternative to Zenith. Endurant uses five densely packed proximal covered rings with Medtronic's M-stent architecture, so the PMEG working zone is concentrated in the first ~55 mm and is more pattern-sensitive than a generic wide-wave layout suggests.",
  clinicalRank: 2,
  color: "#7c3aed",
  waveWidthMm: 12.8,
  // IFU M985265A001DOC1: bare suprarenal nitinol stent with anchor pins
  hasBareSuprarenal: true,
  suprarenalHeightMm: 16, // IFU M985265A001DOC1: nitinol suprarenal stent ≈ 16 mm
  hasInfrarenalBarbs: false,
  // IFU §5: ≥10 mm neck (≤60° infrarenal); ≥15 mm neck (≤75° infrarenal)
  minNeckLengthMm: 10,
  maxInfrarenalAngleDeg: 60,
  maxSuprarenalAngleDeg: 45,
  sizes: [
    {
      graftDiameter: 23,
      neckDiameterMin: 17,
      neckDiameterMax: 19,
      sheathFr: 18,
      nPeaks: 8,
      mainBodyLengths: [49, 82, 124, 166],
      // Binary extraction: ring height ~9.0 mm, gap ~1.1 mm for 23-28 range
      ringHeightMm: 9.0,
      interRingGapMm: 1.1,
    },
    {
      graftDiameter: 25,
      neckDiameterMin: 19,
      neckDiameterMax: 21,
      sheathFr: 18,
      nPeaks: 8,
      mainBodyLengths: [49, 82, 124, 166],
      // Binary extraction: ring height ~9.0 mm, gap ~1.1 mm for 23-28 range
      ringHeightMm: 9.0,
      interRingGapMm: 1.1,
    },
    {
      graftDiameter: 28,
      neckDiameterMin: 22,
      neckDiameterMax: 24,
      sheathFr: 18,
      nPeaks: 8,
      mainBodyLengths: [49, 82, 124, 166],
      // Binary extraction: ring height ~9.0 mm, gap ~1.1 mm for 23-28 range
      ringHeightMm: 9.0,
      interRingGapMm: 1.1,
    },
    {
      graftDiameter: 32,
      neckDiameterMin: 26,
      neckDiameterMax: 28,
      sheathFr: 18,
      nPeaks: 10,
      mainBodyLengths: [82, 124, 166],
      // Binary extraction (endurant_32_36_data): same ring packing as 23-28.
      // 5 rings × 9mm + 4 gaps × 1.1mm = 49.4mm
      ringHeightMm: 9.0,
      interRingGapMm: 1.1,
    },
    {
      graftDiameter: 36,
      neckDiameterMin: 30,
      neckDiameterMax: 32,
      sheathFr: 18,
      nPeaks: 10,
      mainBodyLengths: [124, 166],
      // Binary extraction: ring height ~9mm, gap ~1.1mm for 32-36 range
      ringHeightMm: 9.0,
      interRingGapMm: 1.1,
    },
  ],
  sources: [
    "Medtronic Endurant II IFU H620-3003",
    "Saratzis A et al. EJVES 2017",
    "Donas KP PMEG series",
    "IFU M985265A001DOC1 Fig 1: M-stent style covered frame and suprarenal fixation confirmed",
    "Template geometry sourced from Medtronic print-at-100% back-table templates (3.8 px/mm calibration): 5 ring rows, nPeaks 8 (Ø23–28 mm) / 10 (Ø32–36 mm)",
  ],
};


export const TREO: DeviceGeometry = {
  id: "treo",
  name: "Terumo Aortic TREO",
  shortName: "TREO",
  manufacturer: "Terumo Aortic",
  // ringHeight = projected vertical height of each covered spring row.
  // Binary extraction (treo_33_data): Ring 1 height 10.8 mm, Rings 2-4 ~9.5 mm.
  // Use 9.5 as device default; Ring 1 is slightly taller (~10.8).
  ringHeight: 9.5,
  // Binary extraction: edge-to-edge gap ~9.4 mm (center-to-center ~19 mm).
  // Previous value of 18 mm was the center-to-center distance, not the gap.
  interRingGap: 9.4,
  nRings: 4,
  foreshortening: 0.05,
  seamDeg: 0,
  wireRadius: 2,
  stentType: "sinusoidal",
  fabricMaterial: "polyester",
  pmegSuitability: 1,
  pmegNotes:
    "Wide longitudinal planning windows with staggered covered sinusoidal rows at roughly 18 mm row spacing, plus dual fixation from the suprarenal crown and infrarenal valley barbs. Among the modeled infrarenal platforms, TREO offers the broadest clean fabric windows for PMEG-style modification.",
  clinicalRank: 3,
  color: "#0d9488",
  waveWidthMm: 0,
  // IFU PM-08467-ROW: suprarenal barbs (fully covered until clasp release)
  // AND infrarenal barbs in fabric "valleys" of proximal covered ring
  hasBareSuprarenal: true,
  // IFU PM-08467-ROW: suprarenal fixation zone = 16 mm (Ø20–28 mm sizes)
  // and 18 mm (Ø30–36 mm sizes). Use 16 mm as the device-level value;
  // the renderer applies +2 mm for large sizes automatically.
  suprarenalHeightMm: 16,
  hasInfrarenalBarbs: true,
  // IFU: ≥10 mm (infrarenal <60°) or ≥15 mm (infrarenal 60–75°); suprarenal ≤45°
  minNeckLengthMm: 10,
  maxInfrarenalAngleDeg: 60,
  maxSuprarenalAngleDeg: 45,
  sizes: [
    {
      graftDiameter: 20,
      neckDiameterMin: 17,
      neckDiameterMax: 18,
      sheathFr: 18,
      nPeaks: 5,
      mainBodyLengths: [80, 100, 120],
    },
    {
      graftDiameter: 22,
      neckDiameterMin: 18,
      neckDiameterMax: 19,
      sheathFr: 18,
      nPeaks: 5,
      mainBodyLengths: [80, 100, 120],
    },
    {
      graftDiameter: 24,
      neckDiameterMin: 19,
      neckDiameterMax: 21,
      sheathFr: 18,
      nPeaks: 5,
      mainBodyLengths: [80, 100, 120],
    },
    {
      graftDiameter: 26,
      neckDiameterMin: 21,
      neckDiameterMax: 23,
      sheathFr: 18,
      nPeaks: 5,
      mainBodyLengths: [80, 100, 120],
    },
    {
      graftDiameter: 28,
      neckDiameterMin: 23,
      neckDiameterMax: 25,
      sheathFr: 18,
      nPeaks: 5,
      mainBodyLengths: [80, 100, 120],
    },
    {
      graftDiameter: 30,
      neckDiameterMin: 25,
      neckDiameterMax: 27,
      sheathFr: 19,
      nPeaks: 6,
      mainBodyLengths: [80, 100, 120],
    },
    {
      graftDiameter: 33,
      neckDiameterMin: 27,
      neckDiameterMax: 30,
      sheathFr: 19,
      nPeaks: 6,
      mainBodyLengths: [80, 100, 120],
    },
    {
      graftDiameter: 36,
      neckDiameterMin: 30,
      neckDiameterMax: 32,
      sheathFr: 19,
      nPeaks: 6,
      mainBodyLengths: [80, 100, 120],
    },
  ],
  sources: [
    "TREO Product Brochure PM-08467-ROW",
    "TREO US IFU P190015",
    "Eagleton MJ et al. J Vasc Surg 2021",
    "PMC10958111",
    "IFU PM-08467-ROW Fig: suprarenal zone 16 mm (Ø20–28 mm), 18 mm (Ø30–36 mm); nPeaks 5/6 confirmed; stentType Z-stent confirmed",
  ],
};

export const VALIANT: DeviceGeometry = {
  id: "valiant",
  name: "Medtronic Valiant",
  shortName: "Valiant",
  manufacturer: "Medtronic",
  // ringHeight = sinusoidal ring amplitude extracted from binary waveform data.
  // Binary: Y range 7.6–23.2 mm → amplitude 15.6 mm; wave period ~17.9 mm.
  ringHeight: 15.6,
  // Binary extraction (valiant_28_32_data): 8 rings, gaps 2.6–4.1 mm (avg 3.6 mm).
  // Using 4 proximal rings for PMEG planning zone.
  interRingGap: 3.6,
  nRings: 4,
  foreshortening: 0.05,
  seamDeg: 180,
  wireRadius: 1.5,
  stentType: "sinusoidal",
  fabricMaterial: "polyester",
  pmegSuitability: 3,
  pmegNotes:
    "Medtronic Valiant uses wide sinusoidal nitinol rings (15.6 mm ring height, ~18 mm period). Tall rings reduce the strut-free gap between rows; fenestration placement is tightly constrained. Careful rotational planning is essential.",
  clinicalRank: 3,
  color: "#0d9488",
  waveWidthMm: 17.9,
  proximalRingOffsetMm: 3,
  // IFU: Z-stent suprarenal crown with barbs at peaks
  hasBareSuprarenal: true,
  suprarenalHeightMm: 15,
  hasInfrarenalBarbs: false,
  minNeckLengthMm: 15,
  maxInfrarenalAngleDeg: 60,
  maxSuprarenalAngleDeg: 60,
  sizes: [
    {
      graftDiameter: 28,
      neckDiameterMin: 22,
      neckDiameterMax: 25,
      sheathFr: 18,
      nPeaks: 5,
      mainBodyLengths: [80, 100, 120, 150],
    },
    {
      graftDiameter: 30,
      neckDiameterMin: 24,
      neckDiameterMax: 27,
      sheathFr: 18,
      nPeaks: 5,
      mainBodyLengths: [80, 100, 120, 150],
    },
    {
      graftDiameter: 32,
      neckDiameterMin: 26,
      neckDiameterMax: 29,
      sheathFr: 20,
      nPeaks: 6,
      mainBodyLengths: [80, 100, 120, 150],
    },
  ],
  sources: [
    "Waveform extracted from compiled binary: 249 points, period 17.87 mm, amplitude 15.60 mm",
    "Binary extraction (valiant_28_32_data): 8 rings, gaps 2.6–4.1 mm (avg 3.6 mm), ring height ~15.5 mm",
  ],
};

export const ALL_DEVICES: DeviceGeometry[] = [
  ZENITH_ALPHA,
  ENDURANT_II,
  TREO,
  VALIANT,
  ...BENCH_CT_PREVIEW_DEVICES,
];

export function selectSize(
  device: DeviceGeometry,
  neckDiameterMm: number,
): DeviceSize | null {
  // The device size table already encodes appropriate oversizing:
  // neckDiameterMin/Max is the patient neck range; graftDiameter is the
  // pre-oversized implant. Direct lookup is correct — applying an additional
  // 1.15× multiplier to the neck was selecting grafts 2-3 sizes too large.
  const candidates = device.sizes.filter(
    (size) =>
      neckDiameterMm >= size.neckDiameterMin &&
      neckDiameterMm <= size.neckDiameterMax,
  );

  if (candidates.length === 0) return null;

  // If multiple sizes span this neck diameter, use the smallest (least oversize).
  return candidates.sort((a, b) => a.graftDiameter - b.graftDiameter)[0];
}

export function getTREOWaveWidth(graftDiameterMm: number): number {
  const nPeaks = graftDiameterMm <= 28 ? 5 : 6;
  return (Math.PI * graftDiameterMm) / nPeaks;
}

export function getNPeaks(
  device: DeviceGeometry,
  graftDiameterMm: number,
): number {
  if (device.id === TREO.id) {
    return graftDiameterMm <= 28 ? 5 : 6;
  }

  const exact = device.sizes.find(
    (size) => size.graftDiameter === graftDiameterMm,
  );
  if (exact) {
    return exact.nPeaks;
  }

  const waveWidth =
    device.id === TREO.id ? getTREOWaveWidth(graftDiameterMm) : device.waveWidthMm;

  return computePeaks(graftDiameterMm, waveWidth);
}

export function getDeviceById(deviceId: string) {
  return ALL_DEVICES.find((device) => device.id === deviceId) ?? null;
}

/**
 * Resolves the effective ring height and inter-ring gap for a given device + size
 * combination. Per-size overrides (from template measurements) take precedence
 * over device-level defaults.
 *
 * @example
 *   const { ringHeight, interRingGap } = getEffectiveRingGeometry(ENDURANT_II, size32);
 *   // → { ringHeight: 10.0, interRingGap: 2.0 } (from template measurements)
 */
export function getEffectiveRingGeometry(
  device: DeviceGeometry,
  size: DeviceSize | null,
): { ringHeight: number; interRingGap: number } {
  const geom = resolveRingGeometry(device, size);
  return {
    ringHeight: geom.ringHeightMm,
    interRingGap: geom.interRingGapMm,
  };
}
