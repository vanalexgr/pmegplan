# Extraction audit — 2026-08-07

A review of how the bench-CT DICOM series become the device descriptors the
planner works from, what was found wrong, what was corrected, and what is still
outstanding. Written to be auditable: every figure below is reproducible from
`library/*.json`, the two extraction tools, and the commands in §14.

The review covered the whole path from DICOM to plan:
`endograft_geometry.py` (ring geometry, apices, datums) →
`tools/extract_wire_map.py` (wire map, frame recovery) → `library/*.json` →
`lib/geometry/` and `lib/planning/` (render model, clearance, solver).

**One defect was material and is corrected. Two of the three devices had been
carrying a wire map that was a mirror image of the device it described.** The
library was regenerated from source on 2026-08-07 and any figure computed for
scan2 or scan3 before that date is void.

---

## Findings at a glance

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Wire map reflected in θ on scan2 and scan3 | **Material** | Fixed; library regenerated |
| 2 | Datum-fit gate tested the median, which cannot see a reflection | **Material** | Fixed |
| 3 | Fabric edges are not measured on any device | High | Tool fixed; descriptors need re-run |
| 4 | `number()` had no body — kVp dropped, spacing fallback dead | Medium | Fixed |
| 5 | The two extractors read possibly different series and different masks | Medium | Partly fixed |
| 6 | Chirality is never pinned to the physical device | **High** | **Outstanding** |
| 7 | Apex counts are an artifact of the prominence threshold | Medium | Outstanding |
| 8 | `extract` silently destroys annotations and the wire map | Medium | Outstanding |
| 9 | One straight axis; radius aggregated over the whole device | Medium | Outstanding |
| 10 | Marker θ datum averages all markers into one angle | Medium | Outstanding |
| 11 | Single-voxel speckle runs enter conflict detection | Low | Outstanding |
| 12 | Binary thresholding discards all sub-voxel information | Low | Outstanding |

---

## 1. The reflected wire map — material, fixed

### Mechanism

`principal_axis` in `tools/extract_wire_map.py` took the device axis as `vh[0]`
from SVD. **SVD returns that sign arbitrarily**, and the sign is not cosmetic:
the in-plane basis is built from the axis, so flipping it sends

```
u = axis × helper  →  −u        v = axis × u  →  +v
```

which is `θ → 180° − θ`. That is a **reflection**. `fit_datum` searched an axis
sign, an axial offset and a rotation — and a rotation cannot undo a reflection.
So when the axis came out opposite to the run that wrote the apices, the fit
absorbed the reflection into a wrong rotation and reported a good residual.

`endograft_geometry.cylindrical_coordinates` normalises the sign. The wire-map
tool did not. That asymmetry is the whole bug.

### Evidence

Refitting the stored maps against their own apex rows, with the reflection
searched:

| | `axis_sign` as stored | as written | **mirrored** |
|---|---|---|---|
| scan1 | −1 | **p50 0.099, 3% over 1 mm** | p50 0.261, 21% |
| scan2 | +1 | p50 0.443, 33% | **p50 0.156, 2%** |
| scan3 | +1 | p50 0.547, 39% | **p50 0.095, 6%** |

`axis_sign: +1 ⟺ mirrored`, exactly as the mechanism predicts, and the mirrored
fits for scan2 and scan3 reach scan1's quality. At 180 and 100 apices spread
down the whole device, that is not coincidence.

### Confirmation from source

Regenerating from the DICOM series with the axis sign normalised, **all three
now recover `sign = −1, mirror = +1` and the reflection search never fires** —
which is the direct proof that the old `axis_sign: +1` *was* the sign flip and
not some other frame difference.

| | θ shift before | θ shift now | offset | p50 | p90 | apices > 1 mm | alias |
|---|---|---|---|---|---|---|---|
| scan1 | −1.91° | **+1.50°** | 85.449 mm | 0.078 mm | 0.271 mm | **0.9%** | 2.6× |
| scan2 | +3.50° | **+1.50°** | 90.523 mm | 0.114 mm | 0.314 mm | **3.3%** | 2.6× |
| scan3 | **−23.00°** | **+0.50°** | 93.231 mm | 0.072 mm | 16.657 mm | **12.0%** | 8.6× |

