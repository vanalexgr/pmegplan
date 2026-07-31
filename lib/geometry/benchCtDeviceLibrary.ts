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
  /** Device-topology annotations; not inferred from CT metal segmentation. */
  rendering?: {
    fabric_proximal_edge_z_mm: number;
    fabric_distal_edge_z_mm?: number;
    proximal_bare_ring_indices?: number[];
    barb_length_mm?: number;
    /** Which output scan-z end is anatomically proximal before rendering. */
    anatomical_proximal_z?: "low" | "high";
  };
  /**
   * Provenance for a runtime CT-derived model. Exact scans remain untouched;
   * scaled variants retain their source scan and are never presented as
   * directly measured geometry.
   */
  ct_model?: {
    evidence: "measured_scan" | "scaled_proxy";
    identity_status: "confirmed_platform" | "candidate_nominal_size";
    reference_scan: string;
    target_component: string;
    radial_scale: number;
    axial_scale: number;
  };
  /**
   * Axial intervals of segmented metal per angular bin, in this descriptor's
   * own z and theta datums.
   *
   * The apex rows below describe a ring as an idealised zigzag through ten to
   * twenty-eight points. This is the wire the scan actually found — several
   * thousand intervals per device — and it is what anything deciding strut
   * conflict should use. It carries the bare fixation ring and its barbs
   * without special handling, and it does not assume a ring is a clean zigzag,
   * so a device whose struts the apex model cannot describe is still
   * represented correctly.
   *
   * Written by `tools/extract_wire_map.py`; absent on descriptors predating it.
   */
  wire_map?: BenchCtWireMap;
  rings: BenchCtRing[];
}

export interface BenchCtWireMap {
  theta_bins: number;
  theta_step_deg: number;
  hu_metal_threshold: number;
  isotropic_spacing_mm: number;
  /** Axial gap below which two samples are one run rather than two. */
  run_gap_mm: number;
  /**
   * How the map was brought into the descriptor's frame, and how well. The
   * residual is the distance from each stored apex to the nearest measured
   * metal boundary, so a small median means the frame was genuinely recovered
   * rather than approximately matched.
   */
  datum_fit: {
    axis_sign: number;
    z_offset_mm: number;
    theta_shift_deg: number;
    apex_residual_p50_mm: number;
    apex_residual_p95_mm: number;
  };
  note: string;
  /** Per bin, the `[zStart, zEnd]` intervals holding metal. */
  runs: Array<Array<[number, number]>>;
  /** Per bin, the 90th-percentile radius of that bin's metal, in mm. */
  radius_mm: Array<number | null>;
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
