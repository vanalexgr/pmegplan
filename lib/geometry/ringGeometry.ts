/**
 * Ring geometry resolution for PMEGplan devices.
 *
 * Centralises the logic for determining the effective ring height and gap for
 * a given device + graft diameter. Per-size overrides take precedence over
 * device-level defaults, enabling easy recalibration without code changes.
 */

import type { DeviceGeometry, DeviceSize } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RingGeometry {
  /** Projected vertical height of one covered ring in mm. */
  ringHeightMm: number;
  /** Vertical gap between adjacent rings (strut-free zone) in mm. */
  interRingGapMm: number;
  /** Distance from proximal fabric edge to the top of ring 1 in mm. */
  proximalOffsetMm: number;
  /** Total number of covered rings in the proximal seal zone. */
  nRings: number;
}

// ── Resolution ────────────────────────────────────────────────────────────────

/**
 * Resolve effective ring geometry for a specific graft size.
 *
 * Priority (highest first):
 *   1. DeviceSize.ringHeightMm / DeviceSize.interRingGapMm  (per-size IFU calibration)
 *   2. DeviceGeometry.ringHeight / DeviceGeometry.interRingGap  (device-level default)
 */
export function resolveRingGeometry(
  device: DeviceGeometry,
  size: DeviceSize | null,
): RingGeometry {
  return {
    ringHeightMm: size?.ringHeightMm ?? device.ringHeight,
    interRingGapMm: size?.interRingGapMm ?? device.interRingGap,
    proximalOffsetMm: device.proximalRingOffsetMm ?? 0,
    nRings: device.nRings,
  };
}

// ── Derived quantities ────────────────────────────────────────────────────────

/** Total covered proximal seal zone height in mm (offset + all rings + all gaps). */
export function sealZoneHeightMm(geom: RingGeometry): number {
  return (
    geom.proximalOffsetMm +
    geom.nRings * geom.ringHeightMm +
    Math.max(0, geom.nRings - 1) * geom.interRingGapMm
  );
}

/**
 * Returns true if depthMm falls in an inter-ring gap (strut-free zone).
 *
 * Gaps occur between adjacent rings at:
 *   offset + ringH → offset + ringH + gap  (gap 1)
 *   offset + 2×ringH + gap → offset + 2×ringH + 2×gap  (gap 2)
 *   …
 */
export function isStrutFreeDepth(depthMm: number, geom: RingGeometry): boolean {
  let y = geom.proximalOffsetMm;
  for (let i = 0; i < geom.nRings - 1; i++) {
    y += geom.ringHeightMm;
    if (depthMm >= y && depthMm <= y + geom.interRingGapMm) return true;
    y += geom.interRingGapMm;
  }
  return false;
}