The residual rotation between the two extraction passes is now under 2° on every
device — consistent with nothing but their differing helper vectors (METHODS
§3.2), and the first time the two tools have visibly agreed. scan3's −23° was a
fitted turn absorbing a reflection it had no parameter to express. **scan1 was
never mirrored but was still 3.4° out of true.**

Measured run counts moved slightly with the frame: 5,552 → 5,546 (scan1),
7,191 → 7,255 (scan2), 6,501 → 6,516 (scan3).

### Fix

- `principal_axis` normalises the axis sign the way the other tool does, so both
  passes build the same frame and there is nothing left to reflect.
- `fit_datum` searches the reflection anyway, as a `theta_mirror` parameter, and
  records it in `wire_map.datum_fit`.
- `build_wire_map` emits through the inverse transform, mirror included.

### scan3's remaining tail is a different defect

scan3 still shows p90 16.657 mm with 12.0% of apices beyond a millimetre,
against a p50 of 0.072 mm. That is **not** the frame — it is the peak detector
(finding 7), which asserts five apices per ring where the measured wire
oscillates 5, 7, 6, 6, 11, 5, 9, 14, 11, 5. Roughly one apex in eight is placed
where there is no metal. Conflict detection does not read the apex rows.

---

## 2. The gate could not have caught it — material, fixed

The write gate compared `--max-residual-mm` against the **median** residual.
With seven to ten rings, every apex finds *some* run boundary near it whatever
the frame, so half of them stay sub-millimetre straight through a reflection:
0.443 and 0.547 mm both passed a 1.5 mm gate. Sweeping θ over the full circle,
the median objective admits 28–34 one-degree shifts within 2× of its best on the
two broken devices, against 8 on the correct one — it is not discriminating
there.

The gate is now on:

- **`--max-fraction-over-1mm`** (default 0.20). This is the statistic that
  discriminates: 0.9–12% when the frame is recovered, 33–39% when mirrored. The
  threshold deliberately sits between scan3's 12% peak-detector defect and the
  33% floor of a mirror.
- **`--min-alias-ratio`** (default 2.0) — how many times worse the best rotation
  a full apex period away scores. Observed: 2.6×, 2.6×, 8.6×.

**A prior design decision was reversed here.** The rotation search had been
bounded to half an apex period, to stop it settling one period out. That bound
had to go: with the reflection in play the true rotation is measured from the
raw frame's arbitrary zero and can legitimately fall outside it — it does on
scan3, whose mirrored optimum sits at −45.5° against a ±36° bound. The alias
ratio replaces it by *detecting* aliasing rather than assuming it away.

### Regression test

`lib/__tests__/wireMapDatum.test.ts` runs on every `npm test` and asserts, per
device:

1. the residual tail — no more than 20% of apices beyond 1 mm;
2. **the map is not a reflection** — a device's own apices must not fit its
   mirrored map better than its stored one, with the rotation left free on both
   sides so the comparison is fair.

Before regeneration it failed for scan2 and scan3 and passed for scan1. Neither
this defect nor anything else in the previous 209 tests distinguished a correct
device from its reflection.

---

## 3. Fabric edges are not measured on any device — high, tool fixed

METHODS previously claimed measured fabric edges on scan1 and scan3. The numbers
do not support it:

| | `covered_length_mm` | `total_metal_length_mm` | annotated fabric span | metal − annotated |
|---|---|---|---|---|
| scan1 | 186.79 | 180.46 | 15.6 → 182.9 = 167.3 | **13.16 mm** |
| scan2 | *null* | 163.58 | 0 → 161.4 = 161.4 | 2.18 mm |
| scan3 | 199.14 | 197.87 | 12.1 → 196.9 = 184.8 | **13.07 mm** |

`covered_length_mm` tracks the **metal**, exceeding it by 6.3 and 1.3 mm, where
real fabric must stop short of a proximal bare fixation ring. The hand
annotations behave correctly instead: 13.1 mm inside the metal span on the two
devices that *have* a bare ring, on two independent measurements, and only
2.2 mm on scan2, which has none. That internal consistency is what makes the
annotations credible and the automatic figure not.

