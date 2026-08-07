# Related work — EndoDraft (Juhos et al., JEVT 2026)

Juhos B, Szentiványi A, Bérczi Á, Hüttl A, Borzsák S, Szablics F, Osztrogonácz P,
Csőre J, Csobay-Novák C. *A Novel Surgical Software Tool to Improve the
Physician-Modified Endograft Workflow.* J Endovasc Ther 2026.
DOI: 10.1177/15266028251406185

The closest published comparator. Read carefully because the two tools solve
**different halves of the same workflow**, and the distinction is the strongest
positioning argument available.

---

## 1. What EndoDraft does

A purpose-built Python 3.12 desktop application, distributed free as a compiled
`.exe` with no source code, that automates **punch card creation**.

**Input** — typed per fenestration: graft diameter, clock position (to the
minute), distance to the proximal edge, fenestration diameter, baseline
top-or-bottom, tube or bifurcated.

**Output** — a 1:1 scaled A4 PDF punch card, a 2-D fenestration diagram, and a
virtual 3-D preview. Printed on transparency, punched, sterilised with low-
temperature hydrogen peroxide, and formed into a tube around the semi-deployed
device.

**Internals** — the template X-axis is a 720-value array (one per clock minute),
mapped to pixels via `L = α · D · π`. The 3-D view is a parametric cylinder,
`X = R cos Θ`, `Y = R sin Θ`, `Z = z`, with fenestrations as local circular
deformations.

**Validation** — 76 punch cards, 288 fenestrations, 38 consecutive elective
FEVAR patients, two operators, ethics approval (129/2024).

- Creation time **63.2 ± 21.5 s** software vs **233.0 ± 40.3 s** manual, p<0.001
- Manual longitudinal error 0.8–1.0 mm; circumferential 0.4–0.6 mm
- Learning curve flat (77.8 ± 29.4 s initial vs 55.8 ± 18.5 s terminal, p=0.15)
- In routine clinical use at their centre; not regulator-approved

---

## 2. The decisive difference

EndoDraft **contains no strut geometry**, and says so:

> "Although graft-strut data are not embedded, the printed template can be
> circumferentially adjusted to avoid struts, offering practical flexibility
> across endograft types without device-specific strut or dimension data."

The sinusoidal curves near the graft edges in their 3-D view are explicitly
cosmetic — "plotted near the graft edges to represent structural elements
(supporting rings) and improve visual realism."

Strut avoidance is therefore **a manual search at the back table**: the
semi-deployed device is rotated inside the punch-card tube until a circumferential
position is found where every hole happens to sit over fabric (their Figure 1A).

Their discussion states the problem plainly and leaves it open:

> "Operators also strive to locate fenestrations in strut-free graft segments to
> avoid struts crossing the fenestration, which could compromise long-term
> durability. Manual measurement of arc lengths remains the most common
> approach, but it becomes cumbersome in multi-vessel configurations."

**EndoDraft automates transcription. PMEGplan automates the decision that
transcription records.** They are complementary rather than competing, and a
combined workflow is coherent: solve the pose against measured struts, then emit
the template.

---

## 3. Where PMEGplan is ahead

| | EndoDraft | PMEGplan |
|---|---|---|
| Strut geometry | none embedded | 5,546–7,255 segmented metal intervals per device |
| Strut avoidance | manual rotation at the table | solved computationally over `(d₁, θ)` |
| Clearance | not quantified | mm per hole, plus a margin that *is* the robustness radius |
| 3-D model | parametric cylinder, decorative rings | measured lattice, scan's own diameter profile |
| Input space | device space (clock + distance) | anatomy space (vessel gaps, ostium diameters) |
| Sizing | graft diameter is an input | selected from a library against seal-zone diameter |
| Feasibility | not assessed | seal rule and preserved-vessel bound, limiting vessel named |
| Source | compiled `.exe`, no source | public repository, ~111 tests |

Points worth drawing out:

