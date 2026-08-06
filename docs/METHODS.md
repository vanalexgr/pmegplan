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

### 3.5 Width along the device

Each descriptor also carries a `diameter_profile`: one diameter per axial slice,
straight from the segmenter. **It is not used**, and the reason is worth
recording because the failure is quiet.

The profile drops out wherever segmentation lost the device — scan3 reads
**25.7 mm at z = 119** on a 32 mm graft, and has similar dropouts at z = 51, 77,
94, 114, 178 and 180 — and between rings it measures fabric with no metal behind
it. Interpolating through that gave the two *cylindrical* Zenith Alphas a taper
they do not have (scan1 swinging 128 to 134 mm of circumference, scan3 92 to
106) and put steps and reversals in the TX2's real one.

The width at a depth is therefore taken from the **ring diameters** — one fitted
number per ring, at the ring's centre — with straight lines between them. This
reproduces scan2's 42-to-32 taper monotonically and removes the invented one
from the other two. A test asserts the monotonicity, because the raw profile
could not hold it.

**Bare fixation rings are excluded from this profile**, because it is the width
of the *fabric*. A bare ring sits above the fabric edge with nothing holding it
in, so it splays: 43.4 mm against a 40.7 mm first covered ring on scan1, and
36.1 against 29.7 on scan3. Including it put the circumference at the fabric
edge 13% wide on scan3 — and that circumference is the frame the clearance
raster wraps in and the punch card is drawn at. Apices are drawn at **their own
ring's** diameter rather than off this profile, so the flare is still rendered
where the scan found it.

The remaining consequence is that the circumference at the fabric edge is
*narrower* than the label on both Alphas — 40.7 and 29.7 against 42 and 32 —
because the proximal ring relaxes inward on the bench. That is the free state,
not an error, and it is deliberately not corrected: rescaling would move every
strut relative to every hole. Oversizing is judged against the label instead
(9.2). Measured from the fabric edge, both Alphas therefore widen slightly
toward the body, which is the opposite sign from a design taper — the matrix
test asserts the sign rather than a magnitude, since a magnitude bound would
only have hidden the bare-ring contamination.

This matters more than a rendering detail: since section 6.4 every
circumferential millimetre the surgeon measures is converted at the local
circumference, so this curve determines the marking template.

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
2. **How each vessel is treated** — fenestrated, scalloped, covered, or
   preserved. Preserved is the default: anything not named is kept perfused and
   constrains the plan accordingly.
3. **Aortic diameter at the seal zone** and **healthy aorta above the top
   vessel**.

A vessel that lies *between* two fenestrated vessels cannot be preserved — the
fabric runs over it at every pose. That anatomy is refused at input with a
reason rather than solved. It used to produce a negative push-in ceiling and so
a silent refusal of every device, on configurations as ordinary as fenestrating
the coeliac, SMA and left renal while leaving the right renal.

The whole chain is required even when only the renals are fenestrated, because
an unfenestrated vessel still constrains the plan (6.3).

The chain is walked into a single cranial-positive axis with the datum at the
lowest renal ostium (falling back to the most distal vessel if no renal is
present).

### 6.2 Constraints

- **Seal:** the most proximal fenestration sits at least **10 mm** below the
  proximal fabric edge. A scallop does not sidestep this: the cut seals nothing,
  so the rule is applied below the cut rather than below the nominal edge.
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

### 6.4 Angle is the coordinate, millimetres are derived

An opening's circumferential position is carried as a **fraction of a turn**,
and converted to millimetres at **that opening's own depth**, using the local
circumference from section 3.5.

The alternative — one circumference for the whole device, the proximal one — was
what the planner did originally, and it is wrong on a tapered graft in a way
that hides well. Both hole arcs and wire arcs were computed as `angle × C₀/2π`,
so their *angular* relation was preserved and strut-conflict detection was
sound. What was wrong was every circumferential millimetre below the taper.
On scan2, measured against its own ring profile:

| depth below fabric edge | true circumference | overstated by |
|---|---|---|
| 0 mm | 133.8 mm | — |
| 50 mm (renals, typical case) | 126.9 mm | 5.4% |
| 80 mm | 111.7 mm | 19.8% |
| 100 mm | 104.3 mm | 28.3% |

