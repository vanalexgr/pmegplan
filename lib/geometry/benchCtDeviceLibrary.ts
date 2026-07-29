/**
 * Bench-CT-derived device geometry descriptors.
 *
 * These are deliberately separate from `ALL_DEVICES`: a bench scan supplies
 * the free-state strut geometry, but does not establish the device's IFU
 * sizing, indications, sheath, or suitability for clinical recommendations.
 * Consumers that render a known device at its scanned size can use these
 * descriptors directly rather than reducing them to a uniform waveform.
 */

import endograft1 from "@/library/Endograft-1_scan1.json";
import endograft2 from "@/library/Endograft-2_scan2.json";
import endograft3 from "@/library/Endograft-3_scan3.json";

export interface BenchCtApex {
  theta_deg: number;
  z_mm: number;
}

export interface BenchCtRing {
  index: number;
  component: number;
  diameter_mm: number;
  ring_height_mm: number;
  n_apices: number;
  phase_deg: number | null;
  z_proximal_apices_mm: number | null;
  z_distal_apices_mm: number | null;
  proximal_apices: BenchCtApex[];
  distal_apices: BenchCtApex[];
}

export interface BenchCtDeviceDescriptor {
  schema: "pmegplan.device-geometry/1";
  device: string;
  size: string;
  state: "free_unconstrained";
  geometry?: {
    shape: "cylindrical" | "conical";
    scan_orientation: "standard" | "inverted_corrected";
    proximal_fixation: {
      ring_count: number;
      position: "above_fabric" | "none";
    };
  };
  diameter_profile?: Array<{
    z: number;
    d: number;
  }>;
  rings: BenchCtRing[];
}

function descriptorFromJson(value: unknown): BenchCtDeviceDescriptor {
  const descriptor = value as Partial<BenchCtDeviceDescriptor>;
  if (
    descriptor.schema !== "pmegplan.device-geometry/1" ||
    typeof descriptor.device !== "string" ||
    typeof descriptor.size !== "string" ||
    !Array.isArray(descriptor.rings)
  ) {
    throw new Error("Invalid bench-CT device geometry descriptor.");
  }
  return descriptor as BenchCtDeviceDescriptor;
}

const descriptors = [
  descriptorFromJson(endograft1),
  descriptorFromJson(endograft2),
  descriptorFromJson(endograft3),
] as const;

/** Read-only in-repository library of validated bench-CT descriptor files. */
export const BENCH_CT_DEVICE_LIBRARY: readonly BenchCtDeviceDescriptor[] = descriptors;

export function getBenchCtDeviceDescriptor(
  device: string,
  size: string,
): BenchCtDeviceDescriptor | null {
  return BENCH_CT_DEVICE_LIBRARY.find(
    (descriptor) => descriptor.device === device && descriptor.size === size,
  ) ?? null;
}
