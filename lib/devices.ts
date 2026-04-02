import type { DeviceGeometry, DeviceSize } from "@/lib/types";

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
  ringHeight: 18,
  interRingGap: 6,
  nRings: 5,
  foreshortening: 0.06,
  seamDeg: 180,
  wireRadius: 2,
  stentType: "Z-stent",
  fabricMaterial: "polyester",
  pmegSuitability: 1,
  pmegNotes:
    "Gold standard PMEG platform. Narrow 6 mm inter-ring gaps can create renal conflicts when both vessels land in the same ring zone.",
  clinicalRank: 1,
  color: "#2563eb",
  waveWidthMm: 13.6,
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
      graftDiameter: 26,
      neckDiameterMin: 22,
      neckDiameterMax: 23,
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
  ],
};

export const ENDURANT_II: DeviceGeometry = {
  id: "endurant_ii",
  name: "Medtronic Endurant II",
  shortName: "Endurant II",
  manufacturer: "Medtronic",
  ringHeight: 20,
  interRingGap: 4,
  nRings: 5,
  foreshortening: 0.07,
  seamDeg: 180,
  wireRadius: 1.8,
  stentType: "sinusoidal",
  fabricMaterial: "polyester",
  pmegSuitability: 2,
  pmegNotes:
    "Common European PMEG alternative to Zenith. Helical frame is modelled as sinusoidal rings for conflict planning.",
  clinicalRank: 2,
  color: "#7c3aed",
  waveWidthMm: 12.8,
  sizes: [
    {
      graftDiameter: 23,
      neckDiameterMin: 17,
      neckDiameterMax: 19,
      sheathFr: 18,
      nPeaks: 8,
      mainBodyLengths: [49, 82, 124, 166],
    },
    {
      graftDiameter: 25,
      neckDiameterMin: 19,
      neckDiameterMax: 21,
      sheathFr: 18,
      nPeaks: 8,
      mainBodyLengths: [49, 82, 124, 166],
    },
    {
      graftDiameter: 28,
      neckDiameterMin: 22,
      neckDiameterMax: 24,
      sheathFr: 18,
      nPeaks: 8,
      mainBodyLengths: [49, 82, 124, 166],
    },
    {
      graftDiameter: 32,
      neckDiameterMin: 26,
      neckDiameterMax: 28,
      sheathFr: 18,
      nPeaks: 10,
      mainBodyLengths: [82, 124, 166],
    },
    {
      graftDiameter: 36,
      neckDiameterMin: 30,
      neckDiameterMax: 32,
      sheathFr: 18,
      nPeaks: 10,
      mainBodyLengths: [124, 166],
    },
  ],
  sources: [
    "Medtronic Endurant II IFU H620-3003",
    "Saratzis A et al. EJVES 2017",
    "Donas KP PMEG series",
  ],
};

export const TREO: DeviceGeometry = {
  id: "treo",
  name: "Terumo Aortic TREO",
  shortName: "TREO",
  manufacturer: "Terumo Aortic",
  ringHeight: 18,
  interRingGap: 18,
  nRings: 4,
  foreshortening: 0.05,
  seamDeg: 0,
  wireRadius: 2,
  stentType: "Z-stent",
  fabricMaterial: "polyester",
  pmegSuitability: 1,
  pmegNotes:
    "Wider 18 mm inter-ring gaps provide the largest conflict-free fenestration windows in the database.",
  clinicalRank: 3,
  color: "#0d9488",
  waveWidthMm: 0,
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