(scan2 carries no bare fixation ring — the TX2 proximal component is covered to
its edge with internal barbs — so its fabric edge and its metal top are the same
plane, and the figures above need no adjustment for 3.5's exclusion.)

scan1 and scan3 are cylindrical, so this reads as "the arithmetic is different
for different devices" — it is, and scan2 is the odd one out. It affected
reported clearances, hole-to-hole spacing, the scallop's edge-to-edge bridge,
the clock a hole is labelled with, and most seriously the punch card, which is
the thing that gets measured against.

Two frames therefore coexist and are named in the code:

- the **reference frame** at the proximal circumference, which is where the
  strut map and the clearance raster live, and the only frame in which holes and
  struts line up;
- each opening's **local frame** at its own depth, which is what a tape laid
  round the graft there would read.

Angles are preserved between them; millimetres are not. A distance read off the
raster is scaled by `C(depth)/C₀` to bring it back onto the graft.

### 6.5 Scallops

A scallop is a **specification, not a by-product**. The alternative — deriving
the cut from whatever depth each device happened to be solved at — gave one
anatomy three different scallops, which is what first exposed section 6.4.

- **Shape.** Always a U: parallel sides running down from the fabric edge,
  closed by a semicircle of the cut's own half-width. Every manufactured spec
  found has height ≥ half the width, so the U is always well-formed. Where a
  device cannot sit deep enough to carry the requested width, the cut *narrows*
  to the widest semicircle that fits rather than flattening into a saucer
  nothing is made as.
- **Size.** Default width 20 mm, as a ceiling. Reference points: Cook ZFEN
  scallops are 10 mm wide and 6–12 mm high; a Cook custom arch device runs
  30 × 20 mm.
- **Depth.** The nadir sits at the scalloped ostium's **caudal rim**, not its
  centre, so no fabric crosses the vessel. Both figures are reported: the cut
  depth, and the nadir-to-centre distance a Cook plan sheet quotes.
- **Consequence for the search.** A specified scallop fixes the push-in, leaving
  the solver rotation alone. Devices that cannot clear at that pose are flagged
  with the smallest change in cut that would clear, so the trade between seal and
  clearance is visible rather than silently taken.

The fabric bridge between the cut and the nearest opening is measured **edge to
edge on the unrolled graft**, over the seam where that is the shorter way round.
Note that edge-to-edge does not bound nadir-to-centre and vice versa: the first
is a shortest path, the second a purely axial run, so where the two are far
apart on the clock the real fabric between them is the longer of the two. What
must hold — and is asserted — is that a positive bridge and a merged aperture
cannot coexist.

The application states no minimum bridge, because there is no universal one.

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

**Taper.** The raster has a single wrap period and so must be built in the
reference frame (6.4). On a tapered device that frame is stretched
circumferentially wherever the graft is narrower, so a distance read off it is
longer than the fabric it crosses; the query scales by `C(depth)/C₀` on the way
out. This is exact where the nearest wire lies beside the point — which on a
lattice of near-circumferential struts is the usual case — and where it lies
above or below, the axial component is shrunk too and the answer comes out
short. Short is the safe direction for a field whose contract is to be a lower
bound.

A second note, this one about cost: the scale factor must be **tabulated per
grid row**, not evaluated per query. Reading the diameter profile inside
`distanceAt` — called millions of times in one sweep — took the test suite from
4 seconds to over three minutes. One value per 0.25 mm row is finer than the
profile itself.

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

When a scallop is specified (6.5) the depth is **pinned** rather than searched,
and only rotation is free. The pinned pose is still evaluated against the field,
so a device that cannot take the cut is reported as such together with the cut
it could take.

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
proximal), the seal band, hourly clock grid, openings at true diameter, and the
scallop cut into the proximal edge so the edge the view draws is the edge after
modification. This view is deliberately drawn in the **reference frame**: it
exists to show which window a hole falls in, and that relationship only holds in
the one frame where holes and struts share a ruler. Openings are therefore drawn
at `turn × C₀` and their widths stretched by `C₀/C(depth)`.

