# Device selection as the contribution

The argument that a scanned library automates **which device to implant**, rather
than only where to cut the one already chosen — and what the current data does
and does not support.

---

## 1. The claim

Strut conflict is normally resolved by compromising something:

- cutting or displacing struts, which alters the structural frame
- accepting a hole that overlaps wire
- pushing the graft deeper, covering more aorta
- rotating further, which is harder to deploy accurately

A sufficiently large library of scanned devices offers a fifth option that costs
nothing: **choose a different device whose lattice already suits this anatomy.**

The mechanism for this is already implemented. Every device in the library that
suits the seal zone is solved against the measured lattice, and the results are
compared. The limitation is the size of the library, not the method.

Sizing alone cannot make this choice, because two devices can be the same
labelled diameter, the same oversizing, and behave completely differently.

---

## 2. What the data shows

288 synthetic four-vessel anatomies, sweeping seal-zone diameter 33–38 mm,
coeliac-SMA gap 16–22 mm, SMA-renal gap 20–28 mm, and four clock configurations.
Two devices were usable throughout — `ZTA-P-42` (scan1) and `ZTEG-2PT-42-32`
(scan2), **both 42 mm nominal, both inside the 10–30% oversizing window.**

| | |
|---|---|
| Anatomies with ≥2 usable devices | 288 / 288 |
| **Choice decisive** (one clears, the other does not) | **228 (79%)** |
| Clearance spread between devices | min 0.55, **median 3.44**, max 3.92 mm |

**In four out of five anatomies, two devices a sizing tool would call
interchangeable are not interchangeable at all** — one produces a conflict-free
plan and the other does not. The median difference of 3.44 mm is large against a
1 mm clearance target.

This is the core result, and it is strong. It is invisible to every planning tool
that does not embed strut geometry, because nothing about the labelled size
predicts it.

---

## 3. What the data does *not* show

**The winner never alternated.** scan1 had the better margin in **288 of 288**
cases; scan2 never won and never cleared alone. Both cleared in 0 cases, neither
cleared in 60.

So with this library, selection does not require anatomy at all — it collapses to
"prefer the Alpha for four-vessel work". The per-anatomy part of the thesis is
**not demonstrated by this data**, and a paper should not claim it on this
evidence.

### Why, and why the obvious explanation is wrong

The plausible mechanism was that the TX2's denser lattice cannot admit a large
fenestration. Measuring the largest circle that fits anywhere in each lattice —
the maximum of the clearance field, less the wire radius — refutes that:

| Device | Apices | Wavelength | Largest hole admitted |
|---|---|---|---|
| `ZTA-P-42` | 7 | 18.8 mm | **15.5 mm** |
| `ZTEG-2PT-42-32` | 14 | 9.6 mm | **11.6 mm** |
| `ZTA-P-32` | 5 | 19.7 mm | **14.5 mm** |

Every device admits a 9 mm SMA fenestration with room to spare. The TX2 is not
excluded by hole size.

The actual mechanism is combinatorial: a **rigid** four-hole pattern has to place
every hole in a window *simultaneously*, using only two degrees of freedom. A
9.6 mm wavelength leaves far fewer viable `(d₁, θ)` poses than an 18.8 mm one.
Density penalises multi-vessel patterns much more than it penalises any single
hole.

That is a more interesting finding than the one it replaced, and it is only
visible because the pattern is treated as rigid.

---

## 4. What would demonstrate the full claim

Per-anatomy alternation needs devices whose lattices are **comparably coarse but
differently arranged**, so that no single device dominates:

1. **Several sizes within one platform.** Apex count is fixed per platform but
   circumference is not, so wavelength varies with diameter — a 32 mm Alpha has a
   19.7 mm wavelength against a 42 mm Alpha's 18.8 mm. Sizes overlapping in
   aortic range would test selection directly.
2. **Multiple individuals of the same nominal size.** Measured apex spacing is
   irregular and that irregularity is per-device, not per-model. Whether two
   nominally identical devices differ enough to change the answer is an open and
   easily answered question — and if they do, it is a strong argument for
   scanning individual devices rather than models.
3. **A second coarse platform.** Any comparably-spaced non-Cook device would
   break the current confound between platform and lattice density.

Until then the defensible statement is that **lattice geometry is a first-order
determinant of PMEG feasibility that sizing cannot see**, not that the optimal
device varies per patient.

---

## 5. A screening rule that falls out

The largest inscribable hole is a single number per device, computable once from
the clearance field, and it bounds what that device can ever accept regardless of
anatomy or pose. It is a cheap pre-filter for a large library, and it is the kind
of device-level figure a manufacturer could publish but currently does not.

The complementary figure — how many conflict-free `(d₁, θ)` poses a given pattern
has on a given device — is already computed inside the pose solver and would
quantify "how much room this device leaves" rather than just whether it worked.
Reporting it is outstanding work.

---

## 6. Caveats

- Synthetic anatomies, not a patient series. The sweep spans a plausible range
  but is not a sample of real cases.
- Two devices, one confound: platform and lattice density vary together, so the
  effect cannot be attributed to density alone.
- Free state only, and no bench validation that a cut device behaves as predicted.
- The 60 anatomies where neither device cleared are a real finding in themselves:
  a two-device library fails outright on roughly a fifth of this range.
