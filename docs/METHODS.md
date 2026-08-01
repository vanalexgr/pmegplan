# PMEGplan — methods and design

A record of how the application works, what it takes from the bench CT scans,
and which parts of it are measurement rather than assumption. Written to be
usable as source material for a methods section, so it states figures, names
the techniques, and is explicit about limitations.

Everything here describes the state of the code at the time of writing. Figures
quoted are reproducible from `library/*.json`, `tools/extract_wire_map.py` and
the test suite.

---

## 1. Problem

A physician-modified endograft (PMEG) is an off-the-shelf stent-graft that the
surgeon cuts fenestrations into on the back table so that visceral vessels stay
perfused after deployment. The cut has to land in **fabric**, in the window
between the metal struts. A hole that overlaps a strut cannot be reinforced or
stented reliably.

Two properties of the problem drive the whole design.

**The hole pattern is rigid.** The patient's anatomy fixes where the holes are
relative to each other: the distance between the SMA and the renal is what it
is. The surgeon cannot move one hole to dodge a strut without putting it in the
wrong place. Only the pattern as a whole can move, and it has exactly two
degrees of freedom:

1. how far it is pushed in below the proximal fabric edge (`d₁`), and
2. how far the graft is rotated at deployment (`θ`).

**Conflict is decided in the free state.** The wires are sutured to the fabric,
so a strut and the fabric around it deform together. Whether a hole falls in a
window is therefore a property of the unconstrained device, which is exactly
what a bench CT of that device captures. The deployed configuration matters for
*alignment* — where the hole ends up relative to the vessel — but not for
whether the hole clears metal.

Together these mean the planning problem is: given a rigid pattern and a
measured strut lattice, find `(d₁, θ)` such that every opening clears wire.

---

## 2. Source data

Three endografts were scanned on a bench, unconstrained, in air.

| | Device | Series | Volume | In-plane | Slice |
|---|---|---|---|---|---|
| scan1 | Cook Zenith Alpha Thoracic | 4405F50 | 512 × 512 × 791 | 0.412 mm | 0.300 mm |
| scan2 | Cook Zenith TX2 TAA with Pro-Form | 62CC686D | 512 × 512 × 741 | 0.366 mm | 0.300 mm |
| scan3 | Cook Zenith Alpha Thoracic | stent | 512 × 512 × 801 | 0.480 mm | 0.300 mm |

Acquisition, identical across the three: **Canon Aquilion ONE, 80 kVp, 50 mAs,
BODY_SHARP kernel, AiCE 0.5 reconstruction, 0.5 mm slice thickness
reconstructed at 0.3 mm interval.** Scanned 2026-07-14.

Low kV and a sharp kernel are appropriate here: the target is high-contrast
metal in air, so photon starvation is not a concern and edge definition matters
more than noise.

The platforms are confirmed. The **nominal sizes are not** — they are inferred
from the measured geometry, and section 9 records where that inference is weak.

Raw DICOM is deliberately not in version control. The repository is public and
the three series total roughly 380 MB; only the derived descriptors are tracked.

---

## 3. Extraction pipeline

Implemented in `new plan/files/endograft_geometry.py` (initial extraction) and
`tools/extract_wire_map.py` (the wire map, section 4).

### 3.1 Resampling and segmentation

1. Read the series with SimpleITK, resample to **0.3 mm isotropic** (linear).
2. Threshold metal at **HU ≥ 1600**. Nitinol and stainless in air sit far above
   this even allowing for blooming; the value is recorded per descriptor so it
   is auditable rather than implicit.
3. Threshold radiopaque markers separately at **HU ≥ 2800**.
4. Connected-component labelling, keeping every component holding at least 2%
   of total metal signal.

Point 4 matters and is easy to get wrong: **the stent rings are separate
connected components.** Reducing to the largest component — the obvious move —
keeps exactly one ring. The component count recovers the ring count directly:
8, 7 and 10 for scan1, scan2 and scan3.

### 3.2 Cylindrical frame

Metal voxels are converted to physical coordinates
(`TransformContinuousIndexToPhysicalPoint`, so image origin and direction are
respected), then:

1. **Principal axis** by SVD of the mean-centred point cloud. The first right
   singular vector is the device axis.
2. An in-plane basis `(u, v)` is formed by crossing the axis with a helper
   vector.