### Mechanism, and its demonstration

`fabric_datum` took an HU window of −400 to 600 in a radial band around the
stent wall, with **no exclusion around metal**. Every strut carries a
partial-volume halo whose HU falls from the metal threshold to air, passing
through that window on the way — so the search found each strut's own edge
wherever metal existed and nowhere else, which is precisely why the result
equals the metal span.

Demonstrated on a synthetic volume with four metal rings spanning 35 mm, a halo
inside the fabric window, and a fabric shell of a known 29.0 mm span:

| exclusion | reported covered length |
|---|---|
| 0.0 mm (previous behaviour) | 37.50 mm — tracks metal + halo |
| 0.9 mm (new default) | **29.00 mm — the exact truth** |

There is a second, unproven candidate. The devices were scanned resting in an
oversized plastic container tube (METHODS §2), and the radial band is centred on
the metal wall — on scan1 the tube wall plausibly falls inside it, and a tube
running past both ends of the device would stretch the extent the same way. It
would *not* fall inside scan3's narrower band, which is why the halo is the
likelier cause of both. Both are testable in one pass over the DICOMs.

### Status

`--fabric-metal-exclusion-mm` (default 0.9 mm) dilates the metal mask and
subtracts it before searching, and `cmd_extract` now warns when the covered
length comes back within 2 mm of the metal span — the signature of this failure.

**The descriptors are not yet regenerated for this.** Doing so means re-running
`endograft_geometry.py extract`, which also overwrites the hand annotations and
the wire map (finding 8). Fix that first. Until then the fabric edges in use
remain annotations — which is what they always were, now correctly labelled.

Nothing in the application reads `covered_length_mm`.

---

## 4. `number()` had no body — medium, fixed

```python
def number(value: str | None) -> float | None:
    if value is None:
        return None
    # ...and nothing else. The float parse sat after the `return` in iso_date().
```

Confirmed at runtime: `number("120.0") → None`. Two consequences.

- **`provenance.kvp` was `null` in every descriptor.** kVp is the acquisition
  parameter that most changes blooming at a 1600 HU threshold, so losing it
  weakens the audit trail the threshold is supposed to have.
- **The slice-spacing fallback never fired.** `voxel_dimensions` fell through to
  `math.inf` whenever `GetSpacing()[2]` was absent, so a malformed stack was
  refused rather than falling back to `SliceThickness`. Fail-safe, but not what
  the code says.

Both fixed. kVp will populate on the next first-pass extraction.

---

## 5. The two extractors did not see the same metal — medium, partly fixed

| | `endograft_geometry.py` | `extract_wire_map.py` (before) |
|---|---|---|
| series selection | most-sliced | **`ids[0]`** — GDCM order is not stable |
| component keep | ≥10% of *largest* | ≥2% of *sum* |
| HU threshold | `--hu-metal` (default 1600) | hardcoded 1600 |
| crop | ROI to metal bbox, then resample | none — resamples whole volume |
| in-plane helper | `[1,0,0]` / `[0,1,0]` | `[0,0,1]` / `[1,0,0]` |
| axis sign | normalised | **arbitrary** — finding 1 |

Series selection and axis sign are fixed. The differing component filters and
the hardcoded threshold remain: the apex rows and the wire map are still derived
from slightly different masks of the same series, which is part of why the frame
has to be fitted at all.

**Recommended:** record `provenance.series_instance_uid` in the descriptor and
have both tools read it, and assert `wire_map.hu_metal_threshold ==
provenance.hu_metal_threshold` rather than trusting that both defaults were left
alone.

---

## 6. Chirality is never pinned to the physical device — high, OUTSTANDING

**This is the most important thing still wrong, and it is the same class of
error as finding 1.**

Three places negate the axial coordinate without negating θ:

1. `--flip-z` in `endograft_geometry.py` negates `s` and leaves `θ`. All three
   scans used it (`scan_orientation: "inverted_corrected"`).
2. `axialFlip` in `lib/stentGeometry.ts` — `fabricLengthMm - rebased`, with
   `arcMm` untouched.
3. `axialFlip` in `lib/geometry/benchCtRenderModel.ts`, likewise.

