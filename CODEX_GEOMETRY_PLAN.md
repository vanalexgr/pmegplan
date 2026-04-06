# Geometry Engine Refactor — Codex Implementation Plan

## Context

PMEGplan currently has geometry logic scattered across several files:
- Coordinate transforms redefined in each renderer (`arcFromNoon`, `clockToArcMm`, `computeArcSep`)
- Ring geometry partially per-size (Endurant II uses `sizes[].ringHeightMm`) but inconsistent with other devices
- Device numeric constants embedded in `devices.ts` with no JSON calibration path
- No canonical polar/angular representation — the app mixes clock strings, arc-mm, and pixel coords ad-hoc
- `buildStrutSegments` recently gained device-specific branches (`treo`, `endurant_ii`) with magic constants

The EndoDraft geometry handoff (`geometry_presets.json`) defines a clean parametric waveform model
with explicit field names recovered from binary inspection. Architecture and field names are reliable;
device numbers are provisional. Both must survive in the refactored engine.

---

## Goals

1. **Clean domain model** — one canonical set of types that all code shares
2. **Device abstraction layer** — devices describable from JSON, not hardcoded branches
3. **Coordinate transforms** — single source of truth for clock ↔ arc-mm ↔ polar
4. **JSON serialization** — device presets loadable/exportable; compatible with EndoDraft format

**Non-goals:** changing analysis logic, rendering code, or UI. This is purely the geometry layer.

---

## New File Layout

```
lib/geometry/
  coordinates.ts      ← all clock/arc/polar transforms (no deps)
  waveform.ts         ← parametric waveform builder (no device deps)
  devicePreset.ts     ← JSON schema + loader/exporter
  ringGeometry.ts     ← per-size ring height resolution (replaces getEffectiveRingGeometry)
  index.ts            ← re-exports everything
```

Existing files that change:
- `lib/conflictDetection.ts` — remove `wrapMm`, `clockToArc`; import from `lib/geometry/coordinates`
- `lib/stentGeometry.ts` — remove device-specific branches; delegate to `waveform.ts` + `devicePreset.ts`
- `lib/devices.ts` — device numeric constants moved to `lib/geometry/devicePreset.ts` as typed presets
- `lib/types.ts` — extend `DeviceGeometry` with `WaveformPreset` field (optional, for JSON-loaded devices)

---

## Types

### `lib/geometry/coordinates.ts`

```typescript
/** Arc position in mm along circumference, 0 = 12:00, increases clockwise. */
export type ArcMm = number;

/** Signed arc offset from 12:00: negative = counter-clockwise, positive = clockwise. */
export type ArcFromNoon = number;

/** Full polar angle in radians, 0 = 12:00, increases clockwise. */
export type ThetaRad = number;

/** Clock string "hh:mm" — Cook CMD convention, caudal-to-cranial view. */
export type ClockString = string;

export interface CoordSet {
  arcMm: ArcMm;
  arcFromNoon: ArcFromNoon;
  theta: ThetaRad;
  clock: ClockString;
}

// ── Transforms ──────────────────────────────────────────────────────────────

/** Wrap any value into [0, circ). */
export function wrapMm(value: number, circ: number): ArcMm;

/** Clock string "hh:mm" → arc-mm from 12:00. */
export function clockToArcMm(clock: ClockString, circ: number): ArcMm;

/** Arc-mm → clock string "h:mm". */
export function arcMmToClock(arcMm: ArcMm, circ: number): ClockString;

/** Arc-mm → signed offset from noon (negative = CCW, positive = CW). */
export function arcMmToFromNoon(arcMm: ArcMm, circ: number): ArcFromNoon;

/** Arc-mm → polar angle in radians (0 = 12:00, clockwise). */
export function arcMmToTheta(arcMm: ArcMm, circ: number): ThetaRad;

/** Arc separation (signed, CCW positive) from seam to fenestration. */
export function arcSepFromSeam(
  fenClock: ClockString,
  seamDeg: number,
  rotationDeltaMm: number,
  circ: number,
): number;

/** Circumference from diameter. */
export function diamToCirc(diamMm: number): number;
```

---

### `lib/geometry/waveform.ts`

Corresponds to EndoDraft `z_waveform_rule` and `integration_contract`.

```typescript
export type WaveformPattern = "zigzag" | "sinusoidal" | "m-shaped";

/**
 * Fully parametric waveform descriptor.
 * Maps directly to EndoDraft geometry_presets.json `waveform_model` fields.
 */
export interface WaveformPreset {
  pattern: WaveformPattern;

  /** Circumferential period of one full wave in mm (= 2 × period_mm_small in EndoDraft). */
  waveWidthMm: number;

  /** Projected vertical height of one ring in mm (= small_peak_y_default in EndoDraft). */
  ringHeightMm: number;

  /** Baseline/valley y-offset in mm from ring top (= common_base_y in EndoDraft). Default 0. */
  baselineOffsetMm?: number;

  /** Phase fraction for this ring [0,1). 0 = peaks at top, 0.5 = half-period shift. */
  phaseFraction?: number;

  /** Number of sample points for sinusoidal approximation. Default 16. */
  sinusoidSamples?: number;

  /** M-shaped shoulder ratio [0,1). Only for m-shaped pattern. Default 0.42. */
  mShoulderRatio?: number;
}

/**
 * Build strut segments for a single ring.
 * Returns [ax, ay, bx, by][] in mm coordinates (origin = top-left of ring).
 */
export function buildRingSegments(
  circ: number,
  yTopMm: number,
  preset: WaveformPreset,
  nPeaks: number,
): StrutSegment[];
```

---

### `lib/geometry/ringGeometry.ts`

Replaces the current `getEffectiveRingGeometry` in `devices.ts`.