**3-D view** — the device reconstructed by azimuth/elevation rigid-body
projection, drawn from the scan's own ring profile so a tapered device tapers
because it was measured to. Near/far surface sorting, drag to rotate and tilt,
zoom, and hour lines down the near surface. Selecting a hole turns the graft to
face it. Everything here is placed by **angle**, which is the frame a cylinder
is naturally drawn in; a hole's width in angle is its arc over the local
circumference, so the same physical hole subtends more of a narrow device than a
wide one — as it does on the bench.

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

The sheet is drawn in the reference frame, for the same reason as the flat view.
**On a tapered device that makes it a guide to which window a hole falls in and
not a wrapper**, and it says so: where the taper exceeds 2 mm over the sheet it
carries the true circumference at the fabric edge and at the deepest hole
(134 mm and 116 mm on scan2 for the four-vessel case). The cut list beside it
gives each hole's arc from 12:00 **measured at that hole's own depth**, which is
the number to mark by. A full conical development of the sheet is not
implemented; this is the honest interim.

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

Those same free-state figures are what the circumference at the fabric edge now
resolves to (3.5), so the two sections are describing one fact from two sides:
the proximal ring is narrower than the label, oversizing must not be read from
it, and the geometry frame must not be rescaled to it.

### 9.3 Apex rows remain idealised

Section 4.1's oscillation counts and section 4.3's p95 tails are the same
defect. Conflict detection no longer depends on the apex rows, but they still
drive ring-level display, the sealing-ring geometry, and the apex/valley
landmarks offered as marking references.

### 9.4 The taper is handled, not eliminated

Three approximations remain after section 6.4, all on the one tapered device:

1. **The clearance field** is rasterised in the reference frame and scaled on
   query. Exact for circumferential separation, conservative for axial — it
   reports less clearance than exists, never more.
2. **The printed sheet** is a cylindrical development of a conical surface. It
   preserves which window a hole is in, not the distance round the graft; the
   cut list carries the latter.
3. **The scallop's width** is treated as a constant angle over the cut's depth,
   since it is marked from the fabric edge. On scan2 that is a 1.3% error over
   29 mm.

Each is documented at the point it is taken, and each is in the direction that
does not make a plan look better than it is.

### 9.5 Free state only

Everything is measured unconstrained. As argued in section 1 this is the correct
frame for strut conflict, but it is *not* the deployed configuration, and the
application does not model deployment.

### 9.6 Not clinically validated

No bench cutting, no imaging of a modified device against its plan, no clinical
series. The clearance figures are geometric predictions from a free-state scan.

---

## 10. Implementation

Next.js 16 App Router, React 19, TypeScript, Tailwind 4. Geometry extraction in
Python (SimpleITK, NumPy, SciPy).

- `tools/extract_wire_map.py` — wire map extraction and datum fitting
- `library/*.json` — per-device descriptors including the wire map
- `lib/planning/anatomy.ts` — anatomy model, chain normalisation, opening and
  scallop placement, the bridge measurement
- `lib/planning/clearanceField.ts` — distance transform
- `lib/planning/poseSolver.ts` — 2-D pose search
- `lib/planning/plan.ts` — device selection and the planning pipeline
- `lib/planning/holeMeasurements.ts` — per-hole marking measurements
- `lib/geometry/benchCtRenderModel.ts` — ring profile, apex points, fabric extent
- `lib/stentGeometry.ts` — wire map to strut segments
- `components/` — flat view, 3-D view, punch card, planner

209 unit tests. Clearance-field accuracy, seam wrapping, datum agreement, and
the slide-distance geometry are all covered by tests asserting against
independently computed values rather than recorded outputs.

`lib/__tests__/geometryMatrix.test.ts` runs the configuration matrix — four
fenestrations; three with the coeliac preserved; two renals with the SMA
scalloped; three with the coeliac scalloped — against **all three scans**, plus
the edge cases (single fenestration, no renals, a covered vessel, a cut
straddling the 12:00 seam, a vessel that cannot be preserved). It asserts clock
in equals clock out at every opening's own circumference, that the entered gaps
survive, that the nadir lands on the caudal rim, and that the cut's **sampled
outline** is identical on every device — a shape assertion, not just width and
height, since the reported bug was a difference in shape.