3. Each voxel becomes `(z, r, θ)`: axial position along the axis, radius, and
   angle in the `(u, v)` plane.

**A caveat that later cost real effort:** because `u` is derived from a helper
vector, any small difference in the fitted axis rotates the entire in-plane
frame. The basis is therefore *not reproducible between runs*, which is why the
wire map has to fit its rotation rather than recompute it (section 4.2).

### 3.3 Datums

- **Axial (`z = 0`)** at the **proximal fabric edge**. The fabric is a thin
  shell that morphological opening destroys, so it is found instead by taking
  voxels in an HU window (−400 to 600, polyester/ePTFE in air) that lie in a
  radial band around the stent wall, and taking the 1st percentile of their
  axial extent. `z` increases distally.
- **Angular (`θ = 0`)** at the **radiopaque marker centroid**, giving a datum
  tied to a feature visible on the physical device rather than an arbitrary
  frame.

Both are recorded per descriptor (`datum.z_zero`, `datum.theta_zero_deg_in_scan_frame`).

**Where this failed:** on scan2 the fabric could not be segmented, and the
extractor fell back to `z_zero: "metal"` — the proximal extent of metal. Its
`covered_length_mm` is null as a result. Its fabric edge is therefore an
annotation, not a measurement, and everything resting on the 10 mm seal rule is
weaker for that one device.

### 3.4 Per-ring descriptors