Re-designating which end is proximal reverses the sense of rotation seen from
proximal. Negating z alone therefore mirrors the developed surface. Meanwhile
`lib/geometry/coordinates.ts` declares "Arc increases clockwise", so the entire
planner assumes descriptor θ increases clockwise viewed from proximal — and
**nothing in the pipeline measures or records whether it does.**

The consequence is that **left and right renal could be swapped end to end and
no test would notice.** A single marker centroid yields an angle, not a
handedness, so the information needed to settle it is not currently acquired.

**Recommended:** acquire a physical asymmetry — two markers at a known relative
clock position, or a taped fiducial — derive `datum.theta_handedness` from it,
assert it in the descriptor schema, and collapse the three flips into one
operation that negates z and θ together. This needs a physical landmark before
it needs code.

---

## 7. Apex counts are an artifact of the prominence threshold — medium, OUTSTANDING

```python
prominence = max(0.3, prominence_fraction * height)
```

`height` is the ring's *whole* axial extent, ~15 mm, and the default fraction is
0.5 — a **7.5 mm** prominence gate. That is why every ring reports a
suspiciously uniform count (7 everywhere on scan1, 5 on scan3) while the measured
wire oscillates 7, 11, 9, 7, 9, 7, 9, 7 and 5, 7, 6, 6, 11, 5, 9, 14, 11, 5.

METHODS §4.1 records the discrepancy, but the extractor still emits the wrong
counts, and they feed something load-bearing: `half_period = 180 / median(n)`
formerly bounded the rotation search. scan3's asserted n=5 gives ±36° where the
true counts (often 9–14) give ±13–20°, so the anti-aliasing guard was roughly 2×
too wide — plausibly why scan3 settled at −23°. That bound is now gone
(finding 2), which removes the coupling, but the counts are still wrong and
still drive `phase_deg`, ring-level display and the apex/valley landmarks.

**Recommended:** derive apex counts from the wire map, and scale the prominence
to the local envelope amplitude rather than the ring's total height.

---

## 8. `extract` destroys annotations and the wire map — medium, OUTSTANDING

`cmd_extract` ends with an unconditional `json_path.write_text(...)`. Every
descriptor's `rendering` block is hand-annotated — fabric edges, bare-ring
indices, `anatomical_proximal_z`, the last of which no tool writes at all — and
the wire map is added by a separate later pass. **Re-running the first pass over
`library/` silently drops all of it.**

Evidence that the blocks are manual: the extractor writes
`rendering.fabric_distal_edge_z_mm = round(covered_length, 3)`, but scan1 holds
182.9 against a `covered_length_mm` of 186.79, and scan2 holds 161.4 while its
`covered_length_mm` is `null` — a key the extractor cannot write in that branch.

There is also a units bug in that same line: `fabric_distal_edge_z_mm` is
assigned a *length*, which equals a z coordinate only while `z_zero` is the
fabric percentile — precisely the case where the operator then overrides
`--fabric-proximal-edge-z` to a non-zero value.

`tools/extract_wire_map.py` is safe by contrast: it loads the descriptor, adds
`wire_map`, and writes the whole object back. The 2026-08-07 regeneration
changed only that key, verified by diff.

**Recommended:** merge on write, or separate raw extraction from an explicit
annotation layer. **Do this before the next first-pass extraction**, which
finding 3 otherwise requires.

---

## 9. One straight axis, one radius per angle — medium, OUTSTANDING

`cylindrical_coordinates` fits a **single straight PCA axis** to the whole
device, and the wire map stores **one 90th-percentile radius per angular bin,
aggregated over the entire length**. Together these make four distinct
quantities inseparable: taper, ring ovality, decentring or sag of a 200 mm graft
resting unsupported, and axis curvature.

Decomposing scan1's `radius_mm(θ)` into harmonics gives 0.12 mm at one cycle
(decentring) and 0.27 mm at two (ovality) — but those numbers are
uninterpretable, because the aggregate already blends rings spanning 40.7 to
42.7 mm. That is the point: the representation cannot answer the question.

