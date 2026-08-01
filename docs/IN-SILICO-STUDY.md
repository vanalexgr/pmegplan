# In-silico study protocol

A study design that is publishable with the three devices currently scanned, and
pilot results showing the effects are large enough to be worth running properly.

---

## 1. Why three devices is not the limiting factor

The instinct is that n=3 devices means n=3. It does not, because **the device is
not the sampling unit — the anatomy is.** Each simulated anatomy is an
independent planning problem; the devices are a fixed factor.

Three devices limits **generalisability** (two platforms, one manufacturer),
which belongs in the limitations. It does not limit **power**.

---

## 2. Primary question

Does device-specific strut geometry change whether a PMEG plan is feasible, and
by how much?

Every arm is evaluated against the **same measured geometry**. Arms differ only
in what information the *planner* was allowed to use. That is what makes the
comparison fair — it isolates the contribution of the information, not of the
evaluation.

### Arms

**A — rotation only (manual-equivalent).** Push-in fixed at the seal minimum;
search rotation alone. This models the current workflow, where the punch card is
drawn from anatomy and struts are avoided by rotating the device inside the
printed tube. Depth is not a free variable at the back table: it is set when the
seal is chosen.

**B — joint search (this application).** Search `(d₁, θ)` together against the
measured wire map.

**C — idealised lattice (optional).** Plan against a uniform parametric zigzag
built from the nominal apex count, then *evaluate the resulting pose against
measured geometry*. This isolates the cost of assuming regularity, separately
from the cost of having no strut data at all.

### Outcomes

- **Primary:** proportion of anatomies with a conflict-free plan (every
  fenestration clearing wire).
- **Secondary:** worst-hole clearance distribution; push-in depth required;
  rotation required; proportion needing >45°; per-device minimum feasible depth;
  proportion where the device choice is decisive.

---

## 3. Pilot results

1,000 Monte Carlo four-vessel anatomies, 952 plannable, deterministic seed.
Sampling ranges — coeliac–SMA 12–26 mm, SMA–renal 14–32 mm, inter-renal 2–12 mm,
ostia 5–10 mm, seal zone 32–38 mm, clocks within physiological sectors.

| Arm | Conflict-free | Median worst-hole clearance |
|---|---|---|
| **A** rotation only at 10 mm seal | **37 / 952 = 3.9%** | −1.79 mm |
| **B** joint depth + rotation | **446 / 952 = 46.8%** | −0.12 mm |

409 anatomies were rescued by the second degree of freedom. 501 (53%) had no
conflict-free plan under either arm on this three-device library.

**The 53% is a result about library size, not about PMEG.** It says a
three-device library fails outright on half of this anatomy range — which is the
argument for scanning more devices, stated in the study's own data.

### Why arm A collapses — the mechanism

Not adversarial sampling. Measuring the fraction of the circumference that admits
an 8 mm hole, by depth:

| Depth below fabric edge | scan1 `ZTA-P-42` | scan2 `ZTEG-2PT-42-32` | scan3 `ZTA-P-32` |
|---|---|---|---|
| **10 mm** | **0%** | **0%** | **2%** |
| 14 mm | 25% | 0% | 25% |
| 18 mm | 46% | 0% | 47% |
| 20–22 mm | 73–74% | 0% | 35–39% |
| 25 mm | 38% | 24% | 19% |

At the 10 mm seal minimum, **essentially no circumferential position on any
device admits an 8 mm fenestration.**

The cause is the proximal sealing ring, which is a distinct and taller stent than
the body rings:

| Device | Sealing ring occupies | Its height | Body ring height |
|---|---|---|---|
| `ZTA-P-42` | 0 → 15.9 mm | 16.2 mm | 14.9 mm |
| `ZTEG-2PT-42-32` | 0 → 21.7 mm | 22.4 mm | 15.3 mm |
| `ZTA-P-32` | 0 → 16.6 mm | 17.2 mm | 15.5 mm |