```typescript
export interface RingGeometry {
  ringHeightMm: number;
  interRingGapMm: number;
  proximalOffsetMm: number;    // distance from fabric edge to first ring top
  nRings: number;
}

/**
 * Resolve ring geometry for a specific graft diameter.
 * Falls back to device-level defaults if no per-size override exists.
 */
export function resolveRingGeometry(
  device: DeviceGeometry,
  graftDiameterMm: number,
): RingGeometry;

/** Total covered seal zone height in mm. */
export function sealZoneHeightMm(geom: RingGeometry): number;

/**
 * Returns true if depthMm falls in an inter-ring gap (strut-free zone).
 * Used by conflict detection and "A" strut-free annotation.
 */
export function isStrutFreeDepth(depthMm: number, geom: RingGeometry): boolean;
```

---

### `lib/geometry/devicePreset.ts`

JSON schema matching EndoDraft `geometry_presets.json` plus PMEGplan extensions.

```typescript
/** One entry in geometry_presets.json `device_presets`. */
export interface EndoDraftPreset {
  family: string;
  diameter_range_mm: [number, number];
  waveform_model: {
    n_points: number;
    period_mm_small: number;       // = waveWidthMm / 2
    first_peak_x: number;          // = phase offset in mm
    first_left_base_y: number;
    small_peak_y_default: number;  // = ringHeightMm
    common_base_y: number;         // = baselineOffsetMm
    x_offset_correction: number;   // = rotational correction
    scale_factor: number;
  };
}

/** Full geometry_presets.json schema. */
export interface GeometryPresetsFile {
  meta: { source: string; status: string; notes: string[] };
  recovered_fields: Record<string, string[]>;
  integration_contract: Record<string, string>;
  device_presets: Record<string, EndoDraftPreset>;
  example_project?: unknown;
}

/** Convert EndoDraft preset → PMEGplan WaveformPreset. */
export function endoDraftToWaveform(preset: EndoDraftPreset): WaveformPreset;

/** Convert PMEGplan WaveformPreset → EndoDraft preset. */
export function waveformToEndoDraft(
  family: string,
  diamRange: [number, number],
  wf: WaveformPreset,
): EndoDraftPreset;

/** Load all device presets from a geometry_presets.json object. */
export function loadPresetsFromJson(json: GeometryPresetsFile): Map<string, WaveformPreset>;
```

---

## Calibration Strategy

**All device numeric constants** (ringHeightMm, waveWidthMm, interRingGapMm, nPeaks per diameter)
must remain easily recalibratable without code changes. Two mechanisms:

1. **Per-size overrides in `devices.ts`** (already exists for Endurant II):
   ```typescript
   sizes: [
     { graftDiameter: 23, ringHeightMm: 7.5, interRingGapMm: 2.5, ... },
   ]
   ```
   These take priority over device-level defaults. Add to Zenith Alpha and TREO if IFU data changes.

2. **JSON preset loading** (`geometry_presets.json` via `devicePreset.ts`):
   Drop a new JSON file → call `loadPresetsFromJson()` → override device waveform.
   No recompilation needed. Suitable for clinical recalibration.

The architecture must guarantee: **changing a device's ring height affects conflict detection,
strut rendering, and seal zone calculation simultaneously**, because all three call `resolveRingGeometry`.

---

## Coordinate Transform Unification

Current duplication to eliminate:

| Function | Currently in | Move to |
|---|---|---|
| `wrapMm` | conflictDetection.ts (exported), redefined in renderers | `geometry/coordinates.ts` |
| `clockToArc` | conflictDetection.ts | `geometry/coordinates.ts` as `clockToArcMm` |
| `arcFromNoon` | graftSketchRenderer.ts (private) | `geometry/coordinates.ts` |
| `clockToArcMm` | graftSketchRenderer.ts (private, duplicate) | remove; import from coordinates |
| `computeArcSep` | graftSketchRenderer.ts, punchCardRenderer.ts (duplicate) | `geometry/coordinates.ts` as `arcSepFromSeam` |
| `diamToCirc` | inline everywhere as `Math.PI * diam` | `geometry/coordinates.ts` |

All renderers, analysis, conflict detection, and rotation optimizer import from
`lib/geometry/coordinates` — no other source for these transforms.

---

## Implementation Order

1. **`lib/geometry/coordinates.ts`** — pure functions, no deps. Extract from conflictDetection.ts + renderers.
2. **Update `conflictDetection.ts`** — import `wrapMm`, `clockToArcMm` from coordinates; remove duplicates.
3. **`lib/geometry/ringGeometry.ts`** — extract + standardize `getEffectiveRingGeometry`.
4. **`lib/geometry/waveform.ts`** — refactor `buildStrutSegments` pure ring builder.
5. **Simplify `stentGeometry.ts`** — remove device-specific `if (device.id === "treo")` branches; delegate to waveform.ts + ringGeometry.ts using preset data from devices.ts.
6. **`lib/geometry/devicePreset.ts`** — JSON schema + EndoDraft loader.
7. **`lib/geometry/index.ts`** — re-export all public API.
8. **Update renderers** — import coordinate transforms from geometry/coordinates; remove private duplicates.
9. **TypeScript check + test pass** — no behaviour changes expected.

---

## Constraints

- Do NOT change any analysis, recommendation, or rendering logic — geometry only.
- All existing `DeviceGeometry` fields in `types.ts` must remain for backwards compatibility.
  Add new fields as optional.
- The `buildStrutSegmentsForDevice` export signature in `stentGeometry.ts` must stay the same
  (called from `analysis.ts`).
- Device numeric presets in `devices.ts` are **not** the source of truth for calibration —
  they are the defaults. Actual IFU-calibrated values should flow from `resolveRingGeometry`.
