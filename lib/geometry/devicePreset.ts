/**
 * Device waveform preset schema and JSON loader.
 *
 * Defines a neutral JSON format for device geometry presets and provides
 * conversion utilities to/from the WaveformPreset used by the waveform builder.
 *
 * JSON format overview:
 *   meta             — source/status metadata
 *   device_presets   — map of device key → DeviceWaveformConfig
 *
 * No vendor-specific tool names appear in this file or in the JSON schema.
 */

import type { WaveformPreset, WaveformPattern } from "@/lib/geometry/waveform";

// ── JSON schema types ─────────────────────────────────────────────────────────

/**
 * Waveform model block for one device in the presets JSON file.
 * All lengths in mm.
 */
export interface DeviceWaveformConfig {
  /** Device family name (e.g. "zenith_alpha"). */
  family: string;
  /** Nominal graft diameter range this preset applies to [min, max] mm. */
  diameter_range_mm: [number, number];
  waveform_model: {
    /** Number of parametric control points per full wave. */
    n_points: number;
    /** Half-period in mm (full wave width = period_mm_half × 2). */
    period_mm_half: number;
    /** Phase offset of first peak from origin, in mm. */
    first_peak_x_mm: number;
    /** Y-coordinate of left base point (valley), from ring top. */
    left_base_y_mm: number;
    /** Default projected ring height (peak-to-valley vertical extent) in mm. */
    ring_height_mm: number;
    /** Common base y-offset from ring top in mm (0 if valleys sit at ring bottom). */
    base_offset_mm: number;
    /** Rotational correction applied to x-origin in mm. */
    x_correction_mm: number;
    /** Unitless scale factor for device-specific calibration. Default 1.0. */
    scale_factor: number;
  };
}

/**
 * Full device presets JSON file schema.
 */
export interface DevicePresetsManifest {
  meta: {
    source: string;
    status: string;
    notes: string[];
  };
  /** Map of device key → waveform config. */
  device_presets: Record<string, DeviceWaveformConfig>;
}

// ── Converters ────────────────────────────────────────────────────────────────

/**
 * Convert a DeviceWaveformConfig to a PMEGplan WaveformPreset.
 *
 * Provisional device numbers come from the JSON; they remain easily
 * recalibratable by editing the JSON without code changes.
 */
export function configToWaveform(config: DeviceWaveformConfig): WaveformPreset {
  const wm = config.waveform_model;
  return {
    pattern: inferPattern(config.family),
    waveWidthMm: wm.period_mm_half * 2,
    ringHeightMm: wm.ring_height_mm,
    phaseFraction: wm.first_peak_x_mm / (wm.period_mm_half * 2),
  };
}

/**
 * Convert a WaveformPreset back to a DeviceWaveformConfig for JSON export.
 */
export function waveformToConfig(
  family: string,
  diamRange: [number, number],
  wf: WaveformPreset,
): DeviceWaveformConfig {
  const halfPeriod = wf.waveWidthMm / 2;
  return {
    family,
    diameter_range_mm: diamRange,
    waveform_model: {
      n_points: wf.pattern === "m-shaped" ? 5 : wf.pattern === "sinusoidal" ? (wf.sinusoidSamples ?? 16) : 2,
      period_mm_half: halfPeriod,
      first_peak_x_mm: (wf.phaseFraction ?? 0) * wf.waveWidthMm,
      left_base_y_mm: wf.ringHeightMm,
      ring_height_mm: wf.ringHeightMm,
      base_offset_mm: 0,
      x_correction_mm: 0,
      scale_factor: 1.0,
    },
  };
}

/**
 * Load all device presets from a DevicePresetsManifest.
 * Returns a map of device key → WaveformPreset.
 */
export function loadDevicePresets(
  manifest: DevicePresetsManifest,
): Map<string, WaveformPreset> {
  const result = new Map<string, WaveformPreset>();
  for (const [key, config] of Object.entries(manifest.device_presets)) {
    result.set(key, configToWaveform(config));
  }
  return result;
}

// ── Internal ──────────────────────────────────────────────────────────────────

function inferPattern(family: string): WaveformPattern {
  const f = family.toLowerCase();
  if (f.includes("valiant")) return "sinusoidal";
  if (f.includes("endurant") || f.includes("m-stent")) return "m-shaped";
  return "zigzag";
}