`wire_map.radius_mm` is typed in `benchCtDeviceLibrary.ts` and **never read**.
On the tapered scan2 it blends 42 mm and 32 mm rings into one number per angle,
ranging 18.3–21.6 mm. It should be dropped or made per-run before someone
reaches for it.

**Recommended:** store radius **per run**, which alone converts the map from a
(θ, z) chart into a genuine 3-D centreline; fit a centreline from per-slice
metal centroids instead of one straight line; fit each ring as an ellipse so
diameter, ovality and centre offset come out separately. Ovality matters beyond
rendering: on an ellipse equal angles are not equal arc lengths, and the punch
card is drawn in arc-millimetres.

---

## 10. The marker datum averages every marker into one angle — medium, OUTSTANDING

The θ datum thresholds at 2800 HU and takes the circular mean of **all** marker
voxels at once. If a device carries several markers at different clock
positions — the normal case — that mean blends unrelated landmarks. This is
almost certainly why re-deriving θ lands 19° from the recorded value on scan1,
a known instability that forced the wire map to fit its rotation rather than
recompute it.

**Recommended:** cluster the marker voxels first. That yields a set of 3-D
landmarks instead of one unstable angle: a stabler θ datum, axial landmarks, and
— critically — the **handedness** finding 6 needs.

---

## 11. Single-voxel speckle enters conflict detection — low, OUTSTANDING

Zero-length runs, i.e. isolated single voxels above the metal threshold:

| | runs | zero-length | ≤ 1 voxel |
|---|---|---|---|
| scan1 | 5,546 | 16 (0.3%) | 61 (1.1%) |
| scan2 | 7,255 | **703 (9.7%)** | 1,142 (15.7%) |
| scan3 | 6,516 | 82 (1.3%) | 219 (3.4%) |

`keep_significant` filters 3-D connected components, so an isolated voxel
attached to a real component survives and registers as metal at its angle.
A minimum run length, or the skeletonisation in §13, removes them.

---

## 12. Binary thresholding discards all sub-voxel information — low, OUTSTANDING

Both tools reduce the CT to `arr >= 1600` and never look at an HU value again,
so every run boundary lands on the resample lattice. The loss is visible in the
data: scan1's six most common run lengths are 2.10, 1.80, 1.50, 0.90, 2.40 and
1.20 mm — **exact multiples of the 0.3 mm voxel**, with nothing in between.

A 0.5 mm strut at 0.3 mm voxels is ~2 voxels wide and its HU profile is a smooth
ramp. Fitting that ramp locates the wire centre to roughly **0.05 mm instead of
0.3 mm**. It would also separate two things currently fused: the runs are the
blooming-inflated *outer extent* of metal, not the wire, so clearance is
conservative by an unknown, threshold-dependent amount.

Related: `resample_isotropic` interpolates linearly and *then* thresholds, so the
segmentation is of an interpolated image. Estimating the edge on the native grid
removes that coupling.

---

## Impact on previously computed plans

Measured by running the four-configuration matrix from
`lib/__tests__/geometryMatrix.test.ts` through `planGraft` against the old and
new descriptors. **This is one synthetic anatomy, not a series** — it shows the
shape and scale of the change, not a distribution.

**The recommended device does not change.** scan1 is recommended in all four
configurations before and after, and stays `conflict_free`. The top-line answer
looked identical throughout.

**scan1** moves by exactly the correction and nothing else: rotation **+3.52° in
every configuration**, depth unchanged in all four, arc positions all −1.27 mm
(which is 3.52° × 128.6 mm ÷ 360 to the millimetre), clearances by 0.02–0.22 mm.

**scan2** moves moderately: rotation by 0 to −8.7°, depth by up to 1 mm, worst
margin by −0.41 to **+0.62** mm. In one configuration it improves — margin
1.002 → 1.622 mm with rotation falling to exactly 0°.

**scan3** moves substantially. For four fenestrations: depth **10.00 → 18.75 mm**,
rotation **+4.03° → +21.49°**, and

| | before | after |
|---|---|---|
| RRA clearance | **+1.62 mm** | **−1.21 mm** |
| LRA clearance | **+0.02 mm** | **−2.66 mm** |