**Anatomy-space input changes what can be said.** EndoDraft's fenestration
positions are given; it cannot tell you a case will not work. PMEGplan derives
them, so it can refuse — and can produce a device-independent triage rule such as
*SMA-to-highest-renal ≥ 10 mm + SMA ostium radius* for a two-fenestration
juxtarenal repair.

**Marking landmarks require strut data.** Reporting "nearest apex 2.4 mm above,
at 12:43" is not possible without the lattice.

**Rigidity is exploited.** Because the pattern is rigid, the worst clearance *is*
the radius of the conflict-free neighbourhood — robustness comes free rather than
needing simulation.

---

## 4. Where EndoDraft is ahead

Stated plainly, because these are the real gaps.

**Clinical validation.** 38 patients, 288 fenestrations, two operators, ethics
approval, published, adopted into routine practice. PMEGplan has **none** — no
bench cutting, no imaging of a modified device against its plan, no series. This
is the single largest asymmetry and no amount of methodological sophistication
substitutes for it.

**Device coverage.** EndoDraft works with any graft precisely *because* it needs
no device data — tube and bifurcated, any manufacturer, any size. PMEGplan works
with three scanned devices and has a coverage gap at 29–32 mm aortic diameter.
For general use that is disqualifying today; the library has to grow.

**Quantified workflow benefit.** They measured time saved and characterised the
learning curve. PMEGplan has no such data.

**Established physical workflow.** Laser-printed foil, low-temperature H₂O₂
sterilisation, in-theatre use. PMEGplan's punch card carries a calibration rule
but has never been printed, sterilised or laid on a device.

**Bifurcated devices.** Modelled by EndoDraft; PMEGplan handles tube/thoracic
components only.

---

## 5. A methodological gap worth exploiting

Their accuracy comparison is **circular, and they acknowledge it**:

> "The tests were conducted using the software output as the reference standard."

So the reported 0.8–1.0 mm longitudinal and 0.4–0.6 mm circumferential figures
measure *how far manual drafting deviates from EndoDraft*, not how far either
deviates from a physical truth. Neither method's absolute accuracy was
established.

That is an open experiment: cut a device from each method's template, re-scan it,
and measure the achieved hole positions and strut clearances against plan. It
would give absolute accuracy for both, and — since PMEGplan predicts a clearance
per hole — a directly falsifiable prediction that EndoDraft cannot make.

Their own framing invites it: they argue manual offsets "seldom produce
clinically meaningful shuttering" given an 8 mm fenestration. That is an argument
about *alignment*, and it is silent on strut conflict, which is the durability
concern they raise separately.

---

## 6. Prior art to read before writing up

Their reference 8 — **Álvarez Marcos F, et al. J Endovasc Ther 2025**,
doi:10.1177/15266028251318952, *Physician-modified endografts for non-deferable
complex abdominal aortic aneurysm repair using the Endurant platform: templates
and initial experience* — is described as "a comparable smart template
incorporating graft-strut data".

**This is the closest prior art to PMEGplan and must be read before claiming
novelty.** From the citing sentence, both it and EndoDraft "require manual
marking", which suggests it embeds strut data without solving for pose — but that
needs verifying from the source, not inferred from one clause.

Also worth checking:

- **Ref 12** — Dillon TM, et al. *Comms Eng* 2023;2(1):37. "A computational
  program for automated surgical planning of fenestrated endovascular repair."
- **Ref 10** — Starnes BW, et al. *J Vasc Surg* 2018;68(5):1297–1307. Automated
  software under a physician-sponsored IDE.

Both are described as not publicly accessible, but their methods sections bear on
any novelty claim.

---

## 7. Honest positioning

The defensible claim is **not** "better than EndoDraft". It is:

> Existing PMEG planning tools automate the transcription of a plan onto a
> physical template but embed no device-specific strut geometry, leaving strut
> avoidance to manual rotation of the device at the back table. PMEGplan derives
> strut geometry from bench CT of the actual devices and solves the placement
> against it, turning strut avoidance from a manual search into a computed result
> with a quantified clearance margin.

Followed immediately by the limitation: three devices, and no clinical validation
of any kind. The methodological contribution is real; the clinical evidence is
absent, and a paper claiming otherwise would not survive review.
