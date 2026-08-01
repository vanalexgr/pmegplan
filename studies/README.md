# Studies

Anatomy series and study scripts for the in-silico work described in
`docs/IN-SILICO-STUDY.md`.

---

## Privacy

**This repository is public.** `studies/data/` is gitignored and must stay that
way.

Cook graft plans carry patient name, hospital number, E number, treating
institution and date. None of that may enter version control. Even stripped of
direct identifiers, a small consecutive series from a named institution can be
re-identifiable by date and device configuration, so the anatomy itself is also
kept out — only the schema and the loading code are tracked.

Publication of the series is the clinician's decision under their own ethics
approval, not a side effect of committing a file.

Fields **removed** during extraction: patient name, hospital/patient ID,
E number, D.S./loading numbers, institution, treating clinician, plan date,
drawing reference.

Fields **retained**: the geometry below, plus a sequential `caseId`.

---

## Where the anatomy comes from

Source is the Cook **custom-made device (CMD)** graft plan — the manufacturer's
fenestration specification for that patient. It is not a PMEG plan, and that is
an advantage rather than a compromise: a CMD is ordered for precisely the
anatomy that would otherwise be treated with a PMEG when the 6–12 week lead time
is unacceptable. It is the right population.

Every field the planner needs is present, expressed in device space.

### Reading a plan

Each fenestration or scallop block gives:

| Plan field | Meaning | Maps to |
|---|---|---|
| `DIST FROM PROX EDGE` | axial position on the graft, mm | vessel position along the chain |
| `CLOCK` | orientation, h:mm | `clock` |
| `IVD` | **aortic inner diameter at that vessel's level**, mm | seal-zone / per-level diameter |
| `DIAMETER` or `WIDTH`/`HEIGHT` | opening size, mm | `ostiumDiameterMm` proxy |
| `ARCSEP` | arc from 12:00, mm | cross-check (see below) |

`IVD` is not documented on the plan, and was confirmed empirically. `ARCSEP`,
where present, equals the arc from 12:00 computed on a circumference of
`π · IVD` — matching to within 0.9 mm across seven measurements on two plans,
and far from the graft circumference. So `IVD` is the aortic lumen diameter at
that level, and `ARCSEP` is a redundant encoding of `CLOCK` useful as a
transcription check.

**Vessel chain gaps** are differences between successive `DIST FROM PROX EDGE`
values. For a scallop, the relevant axial position is its base — `HEIGHT` below
the proximal edge — not a `DIST` field, which scallop blocks do not carry.

### Laterality convention

Clock is read on axial CT with 12:00 anterior and 3:00 the patient's left, so a
renal at 9:15 is the **right** renal and one at 2:45 the **left**. This matches
the application's convention. Worth confirming against the operative record for
at least a few cases before relying on it.

---

## Schema

`studies/data/anatomy-series.json`, gitignored:

```jsonc
{
  "source": "cook_cmd_graft_plan",
  "convention": { "clock": "axial_ct", "laterality": "3:00 = patient left" },
  "cases": [
    {
      "caseId": "C001",
      "deviceType": "fenestrated_pararenal",   // or fenestrated_thoracoabdominal
      "graftProximalDiameterMm": 30,
      "graftDistalDiameterMm": 22,
      "graftLengthMm": 108,
      "targets": [
        {
          "vessel": "CELIAC",
          "opening": "scallop",                // scallop | large_fenestration | small_fenestration
          "distFromProxEdgeMm": 16,            // scallop: base
          "clock": "12:15",
          "aorticDiameterAtLevelMm": 22,       // IVD
          "openingWidthMm": 20,
          "openingHeightMm": 16,
          "strutFreeRequested": false,
          "notes": null
        }
      ]
    }
  ]
}
```

---

## Open questions before the series is used

1. **Seal-zone diameter.** `IVD` is per-vessel; the plan does not state the
   aortic diameter at the intended proximal seal, above the top target. Device
   selection needs it. Infer from graft diameter and assumed oversizing, or
   record it separately from the CT?
2. **Scallop semantics.** Is `DIST FROM PROX EDGE` absent for scallops because
   `HEIGHT` is measured from the proximal edge? The drawings are consistent with
   that but it should be confirmed.
3. **Which vessel each opening serves.** Inferred here from clock and axial
   order. Cases with a scallop and no SMA fenestration are ambiguous — the
   scallop may serve the SMA with the coeliac covered.
4. **Whether the anatomy or the device drove the numbers.** `DIST FROM PROX
   EDGE` is a device coordinate chosen with a seal in mind, so inter-target
   differences are anatomic but the absolute offsets are a planning decision.
   Only the differences should be treated as anatomy.

---

## Note for the write-up

Two annotations on these plans are direct manufacturer evidence for the premise
of this project:

- **`**Strut Free**`** on large fenestrations — on one plan, on *both* large
  fenestrations. Cook explicitly specifies that a fenestration must not fall on
  a strut.
- **"NO BARBS ON EXPOSED STRUTS OR STRUTS ADJOINING FENESTRATIONS/SCALLOPS"** —
  a second strut-related constraint.

For a custom device the manufacturer resolves this at the point of manufacture.
For a PMEG nobody does, unless the strut geometry is known.