Those two holes were reported as clearing metal. They were not. In another
configuration an SMA hole's arc moves 130 mm — a wrap to the opposite side of
the graft.

**The error was largest where it was least visible.** The recommendation was
unchanged while a device's per-hole clearances flipped sign by nearly 3 mm, and
a mirrored zigzag ring still renders as a plausible zigzag ring, so the 3-D view
and punch card looked correct throughout. That is the argument for the
regression test in §2 being permanent rather than a one-off.

---

## 13. What more the DICOMs could yield

Not defects — measurement currently left on the floor. Ordered by benefit per
unit of work.

1. **Per-run radius** (§9). A few lines; converts the wire map to 3-D.
2. **Marker clustering** (§10). Small; fixes the θ instability and supplies the
   handedness §6 needs.
3. **Sub-voxel edge fitting** (§12). Moderate; makes a 0.05 mm claim honest.
4. **Skeletonisation.** The largest piece. A 3-D skeleton gives the strut graph —
   apices as graph vertices, junctions, wire gauge — which retires the apex
   model rather than patching it, settles §7 and §11, and would identify what
   scan2's long runs actually are. 10.7% of its runs exceed 5 mm and reach
   16.4 mm, in 423 of 720 bins and clustered in angular bands up to 22.5° wide:
   real structure the ring model cannot represent.
5. **Fabric as a per-angle contour** rather than two percentiles — the fabric
   edge is not flat, and the 10 mm seal rule is measured from it.
6. **Other reconstructions in the study.** A sharp kernel suits metal edges and a
   smooth one suits fabric; only one series is read.
7. **Spectral data, if the acquisition has it** — material decomposition
   separates nitinol from the markers from polyester far more cleanly than any
   single HU threshold, and is the real answer to blooming.

### On scanning in water

Considered and **not recommended as a replacement**. Working through the partial
volume for ~0.1 mm woven polyester in 0.3 mm voxels, at roughly +100 to +150 HU:
in air a fabric voxel reads about **−620 HU**, *below* the −400 window floor, so
the current window largely cannot see fabric at all; in water it reads about
**+50 HU**, where nothing else in the tube is positive except metal. So water
would help the fabric considerably.

But it would hurt the metal, which is what the project rests on. METHODS §2
justifies 80 kVp / 50 mAs because the target is high-contrast metal in air;
filling the tube introduces beam hardening and inter-strut streaking, and would
require re-tuning both the 1600 HU threshold and the 0.6 mm run-gap heuristic.

**If pursued: two scans, not one.** Keep the air acquisition for metal, add a
higher-dose water scan for fabric, and register them on the metal, which is a
rigid body present in both. Practical caution: a porous woven graft will trap
air bubbles, and a bubble reads −1000 HU — it would destroy exactly the
measurement being sought, patchily rather than obviously. Degassed water, a
wetting agent, and time to soak.

**Test before scanning anything.** Histogram the HU in a thin radial shell just
outside the metal on scan1, away from any strut. A population near −600 means
fabric *is* resolved in air and only the window and the metal mask need
changing. Its absence means a water scan is the way to get it. Zero cost, and it
decides the question.

---

## 14. Reproducing this audit

```bash
npm test
```

215 tests. `lib/__tests__/wireMapDatum.test.ts` is the frame check.

```bash
venv/bin/python tools/extract_wire_map.py --dicom-root <dir> --check
```

Reports the recovered frame per device without writing. Drop `--check` to write.
The DICOM root holds one folder per device (`4405F50`, `62CC686D`, `stent`) and
is deliberately not in version control.

The frame fit can also be validated without the DICOMs, by feeding each
descriptor its own stored wire map as if it were raw — a correct map recovers
`mirror = +1`, offset 0 and shift 0. That is how the defect was first isolated.

---

## Provenance

| | |
|---|---|
| Review date | 2026-08-07 |
| Library regenerated | 2026-08-07, commit `03a7040` |
| Extractor fixes | commit `77f5c50` |
| Source series | Canon Aquilion ONE, 2026-07-14, unchanged |
| Descriptors before | commit `1dc8dd2` |

The regeneration changed only the `wire_map` key in each descriptor; all ring
rows, datums and hand annotations are byte-identical, verified by diff.