A fenestration at 10 mm depth sits **inside** that ring. Usable fabric appears
only once the pattern clears it, at roughly 18–22 mm on the Alphas.

**This yields a device-specific rule that is simple, clinically actionable, and
as far as I know unpublished:**

> The minimum practical push-in is not the seal rule. It is the distal extent of
> the proximal sealing ring — 15.9, 21.7 and 16.6 mm on these three devices.

It also explains why the TX2 never wins a four-vessel plan: its sealing ring is
22.4 mm tall, and no depth from 10 to 22 mm admits an 8 mm hole anywhere on its
circumference.

### Device choice

Separately, across 288 anatomies with two usable devices of the **same 42 mm
labelled size and the same oversizing**, the choice was decisive in **228 (79%)**
— one cleared, the other did not — with a median clearance spread of **3.44 mm**.
The best device did not vary with anatomy, however (see `DEVICE-SELECTION.md`).

---

## 4. What must be reported honestly

**Arm B buys its advantage with aortic coverage.** Median push-in was 19.0 mm
against arm A's fixed 10 mm — roughly 9 mm of additional covered aorta. The
second degree of freedom is not free, and a paper that reports the feasibility
gain without the coverage cost is misleading. Report the depth distribution
alongside the primary outcome.

**Arm A is a model, not a measurement.** No surgeon was observed. It represents
the manual workflow's information constraint; it does not claim to reproduce any
individual's practice.

**53% infeasibility is not a claim about clinical PMEG.** Real practice resolves
some of these by displacing struts or accepting marginal clearance — the
compromises this tool exists to avoid. The figure is conditional on strict
conflict-free geometry and this library.

---

## 5. The single strongest upgrade

**Replace Monte Carlo anatomy with a consecutive patient series.**

Synthetic anatomy is the weakest part of the design and the easiest to fix. A
retrospective series of consecutive FEVAR/PMEG cases — vessel spacing, clock
positions, ostium diameters, seal-zone diameter, all already measured for the
procedural plan — converts this from "in-silico on simulated anatomy" to
"in-silico on real anatomy", which is a materially different paper.

It also permits a stronger secondary analysis: for cases actually treated, how
does the plan the tool produces compare with the plan that was used, and did the
struts fall where the tool predicts?

The EndoDraft study used exactly this design — 38 consecutive patients,
retrospective procedural data, ethics approval — and it is the reason their paper
is convincing despite being a bench study.

---

## 6. Bench validation, if any is possible

One or two devices cut to a generated template, re-scanned, and the achieved
clearances measured against prediction would de-risk the whole method. It
addresses the circularity that limits the EndoDraft paper, where manual accuracy
was measured against their own software rather than a physical truth.

Even n=1 changes the discussion from "geometric prediction" to "geometric
prediction, verified once".

---

## 7. Proposed structure

**Title** — *Bench-CT-derived strut geometry determines feasible fenestration
placement in physician-modified endografts: an in-silico study*

**Methods** — device scanning and wire-map extraction (`METHODS.md` §2–4);
anatomy source; the three arms; outcomes; the evaluation being common to all arms.

**Results** — primary feasibility comparison; the depth-availability table and
sealing-ring finding; largest inscribable hole per device; device-choice analysis;
coverage cost.

**Discussion** — strut geometry is a first-order determinant of feasibility and is
invisible to sizing; the sealing ring sets the true minimum push-in; library size
is the binding constraint; positioning against EndoDraft as complementary
(`RELATED-WORK.md` §7).

**Limitations** — three devices, two platforms, one manufacturer; synthetic or
retrospective anatomy; free state only; no bench or clinical validation; arm A a
model of the manual workflow rather than an observation of it.

---

## 8. What is already reproducible

Everything in section 3 came from scripts run against the committed library and
planner. Nothing needs new data. The pilot scripts were removed after use and are
reconstructible from this document; they should be committed as a `studies/`
directory with fixed seeds before any results are reported in a paper.
