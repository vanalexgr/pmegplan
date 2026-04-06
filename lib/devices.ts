import type { DeviceGeometry, DeviceSize } from "@/lib/types";
import { resolveRingGeometry } from "@/lib/geometry/ringGeometry";

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
  // Photo/IFU appearance: short ring-free fabric collar below the proximal edge
  // before the first covered Z-row starts.
  proximalRingOffsetMm: 8,
  // IFU T_ZALPHA_REV5: bare suprarenal nitinol stent with fixation barbs
  hasBareSuprarenal: true,
  suprarenalHeightMm: 18, // IFU T_ZALPHA_REV5: bare Z-stent above fabric ≈ 18 mm
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
  ringHeight: 8.5,
  interRingGap: 3,
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
      // Template measurements (IFU print-at-100% at 3.8 px/mm):
      // 5 rings, all in-phase. Ring height measured top-to-bottom of sinusoid.
      ringHeightMm: 7.5,
      interRingGapMm: 2.5,
    },
    {
      graftDiameter: 25,
      neckDiameterMin: 19,
      neckDiameterMax: 21,
      sheathFr: 18,
      nPeaks: 8,
      mainBodyLengths: [49, 82, 124, 166],
      // Template measurements: circ = π × 25 ≈ 78.5 mm · 8 peaks · 5 rings
      ringHeightMm: 8.0,
      interRingGapMm: 2.5,
    },
    {
      graftDiameter: 28,
      neckDiameterMin: 22,
      neckDiameterMax: 24,
      sheathFr: 18,
      nPeaks: 8,
      mainBodyLengths: [49, 82, 124, 166],
      // Template measurements: circ = π × 28 ≈ 88.0 mm · 8 peaks · 5 rings
      ringHeightMm: 8.0,
      interRingGapMm: 2.5,
    },
    {
      graftDiameter: 32,
      neckDiameterMin: 26,
      neckDiameterMax: 28,
      sheathFr: 18,
      nPeaks: 10,
      mainBodyLengths: [82, 124, 166],
      // Digitised Endurant_32 back-table template (3.8 px/mm): five covered
      // M-stent rows packed at ~0→8 mm, ~10→18 mm, ~20→28 mm, ~30→38 mm,
      // and ~40→48 mm. Ring 1 is symmetric; rings 2–5 use the asymmetric
      // calligraphic profile captured in lib/mstentProfile.ts.
      // Ring height = 8mm, gap = 2mm → total 5×8 + 4×2 = 48mm ✓
      ringHeightMm: 8.0,
      interRingGapMm: 2.0,
    },
    {
      graftDiameter: 36,
      neckDiameterMin: 30,
      neckDiameterMax: 32,
      sheathFr: 18,
      nPeaks: 10,
      mainBodyLengths: [124, 166],
      // Template measurements: circ = π × 36 ≈ 113.1 mm · 10 peaks · 5 rings
      ringHeightMm: 8.5,
      interRingGapMm: 2.0,
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
  // TREO's defining planning feature is the broad working window created by
  // staggered covered wireform rows with roughly square-ish openings.
  ringHeight: 9,
  // Template measurement: fabric gaps between covered rows are ~18 mm.
  interRingGap: 18,
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

export const GORE_EXCLUDER: DeviceGeometry = {
  id: "gore_excluder",
  name: "Gore Excluder C3",
  shortName: "Excluder C3",
  manufacturer: "W.L. Gore & Associates",
  ringHeight: 15,
  interRingGap: 3,
  nRings: 5,
  foreshortening: 0.05,
  seamDeg: 180,
  wireRadius: 1.5,
  stentType: "sinusoidal",
  fabricMaterial: "ePTFE",
  pmegSuitability: 4,
  pmegNotes:
    "Included for completeness. ePTFE is harder to modify and is not recommended as a first-choice PMEG base platform.",
  clinicalRank: 4,
  color: "#dc2626",
  waveWidthMm: 10.5,
  // IFU: nitinol anchors + ePTFE/FEP sealing cuff at proximal end (no separate bare stent)
  hasBareSuprarenal: false,
  hasInfrarenalBarbs: false,
  // IFU: ≥15 mm non-aneurysmal neck, ≤60° proximal aortic neck angulation
  minNeckLengthMm: 15,
  maxInfrarenalAngleDeg: 60,
  maxSuprarenalAngleDeg: 60,
  sizes: [
    {
      graftDiameter: 23,
      neckDiameterMin: 17,
      neckDiameterMax: 19,
      sheathFr: 18,
      nPeaks: 8,
      mainBodyLengths: [60, 95, 130, 165],
    },
    {
      graftDiameter: 26,
      neckDiameterMin: 20,
      neckDiameterMax: 22,
      sheathFr: 18,
      nPeaks: 8,
      mainBodyLengths: [60, 95, 130, 165],
    },
    {
      graftDiameter: 29,
      neckDiameterMin: 23,
      neckDiameterMax: 25,
      sheathFr: 18,
      nPeaks: 10,
      mainBodyLengths: [60, 95, 130, 165],
    },
    {
      graftDiameter: 31,
      neckDiameterMin: 25,
      neckDiameterMax: 27,
      sheathFr: 18,
      nPeaks: 10,
      mainBodyLengths: [60, 95, 130, 165],
    },
    {
      graftDiameter: 34,
      neckDiameterMin: 28,
      neckDiameterMax: 30,
      sheathFr: 18,
      nPeaks: 10,
      mainBodyLengths: [60, 95, 130, 165],
    },
  ],
  sources: [
    "Gore Excluder C3 IFU H-G-EXLC",
    "Gore Conformable Excluder IFU",
    "IFU H-G-EXLC Fig 1A/4: sinusoidal ring pattern confirmed; hasBareSuprarenal false confirmed",
  ],
};

export const ALL_DEVICES: DeviceGeometry[] = [
  ZENITH_ALPHA,
  ENDURANT_II,
  TREO,
  GORE_EXCLUDER,
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