For each ring component, sampling `z_min(θ)` and `z_max(θ)` over 360 angular
bins and taking circular peaks gives the **apices** — the proximal apices are
the circular minima of `z_min`, the distal apices the circular maxima of
`z_max`. Recorded per ring: apex count, apex positions `(θ, z)`, ring height,
phase, and diameter (twice the 90th-percentile radius of that ring's metal).

Quoted apex localisation uncertainty: **0.41 mm (scan1), 0.37 mm (scan2),
0.48 mm (scan3)**.

---

## 4. The wire map

This is the central methodological point of the project.

### 4.1 Why apices are not enough

The descriptors above hold 10–28 apex points per ring. The CT holds **6,350 to
31,100 metal voxels per ring**. The original application reconstructed the strut
path by fitting a Catmull-Rom spline through the apices — so over 99% of the
measurement was discarded and the clearance field, the thing that decides
whether a fenestration lands in fabric, was computed from an *interpolated*
path.

Two findings made that untenable:

- **Rings are not the uniform zigzags the apex model assumes.** Counting
  oscillations of the measured wire around the circumference gives 7, 11, 9, 7,
  9, 7, 9, 7 across scan1's rings, against a descriptor asserting seven
  everywhere. scan3 is worse: 5, 7, 6, 6, 11, 5, 9, 14, 11, 5 against an
  asserted five.
- **The TX2's struts are not describable by the apex model at all.** Its median
  axial metal extent per half-degree runs 2.4–11.8 mm, where a single ~0.5 mm
  strand with blooming gives about 2 mm (as scan1 and scan3 do).

A plan cannot be called CT-derived when the geometry it is computed against is a
curve fitted through fourteen points per ring.

### 4.2 Representation

For each of **720 angular bins (0.5°)**, the map records the **axial intervals
in which the scan found metal** — `[z_start, z_end]` pairs, in the descriptor's
own `z` and `θ` datums. Samples within 0.6 mm (two isotropic voxels) axially are
merged into one run, on the basis that a gap smaller than that is blooming
rather than fabric.

| | Apex points stored | Measured runs |
|---|---|---|
| scan1 | 112 | **5,552** |
| scan2 | 180 | **7,191** |
| scan3 | 100 | **6,501** |

Median run length is 1.80 mm on the Alphas — consistent with a ~0.5 mm wire plus
blooming. Median runs per bin is 8, 9 and 10, matching the ring counts.

This representation has three properties that matter:

- It is **what conflict detection actually wants**. The fabric window at a given
  angle is the gap between one interval and the next.
- It **carries the bare fixation ring and any barbs for free**, with no special
  handling; they are simply metal at negative depth.
- It **assumes nothing about ring shape**, so a device whose struts the apex
  model cannot describe is still represented correctly.

### 4.3 Frame recovery and validation

The map is written into each existing descriptor's frame rather than
regenerated, so the fabric edges and bare-ring annotations keep their meaning.
This requires reproducing a frame that, per section 3.2, is not reproducible.

The solution: **fit the frame, and use the fit as the validation.**

- **θ** comes from the recorded datum, not re-derived. Re-deriving it from the
  marker centroid lands **19° away on scan1** — the marker segmentation is not
  stable enough.
- **Axis sign, axial offset and a residual rotation** are fitted by minimising
  the distance from each stored apex to the nearest measured metal boundary at
  its angle.

The fit is heavily over-determined — three parameters against 100–180 apices
spread down the whole device — so a small residual cannot be coincidence.

| | axis sign | z offset | θ shift | **residual p50** | residual p95 |
|---|---|---|---|---|---|
| scan1 | −1 | 85.409 mm | −1.91° | **0.102 mm** | 0.239 mm |
| scan2 | +1 | 90.373 mm | +3.50° | **0.625 mm** | 11.916 mm |
| scan3 | +1 | 93.281 mm | −23.00° | **0.680 mm** | 17.921 mm |

All three are sub-millimetre at the median against 0.3 mm voxels; scan1 is
sub-voxel. The script refuses to write above a threshold, and did refuse twice
during development while the fit was wrong.

**Two traps, both now guarded in code:**

1. *Matching against the wrong thing.* An apex must be matched to a **run
   boundary at its own angle**, not to the device-wide envelope — which at any
   angle spans every ring. Getting this wrong produced residuals of 62–79 mm.
2. *Rotational aliasing.* A ring with `n` apices repeats every `360/n` degrees,
   so a rotation search wider than half that period can settle one whole period
   out. This happened: the first scan2 fit returned **+31°** against a 30°
   period. It looks identical on an idealised ring but misaligns every measured
   irregularity — the very thing the map exists to preserve. The search is now
   bounded by `180/n`.

**The wide p95 tails are a finding, not a defect in the fit.** They are apices
the peak detector placed where the scan has no metal — the same defect as the
oscillation-count mismatch in 4.1. Conflict no longer depends on the apex rows,
but they still drive ring-level display and the apex/valley landmarks, so
re-deriving them from the wire map is outstanding work.

---

## 5. What is measured and what is not

Stating this plainly matters more than any single figure.

**Measured from CT:**
- Strut positions, as 5,552–7,191 metal intervals per device
- Ring diameters, heights, apex counts and phase
- Device diameter profile (including the TX2's taper)
- Fabric proximal and distal edges — **on scan1 and scan3 only**
- Bare fixation ring presence and extent

**Annotated, not measured:**
- Fabric edge on **scan2** (segmentation failed; fell back to proximal metal)
- Bare-ring indices and device topology
- Nominal sizes (inferred from measured geometry; see section 9)

**Not resolved at all:**
- **Barbs.** The segmentation finds *no metal whatsoever* beyond the fixation
  ring's own apices — 0.00 mm on scan1, 0.03 mm on scan3. An earlier version
  extruded barbs from an annotated 5.5 mm length and drew them on the cutting
  template; that put wire on a marking template where the scan found none, and
  they were removed.

---

## 6. Planning model

### 6.1 Input: anatomy, not device geometry

The surgeon enters:

1. **The full splanchnic chain** — coeliac, SMA, both renals — as centreline
   gaps between consecutive vessels, ostium diameters, and clock positions on
   axial CT (12:00 anterior, 3:00 patient's left).
2. **Which vessels take a fenestration.** Anything unticked is *preserved*, not
   covered.
3. **Aortic diameter at the seal zone** and **healthy aorta above the top
   vessel**.

The whole chain is required even when only the renals are fenestrated, because
an unfenestrated vessel still constrains the plan (6.3).

The chain is walked into a single cranial-positive axis with the datum at the
lowest renal ostium (falling back to the most distal vessel if no renal is
present).

### 6.2 Constraints

- **Seal:** the most proximal fenestration sits at least **10 mm** below the
  proximal fabric edge. Scallops are not used in this workflow, so this applies
  uniformly and cannot be sidestepped by an edge cut.
- **Rotation:** capped at **±45°**, accepting a deeper pose rather than a larger
  turn.
- **Oversizing:** **10–30%** at the proximal seal, judged against the **labelled**
  diameter (see 9.2).

### 6.3 The preserved-vessel bound

A vessel that is preserved rather than fenestrated caps how far the pattern can
be pushed in: raising the fabric edge past its **inferior ostial margin**
(`z − ostium/2`) would cover a vessel meant to stay perfused.

This is why the SMA-to-renal distance is decisive in a juxtarenal repair: the
entire seal zone has to fit between the SMA's lower margin and the highest
renal. It yields a device-independent preoperative triage threshold —

> **SMA-to-highest-renal ≥ 10 mm + SMA ostium radius**
> (14.5 mm for a 9 mm ostium)

— below which a two-fenestration juxtarenal PMEG cannot seal, and the SMA needs
a fenestration of its own. The application reports the limiting vessel by name.

---

## 7. Solver

### 7.1 Clearance field

Per-pose iteration over every strut segment is too slow for interactive use with
5,500+ segments. Instead a **distance field** is precomputed once per device:

- Rasterise the wire onto a grid at **0.25 mm** cells.
- Tile the grid **three times circumferentially** so the seam wraps correctly.
- Run the **exact 1-D squared Euclidean distance transform of Felzenszwalb &
  Huttenlocher** separably — along rows, then columns.
- Extract the middle tile.
- Subtract **half a cell diagonal** so the result is a guaranteed *lower bound*
  on true distance — the field never reports more clearance than exists.

Queries use bilinear interpolation with row clamping and column wrapping.
Verified against brute-force segment distance over 3,000 samples: worst
overestimate < 0.05 mm, worst underestimate < 0.5 mm.

One implementation note worth recording: the "no wire here" sentinel **must be
finite**. Using `Infinity` makes the transform compute `Infinity − Infinity =
NaN`, the parabola comparison always fails, and the sweep index decrements
without bound.

### 7.2 Pose search

Because the pattern is rigid, `d₁` and `θ` are scanned **together** on a 2-D
grid at 0.25 mm resolution. Scanning them sequentially is wrong: a depth that
looks best on its own can foreclose the rotation that would have cleared every
hole.

**Selection rule:** the *shallowest* depth having a rotation within the turn cap
that meets the clearance target (default 1 mm); among those, the *smallest*
turn. Maximising clearance outright would push the fabric edge as far cranially
as constraints allow, buying fractions of a millimetre at the cost of real
aortic coverage.

Where the cap rejects a better pose, the application reports what was given up
rather than silently returning the degraded answer.

### 7.3 Margin is robustness

Because the pattern is rigid, translating it by any distance up to the worst
opening clearance cannot create a conflict. **The worst clearance therefore *is*
the radius of the conflict-free neighbourhood.**

This collapsed three subsystems in the original application — a rotation
optimiser, a depth optimiser, and a 41-scenario perturbation simulation — into
one 2-D scan whose output already carries the robustness figure.

### 7.4 A rejected optimisation

An idealised ring with `n` apices is `n`-fold symmetric, so the lattice appears
to repeat every `360/gcd(apex counts)` degrees, and the rotation search could be
restricted to one period.

**This was implemented, measured, and removed.** Rings are only `n`-fold
symmetric if their apices are *evenly spaced*, and measured apices are not.
Applying the periodicity degraded scan3's clearance from 1.08 mm to 0.10 mm — it
discards the very irregularity the bench CT was taken to capture. The function
is retained and tested but off by default, with the reasoning recorded.

The same reasoning underlies the aliasing guard in 4.3.

---

## 8. Outputs

Device geometry, clearance and all three views are driven from the same wire
map, so they cannot disagree.

**Flat view** — the graft unrolled to one scale in both axes. Measured wire, the
region *above* the fabric edge (where the Alphas' fixation ring sits, ~12 mm
proximal), the seal band, hourly clock grid, and openings at true diameter.

**3-D view** — the device reconstructed by azimuth/elevation rigid-body
projection, drawn from the scan's own diameter profile so a tapered device
tapers because it was measured to. Near/far surface sorting, drag to rotate and
tilt, zoom, and hour lines down the near surface. Selecting a hole turns the
graft to face it.

**Hole measurements** — selecting an opening reports the free fabric above,
below and to each side, plus the nearest apex above and valley below with clock
positions and offsets, drawn on the graft along the line each was measured.

The slide-distance geometry needs care: sliding a circular hole toward a strut,
its rim is only `radius` away *straight on*; offset sideways by `lateral`, the
rim is nearer by the chord half-width `√(r² − lateral²)`. Measuring to the flat
of the hole instead reported 0.1 mm of room where there was 1.6 mm.

**Punch card** — a 1:1 cutting template rendered at 96 dpi with one canvas unit
per millimetre: measured wire, seal line, hourly clock grid labelled top and
bottom, depth scale, and each opening at true diameter with a punch cross
extending past the rim. A 50 mm calibration rule is drawn on it; printing hides
all other page content, since a browser will otherwise scale the sheet to fit.

*A canvas pitfall worth recording:* `ctx.font` is parsed by the CSS font
shorthand grammar, which **rejects `var()` and leaves the previous value in
place**. The assignment fails silently and the canvas keeps its `10px
sans-serif` default — which, in a coordinate system where one unit is a
millimetre, renders every label 10 mm tall.

---

## 9. Limitations

### 9.1 Library coverage

Three devices is a demonstration, not a library. At 10–30% oversizing they cover
roughly **24–29 mm** and **32–38 mm** of aortic diameter — with a **gap at
29–32 mm**. The application declines that gap explicitly rather than
interpolating a device for it, which is the intended behaviour: it reports which
device is worth scanning next.

### 9.2 Nominal sizes are inferred

The platforms are confirmed; the sizes are not. Evidence differs per device:

- **scan3** is the good case. Body rings measure 31.6 mm against a nominal 32,
  and measured covered length 199.1 mm against a catalog 201 — under 2 mm out.
- **scan1**'s diameter holds (body rings 42.3 against nominal 42) but its
  **length does not**: measured covered length is **186.8 mm**, and the Alpha 42
  series offers only 121/147/173/225 mm. The recorded 173 is **13.8 mm out**,
  with no better candidate. Since the same measurement matches scan3 to within
  1.9 mm, this is a real discrepancy rather than noise.
- **scan2** is weakest: its fabric could not be segmented at all, so its 165 mm
  rests entirely on an annotation.

A related correction is worth recording because it ran the wrong way. Oversizing
was briefly computed against the **measured** sealing-ring diameter, on the
reasoning that it should be judged where sealing happens. That measurement is
twice the 90th-percentile radius of the ring's *metal*, so it sits inside the
fabric surface; and the proximal ring is genuinely narrower than the body in the
free state (40.7 vs 42.3 on scan1, 29.8 vs 31.6 on scan3) because nothing holds
the end open on the bench. The result was **13% reported where the label gives
17%** — understating oversizing, which is the direction that makes an undersized
device look acceptable. Oversizing now uses the labelled diameter; the unrolled
circumference stays on measured geometry, since rescaling it would move every
strut relative to every hole.

### 9.3 Apex rows remain idealised

Section 4.1's oscillation counts and section 4.3's p95 tails are the same
defect. Conflict detection no longer depends on the apex rows, but they still
drive ring-level display, the sealing-ring geometry, and the apex/valley
landmarks offered as marking references.

### 9.4 Free state only

Everything is measured unconstrained. As argued in section 1 this is the correct
frame for strut conflict, but it is *not* the deployed configuration, and the
application does not model deployment.

### 9.5 Not clinically validated

No bench cutting, no imaging of a modified device against its plan, no clinical
series. The clearance figures are geometric predictions from a free-state scan.

---

## 10. Implementation

Next.js 16 App Router, React 19, TypeScript, Tailwind 4. Geometry extraction in
Python (SimpleITK, NumPy, SciPy).

- `tools/extract_wire_map.py` — wire map extraction and datum fitting
- `library/*.json` — per-device descriptors including the wire map
- `lib/planning/anatomy.ts` — anatomy model, chain normalisation, opening placement
- `lib/planning/clearanceField.ts` — distance transform
- `lib/planning/poseSolver.ts` — 2-D pose search
- `lib/planning/plan.ts` — device selection and the planning pipeline
- `lib/planning/holeMeasurements.ts` — per-hole marking measurements
- `lib/stentGeometry.ts` — wire map to strut segments
- `components/` — flat view, 3-D view, punch card, planner

Roughly 111 unit tests. Clearance-field accuracy, seam wrapping, datum
agreement, and the slide-distance geometry are all covered by tests asserting
against independently computed values rather than recorded outputs.
